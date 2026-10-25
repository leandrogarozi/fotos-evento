import { json, bad, readJson, uid, token } from '../_lib/util.js';
import { normWpp, validPin, newPin, checkPin } from '../_lib/pin.js';
import { eventBySlug } from '../_lib/events.js';

const MAX_IDS = 400, MAX_FAILS = 5, LOCK_MIN = 15;

// Fotos favoritas (coraçãozinho) guardadas no servidor com WhatsApp + senha, para continuar depois ou em outro aparelho.
//  { action: 'salvar', e, name, whatsapp, pin, ids, athleteId } cria (ou atualiza, se a senha bater) e devolve { token }
//  { action: 'abrir', e, whatsapp, pin } devolve { token, name, athleteId, ids }
//  { action: 'sincronizar', e, token, ids, athleteId } atualiza a lista de quem já salvou (o token fica no aparelho)
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  const clean = async (ids) => {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_IDS);
    if (!list.length) return [];
    const { results } = await env.DB.prepare('SELECT id FROM photos WHERE id IN (SELECT value FROM json_each(?)) AND has_orig = 1 AND has_prev = 1 AND event_id = ?').bind(JSON.stringify(list), ev.id).all();
    const ok = new Set(results.map((r) => r.id));
    return list.filter((id) => ok.has(id));
  };
  const athlete = async (a) => (Number(a) ? ((await env.DB.prepare('SELECT id FROM athletes WHERE id = ? AND event_id = ?').bind(Number(a), ev.id).first()) || {}).id || null : null);
  const now = new Date().toISOString();

  if (b.action === 'sincronizar') {
    const row = await env.DB.prepare('SELECT id FROM favorites WHERE token = ? AND event_id = ?').bind(String(b.token || ''), ev.id).first();
    if (!row) return bad('Favoritas não encontradas. Abra de novo com seu WhatsApp e senha.', 404);
    await env.DB.prepare('UPDATE favorites SET photo_ids = ?, athlete_id = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(await clean(b.ids)), await athlete(b.athleteId), now, row.id).run();
    return json({ ok: true });
  }

  const wpp = normWpp(b.whatsapp), pin = String(b.pin || '').trim();
  if (wpp.length < 10 || wpp.length > 13) return bad('Informe um WhatsApp válido com DDD.');
  if (!validPin(pin)) return bad('A senha tem de 4 a 6 números.');
  const key = 'fav:' + wpp, t = Date.now();
  const att = await env.DB.prepare('SELECT fails, locked_until FROM access_attempts WHERE wpp = ?').bind(key).first();
  if (att && att.locked_until && Date.parse(att.locked_until) > t) {
    const min = Math.ceil((Date.parse(att.locked_until) - t) / 60000);
    return bad(`Muitas tentativas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.`, 429);
  }
  const row = await env.DB.prepare('SELECT * FROM favorites WHERE event_id = ? AND whatsapp = ?').bind(ev.id, wpp).first();
  const pinOk = row ? await checkPin(pin, wpp, row.pin_salt, row.pin_hash) : false;
  if (row && !pinOk) {
    const fails = (att ? att.fails : 0) + 1, lock = fails >= MAX_FAILS ? new Date(t + LOCK_MIN * 60000).toISOString() : null;
    await env.DB.prepare('INSERT INTO access_attempts (wpp, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(wpp) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until').bind(key, lock ? 0 : fails, lock).run();
    return bad('WhatsApp ou senha incorretos.', 401);
  }
  if (row) await env.DB.prepare('DELETE FROM access_attempts WHERE wpp = ?').bind(key).run();

  if (b.action === 'abrir') {
    if (!row) return bad('Não achei favoritas salvas para esse WhatsApp.', 404);
    const ids = await clean(JSON.parse(row.photo_ids || '[]'));
    const tok = token();
    await env.DB.prepare('UPDATE favorites SET token = ? WHERE id = ?').bind(tok, row.id).run();
    return json({ token: tok, name: row.name, athleteId: row.athlete_id || 0, ids });
  }
  if (b.action !== 'salvar') return bad('Ação inválida.');
  const ids = await clean(b.ids), tok = token(), name = String(b.name || '').trim().slice(0, 120);
  if (name.length < 2) return bad('Informe seu nome.');
  if (row) {
    await env.DB.prepare('UPDATE favorites SET name = ?, token = ?, athlete_id = ?, photo_ids = ?, updated_at = ? WHERE id = ?').bind(name, tok, await athlete(b.athleteId), JSON.stringify(ids), now, row.id).run();
  } else {
    const pn = await newPin(pin, wpp);
    await env.DB.prepare('INSERT INTO favorites (id, event_id, whatsapp, name, pin_salt, pin_hash, token, athlete_id, photo_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), ev.id, wpp, name, pn.salt, pn.hash, tok, await athlete(b.athleteId), JSON.stringify(ids), now).run();
  }
  return json({ token: tok, saved: ids.length });
}

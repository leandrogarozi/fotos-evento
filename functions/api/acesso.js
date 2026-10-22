import { json, bad, readJson, safeEqual, hmacHex } from '../_lib/util.js';
import { normWpp, validPin } from '../_lib/pin.js';

const MAX_FAILS = 5, LOCK_MIN = 15;

// { whatsapp, pin } -> pedidos do comprador (sem login: WhatsApp + senha criada na compra)
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const wpp = normWpp(b.whatsapp), pin = String(b.pin || '').trim();
  if (wpp.length < 10 || !validPin(pin)) return bad('Informe seu WhatsApp e a senha de 4 a 6 números.');

  const now = Date.now();
  const att = await env.DB.prepare('SELECT fails, locked_until FROM access_attempts WHERE wpp = ?').bind(wpp).first();
  if (att && att.locked_until && Date.parse(att.locked_until) > now) {
    const min = Math.ceil((Date.parse(att.locked_until) - now) / 60000);
    return bad(`Muitas tentativas. Tente de novo em ${min} minuto${min > 1 ? 's' : ''}.`, 429);
  }

  const { results } = await env.DB.prepare(
    `SELECT o.token, o.kind, o.status, o.amount_cents, o.pin_salt, o.pin_hash, a.name AS athlete_name
     FROM orders o LEFT JOIN athletes a ON a.id = o.athlete_id
     WHERE o.whatsapp = ? AND o.pin_hash != '' AND o.status IN ('aguardando', 'pago', 'liberado')
     ORDER BY o.created_at DESC`
  ).bind(wpp).all();
  const ok = [];
  for (const o of results) if (safeEqual(await hmacHex(o.pin_salt, `${wpp}:${pin}`), o.pin_hash)) ok.push(o);

  if (!ok.length) {
    const fails = (att ? att.fails : 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(now + LOCK_MIN * 60000).toISOString() : null;
    await env.DB.prepare(
      `INSERT INTO access_attempts (wpp, fails, locked_until) VALUES (?, ?, ?)
       ON CONFLICT(wpp) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`
    ).bind(wpp, lock ? 0 : fails, lock).run();
    return bad('WhatsApp ou senha incorretos.', 401);
  }
  await env.DB.prepare('DELETE FROM access_attempts WHERE wpp = ?').bind(wpp).run();
  return json({ orders: ok.map((o) => ({ token: o.token, athlete: o.athlete_name, kind: o.kind, status: o.status, amount: o.amount_cents })) });
}

import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { adminEvent } from '../../_lib/events.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const ev = await adminEvent(request, env);
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.name, a.turma, a.turma_order, COUNT(p.id) AS n
     FROM athletes a
     LEFT JOIN photo_athletes pa ON pa.athlete_id = a.id
     LEFT JOIN photos p ON p.id = pa.photo_id AND p.has_orig = 1 AND p.has_prev = 1
     WHERE a.event_id = ? GROUP BY a.id`
  ).bind(ev.id).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE has_orig = 1 AND has_prev = 1 AND event_id = ?').bind(ev.id).first();
  // Fotos prontas ainda sem os rostos calculados (busca por selfie). ?pendingFaces=1 devolve os ids.
  const pend = await env.DB.prepare('SELECT id FROM photos WHERE has_orig = 1 AND has_prev = 1 AND faces_done = 0 AND event_id = ? ORDER BY filename LIMIT 2000').bind(ev.id).all();
  let names;
  if (new URL(request.url).searchParams.get('names')) {
    const rows = (await env.DB.prepare('SELECT id, filename FROM photos WHERE has_orig = 1 AND has_prev = 1 AND event_id = ?').bind(ev.id).all()).results;
    const tags = (await env.DB.prepare('SELECT pa.photo_id, pa.athlete_id FROM photo_athletes pa JOIN photos p ON p.id = pa.photo_id WHERE p.event_id = ?').bind(ev.id).all()).results;
    const by = new Map(); for (const t of tags) by.set(t.photo_id, [...(by.get(t.photo_id) || []), t.athlete_id]);
    names = rows.map((r) => ({ id: r.id, filename: r.filename, aths: by.get(r.id) || [] }));
  }
  return json({
    names,
    total: total.n,
    facesPending: pend.results.length,
    pendingIds: new URL(request.url).searchParams.get('pendingFaces') ? pend.results.map((r) => r.id) : undefined,
    athletes: results.sort((a, b) => a.turma_order - b.turma_order || a.name.localeCompare(b.name, 'pt-BR'))
      .map(({ id, name, turma, n }) => ({ id, name, turma, n })),
  });
}

// { action: 'delete', ids: [...] } apaga várias fotos (R2 + banco) de uma vez.
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  const ids = [...new Set((b.ids || []).map(String))].filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 500);
  if (!ids.length) return bad('Nenhuma foto selecionada.');
  const js = JSON.stringify(ids);
  if (b.action === 'geral') { // olhada na triagem e deixada como geral: sai da fila
    await env.DB.prepare('UPDATE photos SET triaged = 1 WHERE id IN (SELECT value FROM json_each(?))').bind(js).run();
    return json({ ok: true, count: ids.length });
  }
  if (['assign', 'unassign', 'clear'].includes(b.action)) {
    if (b.action === 'clear') await env.DB.batch([
      env.DB.prepare('DELETE FROM photo_athletes WHERE photo_id IN (SELECT value FROM json_each(?))').bind(js),
      env.DB.prepare('UPDATE photos SET triaged = 0 WHERE id IN (SELECT value FROM json_each(?))').bind(js),
    ]);
    else {
      const a = await env.DB.prepare('SELECT id FROM athletes WHERE id = ?').bind(Number(b.athleteId)).first();
      if (!a) return bad('Atleta não encontrado.');
      if (b.action === 'assign') await env.DB.prepare('INSERT OR IGNORE INTO photo_athletes (photo_id, athlete_id) SELECT p.id, ? FROM photos p WHERE p.id IN (SELECT value FROM json_each(?))').bind(a.id, js).run();
      else await env.DB.prepare('DELETE FROM photo_athletes WHERE athlete_id = ? AND photo_id IN (SELECT value FROM json_each(?))').bind(a.id, js).run();
    }
    return json({ ok: true, count: ids.length });
  }
  if (b.action !== 'delete') return bad('Ação inválida.');
  await env.FOTOS.delete(ids.flatMap((id) => [`orig/${id}`, `prev/${id}`]));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM order_photos WHERE photo_id IN (SELECT value FROM json_each(?))').bind(js),
    env.DB.prepare('DELETE FROM photo_athletes WHERE photo_id IN (SELECT value FROM json_each(?))').bind(js),
    env.DB.prepare('DELETE FROM photo_faces WHERE photo_id IN (SELECT value FROM json_each(?))').bind(js),
    env.DB.prepare('DELETE FROM photos WHERE id IN (SELECT value FROM json_each(?))').bind(js),
  ]);
  return json({ deleted: ids.length });
}

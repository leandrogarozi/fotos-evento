import { json, bad } from '../_lib/util.js';
import { eventBySlug, slugParam } from '../_lib/events.js';

// Lista pública de fotos de vitrine (só ids) de UM evento. ?athlete=ID, ?geral=1, ?queue=1 filtram.
export async function onRequestGet({ request, env }) {
  const q = request ? new URL(request.url).searchParams : new URLSearchParams();
  const ev = await eventBySlug(env, slugParam(request));
  if (!ev) return bad('Evento não encontrado.', 404);
  const a = Number(q.get('athlete'));
  const ready = 'p.event_id = ? AND p.has_orig = 1 AND p.has_prev = 1';
  const noAthlete = 'NOT EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id)';
  const run = (sql, ...args) => env.DB.prepare(sql).bind(...args).all();
  const { results } = q.get('queue')
    ? await run(`SELECT p.id FROM photos p WHERE ${ready} AND p.triaged = 0 AND ${noAthlete} ORDER BY p.filename`, ev.id)
    : q.get('geral')
    ? await run(`SELECT p.id FROM photos p WHERE ${ready} AND ${noAthlete} ORDER BY p.filename`, ev.id)
    : a
    ? await run(`SELECT DISTINCT p.id FROM photos p JOIN photo_athletes pa ON pa.photo_id = p.id WHERE ${ready} AND pa.athlete_id = ? ORDER BY p.filename`, ev.id, a)
    : await run(`SELECT p.id FROM photos p WHERE ${ready} ORDER BY p.filename`, ev.id);
  let general = [];
  if (a && !q.get('geral') && !q.get('queue')) { // fotos gerais confirmadas (pasta Geral / triagem) também aparecem na galeria do atleta
    general = (await run(`SELECT p.id FROM photos p WHERE ${ready} AND p.triaged = 1 AND ${noAthlete} ORDER BY p.filename`, ev.id)).results.map((r) => r.id);
  }
  return json({ photos: results.map((r) => r.id), general }, 200, { 'cache-control': 'public, max-age=30' });
}

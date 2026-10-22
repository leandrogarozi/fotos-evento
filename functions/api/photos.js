import { json } from '../_lib/util.js';

// Lista pública de fotos de vitrine (só ids). ?athlete=ID filtra por atleta.
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const a = Number(q.get('athlete'));
  const ready = 'p.has_orig = 1 AND p.has_prev = 1';
  const { results } = q.get('queue')
    ? await env.DB.prepare(`SELECT p.id FROM photos p WHERE ${ready} AND p.triaged = 0 AND NOT EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id) ORDER BY p.filename`).all()
    : q.get('geral')
    ? await env.DB.prepare(`SELECT p.id FROM photos p WHERE ${ready} AND NOT EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id) ORDER BY p.filename`).all()
    : a
    ? await env.DB.prepare(`SELECT DISTINCT p.id FROM photos p JOIN photo_athletes pa ON pa.photo_id = p.id
        WHERE pa.athlete_id = ? AND ${ready} ORDER BY p.filename`).bind(a).all()
    : await env.DB.prepare(`SELECT p.id FROM photos p WHERE ${ready} ORDER BY p.filename`).all();
  let general = [];
  if (a && !q.get('geral') && !q.get('queue')) { // fotos gerais confirmadas (pasta Geral / triagem) também aparecem na galeria do atleta
    general = (await env.DB.prepare(`SELECT p.id FROM photos p WHERE ${ready} AND p.triaged = 1 AND NOT EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id) ORDER BY p.filename`).all()).results.map((r) => r.id);
  }
  return json({ photos: results.map((r) => r.id), general }, 200, { 'cache-control': 'public, max-age=30' });
}

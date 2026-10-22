import { json } from '../_lib/util.js';

// Lista pública de fotos de vitrine (só ids). ?athlete=ID filtra por atleta.
export async function onRequestGet({ request, env }) {
  const a = Number(new URL(request.url).searchParams.get('athlete'));
  const ready = 'p.has_orig = 1 AND p.has_prev = 1';
  const { results } = a
    ? await env.DB.prepare(`SELECT DISTINCT p.id FROM photos p JOIN photo_athletes pa ON pa.photo_id = p.id
        WHERE pa.athlete_id = ? AND ${ready} ORDER BY p.filename`).bind(a).all()
    : await env.DB.prepare(`SELECT p.id FROM photos p WHERE ${ready} ORDER BY p.filename`).all();
  return json({ photos: results.map((r) => r.id) }, 200, { 'cache-control': 'public, max-age=30' });
}

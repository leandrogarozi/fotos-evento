import { json, bad, readJson } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { eventBySlug } from '../_lib/events.js';
import { validVec, searchFaces } from '../_lib/faces.js';

// { e, d: [128 números] }: a página calcula a impressão do rosto no celular; aqui só chegam os números.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  if (!validVec(b.d)) return bad('Não consegui ler o rosto. Tente outra foto.');
  const cfg = await getConfig(env, ev.id);
  const max = Math.min(0.8, Math.max(0.2, (Number(cfg.face_dist) || 50) / 100));
  const r = await searchFaces(env, ev.id, Float32Array.from(b.d), max);
  return json({ ids: r.ids, maybe: r.maybe, scanned: r.scanned }, 200, { 'cache-control': 'no-store' });
}

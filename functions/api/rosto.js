import { json, bad, readJson } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { eventBySlug } from '../_lib/events.js';
import { validVec, searchSlice } from '../_lib/faces.js';

// { e, d: [128 números], off, lim }: a página calcula a impressão do rosto no celular; aqui só chegam os números.
// A busca é dividida em fatias (off/lim) que a página pede em paralelo, para caber no tempo curto de cada requisição.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  if (!validVec(b.d)) return bad('Não consegui ler o rosto. Tente outra foto.');
  const cfg = await getConfig(env, ev.id);
  const max = Math.min(0.8, Math.max(0.2, (Number(cfg.face_dist) || 50) / 100));
  const lim = Math.min(4000, Math.max(200, Math.floor(Number(b.lim)) || 2000)), off = Math.max(0, Math.floor(Number(b.off)) || 0);
  const r = await searchSlice(env, ev.id, Float32Array.from(b.d), max, off, lim);
  return json({ sure: r.sure, maybe: r.maybe, total: r.total, lim, ids: r.sure.sort((a, c) => a[1] - c[1]).map((x) => x[0]) }, 200, { 'cache-control': 'no-store' });
}

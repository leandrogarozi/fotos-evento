import { json, bad, readJson } from '../../../../_lib/util.js';
import { isAdmin, denied } from '../../../../_lib/auth.js';
import { validVec, packVec, MAX_FACES } from '../../../../_lib/faces.js';

// { faces: [[128 números], ...] }: rostos achados na foto (calculados no navegador do painel). Substitui os anteriores.
export async function onRequestPost({ params, request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const b = await readJson(request);
  const faces = (Array.isArray(b.faces) ? b.faces : []).slice(0, MAX_FACES);
  if (!faces.every(validVec)) return bad('Rostos inválidos.');
  const p = await env.DB.prepare('SELECT id FROM photos WHERE id = ?').bind(params.id).first();
  if (!p) return bad('Foto não encontrada.', 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photo_faces WHERE photo_id = ?').bind(params.id),
    ...faces.map((f, i) => env.DB.prepare('INSERT INTO photo_faces (photo_id, n, vec) VALUES (?, ?, ?)').bind(params.id, i, packVec(f))),
    env.DB.prepare('UPDATE photos SET faces_done = 1 WHERE id = ?').bind(params.id),
  ]);
  return json({ ok: true, faces: faces.length });
}

import { json, bad } from '../../../../_lib/util.js';
import { isAdmin, denied } from '../../../../_lib/auth.js';

// Passo 2/3 do upload: corpo cru da imagem direto para o R2 (sem processar no servidor).
export async function onRequestPut({ params, request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { id, kind } = params;
  if (kind !== 'orig' && kind !== 'prev') return bad('Tipo inválido.');
  const photo = await env.DB.prepare('SELECT id FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return bad('Foto não encontrada.', 404);
  await env.FOTOS.put(`${kind}/${id}`, request.body, { httpMetadata: { contentType: 'image/jpeg' } });
  await env.DB.prepare(`UPDATE photos SET ${kind === 'orig' ? 'has_orig' : 'has_prev'} = 1 WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

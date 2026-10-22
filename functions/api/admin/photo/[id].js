import { json } from '../../../_lib/util.js';
import { isAdmin, denied } from '../../../_lib/auth.js';

export async function onRequestDelete({ params, request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  await env.FOTOS.delete(`orig/${params.id}`);
  await env.FOTOS.delete(`prev/${params.id}`);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM order_photos WHERE photo_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM photo_athletes WHERE photo_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(params.id),
  ]);
  return json({ ok: true });
}

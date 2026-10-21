import { json, bad, readJson, safeEqual } from '../../_lib/util.js';
import { makeToken } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return bad('ADMIN_PASSWORD não configurada.', 503);
  const { password } = await readJson(request);
  if (!safeEqual(password || '', env.ADMIN_PASSWORD)) return bad('Senha incorreta.', 401);
  return json({ token: await makeToken(env) });
}

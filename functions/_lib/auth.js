import { hmacHex, safeEqual, json } from './util.js';

const TTL = 12 * 3600 * 1000;

export async function makeToken(env) {
  const exp = Date.now() + TTL;
  return `${exp}.${await hmacHex(env.ADMIN_PASSWORD, 'admin.' + exp)}`;
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const h = request.headers.get('authorization') || '';
  const [exp, sig] = h.replace(/^Bearer /, '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(await hmacHex(env.ADMIN_PASSWORD, 'admin.' + exp), sig);
}

export const denied = () => json({ error: 'Não autorizado' }, 401);

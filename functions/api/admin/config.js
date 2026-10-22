import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { getConfig } from '../../_lib/db.js';
import { DEFAULTS, NUMERIC_KEYS, normalizeTiers, parseTiers } from '../../_lib/pricing.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const cfg = await getConfig(env);
  return json({ ...cfg, tiers: parseTiers(cfg) });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const body = await readJson(request);
  const stmts = [];
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (key === 'price_tiers') {
      let t = null; try { t = normalizeTiers(typeof v === 'string' ? JSON.parse(v) : v); } catch (_) {}
      if (!t) return bad('Pacotes inválidos: use quantidade de 1 a 300 e preço de pelo menos R$ 1,00.');
      v = JSON.stringify(t);
    }
    if (NUMERIC_KEYS.includes(key)) { v = Math.round(Number(v)); if (!Number.isFinite(v) || v < 0) continue; }
    stmts.push(env.DB.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(v).slice(0, 2000)));
  }
  if (stmts.length) await env.DB.batch(stmts);
  const cfg = await getConfig(env);
  return json({ ...cfg, tiers: parseTiers(cfg) });
}

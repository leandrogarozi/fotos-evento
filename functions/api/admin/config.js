import { json, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { getConfig } from '../../_lib/db.js';
import { DEFAULTS, NUMERIC_KEYS } from '../../_lib/pricing.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  return json(await getConfig(env));
}

export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const body = await readJson(request);
  const stmts = [];
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in body)) continue;
    let v = body[key];
    if (NUMERIC_KEYS.includes(key)) { v = Math.round(Number(v)); if (!Number.isFinite(v) || v < 0) continue; }
    stmts.push(env.DB.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(v)));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json(await getConfig(env));
}

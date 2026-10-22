import { mergeConfig } from './pricing.js';

export async function getConfig(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM config').all();
  return mergeConfig(results);
}

export async function getOrder(env, where, value) {
  return env.DB.prepare(
    `SELECT o.*, a.name AS athlete_name FROM orders o
     LEFT JOIN athletes a ON a.id = o.athlete_id WHERE ${where} = ?`
  ).bind(value).first();
}

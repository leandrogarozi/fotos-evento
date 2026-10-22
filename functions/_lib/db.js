import { mergeConfig } from './pricing.js';

// Configuração de UM evento (padrões + o que foi salvo no painel).
export async function getConfig(env, eventId = 1) {
  const { results } = await env.DB.prepare('SELECT key, value FROM event_config WHERE event_id = ?').bind(Number(eventId) || 1).all();
  return mergeConfig(results);
}

export async function getOrder(env, where, value) {
  return env.DB.prepare(
    `SELECT o.*, a.name AS athlete_name, ev.slug AS event_slug, ev.name AS event_name
     FROM orders o
     LEFT JOIN athletes a ON a.id = o.athlete_id
     LEFT JOIN events ev ON ev.id = o.event_id WHERE ${where} = ?`
  ).bind(value).first();
}

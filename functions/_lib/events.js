// Eventos: cada evento tem slug (endereço), configuração, atletas, fotos e pedidos próprios.
export const mainEvent = async (env) =>
  (await env.DB.prepare('SELECT * FROM events WHERE is_main = 1 ORDER BY id LIMIT 1').first()) ||
  (await env.DB.prepare('SELECT * FROM events ORDER BY id LIMIT 1').first());

// slug vazio = evento principal; slug desconhecido = null
export const eventBySlug = async (env, slug) =>
  slug ? env.DB.prepare('SELECT * FROM events WHERE slug = ?').bind(String(slug).toLowerCase()).first() : mainEvent(env);

export const eventById = (env, id) => env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(Number(id) || 0).first();

export const slugParam = (request) => (request ? new URL(request.url).searchParams.get('e') || '' : '');

// Evento que o painel está editando (cabeçalho x-event ou ?event=ID); padrão: principal.
export async function adminEvent(request, env) {
  const h = request && (request.headers.get('x-event') || new URL(request.url).searchParams.get('event'));
  return (h && (await eventById(env, h))) || (await mainEvent(env));
}

export const slugify = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'evento';

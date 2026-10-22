// Vitrine (baixa resolução + marca d'água). A original nunca passa por aqui.
export async function onRequestGet({ params, env }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response('not found', { status: 404 });
  const obj = await env.FOTOS.get(`prev/${params.id}`);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' },
  });
}

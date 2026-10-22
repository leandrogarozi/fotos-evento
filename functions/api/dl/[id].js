import { bad } from '../../_lib/util.js';
import { getOrder } from '../../_lib/db.js';
import { photoAllowed, dlValid } from '../../_lib/access.js';

// Download da original. Só com link assinado de um pedido pago que inclui a foto.
export async function onRequestGet({ params, request, env }) {
  const q = new URL(request.url).searchParams;
  const order = await getOrder(env, 'o.token', q.get('t') || '');
  if (!(await dlValid(env, order, q.get('e'), q.get('s')))) return bad('Link inválido ou expirado. Abra a página do pedido para gerar outro.', 403);
  const photo = await photoAllowed(env, order, params.id);
  if (!photo) return bad('Foto não disponível neste pedido.', 403);
  const obj = await env.FOTOS.get(`orig/${photo.id}`);
  if (!obj) return bad('Arquivo não encontrado.', 404);
  const fname = (photo.filename || photo.id).replace(/[^\w.\- ]+/g, '_');
  return new Response(obj.body, {
    headers: {
      'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
      'content-disposition': `attachment; filename="${/\.jpe?g$/i.test(fname) ? fname : fname + '.jpg'}"`,
      'cache-control': 'private, no-store',
    },
  });
}

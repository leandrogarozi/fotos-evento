import { ensureSchema } from './_lib/schema.js';

// Qualquer exceção vira JSON legível (em vez da tela genérica 1101 da Cloudflare).
export async function onRequest(ctx) {
  try {
    // Se a atualização automática do banco falhar, o resto do site continua de pé.
    try { await ensureSchema(ctx.env); } catch (e) { console.error('ensureSchema', e && e.message); }
    return await ctx.next();
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 300);
    const hint = !ctx.env.DB ? 'Banco não ligado: falta o binding DB (Configurações > Bindings) e um novo deploy.'
      : !ctx.env.FOTOS ? 'Bucket de fotos não ligado: falta o binding FOTOS (R2) e um novo deploy.' : undefined;
    return new Response(JSON.stringify({ error: 'Erro interno', detail: msg, hint }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
}

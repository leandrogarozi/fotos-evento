import { getConfig } from './db.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Envia pelo webhook de e-mail (script do Gmail). Devolve true/false, nunca lança.
export async function sendAccessEmail(env, { order, pin, origin }) {
  if (!env.MAIL_WEBHOOK_URL || !order.email) return false;
  try {
    const cfg = await getConfig(env);
    const first = String(order.buyer_name || '').split(' ')[0];
    const what = order.athlete_name ? `as fotos de ${order.athlete_name}` : 'as suas fotos';
    const subject = `Pagamento confirmado: suas fotos do ${cfg.event_name}`;
    const text = [
      `Oi, ${first}! Seu pagamento foi confirmado.`, '',
      `Pedido: ${what}.`, '',
      'Seus dados de acesso:',
      `WhatsApp: ${order.whatsapp}`,
      `Senha: ${pin}`, '',
      `Para ver e baixar as fotos: abra ${origin}/ , toque em "Já comprei" e entre com o WhatsApp e a senha acima.`, '',
      'As fotos ficam disponíveis depois do evento. Se tiver qualquer dúvida, é só responder este e-mail.', '',
      'Leandro Garozi Fotografia',
    ].join('\n');
    const html = `<div style="background:#f5f5f1;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#242723">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px">
<div style="font-size:12px;font-weight:700;letter-spacing:.14em">LEANDRO GAROZI</div>
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;margin:16px 0 8px">Pagamento <span style="color:#6f8259">confirmado</span></h1>
<p style="margin:0 0 16px;color:#62675f">Oi, ${esc(first)}! Recebemos o pagamento d${order.athlete_name ? 'as fotos de ' + esc(order.athlete_name) : 'as suas fotos'}.</p>
<div style="background:#eeefe9;border-radius:14px;padding:16px;margin:0 0 20px">
<div style="font-size:13px;color:#62675f">Seu WhatsApp</div><div style="font-size:18px;margin-bottom:10px">${esc(order.whatsapp)}</div>
<div style="font-size:13px;color:#62675f">Sua senha</div><div style="font-size:28px;letter-spacing:.2em;font-family:Georgia,serif">${esc(pin)}</div></div>
<p style="margin:0 0 20px"><a href="${esc(origin)}/" style="display:inline-block;background:#242723;color:#f5f5f1;text-decoration:none;padding:14px 26px;border-radius:50px;font-size:14px">Acessar minhas fotos</a></p>
<p style="margin:0 0 6px;font-size:14px">Como entrar: abra o site, toque em <b>Já comprei</b> e use o WhatsApp e a senha acima.</p>
<p style="margin:0;font-size:14px;color:#62675f">As fotos ficam disponíveis depois do evento. Qualquer dúvida, é só responder este e-mail.</p>
</div></div>`;
    const res = await fetch(env.MAIL_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: env.MAIL_WEBHOOK_SECRET || '', to: order.email, subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await res.json().catch(() => null);
    return !!(res.ok && d && d.ok);
  } catch (e) { console.error('sendAccessEmail', e && e.message); return false; }
}

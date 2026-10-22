// Envia os e-mails de confirmação (senha + link) pelo seu Gmail. Grátis, até ~100 e-mails por dia.
// 1) script.google.com > Novo projeto > cole este código.
// 2) Troque SEGREDO por uma frase sua (a mesma vai na Cloudflare, em MAIL_WEBHOOK_SECRET).
// 3) Implantar > Nova implantação > App da Web > Executar como: Eu > Quem tem acesso: Qualquer pessoa.
// 4) Autorize quando pedir e copie o endereço da implantação (termina em /exec).
const SEGREDO = 'TROQUE-POR-UMA-FRASE-SUA';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SEGREDO) return resposta({ ok: false, error: 'segredo' });
    MailApp.sendEmail({
      to: d.to,
      subject: d.subject,
      body: d.text,
      htmlBody: d.html,
      name: 'Leandro Garozi Fotografia',
      replyTo: 'leandrogarozi@gmail.com',
    });
    return resposta({ ok: true });
  } catch (err) {
    return resposta({ ok: false, error: String(err) });
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

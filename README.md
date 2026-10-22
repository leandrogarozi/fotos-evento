# Fotos do evento (Cloudflare Pages + D1)

Fase 1: **pré-venda** (escolhe o atleta, paga no Mercado Pago, painel de pedidos).
Fase 2 (depois do evento): upload com marca d'água (R2), vitrine, carrinho, download/ZIP.

Sem build e sem framework: `public/` (páginas) + `functions/` (API) + `migrations/` (banco).

## Publicar (uma vez)

1. **Cloudflare → Workers e Pages → Criar aplicativo → "Continuar para o Pages" → Connect to Git** → repositório `leandrogarozi/fotos-evento`, branch `main`.
   - Root directory: *(vazio)*
   - Build command: *(vazio)*
   - Build output directory: `public`
2. **Storage & Databases → D1 → Create** com o nome `fotos-evento`. Abra o banco → **Console** e rode, nesta ordem, o conteúdo de `migrations/0001_init.sql` e depois `migrations/0002_atletas.sql`.
3. No projeto Pages → **Settings → Bindings → Add → D1 database**: variable name `DB`, banco `fotos-evento` (em Production e Preview).
4. **Settings → Variables and Secrets** (tipo *Secret*):
   - `ADMIN_PASSWORD` — a senha do painel (nova; não reuse a antiga)
   - `MP_ACCESS_TOKEN` — token de teste do Mercado Pago (depois troque pelo de produção)
   - `MP_WEBHOOK_SECRET` — assinatura secreta do webhook (opcional; ver abaixo)
5. Faça um novo deploy (Deployments → Retry).
6. No Mercado Pago → sua aplicação → **Webhooks**: URL `https://SEU-PROJETO.pages.dev/api/webhook/mercadopago`, evento **Pagamentos**.

Painel: `https://SEU-PROJETO.pages.dev/admin.html`. Página de venda: `/`.

## Segurança do webhook
O webhook sempre confirma o pagamento consultando a API do Mercado Pago com o seu token (só libera se `approved` e valor ≥ pedido). Se quiser também exigir a assinatura, crie a variável `MP_WEBHOOK_STRICT=1`.

## Testar
`npm test` (Node 22): carrinho/preços e um teste de ponta a ponta dos handlers com banco em memória e Mercado Pago falso.

## Preços e datas
Tudo no painel → **Preços e datas** (valores em centavos). Para teste de R$ 1: pré-venda = `100`, depois volte para `5000`.

## Fase 2: loja (galeria, carrinho, download)

Código na branch `loja`. Antes de juntar na `main`:

1. **Banco:** no D1 → Console, rode `migrations/0003_fotos.sql`.
2. **Fotos (R2):** Armazenamento e bancos de dados → **R2** → Criar bucket `fotos-evento` (privado). No projeto Pages → Configurações → Bindings → Adicionar → **R2 bucket**: variável `FOTOS`, bucket `fotos-evento`.
3. **Novo deploy** (Implantações → Retry) para valer o binding.
4. *(Opcional)* Marca d'água em PNG transparente: salve como `public/marca.png` no repositório. Sem ele, usa o texto "Texto da marca d'água" (painel → Preços e datas).

Fluxo: painel → aba **Fotos** → marque os atletas → envie os JPGs (ou uma pasta por atleta). A vitrine (1200 px, ~70%, marca d'água) é gerada no navegador; a original sobe privada pro R2 e só sai por link assinado de pedido pago (7 dias). Quem comprou o pacote "todas" na pré-venda recebe as fotos assim que elas sobem.

Limites do plano grátis: o ZIP é montado no celular/computador do comprador (sem custo de servidor); em pacotes muito grandes no 4G, o download foto a foto é mais seguro.

## E-mail com senha e link (confirmação de pagamento)

Quando o Mercado Pago confirma, o comprador recebe um e-mail com WhatsApp, senha e o link do site. O envio usa o seu Gmail, por um script (`docs/enviar-email.gs`).

1. **script.google.com** → Novo projeto → cole `docs/enviar-email.gs`, troque `SEGREDO` por uma frase sua.
2. **Implantar → Nova implantação → App da Web** → Executar como: *Eu* · Acesso: *Qualquer pessoa* → autorize → copie o endereço (`.../exec`).
3. **Cloudflare → fotos-evento → Configurações → Variáveis e Segredos** (tipo *Secret*): `MAIL_WEBHOOK_URL` = o endereço copiado; `MAIL_WEBHOOK_SECRET` = a frase do passo 1.
4. **Implantações** → Retry na linha mais recente.

Sem essas variáveis o site funciona normal, só não envia e-mail. A senha fica criptografada no banco só até o e-mail sair; depois é apagada.

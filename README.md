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

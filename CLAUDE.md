# Fotos Evento (loja de fotos do Leandro Garozi)

Antes de qualquer trabalho aqui, leia `docs/GUIA-DO-APP.md`: é o mapa completo (o que é, onde está hospedado, como funciona, painel, rotas, dados, pendências, como adaptar para ensaios).

Regras rápidas:
- Responda em português do Brasil, texto direto e sem travessão.
- Nunca peça, mostre ou grave senhas e tokens. Os segredos ficam na Cloudflare (Configurações > Variáveis e Segredos); o guia só lista os nomes.
- Publicar = push na `main` (a Cloudflare publica sozinha). Não use "Retry deployment" numa linha antiga: ele recoloca a versão velha no ar.
- Rode `npm test` antes de publicar. Mudou o banco? Atualize `functions/_lib/schema.js` e crie um arquivo em `migrations/`.
- Este app é separado do repositório `core` (FARO) e do app antigo de ensaios (Apps Script).
- Espelho do guia no Drive: `Claude - IA/Cowork/FOTOS EVENTO - APP/`.

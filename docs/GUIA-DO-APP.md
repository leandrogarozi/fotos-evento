# Fotos Evento: guia do app (mapa para o Claude)

Documento vivo. Atualizado em 22/10/2026. Dono: Leandro Garozi (fotógrafo e consultor, Colatina, ES).
Se você é um Claude lendo isto: este é o mapa completo do app. Leia inteiro antes de mexer em código. Nunca peça nem imprima senhas ou tokens: só os NOMES das variáveis estão aqui.

## 1. O que é

Loja de fotos de eventos, feita para o campeonato interno de CrossFit de 24/10/2026 (38 atletas), mas construída para ser reaproveitada em outros eventos e, com adaptações, em ensaios.

O comprador:
1. entra pelo link (quase sempre pelo celular, via WhatsApp);
2. compra o pacote completo na pré-venda ou escolhe fotos avulsas depois;
3. paga com Pix ou cartão (Mercado Pago);
4. recebe um e-mail com a senha e o link;
5. volta quando quiser em "Já comprei" (WhatsApp + senha) e baixa as fotos em alta, sem marca d'água.

O Leandro tem um painel administrativo (com senha) para subir fotos, ver pedidos, mexer em preços e datas.

Este app é SEPARADO do app antigo de escolha de fotos para ensaios (Google Apps Script, projeto "escolhefotos"). O antigo continua como está, não foi alterado.

## 2. Onde está tudo (endereços e contas)

| Peça | Onde |
|---|---|
| Site no ar | https://fotos-evento-f1o.pages.dev |
| Página de venda | `/` |
| Já comprei (acesso com WhatsApp + senha) | `/acesso.html` |
| Galeria geral (todas as fotos com marca d'água) | `/galeria.html` (ou `/galeria.html?a=ID` de um atleta) |
| Painel administrativo | `/admin.html` (só o Leandro, com senha; não divulgar) |
| Código | GitHub: `leandrogarozi/fotos-evento` (branch `main`) |
| Hospedagem | Cloudflare Pages, projeto `fotos-evento`, publica sozinho a cada push na `main` |
| Banco de dados | Cloudflare D1, banco `fotos-evento` (binding `DB`) |
| Fotos | Cloudflare R2, bucket `fotos-evento`, privado (binding `FOTOS`) |
| Pagamento | Mercado Pago, aplicação Checkout Pro (API de Preferences), credenciais de PRODUÇÃO |
| E-mails | Google Apps Script do Gmail `leandrogarozi@gmail.com` (código em `docs/enviar-email.gs`) |
| Segredos | Cloudflare > fotos-evento > Configurações > Variáveis e Segredos |

Importante: o repositório `leandrogarozi/core` é o painel pessoal FARO. Este app NÃO mora lá (foi separado de propósito, para não misturar).

### Variáveis (apenas nomes)
- `ADMIN_PASSWORD`: senha do painel. Também é a chave das assinaturas de download e das senhas de comprador, e da cifra temporária da senha. Se trocar, links de download antigos deixam de valer e e-mails pendentes não conseguem mais decifrar a senha (a senha dos compradores continua valendo, ela é só um hash).
- `MP_ACCESS_TOKEN`: Access Token de produção do Mercado Pago.
- `MAIL_WEBHOOK_URL` e `MAIL_WEBHOOK_SECRET`: endereço `/exec` do script do Gmail e a frase combinada com ele.
- Opcionais (não configuradas hoje): `MP_WEBHOOK_SECRET` + `MP_WEBHOOK_STRICT=1` (exigir assinatura do webhook), `PIN_SECRET` (chave própria para a cifra da senha), `DOWNLOAD_SECRET` (chave própria dos links de download).

### Mercado Pago
- Webhook configurado: `https://fotos-evento-f1o.pages.dev/api/webhook/mercadopago`, evento Pagamentos.
- O webhook só avisa; quem decide é a API do Mercado Pago: o servidor consulta o pagamento e só libera se estiver `approved` com valor maior ou igual ao do pedido.
- Rede de segurança: ao abrir a página do pedido (`?sync=1`) e no botão Verificar do painel, o servidor busca o pagamento pelo `external_reference` (= id do pedido).
- A conta do Mercado Pago que RECEBE não consegue pagar para si mesma: testes de pagamento devem ser feitos em janela privada ou por outra conta.

## 3. Como funciona (fluxos)

### Pré-venda (até 23/10/2026 23:59, horário de Brasília)
1. Comprador escolhe o atleta na lista (agrupada por turma RX, INT, SC), informa nome, WhatsApp, e-mail (obrigatório), cria uma senha de 4 a 6 números (tem olhinho para conferir) e paga o pacote completo (R$ 50).
2. O pedido nasce como `aguardando`. O Mercado Pago confirma pelo webhook, vira `pago`.
3. Na hora que vira `pago` (uma vez só) sai o e-mail com WhatsApp, senha e botão "Acessar minhas fotos".
4. As fotos ainda não existem. Depois do evento o Leandro sobe as fotos e o acesso libera sozinho.

### Loja (depois da pré-venda)
- A página inicial vira "Encontre suas fotos" sozinha quando passa o fim da pré-venda.
- Opções: pacote completo (R$ 60 por 5 dias após publicar, depois R$ 80) ou fotos avulsas (1 foto R$ 15, 4 fotos R$ 40). O carrinho sempre cobra o MENOR preço possível (3 fotos cobram 40 e avisam que dá para levar mais 1 sem pagar a mais; 5 fotos custam 55 e oferecem o pacote). O cálculo é feito no SERVIDOR (`/api/quote` e `/api/checkout`), a tela só mostra.
- Na galeria do atleta: "Você aparece em X fotos. Por mais R$ Y leva todas." e botão "Quero todas".

### Como cada comprador recebe as fotos dele (decisão de 22/10/2026)
Sem reconhecimento facial (decisão consciente: o Claude não identifica pessoas por rosto), e sem marcação livre: se quem comprou o pacote pudesse marcar fotos à vontade, poderia pegar fotos de outros atletas e repassar. Por isso:
- O Leandro sobe tudo (todas entram na galeria geral, sem atleta).
- A aba **Triagem** do painel mostra uma foto por vez; o Leandro (ou o treinador) digita parte do nome do atleta, Enter escolhe, Enter com campo vazio salva e vai para a próxima. "Foto geral" tira da fila fotos de torcida e ambiente. Também dá para atribuir em massa em "Fotos enviadas" (seleciona várias, "Atribuir a...") ou subir por pasta de atleta (modo avançado).
- O pacote completo libera SÓ as fotos atribuídas ao atleta. Fotos sem atleta ficam para venda avulsa.
- Opcional e DESLIGADO por padrão: `claim_enabled = 1` religa a marcação livre ("Escolher minhas fotos"), com limite opcional `claim_max`. Com a chave desligada, marcações antigas não liberam nada.
- Quem comprou fotos avulsas baixa exatamente as que escolheu.

### Acesso do comprador (sem login/cadastro)
- WhatsApp + senha de 4 a 6 números (guardada só como hash). 5 erros travam aquele WhatsApp por 15 minutos.
- A página do pedido também abre por link único com token (`/pedido.html?t=...`), que é para onde o Mercado Pago devolve o comprador.
- WhatsApp é normalizado (só dígitos, sem o 55).

### Download
- Links assinados (HMAC) válidos por 7 dias, renovados toda vez que a página do pedido abre.
- Cada download confere se a foto pertence ao pedido pago.
- A original nunca tem URL pública. A vitrine (1200 px, qualidade 70%, marca d'água em diagonal repetida) vem de `/img/ID`.
- "Baixar todas (ZIP)" é montado no navegador do comprador (sem compressão), porque o servidor grátis tem pouquíssimo CPU. Em pacotes muito grandes no 4G, o download foto a foto é mais seguro.

### Encerramento das vendas
- Configurável: data fixa (`sales_end`) OU N dias depois de "fotos publicadas" (`sales_days` + `published_at`). Data fixa vale mais. Vazio = sem encerramento.
- Aviso verde bem visível com contagem regressiva na página inicial e na galeria. Depois do prazo a página vira "Vendas encerradas" e o servidor recusa compra (HTTP 410). Quem já comprou continua acessando.

### E-mail
- Enviado quando o pagamento é confirmado: assunto "Pagamento confirmado: suas fotos do <evento>", com WhatsApp, senha e botão do site.
- A senha fica CIFRADA (AES-GCM) em `orders.pin_enc` só até o e-mail sair; depois é apagada. Se o e-mail falhar, a compra segue paga e a senha cifrada fica para reenvio.
- O botão "Senha" do painel redefine a senha de um pedido e reenvia o e-mail com a nova.
- Limite do Gmail gratuito: cerca de 100 e-mails por dia.

## 4. Painel administrativo (`/admin.html`)

Login com `ADMIN_PASSWORD` (token HMAC de 12 horas guardado na sessão do navegador).

- **Pedidos**: lista, total vendido, status. Botões: Verificar (consulta o Mercado Pago), Liberar (marca como pago manualmente, serve se o webhook falhar, e também dispara o e-mail), Avisar (abre o WhatsApp do comprador com mensagem pronta), Ver (abre a página do pedido), Reenviar e-mail (caixinha para confirmar/corrigir o e-mail; reenvia a mesma senha se ainda estiver guardada, senão gera uma nova de 6 números e mostra na tela), Senha (define uma senha escolhida e reenvia), Atleta (corrige o atleta de um pedido), Excluir (pedido pago exige digitar EXCLUIR).
- **Preços e datas**: preços em R$, datas no horário de Brasília, botão "Agora" em "Fotos publicadas em", encerramento das vendas, limite de marcação, nome do evento e texto da marca d'água. Mostra um quadro com o encerramento efetivo.
- **Fotos**: upload simples (JPG, todas entram na galeria geral; a pasta por atleta fica em "Avançado": nome da subpasta = nome do atleta, "Ana + Bruno" para duas pessoas, "Geral" para sem atleta). Em "Fotos enviadas": seleção múltipla, atribuir a atleta, tirar do atleta, deixar sem atleta e excluir em massa.
- **Triagem**: identificar quem aparece em cada foto, uma por vez (teclado). A vitrine com marca d'água é gerada NO NAVEGADOR (canvas) e enviada junto com a original (PUT direto para o R2, 2 envios paralelos). Lista "Fotos enviadas" por atleta, todas ou gerais, com seleção múltipla e exclusão em massa.
- **Atletas**: adicionar, tirar da lista, voltar para a lista.
- **Link e QR**: links e QR codes da página de venda, do "Já comprei" e da galeria geral (QR por serviço externo qrserver.com).

## 5. Estrutura do código

```
public/            páginas estáticas (sem build, sem framework)
  index.html       pré-venda / loja / vendas encerradas
  galeria.html     galeria (geral, por atleta, modo "marcar minhas fotos")
  pedido.html      página do pedido (status, passos, downloads, ZIP)
  acesso.html      "Já comprei"
  admin.html       painel
  style.css        tokens do BRAND-MAP v3 (ver seção 8)
  pin.js           olhinho da senha
functions/         API (Cloudflare Pages Functions, JavaScript ESM)
  _middleware.js   garante o esquema do banco e transforma exceções em JSON legível
  _lib/            pricing, db, access, auth, mp, mail, paid, pin, schema, secret, sync, util
  api/             rotas (ver seção 6)
  img/[id].js      vitrine pública
migrations/        0001 a 0006 (referência; o esquema também se completa sozinho em schema.js)
test/              48 testes (node:test)
docs/              este guia e enviar-email.gs
```

## 6. Rotas

Públicas: `GET /api/event`, `GET /api/photos` (`?athlete=ID` ou `?geral=1`), `GET /api/quote?n=&athlete=`, `POST /api/presale`, `POST /api/checkout`, `POST /api/acesso`, `POST /api/claim`, `GET /api/pedido/:token` (`?sync=1`), `GET /api/dl/:photoId?t&e&s` (assinado), `GET /img/:id`, `POST /api/webhook/mercadopago`.

Admin (Bearer token): `POST /api/admin/login`, `GET|POST /api/admin/orders`, `GET|POST /api/admin/config`, `GET|POST /api/admin/athletes`, `GET|POST /api/admin/photos` (POST `{action:'delete', ids}`), `POST /api/admin/photo`, `PUT /api/admin/photo/:id/(orig|prev)`, `DELETE /api/admin/photo/:id`.

## 7. Dados

Tabelas D1: `config` (chave/valor), `athletes`, `orders`, `photos` (coluna `triaged`: foto já olhada na triagem e deixada como geral), `photo_athletes`, `order_photos`, `access_attempts`.

- `orders.kind`: `todas` (pacote completo de um atleta) ou `fotos` (avulsas, listadas em `order_photos`). `status`: `aguardando`, `pago`, `liberado`, `erro`. `presale`: 1 se veio da pré-venda. Campos de senha: `pin_salt`, `pin_hash`, `pin_enc` (temporário).
- Pacote `todas` libera as fotos atribuídas ao atleta em `photo_athletes` (e, só se `claim_enabled = 1`, as marcadas pelo comprador em `order_photos`).
- Foto só aparece se `has_orig = 1` e `has_prev = 1` (upload completo).
- R2: `orig/<id>` (original privada) e `prev/<id>` (vitrine).

Chaves de `config` (valores em centavos nos preços; o painel mostra R$): `event_name`, `event_date`, `brand_text`, `whatsapp`, `presale_end`, `presale_price_cents`, `price_tiers` (pacotes de fotos avulsas, JSON [{n, cents}]; vazio usa `price_one_cents` e `price_four_cents`), `price_all_event_cents`, `price_all_late_cents`, `price_box_cents` (campo existe, ainda não usado), `published_at`, `late_after_days`, `claim_enabled`, `claim_max`, `sales_end`, `sales_days` e os textos das páginas `txt_*` (editáveis no painel; `*asteriscos*` destacam). Os padrões ficam em `functions/_lib/pricing.js` (`DEFAULTS`).

## 8. Visual

Segue o BRAND-MAP v3 do Studio Garozi (Drive, `BRAND STUDIO GAROZI/BRAND-MAP.md`): fundo `#f5f5f1`, texto `#242723`, verde sálvia `#bdcdaa`, verde musgo `#6f8259`, títulos em Playfair Display, corpo em Figtree, botão pílula com seta, cantos arredondados, sem fundo escuro, texto sem travessão. Pendência: registrar esta peça na tabela de peças do BRAND-MAP e rodar o `brand-check.py` (só existe no Mac do Leandro).

## 9. Como trabalhar neste projeto (para o Claude)

- Publicar: fazer push na `main`; a Cloudflare publica sozinha (1 a 2 minutos). ATENÇÃO: o botão "Retry deployment" da Cloudflare refaz o commit DA LINHA em que se clica e a coloca como versão ativa. Clicar numa linha antiga recoloca versão velha no ar (já aconteceu 2 vezes). Para publicar algo novo, basta dar push. Para aplicar variável/binding novos sem mudar código, dar um commit pequeno.
- Testes: `npm test` (Node 22, usa `node:sqlite` e R2/Mercado Pago de mentira). Conferir o build das funções: `npx wrangler@3.114.17 pages functions build --outdir <pasta>`.
- Rodar local contra D1/R2 simulados: criar (sem commitar) um `wrangler.toml` com `pages_build_output_dir = "public"`, `[[d1_databases]] binding="DB"`, `[[r2_buckets]] binding="FOTOS"` e um `.dev.vars` com `ADMIN_PASSWORD` e `MP_ACCESS_TOKEN`; aplicar migrações com `wrangler d1 execute --local` e subir com `wrangler pages dev`. O Mercado Pago não é alcançável de dentro do sandbox do Claude.
- Esquema: `functions/_lib/schema.js` cria sozinho tabelas/colunas que faltarem (idempotente, não derruba o site se falhar). Qualquer mudança de esquema deve ir também para um arquivo novo em `migrations/` e para `schema.js`, e há um teste que compara os dois.
- Preview visual: as telas foram verificadas com Playwright (Chromium em `/opt/pw-browsers`) com a API simulada por `page.route`.

### Limites do plano gratuito que moldaram o código
- Workers/Pages Functions: ~10 ms de CPU por requisição. Por isso: nada de processar imagem nem montar ZIP no servidor; upload vai direto para o R2 com o corpo cru; hash de senha é HMAC simples (não PBKDF2).
- D1: no máximo 100 parâmetros por consulta e poucos comandos por requisição. Por isso as listas de fotos usam `json_each(?)` em um único comando.
- Pages devolve `index.html` com HTTP 200 para caminhos que não existem (ex.: `/marca.png`): ao buscar arquivos opcionais, conferir o `content-type`.
- R2: 10 GB grátis (cerca de 800 fotos de 12 MB), exige cartão cadastrado, sem custo de saída.
- Gmail via Apps Script: ~100 e-mails por dia.

## 10. Estado atual e pendências (22/10/2026)

Funcionando e testado no ar: pré-venda com pagamento real, e-mail com senha e link, "Já comprei", upload com marca d'água, vitrine, marcar as próprias fotos, download, painel, links e QR codes, encerramento das vendas (publicado agora, falta o Leandro conferir no ar).

A fazer pelo Leandro:
- conferir preços no painel (pré-venda R$ 50, 1 foto R$ 15, 4 fotos R$ 40, depois da pré-venda R$ 60, depois do prazo R$ 80);
- apagar pedidos e fotos de teste;
- divulgar a pré-venda;
- após o evento: subir as fotos, clicar em "Agora" em "Fotos publicadas em" e definir o encerramento das vendas;
- trocar a senha do painel (a atual foi colada em chat; lembrete agendado para domingo 25/10 às 20h);
- opcional: enviar o PNG transparente da marca d'água e salvar como `public/marca.png` (sem ele usa o texto "Leandro Garozi Fotografia").

Ainda não feito (prioridade 2 do brief original): cupom manual que libera o pacote de um atleta sem cobrança; pacote do box (libera todas as fotos do evento por valor definido no painel; o campo `price_box_cents` existe, falta a lógica).

Ideias discutidas e não implementadas: tela de triagem em massa (selecionar várias fotos e atribuir a um atleta), segurança extra do webhook (`MP_WEBHOOK_STRICT`), domínio próprio (ex.: fotos.leandrogarozi.com.br) no lugar do `.pages.dev`.

Decisão de produto registrada: SEM reconhecimento facial. A identificação é feita pelo próprio comprador (marcar as fotos) ou pelo Leandro por pastas.

## 11. Adaptar para ENSAIOS

O app antigo de ensaios (Apps Script: `Admin.html`, `Client.html`, `Code.gs`) funciona assim: o Leandro cria uma sessão por cliente com link da pasta do Drive, cota de fotos COM tratamento e SEM tratamento, e valor do pacote; o cliente marca fotos em cada categoria, escreve observações por foto tratada, finaliza e fala com o Leandro pelo WhatsApp; o Leandro recebe e-mail com a lista.

O que dá para reaproveitar deste app novo num modo "ensaio":
- galeria, lightbox, visual e layout mobile;
- acesso por WhatsApp + senha e e-mail de confirmação;
- upload com vitrine com marca d'água e original privada no R2 (substitui a pasta do Drive e os links do Drive expostos);
- painel de pedidos, avisos por WhatsApp, links assinados e download (útil para entregar as fotos tratadas);
- Mercado Pago, se houver cobrança no mesmo fluxo.

O que seria novo: sessão por cliente (um "evento" por ensaio, com cota COM/SEM tratamento), observação por foto, entrega das fotos tratadas depois da escolha, e a decisão de cobrar ou não pela plataforma. Caminho sugerido: generalizar "evento" (hoje há um evento só, configurado em `config`) para uma tabela `events`, e criar um tipo de pedido `ensaio` com cotas e observações.

## 12. Segurança (resumo)

- Originais só saem por link assinado de pedido pago; vitrine é o único arquivo público.
- Senha do comprador: só hash; senha em texto só cifrada e temporária, até o e-mail sair.
- Painel: senha em variável de ambiente, token de 12 horas, comparação em tempo constante.
- Valores sempre calculados no servidor; pagamento sempre confirmado consultando a API do Mercado Pago.
- Bloqueio por tentativas no "Já comprei". Exclusões sensíveis exigem confirmação digitada.
- Nunca colocar segredos no código, no repositório ou em conversa.

## 13. Histórico de decisões recentes (22/10/2026)
- Layout: uma proposta mais limpa (Inter, grade de 3 colunas) foi montada na branch `layout-limpo`, mas o Leandro preferiu manter o visual atual. A branch fica parada, sem publicar.
- Vários eventos ao mesmo tempo: adiado. Hoje é um evento por vez (nome e textos editáveis no painel); para o Vida Ativa, trocar nome, textos e atletas e limpar fotos e pedidos antigos.

## Vários eventos (caixa "Evento" no painel)
- No topo do painel há a caixa **Evento**. Tudo (pedidos, preços, fotos, atletas, links) vale para o evento escolhido.
- **+ Novo evento** cria uma galeria nova, com atletas, fotos e preços próprios (pode copiar preços e textos do evento atual).
- O evento principal abre sem nada no link; os outros abrem com `?e=apelido` (a aba "Link e QR" mostra o link certo de cada um).
- Banco: tabelas `events` e `event_config`; colunas `event_id` em atletas, fotos e pedidos (migração 0007).

## Pacote com limite de fotos
- Em "Preços e datas" há dois blocos separados: **Pré-venda** (valor, até quantas fotos, foto adicional) e **Depois da pré-venda** (idem). Limite 0 = todas as fotos. O limite só liga se a foto adicional custar pelo menos R$ 1,00.
- Pré-venda: paga o pacote; depois, se o atleta tem mais fotos que o limite, a pessoa escolhe as dela na página do pedido (uma vez, não troca). Se tem até o limite, libera tudo sozinho.
- Fotos adicionais: botão na página do pedido, R$ por foto, vira um pedido novo ligado ao pacote (mesma senha).
- Na galeria (depois da pré-venda) o carrinho cobra o menor valor entre pacote + adicionais e as fotos avulsas.
- O limite vale no pedido pela regra da hora da compra (coluna `orders.pack_limit`, migração 0008): mudar o limite não altera quem já comprou.

## Busca por selfie (reconhecimento de rosto)
- Roda no celular da pessoa (biblioteca aberta face-api, em `public/vendor/`). A selfie NUNCA vai para o servidor: só os 128 números do rosto (`POST /api/rosto`). No banco ficam só números (`photo_faces`), nunca imagens.
- No painel, ao enviar fotos (aba Fotos), a caixa "Preparar a busca por selfie" calcula os rostos de cada foto no computador. Fotos antigas sem rostos aparecem num aviso com o botão "Calcular agora".
- Enviar a pasta do evento: subpasta com o nome do atleta (ou "Ana + Bruno") e uma subpasta "Geral". Fotos soltas vão para a Triagem. As fotos Gerais aparecem na galeria de todos os atletas ("Fotos gerais do evento").
- Para ligar na loja: Preços e datas > Busca por selfie. Para testar antes, abra a loja com `?teste` no final do link. "Rigor da busca": 50 é o padrão (menor = mais rígido).
- Se o reconhecimento falhar, a pessoa continua achando as fotos pelo nome ("Ver as fotos pelo meu nome"). O pacote continua levando só as fotos identificadas por você (a opção "pacote libera fotos Gerais" fica desligada).
- Migração 0009 (`photo_faces`, `photos.faces_done`). Teste: `test/rosto.test.js`.
- Qualidade da busca: ao enviar, "Completa" corta a foto em pedaços e acha também gente ao fundo e de longe (bem mais lento; precisa de aceleração de vídeo no navegador), "Rápida" só rostos maiores. "Refazer os rostos das fotos já enviadas" recalcula pela pasta do computador, sem enviar de novo.
- Resultado da busca: "parecem você" (distância dentro do rigor) e "Talvez sejam você" (um pouco acima; rostos pequenos têm mais folga). Migração 0010 (`photo_faces.w`).

## Visual v4 (capa com fotos)
- Paleta: branco predominante, verde-limão `#A2FF01`, preto `#141414`, cinza `#434343`. Fontes: Anton (títulos) e Figtree (textos). Tudo definido em `public/style.css` (vale para o site e o painel).
- Página inicial (`public/index.html`): capa com as 4 fotos de `public/capa/1.jpg` a `4.jpg` (masculina, feminina, masculina, feminina), girando a cada 5,5 s. Para trocar uma foto, substitua o arquivo com o mesmo nome (JPG, uns 1800 px de largura) e publique.
- Textos da capa: Preços e datas > Textos do site > "Página inicial (capa)". O Instagram do rodapé vem de Preços e datas > Evento.

## Espaço usado (aba Fotos do painel)
- Mede o armazenamento (R2) de verdade: total usado, % dos 10 GB grátis, originais x vitrine, por evento, e quantas fotos ainda cabem. Amarelo a partir de 70%, vermelho a partir de 90%. Atualiza ao abrir a aba, ao apagar fotos e no botão Atualizar.
- "Limpar sobras" apaga arquivos que não pertencem a nenhuma foto do banco (envios que falharam). Endpoint: `GET/POST /api/admin/storage`.

## Busca por selfie em eventos grandes
- Cada requisição do plano grátis da Cloudflare tem ~10 ms de CPU. A busca compara os rostos em **fatias de 2.000** (`off`/`lim` em `POST /api/rosto`), que a página pede em paralelo e junta no celular. Cada fatia leva ~1 ms de conta (a comparação para cedo quando o rosto já está longe). Testado com 15.000 rostos.
- Resultado: "parecem você" (ids) e "talvez" (maybe), cada um com a distância. Os testes usam relógio fixo (`test/helpers.js`).

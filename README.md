# FORMAREDE

**Plataforma inteligente de formacao e acompanhamento de professores** — SaaS
multi-tenant para redes municipais de ensino. Cada municipio e um ambiente isolado
(dados, identidade visual e configuracoes proprias), com isolamento garantido no
banco via PostgreSQL Row-Level Security.

> Documento de referencia: `DRF-001`. Blueprint visual de arquitetura publicado
> como Artifact (link no chat).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind v4 |
| Backend | NestJS · Passport JWT · Zod |
| Banco | PostgreSQL 16+ · Prisma · **RLS por tenant** (pgvector so quando a curadoria semantica sair do stub) |
| Assincrono | BullMQ · Redis |
| Monorepo | Turborepo · pnpm |

## Estrutura

```
formarede/
├── apps/
│   ├── web/         Next.js (login, dashboard, gestao de municipios/escolas)
│   ├── api/         NestJS (auth, tenancy, organizacoes, auditoria)
│   └── worker/      BullMQ (transcricao, indexacao, relatorios, IA)
├── packages/
│   ├── db/          Schema Prisma + RLS + client tenant-aware
│   └── contracts/   Tipos, DTOs (Zod) e matriz RBAC compartilhados
├── docker-compose.yml   PostgreSQL + Redis
└── turbo.json
```

## Pre-requisitos

- Node.js >= 20.11
- pnpm 9 (`npm i -g pnpm`)
- Docker (para PostgreSQL + Redis)

## Como rodar

```bash
# 1. Dependencias
pnpm install

# 2. Variaveis de ambiente
cp .env.example .env

# 3. Sobe Postgres + Redis, aplica schema, aplica RLS e faz seed
pnpm bootstrap
#   = docker compose up -d && db:migrate && db:rls && db:seed

# 4. Compila os pacotes compartilhados (contracts/db) uma vez
pnpm build --filter=@formarede/contracts --filter=@formarede/db

# 5. Sobe tudo em modo dev (web + api + worker)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333/api/v1

### Credenciais de demonstracao (seed)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Administrador da rede | admin.sp@formarede.gov.br | Formarede@2026 |
| Superadministrador | super@formarede.gov.br | Formarede@2026 |

## Isolamento multi-tenant (RLS)

Toda tabela escopada carrega `tenant_id`. A cada requisicao a API fixa o contexto
e o Postgres impoe o filtro — mesmo um bug na aplicacao nao vaza dados entre
municipios (criterio de aceite CA-02).

- `forTenant(tenantId)` — client escopado; injeta `app.tenant_id` em cada operacao.
- `runAsSystem(fn)` — bypass controlado (seed, superadmin cross-tenant).

Ver `packages/db/prisma/rls.sql` e `packages/db/src/index.ts`.

**O RLS so vale para um papel comum.** Superusuario (e papel com `BYPASSRLS`) ignora as
politicas; o Postgres local do `docker compose` conecta como dono e serve para
desenvolver, nao para provar isolamento. Num servidor de verdade, a API conecta com o
papel `formarede_app` (sem superusuario) e o dono fica so para schema e RLS:

```bash
# 1. Uma vez por servidor, como superusuario (num schema proprio se o banco for compartilhado)
psql "$URL_DO_DONO" -c "CREATE ROLE formarede_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '...'" \
                    -c "CREATE SCHEMA IF NOT EXISTS formarede"

# 2. DATABASE_URL = formarede_app; DIRECT_URL = dono (db push e rls usam o DIRECT_URL)
#    as duas com ?schema=formarede
pnpm db:migrate && pnpm db:rls   # rls.sql tambem concede ao formarede_app o acesso ao schema
pnpm db:seed                     # roda como formarede_app: ja prova que o RLS deixa o seed passar
```

## Testes

Rodam contra um banco real configurado como acima (`DATABASE_URL` com `formarede_app`).

- `pnpm --filter @formarede/db test` — estrutura (cada modelo tem tabela), RLS forcado em
  toda tabela com `tenant_id`, isolamento entre municipios (ler, gravar, alterar, apagar),
  contexto que nao vaza entre consultas do pool, restricoes. Precisa do `db` compilado.
- `API_URL=http://localhost:3333 pnpm --filter @formarede/api test:e2e` — com a API no ar e o
  mesmo `DATABASE_URL`: cria um municipio de teste (IA no provider `mock`) e percorre login,
  permissoes, isolamento, curadoria, Copiloto, etapas, inscricao, chamada, frequencia,
  relatorios e CSV, atividade, certificado e validacao publica, pesquisa, trilha, paineis e
  Assistente (sem enviar mensagem, que chamaria a Anthropic). Apaga tudo o que criou no fim.

## Deploy (Easypanel)

**Um servico so (recomendado).** O `Dockerfile` da raiz monta web e API na mesma imagem:
a web atende na porta 3000 e repassa `/api/v1` para a API, que roda dentro do container.
Um dominio, sem CORS.

1. No projeto do Easypanel, crie um servico **App** ligado a este repositorio (branch `main`).
2. Em Build, escolha **Dockerfile** e deixe os padroes: Build Path `/` e arquivo `Dockerfile`.
3. Em Environment, cole o `.env` da raiz (fora do git: na maquina de quem faz o deploy ele
   guarda os valores de producao) ou preencha a tabela abaixo.
4. Em Domains, aponte o dominio para a porta **3000**.
5. Clique em Deploy (salvar nao dispara o build).

| Variavel | Valor |
|----------|-------|
| `NEXT_PUBLIC_MOCK` | `0` usa a API e o banco; `1` mostra os dados de demonstracao. Entra no build: mudar pede novo deploy |
| `DATABASE_URL` | papel `formarede_app` (ver RLS acima) |
| `JWT_SECRET` | `openssl rand -hex 32`; sem ele (ou com o do exemplo) a API nao sobe |
| `JWT_EXPIRES_IN` | `8h` (a web nao renova o token; com `15m` a sessao cai no meio do uso) |
| `ANTHROPIC_API_KEY` | Assistente pedagogico |
| `DEEPSEEK_API_KEY` | Copiloto, quando o provider do municipio for `deepseek` |

Se a API ou a web parar, o container sai e o Easypanel o reinicia; o log mostra o motivo
(por exemplo, `JWT_SECRET ausente`). O worker e o Redis nao entram: nenhuma rota enfileira
tarefas. Mudar o schema do banco se faz de fora, com o dono (`DIRECT_URL`):
`pnpm db:migrate && pnpm db:rls`.

**Servicos separados (opcional).** `apps/web/Dockerfile` (porta 3000) e
`apps/api/Dockerfile` (porta 3333), cada um num servico App com Build Path `/` e o caminho
do arquivo no campo do Dockerfile. Ai a web precisa de `NEXT_PUBLIC_API_URL` com o
endereco publico da API (sem `/api/v1`), e a API de `CORS_ORIGINS` com o da web.

## Endpoints (Fundacao)

| Metodo | Rota | Acesso |
|--------|------|--------|
| POST | `/auth/login` | publico |
| GET | `/auth/me` | autenticado |
| POST | `/auth/switch-tenant` | autenticado |
| GET | `/dashboard` | autenticado |
| GET | `/tenants` | SUPERADMIN |
| GET | `/tenants/current` | autenticado |
| GET/POST | `/regionais` | permissao regional:* |
| GET/POST/DELETE | `/escolas` | permissao escola:* |

## Roadmap

Esta entrega e a **Etapa 1 (Fundacao)**. Proximas: operacao pedagogica (curadoria,
encontros, atividades, certificados), MVP inteligente (copiloto, tutor RAG) e
diferenciais (trilhas adaptativas, microcredenciais, comunidades). Ver blueprint.

## Scripts uteis

```bash
pnpm db:studio     # Prisma Studio
pnpm db:reset      # recria schema + seed (apaga dados)
pnpm typecheck     # checagem de tipos em todo o monorepo
pnpm infra:down    # derruba Postgres + Redis
```

## Etapa 2 - Operacao pedagogica (entregue)

Novos usuarios demo: `formador.sp@formarede.gov.br` e `prof.sp@formarede.gov.br`
(mesma senha `Formarede@2026`).

| Metodo | Rota | Acesso |
|--------|------|--------|
| GET/POST | `/formacoes` | formacao:read / formacao:create |
| GET | `/formacoes/:id` | detalhe com modulos, turmas, materiais, atividades e historico |
| POST | `/formacoes/:id/encerrar` · `/formacoes/:id/reabrir` | formacao:transicao — ciclo simples (em andamento ↔ encerrada); quem cria decide, sem aprovação por etapas; fica no histórico e na auditoria |
| POST | `/formacoes/:id/modulos` e `/turmas` | estruturacao |
| GET/POST | `/encontros` | agenda por turma |
| GET | `/encontros/:id/chamada` | lista de presenca |
| POST | `/encontros/:id/frequencia` | registro em lote |
| GET/POST | `/materiais` | curadoria (novo material entra EM_REVISAO) |
| POST | `/materiais/:id/decisao` | aprovar/rejeitar (curador) |
| POST | `/materiais/:id/vincular` | colecao da formacao |
| POST | `/formacoes/:id/atividades` | criar atividade |
| PUT | `/atividades/:id/prazo` | atividade:update — `{prazo}` muda a data de entrega (`null` tira o prazo); fica na auditoria |
| POST | `/atividades/:id/entrega` | professor envia/reenvia |
| GET | `/atividades/:id/entregas` | formador lista |
| POST | `/entregas/:id/avaliacao` | devolutiva (nota/feedback/ajuste) |
| POST | `/inscricoes` | inscricao em turma (valida vagas) |
| GET | `/participante/minhas-formacoes` | area do professor com progresso |
| POST | `/inscricoes/:id/certificado` | emite se frequencia minima + atividades avaliadas |
| GET | `/certificados/validar/:codigo` | **publico** - validacao de certificado |

Paginas web novas: `/formacoes`, `/formacoes/[id]`,
`/materiais`, `/minhas-formacoes` e `/validar/[codigo]` (publica).

Status de validacao: `tsc` verde em contracts, db, api, web e worker
(pnpm 9 / Node 24). Runtime com banco requer Docker (`pnpm bootstrap`).

## Etapa 2 - complemento final (avaliacoes, relatorios, chamada)

| Metodo | Rota | Acesso |
|--------|------|--------|
| GET | `/avaliacoes?formacaoId=` | autenticado (lista questionarios) |
| POST | `/formacoes/:id/avaliacoes` | avaliacao:create (escalas 1-5 + abertas, anonima opcional) |
| GET | `/avaliacoes/:id` | autenticado (perguntas para responder) |
| POST | `/avaliacoes/:id/respostas` | avaliacao:responder (anonima nao referencia inscricao) |
| GET | `/avaliacoes/:id/resultados` | avaliacao:read (medias + textos agregados) |
| GET | `/relatorios/frequencia?formacaoId=` | report:read |
| GET | `/relatorios/conclusao` | report:read (inscritos, certificados, taxa) |
| GET | `/relatorios/frequencia/csv` e `/conclusao/csv` | report:export |

Paginas novas: `/encontros` (agenda) + `/encontros/[id]/chamada` (frequencia em
lote com justificativa), `/avaliacoes` (criar/listar), `/avaliacoes/[id]/responder`,
`/avaliacoes/[id]` (resultados agregados) e `/relatorios` (tabelas + export CSV).

Banco: 23 modelos sob RLS. Typecheck verde em todos os pacotes, incluindo o seed.

## Etapa 3 - MVP inteligente (entregue): Copiloto com IA governada

Gateway proprio em `packages/ai` (RNF-024): o dominio nunca chama provedor
direto. Providers: `deepseek` (PADRAO - deepseek-chat via API OpenAI-compativel,
requer DEEPSEEK_API_KEY), `anthropic` (SDK oficial, claude-opus-4-8, adaptive
thinking, structured outputs) e `mock` (deterministico, roda sem chave). Salvaguardas
implementadas: mascaramento de PII na entrada (RIA-007), prompts versionados
(RIA-011), fontes = somente materiais aprovados (RIA-003/006), log completo de
interacao com modelo/prompt/usuario/tokens (RIA-004) e sinalizacao (RIA-010).
O plano gerado nasce RASCUNHO e so publica com aprovacao humana (RIA-002/009, CA-09).

| Metodo | Rota | Acesso |
|--------|------|--------|
| POST | `/ia/formacoes/:id/plano` | ia:usar - gera rascunho (copiloto IA-01) |
| POST | `/ia/interacoes/:id/decisao` | ia:usar - APROVAR / REJEITAR / EDITAR |
| POST | `/ia/interacoes/:id/sinalizar` | autenticado - reporta resposta incorreta |
| GET | `/ia/interacoes` | ia:auditar - trilha de interacoes |
| GET/PUT | `/ia/config` | ia:config - habilitar IA e escolher provider por municipio |

Paginas: `/formacoes/[id]/copiloto` (gerar -> revisar com fontes -> aprovar/
rejeitar/regenerar/sinalizar) e `/ia` (governanca + auditoria). Banco: 25
modelos sob RLS. Geracao padrao: DeepSeek - defina `DEEPSEEK_API_KEY` no `.env`
(modelo via `DEEPSEEK_MODEL`, padrao deepseek-chat). Troque de provider por
municipio na tela "IA governada" (anthropic ou mock).

## Acompanhamento da frequência dos professores

Tela `/frequencia` (menu "Frequência") para gestão da rede, coordenação, formadores e gestão
escolar — permissão `frequencia:acompanhar`. A gestão escolar vê apenas os professores das
próprias escolas (vínculo `membership.escolaId`).

| Método | Rota | Acesso |
|--------|------|--------|
| GET | `/frequencia/professores?formacaoId=&turmaId=&escolaId=` | frequencia:acompanhar |

Por professor (inscrição): frequência acumulada (presenças ÷ chamadas registradas), máximo
ainda alcançável até o fim da turma, faltas e justificadas, ausências seguidas, histórico
encontro a encontro e situação — *não alcança o mínimo*, *abaixo do mínimo*, *atenção*
(até 10 pontos acima do mínimo ou 2+ ausências seguidas), *sem chamada* e *regular*. No
recorte: indicadores, quem precisa de contato, encontros já realizados sem chamada e
exportação CSV. A regra de cálculo é `resumirFrequencia` em `packages/contracts`, a mesma
usada pelo modo demonstração; a certificação continua usando presenças ÷ encontros previstos.

## Experiência por papel (professor e quem conduz)

O sistema organiza cada tela pelo que a pessoa vem fazer:

- **Menu por papel.** Professor: Início, Minhas formações, Avaliações e Assistente. Quem conduz:
  Início, Formações, Encontros, Frequência, Avaliações e Assistente. Materiais e Escolas só para quem
  cadastra ou aprova. "Voltar" leva à tela de cima (a formação, a lista), e todo botão do Assistente
  abre o mesmo painel. As permissões vêm do papel (não da cópia guardada no login).
- **Início = próxima ação.** Professor: "Para fazer agora" (ajuste pedido, entrega, pesquisa, próxima
  etapa da trilha, certificado liberado), próximo encontro e as próprias formações. Quem conduz:
  "O que precisa de você" (chamada de hoje e pendentes, entregas por atividade, etapas em curadoria)
  e os próximos encontros. Cada item leva ao ponto exato (`/encontros/:id/chamada`,
  `/formacoes/:id?avaliar=<atividade>#atividade-…`, `#trilha`). Gestão da rede (`report:read`): "O que
  depende de você" (materiais para revisar, formação esperando a decisão de encerrar, professores abaixo do
  mínimo, chamadas pendentes) e depois "Como está a rede", com a frequência da mesma conta da tela de Frequência.
- **Uma conta só.** Minhas formações, Início e a página da formação usam a mesma participação
  (presenças sobre encontros previstos, atividades avaliadas); o botão do certificado só aparece quando
  liberado. O certificado (`/validar/:codigo`) é o próprio documento: imprimir/salvar em PDF e conferir
  pelo mesmo endereço.
- **Pesquisas.** O professor vê "Para responder" e "Já respondidas", inclusive nas anônimas: a resposta
  continua sem ligação com a pessoa e só a participação (sem data) é registrada (`avaliacao_participacao`),
  o que também barra a resposta duplicada.
- **Chamada e encontros.** A chamada diz qual encontro é, marca todos de uma vez, mostra a escola de cada
  cursista e tem a barra de salvar sempre à mão. Nada se perde: cada toque fica num rascunho do aparelho
  (recuperado ao voltar) e sair por um link do app com marcações não salvas oferece, na própria barra,
  "Salvar e sair / Sair sem salvar / Continuar". Depois de salvar, a tela oferece a próxima chamada
  pendente na própria barra. Salvar com cursista sem marca pergunta antes; a chamada salva assim fica
  "Chamada incompleta" (Início, Encontros, formação e Frequência) até todos terem marca. Quem se inscreveu
  depois do encontro não entra na conta. Encontros agrupa "Chamadas a fazer", "Próximos" e "Já realizados",
  e "Agendar encontro" cria o encontro da turma.
- **Nomes.** "Pesquisas" são os questionários (menu e página `/avaliacoes`); dar nota à entrega é sempre
  "devolutiva" ("Dar devolutiva", "Registrar devolutiva"). A situação de uma entrega tem o mesmo texto e a
  mesma cor para quem envia e quem avalia (`SituacaoEntrega`, a partir de `ENTREGA_STATUS_LABELS`).
- **Certificado.** A página `/validar/:codigo` dá os parabéns à própria pessoa, volta para Minhas formações
  quando há sessão e compartilha (compartilhamento do celular ou WhatsApp) além de imprimir/salvar em PDF.
- **Plano com IA (Copiloto).** Mostra a formação, marca o rascunho como da IA (selo e borda tracejada na
  cor própria da IA), deixa editar o rascunho bloco a bloco (aprovar com edição envia `EDITAR` e a auditoria
  guarda as duas versões), exige o diagnóstico, avisa antes de gerar se não há material aprovado como fonte,
  confirma antes de descartar ou publicar e recolhe os detalhes técnicos para auditoria.
  Publicado, vira "Plano aprovado" e aparece na seção "Plano formativo" da formação (quem aprovou, quando,
  fontes, histórico e o próximo passo: criar os módulos a partir do plano).
- **Curadoria.** Aprovar e recusar pedem confirmação no próprio item: aprovar diz o que muda e avisa se falta
  link ou licença; recusar exige o motivo, que fica no acervo para quem cadastrou (`material.motivo_recusa`).
- **Preparar a formação.** Antes da execução, a página da formação abre com os passos (plano, módulos,
  trilha, turma, encontros), cada um com a ação de quem pode fazê-lo; plano aprovado sem módulos vira tarefa
  no Início de quem cria módulos.
- **Relatórios.** Conclusão por formação com os números em texto e o mínimo de cada formação, e exportação
  CSV; a frequência usa a mesma conta da tela de Frequência (onde fica a lista por professor).
- **Para quem estuda.** Etapas no idioma do cursista ("Em preparação", "Em andamento", "Encerrada"); no
  catálogo, "Você participa" / "Com turma aberta". Resultados de pesquisa mostram a formação e a taxa de
  resposta ("18 de 24 cursistas responderam").

| Método | Rota | Acesso |
|--------|------|--------|
| GET | `/painel/conducao` | quem conduz ou acompanha; cada lista só para quem age sobre ela |
| GET | `/participante/minhas-formacoes` | participante:area — agora com a participação completa (mesma da formação) |
| GET | `/encontros/:id` | encontro:read — encontro com turma e formação (contexto da chamada) |
| GET | `/ia/formacoes/:id/planos` | ia:usar — planos aprovados da formação, do mais recente ao mais antigo |
| GET | `/avaliacoes` | professor: só as das suas formações, com `respondida`; quem conduz: todas |

## Página da formação: uma visão para quem estuda, outra para quem conduz

`/formacoes/:id` mostra a mesma trilha para todos, mas organiza o resto pelo papel:

- **Cursista (professor):** "Sua participação" (próximo encontro e o que falta para o certificado:
  presenças contadas como no certificado e atividades avaliadas), a trilha com "Continuar a trilha"
  e etapas concluídas recolhidas, "Suas atividades" (envio da entrega, devolutiva e pedido de ajuste
  no mesmo lugar) e os encontros com a própria presença. Quem não está numa turma vê como se inscrever.
- **Quem conduz (formador, gestão, curadoria):** "O que precisa de você" (chamada pendente, entregas
  aguardando devolutiva, etapas em curadoria e o próximo encontro), a trilha, "Atividades e entregas"
  (fila por atividade, nota e devolutiva ou pedido de ajuste sem sair da página, nova atividade) e os
  encontros com a situação da chamada. Sem aprovação por etapas: a formação nasce
  em andamento (o checklist "Preparar a formação" aparece até haver turma com encontros) e quem a criou
  usa "Encerrar a formação", no fim da página, com confirmação; encerrada, o aviso vai para o topo, com
  quem encerrou e quando, e "Reabrir".

| Método | Rota | Acesso |
|--------|------|--------|
| GET | `/formacoes/:id/minha-participacao` | participante:area — `null` se a pessoa não está numa turma da formação |
| GET | `/formacoes/:id/acompanhamento` | quem conduz ou acompanha (trilha:editar, frequencia:registrar, entrega:read, inscricao:read ou formacao:update); a fila de entregas só com entrega:read |

O envio e a avaliação usam as rotas que já existiam (`POST /atividades/:id/entrega`,
`GET /atividades/:id/entregas`, `POST /entregas/:id/avaliacao`); o link anexado à entrega também
só aceita `http(s)`.

## Trilha formativa

Seção "Trilha formativa" na página de cada formação (`/formacoes/:id#trilha`; atalho
"Abrir a trilha formativa" em Minhas formações). Formadores, curadoria e gestão da rede
(`trilha:editar`) montam um percurso em ordem com vídeos, documentos, podcasts, links e
materiais do acervo, cada etapa com orientação, tempo estimado, módulo e indicação de
obrigatória ou opcional; o cursista estuda na própria página e marca o que concluiu.

| Método | Rota | Acesso |
|--------|------|--------|
| GET | `/formacoes/:id/trilha` | formacao:read (cursista vê só etapas aprovadas e o próprio progresso; quem edita vê tudo e quantos concluíram) |
| POST | `/formacoes/:id/trilha/etapas` | trilha:editar — `materialId` do acervo (aprovado) **ou** `recurso` novo `{tipo, titulo, url}` |
| POST | `/formacoes/:id/trilha/modelo` | trilha:editar — `{modeloId}`: as etapas do modelo entram no fim da trilha, sem recurso |
| PUT | `/trilha/etapas/:etapaId/recurso` | trilha:editar — mesmos campos de criar: dá à etapa do modelo (ou à de material recusado) o recurso e os textos |
| POST | `/formacoes/:id/trilha/ia` | trilha:editar + ia:usar — `{objetivo, quantidade (3-8), tempo, formatos, usarAcervo, substituir}`: proposta do Gerador de trilhas (nada é gravado na trilha); com `substituir`, ao salvar ela fica no lugar das etapas atuais |
| POST | `/formacoes/:id/trilha/ia/:interacaoId` | trilha:editar — `{incluir: [posições]}`: grava as etapas escolhidas; descartar usa `POST /ia/interacoes/:id/decisao` (`REJEITAR`) |
| PUT / DELETE | `/trilha/etapas/:etapaId` | trilha:editar |
| POST | `/trilha/etapas/:etapaId/mover` | trilha:editar — `{direcao: "subir" \| "descer"}` |
| POST | `/trilha/etapas/:etapaId/conclusao` | participante:area — `{concluida}`, só inscritos numa turma da formação |

**Modelos prontos** (`MODELOS_TRILHA` no `contracts`): "Percurso entre dois encontros", "Ciclo de
prática: ver, planejar, aplicar e refletir", "Estudo de um documento curricular" e "Acolhida e
diagnóstico". Cada etapa traz o tipo de recurso previsto, uma orientação e o tempo, com trechos
entre colchetes para trocar (`[tema do encontro]`). As etapas entram sem material (`material_id`
vazio, `tipo_previsto`) e só quem edita as vê; em cada uma, "Substituir conteúdo" troca título,
orientação e recurso de uma vez (o título não salva com colchetes), e só então ela chega aos
cursistas. O checklist "Preparar a formação" só dá a trilha por pronta sem etapas a definir.

**Gerar com IA**: quem edita conta o objetivo, a quantidade de etapas, o tempo de estudo e os
formatos, e o **Gerador de trilhas** (perfil do agente LangGraph de `@formarede/ai`, Claude Opus 5.5)
lê a formação (objetivos, público, módulos, plano aprovado, trilha atual) e o acervo aprovado do
município, pode buscar mais materiais e entrega a proposta pela ferramenta `apresentar_trilha`,
validada pelo schema do `contracts`. A API confere os materiais citados (só aprovados do próprio
município; o resto vira etapa a definir, com `recurso_sugerido` do que procurar) e registra a
interação (`ai_interacao`, assistente `gerador-trilha`, prompt versionado). A tela mostra a proposta
como rascunho da IA; só as etapas marcadas entram na trilha ao salvar (`APROVADA` ou `EDITADA`), no fim
ou no lugar da trilha atual ("Substituir pela proposta da IA", o padrão quando a trilha só tem etapas a
definir, como as de um modelo pronto; com material ou progresso de cursistas, a tela avisa o que sai), e
descartar fica registrado (`REJEITADA`). Com o provider `mock` do município, a proposta sai de
`propostaTrilhaDeExemplo`, sem chamar o modelo (testes e demonstração).

Todo recurso é um `Material`: o recurso novo entra no acervo **em revisão** (tag `trilha`) e
só aparece para os cursistas depois que a curadoria aprova (`material:aprovar`, que pode
aprovar ali mesmo na trilha). A etapa também vincula o material à coleção da formação, que
alimenta o Copiloto e o Assistente. Tabelas `trilha_etapa` e `trilha_progresso`, sob RLS;
novo tipo de material `PODCAST`.

Mídia (`apps/web/src/lib/midia.ts`): YouTube (via `youtube-nocookie.com`), Vimeo e Spotify
(episódio ou programa) viram player embutido, montado a partir do id e carregado só quando a
pessoa clica em "Assistir aqui" / "Ouvir aqui"; arquivos `.mp4/.webm` e `.mp3/.m4a/.ogg/.wav`
tocam no player nativo; o resto (PDF, sites) abre em nova aba. Só endereços `http(s)` são
aceitos, também no cadastro de materiais.

## Assistente Pedagógico (IA): LangGraph + Claude Opus 5.5

O grafo LangGraph (`packages/ai/src/agente.ts`) é compartilhado: o laço agente ↔ ferramentas,
streaming, fallback em recusa e o teto de chamadas valem para todo perfil. O Assistente é um perfil
(conversa, cartão de planejamento) e o Gerador de trilhas é outro (`packages/ai/src/trilha`), que
termina ao entregar a proposta.

Tela `/assistente` (menu "Assistente IA") para professores, formadores, coordenação,
curadoria e gestão da rede — permissão `ia:assistente`. Ajuda a construir planos de
aula, sequências didáticas e roteiros de encontros formativos e tira dúvidas sobre como
aplicar em sala as ideias das formações. Atalho na página de cada formação
("Conversar com o assistente").

**Arquitetura** (`packages/ai/src/assistente/`): um `StateGraph` do LangGraph orquestra o
laço `agente ⇄ ferramentas` e o streaming de eventos; cada nó `agente` chama a Messages
API pelo SDK oficial (`@anthropic-ai/sdk`) com `claude-opus-5-5`, thinking adaptativo
(`display: "updates"` para as notas de progresso), `effort: "medium"`, ferramentas
`strict` com `eager_input_streaming`, cache de prompt e `fallbacks: "default"` em caso
de recusa do classificador. Até 6 chamadas ao modelo por resposta.

| Ferramenta | O que faz |
|---|---|
| `listar_formacoes` | formações acessíveis (professor: as que cursa) |
| `consultar_formacao` | objetivos, módulos, atividades, materiais aprovados vinculados e a trilha formativa (só etapas aprovadas) |
| `buscar_materiais_aprovados` | materiais aprovados pela curadoria (únicas fontes citáveis) |
| `apresentar_planejamento` | cartão estruturado do planejamento (rascunho para revisão) |

| Método | Rota | Acesso |
|--------|------|--------|
| GET/POST | `/assistente/conversas` | ia:assistente (só as próprias conversas) |
| GET/DELETE | `/assistente/conversas/:id` | ia:assistente |
| POST | `/assistente/conversas/:id/mensagens` | ia:assistente — resposta em SSE (`texto`, `progresso`, `ferramenta`, `planejamento`, `fim`, `erro`) |

Salvaguardas: PII mascarada na pergunta e nos resultados das ferramentas (RIA-007);
prompt versionado `assistente-pedagogico/v1` (RIA-011); fontes = materiais aprovados
(RIA-003/006); cada turno gera uma `AiInteracao` com modelo, versão e tokens (RIA-004)
e pode ser sinalizado (RIA-010); respeita a IA desabilitada por município (RIA-005).
O histórico é append-only (tabelas `assistente_conversa` e `assistente_turno`, sob RLS):
as mensagens voltam ao modelo exatamente como vieram, inclusive blocos de thinking.

Configuração: defina `ANTHROPIC_API_KEY` no `.env` e reinicie a API. No modo
demonstração (`NEXT_PUBLIC_MOCK=1` em `apps/web/.env.local`) as respostas do assistente
são simuladas; para conversar com o Claude Opus 5.5 use `NEXT_PUBLIC_MOCK=0`.

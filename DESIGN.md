# Design

Sistema visual do FORMAREDE. Fonte da verdade dos tokens: `apps/web/src/app/globals.css`.
Modelo: o design system do IncluiEdu (Claude Design System "IncluiEdu"), com a marca em
**amarelo** no lugar do azul. Tema único claro.

## Theme

Calmo, claro e acolhedor: o app vive numa moldura `paper` arredondada sobre `canvas`, com a
faixa da marca (laranja, amarelo e lima em terços, 6 px) na base. Menu lateral cinza-quente,
botões em pílula, quadro de dados com cartões brancos, gráficos com textura listrada e o
valor sempre também em texto.

## Color

| Token | Valor | Uso |
|---|---|---|
| `canvas` / `paper` / `paper-raised` | `#efe9da` / `#fbf8f0` / `#ffffff` | Fundo atrás da moldura / moldura e campos / cartões |
| `surface-muted` | `#f4eedf` | Menu lateral, quadro de dados, controles neutros |
| `line` / `line-strong` | `#e5dcc6` / `#958a6c` | Divisórias / borda de campo (3,2:1) |
| `ink` / `ink-soft` / `ink-strong` | `#2b2410` / `#5f5640` / `#1d1808` | Texto / secundário / texto sobre a marca e os sinais |
| `brand` | `#f2b705` | Botão principal, item ativo, botão do Assistente — **texto `ink` por cima** (8,5:1) |
| `brand-hover` | `#e0a500` | Hover do principal |
| `brand-strong` | `#7a5200` | Ocre: link, anel de foco (o amarelo não chega a 3:1 como contorno) |
| `brand-soft` / `brand-faint` / `brand-tint` / `brand-warm` | `#fff1c2` / `#fdf6dc` / `#fbe7a3` / `#f9e09a` | Secundário e hover / herói / hover do secundário / avatar e seleção |
| `green` / `amber` / `coral` (+ `-soft`) | `#23703f` / `#8a3d0b` / `#923f48` | Sucesso / atenção (em laranja, para não se confundir com a marca) / erro |
| `peach` `teal` `sage` `rose` (`-soft`, `-ink`, `-fill`) | — | Categorias (modalidade da formação), nunca estado |
| `signal-lime` / `signal-yellow` / `signal-orange` / `signal-track` | `#7cb93a` / `#f5be0b` / `#f4693a` / `#ece5d3` | Dados: bom / intermediário / atenção / trilho. Só preenchimento, nunca texto |
| `ia-ink` / `ia-soft` / `ia-line` | `#33479a` / `#e9edfb` / `#7a8bd0` | **Só o que a IA escreveu**: tinta de caneta azul no selo "Proposto pela IA", no avatar do Assistente e na borda tracejada do rascunho (7,9:1 sobre `paper`; borda 3,1:1). Não é marca, estado nem categoria |

Regras: um só principal por área; sobre o amarelo vai sempre `ink`/`ink-strong`; texto e foco da
marca em `brand-strong`; não escrever hex fora dos tokens. A ponte no fim do `:root` mantém os
nomes antigos (`--accent`, `--c-*`, `--surface-2`…) apontando para os novos.

## Typography

**Noto Sans** em tudo (títulos e números em negrito, `tracking-tight` −0,025em); **JetBrains
Mono** só em código. Escala: 12 (caption, piso) · 14 (corpo, rótulo) · 16 (leitura, título de
cartão) · 20 (seção) · 24 · 32 · 40 (título de página, KPI) · 56. Números com `tabular-nums`.
Caixa de frase em títulos, botões e selos.

## Components

- `.card` (ui-card): branco, borda `line`, 22 px de canto. `.dash-board` + `.dash-card`: quadro
  cinza (30 px) com cartões brancos sem borda — o padrão de todo dado.
- `.btn-primary` (amarelo + ink), `.btn-secondary` (`brand-soft` + ocre), `.btn-ghost` (discreto,
  borda `line`), `.btn-danger` (coral). Pílula, 44 px, 14 px médio.
- `.input` 44 px, 12 px de canto, fundo `paper`; foco com borda ocre e brilho amarelo.
- `.badge` 12 px médio; `.status-pill` com o sinal cheio; `.kpi` cartão tingido por `data-tom`.
- `PageHeader`: título de 40 px, logo abaixo a linha de fatos (`meta`: modalidade · carga · etapa) e a
  frase de apoio. **Sem rótulo acima do título** (eyebrow/kicker é proibido no piso de qualidade).
- Início por papel: a primeira seção é a próxima ação ("Para fazer agora" / "O que precisa de você"),
  em linhas `.pend` (ícone + texto + contexto + uma ação; só a primeira é principal); indicadores da
  rede vêm depois e só para quem acompanha a rede. Nada de número gigante como destaque. A curadoria
  (`report:read`) abre em "O que depende de você" (materiais em revisão, respostas às devolutivas,
  professores abaixo do mínimo, chamadas pendentes) e depois "Como está a rede": uma frase com o tamanho
  da rede, três quadros (desempenho, frequência por situação, entregas) e o resto em "Mais indicadores".
  Números de frequência saem da mesma conta da tela de Frequência.
- Trabalho não salvo (ex.: chamada): rascunho automático no aparelho e, ao tentar sair pelo app, a
  escolha aparece na própria barra de ação ("Salvar e sair / Sair sem salvar / Continuar"); nada de
  diálogo do navegador. Nos formulários da trilha (editar, substituir, nova etapa, gerar com IA) o salvar fica numa barra
  presa ao fim da tela, que diz quando os cursistas veem a etapa; sair com alterações pergunta nela
  (`useSaidaProtegida`: "Continuar editando / Sair sem salvar", barra laranja). Ação destrutiva ou que publica pede confirmação em linha, dizendo o que muda.
- Salvar nunca afirma o que não é verdade: chamada salva com cursista sem marca pergunta antes ("Marcar
  os N como presentes e salvar / Salvar só as marcadas / Continuar"), fica "Chamada incompleta" em todas
  as telas e continua pendente. A barra muda de forma e cor com o que diz (pergunta laranja, salva verde
  com visto) e o foco vai para a primeira ação dela. Quem se inscreveu depois do encontro fica fora da conta.
- Formulários validam pela própria tela (`noValidate`): o erro aparece logo abaixo do campo
  (`.campo-erro`, campo com `aria-invalid`) e some ao digitar. Link colado ganha o "https://" que faltar
  (`linkWeb` em `lib/texto.ts`). Quando o formulário some depois de enviar, o foco vai para a confirmação.
- Decisão que publica, sempre em linha e no lugar do item: aprovar material diz o que muda e avisa o que
  falta conferir (sem link, sem licença → "Aprovar mesmo assim"); recusar pede o motivo, que quem cadastrou
  lê no acervo. O resultado fica no lugar do item, com o foco nele; nada pula de posição.
- Conteúdo de IA: `SeloIA` ("Proposto pela IA · revise" no rascunho, "· você editou", "· aprovado",
  "· editado e aprovado"), rascunho com borda tracejada `ia-line`, aprovado com borda cheia. O rascunho do
  Copiloto é editável bloco a bloco (`PlanoEditavel`: "Editar" → campos com remover/adicionar → "Concluir";
  bloco mexido ganha "Editado"); o pedido fica fixo acima e a soma das horas é conferida com a carga da formação. O plano aprovado mora na seção "Plano formativo"
  da formação, com quem aprovou, quando, fontes e histórico. O amarelo fica só no botão que abre o Assistente.
- Cada tela define o título da aba ("Encontros · Formarede") pelo `PageHeader` (`useTituloDaAba`).
- Ciclo da formação sem aprovação por etapas (quem cria é quem valida): nasce "Em andamento" e termina em
  "Encerrada" pelo "Encerrar a formação" no fim da página (confirmação em linha; encerrada, o aviso sobe ao
  topo com quem e quando, e "Reabrir"). Nova formação: a barra presa ao fim da tela mostra "Salvar formação"
  em qualquer passo assim que o obrigatório (título) está preenchido; salvo, a lista de formações confirma e
  destaca a nova.
- Formação em preparação (ainda sem turma com encontros): a primeira seção é "Preparar a formação", os
  passos em ordem (plano, módulos, trilha, turma, encontros) com `Requisito`; só o próximo passo por fazer
  tem o botão principal, e quem não pode fazer um passo lê quem faz.
- Números para a gestão em texto, não em blocos de número grande: `dl.rel-numeros` (rótulo, valor, apoio),
  "—" com o motivo quando não há base. Cor de dado segue o valor (conclusão ≥ 70 lima, ≥ 50 amarelo, senão
  laranja; satisfação de 1 a 5 com a barra começando em 1). Relatórios, Início e Frequência usam a mesma
  conta (`resumirFrequencia`) e o mínimo de cada formação.
- Falha ao carregar: `ErroCarga` (o que aconteceu + "Tentar de novo"), nunca "Erro ao carregar." solto.
- Status com um vocabulário só (`MATERIAL_STATUS_LABELS`, `ENTREGA_STATUS_LABELS`, `situacaoEncontro`
  no `contracts`); plurais e decimais por `lib/texto.ts` (`plural`, `decimal`), datas por `lib/datas.ts`.
- `.empty-state` com borda tracejada; `.hatch` (textura a 120°) em barras, roscas e medidores.
- Modelo pronto (trilha): escolhido em linhas de opção (`.modelo-opcao`, a escolhida em `brand-faint` com borda
  amarela) com a prévia das etapas logo abaixo; "Usar este modelo" fica numa barra presa ao fim da tela
  (`.modelo-barra`, como a da chamada: some a barra de baixo do celular e o botão do Assistente), com o modelo e
  quantas etapas entram. Depois de usar, a confirmação diz que as etapas já estão salvas na trilha e o que falta.
- Gerar trilha com IA: o pedido (objetivo, etapas, tempo, formatos, usar o acervo e, com a trilha já montada,
  "Substituir pela proposta da IA" ou "Manter e acrescentar no fim", com aviso do que sai) com a mesma barra presa; a espera
  diz o que a IA está fazendo e pode ser cancelada; a proposta é rascunho da IA (borda tracejada `ia-line`, `SeloIA`
  "Proposto pela IA · revise"), cada etapa com caixa para incluir ou não, o material do acervo ou "Recurso a definir"
  com a sugestão da IA em `ia-ink` (`.trilha-sugestao`). Salvar grava só as marcadas; a etapa da IA sem recurso leva
  o selo "Proposta da IA" e a sugestão no cartão e no formulário de substituir. O texto de exemplo marca o que trocar com `.marcador` (trecho entre
  colchetes, fundo neutro e sublinhado tracejado). A etapa ainda por preencher é tracejada como o rascunho, com o
  número apagado e o selo "Do modelo"; "Substituir conteúdo" abre o formulário no lugar do cartão, já preenchido,
  e só a primeira etapa por preencher tem o botão principal.
- Páginas de trabalho (ex.: formação): seções em quadro `.fsec` (cinza, 30 px) com células brancas
  `.fcell`/`.fitem`; a primeira seção responde "o que é com você agora" para o papel de quem abre.
  Estado pela forma, não só pela cor: marca vazia (pendente), cheia com visto (feito), ampulheta
  (aguardando curadoria). Detalhes de apoio ficam em `<details>` recolhido ("Sobre a formação").
- Devolutivas da curadoria (`#devolutivas`, logo depois de "O que precisa de você"): um `.fitem` por
  devolutiva, com título pelo tema ("Sobre a trilha"), selo de quem tem a vez ("Aguardando você" em
  `warn`; "Aguardando a curadoria"/"quem conduz" neutro; "Resolvida" em `good`) e a conversa em blocos
  `.devol-msg` dentro do cartão (os da curadoria em `brand-faint`). Responder abre o campo no próprio
  item; "Responder" é principal só quando a vez é de quem lê. As resolvidas ficam num `<details>`;
  resolver ou reabrir leva o foco ao título da seção e anuncia em `role="status"`.
- Alocação de formadores: escolha por pílulas marcáveis (`.trilha-check` em `.aloca-opcoes`; turmas
  agrupadas pela formação em `.aloca-grupo`). Turma sem formador leva o selo "Sem formador" (`warn`) e o
  botão principal "Alocar formador" no próprio item; com formador, "Trocar formadores" secundário. A
  tela Formadores abre pelas turmas sem formador (se houver), depois os formadores ("Sem turma" em
  `warn`) e os links de cadastro: o endereço inteiro num campo só de leitura em fonte mono
  (`.link-copia`) com "Copiar link" ao lado; o link recém-gerado tem contorno da marca (`[data-novo]`)
  e recebe o foco; desativar pede confirmação no item. O cadastro público usa a moldura do login, com
  as turmas do link no painel ao lado (`.cadastro-turmas`).
- Assistente: `.assistant-fab` (pílula amarela no canto; estados por forma: anel, ponto, losango)
  e `.assistant-panel` (diálogo não modal, 420 × 680 px; tela inteira no celular). Some enquanto a barra
  da chamada está na tela (continua no menu). No celular, o fim da página tem 160 px de folga para a barra
  de baixo e o botão; com a chamada aberta, a barra de baixo também sai e a da chamada desce.

## Layout

- `.app-frame` até 1680 px, 18 px de margem, 32 px de canto; `.nav-rail` de 224 px (rotina +
  "Rede municipal": formadores, escolas e relatórios); `.app-content` com 96 px no fim para o botão do Assistente.
- Abaixo de 1024 px: barra fixa no rodapé (três destinos + Menu "Para onde você quer ir?").
- Abaixo de 768 px: moldura cola na tela (8 px, 24 px de canto). Sem rolagem lateral a 320 px.

## Motion

Cartões sobem 8 px ao entrar (260 ms, sem opacidade); barras crescem uma vez; só o carregamento
pulsa. `prefers-reduced-motion`: nenhuma animação.

## Voice

Colega experiente da escola: direta, gentil, sem jargão de sistema; trata por "você". Botões com
verbo no infinitivo; vazio diz quando o conteúdo aparece; sem base de cálculo mostra "—" e diz por
quê. A IA propõe, a pessoa decide.

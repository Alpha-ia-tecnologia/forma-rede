// Teste ponta a ponta da API contra um banco real: um municipio de teste com gestora,
// formador e dois professores percorre o ciclo inteiro (formacao, curadoria, Copiloto,
// etapas, chamada, frequencia, relatorios, atividade, certificado, pesquisa, trilha) e
// tudo o que ele criou e apagado no fim. A IA do municipio de teste usa o provider mock.
//   API_URL=http://localhost:3333 DATABASE_URL=... pnpm --filter @formarede/api test:e2e
// DATABASE_URL e o mesmo banco da API (prepara e limpa o municipio de teste).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const { prisma, runAsSystem } = require('@formarede/db');
const bcrypt = require('bcryptjs');

const BASE = `${(process.env.API_URL ?? 'http://localhost:3333').replace(/\/$/, '')}/api/v1`;
const marca = Date.now().toString(36);
const senha = `E2e-${randomBytes(9).toString('base64url')}`;
const email = (papel: string) => `e2e-${marca}-${papel}@teste.formarede.dev`;

interface Resposta { status: number; ok: boolean; data: any; json: any }

async function api(metodo: string, rota: string, opcoes: { token?: string; body?: unknown } = {}): Promise<Resposta> {
  const r = await fetch(BASE + rota, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {}),
    },
    body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, data: json?.data, json };
}

/** Exige sucesso e devolve data; na falha, a mensagem traz o corpo da resposta. */
function ok(r: Resposta, passo: string) {
  assert.ok(r.ok, `${passo}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.data;
}

function status(r: Resposta, esperado: number, passo: string) {
  assert.equal(r.status, esperado, `${passo}: ${JSON.stringify(r.json)}`);
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Estado compartilhado entre os passos (rodam em ordem).
const s: Record<string, any> = { token: {} };

before(async () => {
  const senhaHash = await bcrypt.hash(senha, 10);
  const pessoas = [
    ['gestora', 'Gestora E2E', 'ADMIN_REDE'],
    ['formador', 'Formador E2E', 'FORMADOR'],
    ['prof1', 'Ana Professora E2E', 'PROFESSOR'],
    ['prof2', 'Bruno Professor E2E', 'PROFESSOR'],
  ] as const;
  const usuarios = [];
  for (const [papel, nome] of pessoas) {
    usuarios.push(await prisma.user.create({ data: { email: email(papel), nome, senhaHash } }));
  }
  await runAsSystem(async (tx: any) => {
    const tenant = await tx.tenant.create({
      data: {
        slug: `teste-e2e-${marca}`, nome: 'Municipio de Teste E2E', uf: 'SP',
        config: { create: { iaHabilitada: true, iaProvider: 'mock' } },
      },
    });
    s.tenantId = tenant.id;
    await tx.membership.createMany({
      data: pessoas.map(([, , role], i) => ({ tenantId: tenant.id, userId: usuarios[i].id, role })),
    });
    // Uma formacao de outro municipio, para conferir o isolamento pela API.
    s.formacaoDeOutro = (await tx.formacao.findFirst({ where: { tenantId: { not: tenant.id } }, select: { id: true } }))?.id;
  });
  s.usuarios = Object.fromEntries(pessoas.map(([papel], i) => [papel, usuarios[i]]));
});

after(async () => {
  await runAsSystem(async (tx: any) => {
    if (s.tenantId) {
      await tx.auditLog.deleteMany({ where: { tenantId: s.tenantId } });
      await tx.tenant.delete({ where: { id: s.tenantId } });
    }
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: `e2e-${marca}-` } } });
  await prisma.$disconnect();
});

test('login: cada papel entra no proprio municipio', async () => {
  for (const papel of ['gestora', 'formador', 'prof1', 'prof2']) {
    const d = ok(await api('POST', '/auth/login', { body: { email: email(papel), senha } }), `login ${papel}`);
    s.token[papel] = d.accessToken;
    const me = ok(await api('GET', '/auth/me', { token: d.accessToken }), `me ${papel}`);
    assert.equal(me.tenantSlug, `teste-e2e-${marca}`);
  }
});

test('login: senha errada e recusada', async () => {
  status(await api('POST', '/auth/login', { body: { email: email('gestora'), senha: 'senha-errada' } }), 401, 'senha errada');
});

test('sem token a API recusa', async () => {
  status(await api('GET', '/formacoes'), 401, 'sem token');
});

test('permissoes: professor nao cria formacao', async () => {
  status(await api('POST', '/formacoes', { token: s.token.prof1, body: { titulo: 'Nao pode' } }), 403, 'professor cria formacao');
});

test('gestao cria formacao, modulo e turma', async () => {
  const f = ok(await api('POST', '/formacoes', {
    token: s.token.gestora,
    body: { titulo: 'Formacao E2E', tema: 'Leitura', cargaHoraria: 8, freqMinimaPct: 50 },
  }), 'criar formacao');
  assert.equal(f.etapaFluxo, 'PLANEJAMENTO');
  s.formacaoId = f.id;
  ok(await api('POST', `/formacoes/${f.id}/modulos`, { token: s.token.gestora, body: { titulo: 'Modulo 1', ordem: 1 } }), 'criar modulo');
  s.turmaId = ok(await api('POST', `/formacoes/${f.id}/turmas`, { token: s.token.gestora, body: { nome: 'Turma E2E', vagas: 2 } }), 'criar turma').id;
});

test('isolamento: a gestao nao ve formacoes de outro municipio', async () => {
  const lista = ok(await api('GET', '/formacoes', { token: s.token.gestora }), 'listar formacoes');
  assert.deepEqual(lista.map((f: { id: string }) => f.id), [s.formacaoId]);
  if (s.formacaoDeOutro) {
    status(await api('GET', `/formacoes/${s.formacaoDeOutro}`, { token: s.token.gestora }), 404, 'formacao de outro municipio');
  }
});

test('curadoria: recusar exige motivo, e o motivo fica no acervo', async () => {
  const m = ok(await api('POST', '/materiais', {
    token: s.token.gestora, body: { titulo: 'Video sem licenca', tipo: 'VIDEO', url: 'https://exemplo.org/video' },
  }), 'cadastrar material');
  assert.equal(m.status, 'EM_REVISAO');
  status(await api('POST', `/materiais/${m.id}/decisao`, { token: s.token.gestora, body: { aprovar: false } }), 400, 'recusar sem motivo');
  ok(await api('POST', `/materiais/${m.id}/decisao`, {
    token: s.token.gestora, body: { aprovar: false, motivo: 'Falta a licenca de uso.' },
  }), 'recusar com motivo');
  const acervo = ok(await api('GET', '/materiais', { token: s.token.gestora }), 'listar acervo');
  const recusado = acervo.find((x: { id: string }) => x.id === m.id);
  assert.equal(recusado.status, 'REJEITADO');
  assert.equal(recusado.motivoRecusa, 'Falta a licenca de uso.');
});

test('curadoria: material aprovado e vinculado a formacao', async () => {
  const m = ok(await api('POST', '/materiais', {
    token: s.token.gestora,
    body: { titulo: 'Guia de leitura E2E', tipo: 'DOCUMENTO', url: 'https://exemplo.org/guia', licenca: 'CC BY 4.0' },
  }), 'cadastrar material');
  ok(await api('POST', `/materiais/${m.id}/decisao`, { token: s.token.gestora, body: { aprovar: true } }), 'aprovar');
  ok(await api('POST', `/materiais/${m.id}/vincular`, { token: s.token.gestora, body: { formacaoId: s.formacaoId } }), 'vincular');
  s.materialId = m.id;
});

test('Copiloto: o plano gerado e publicado com edicao e aparece como aprovado', async () => {
  const g = ok(await api('POST', `/ia/formacoes/${s.formacaoId}/plano`, {
    token: s.token.gestora, body: { diagnostico: 'Professores pedem estrategias de leitura em voz alta.' },
  }), 'gerar plano');
  assert.ok(g.fontes.some((f: { id: string }) => f.id === s.materialId), 'o material aprovado entra como fonte');
  const editado = { ...g.plano, objetivos: [...g.plano.objetivos, 'Objetivo incluido na revisao'] };
  ok(await api('POST', `/ia/interacoes/${g.interacaoId}/decisao`, {
    token: s.token.gestora, body: { decisao: 'EDITAR', saidaEditada: JSON.stringify(editado) },
  }), 'publicar editado');
  status(await api('POST', `/ia/interacoes/${g.interacaoId}/decisao`, {
    token: s.token.gestora, body: { decisao: 'APROVAR' },
  }), 400, 'segunda decisao');
  const planos = ok(await api('GET', `/ia/formacoes/${s.formacaoId}/planos`, { token: s.token.gestora }), 'planos aprovados');
  assert.equal(planos.length, 1);
  assert.equal(planos[0].editado, true);
  assert.ok(planos[0].conteudo.objetivos.includes('Objetivo incluido na revisao'));
});

test('etapas: devolver pede justificativa; aprovar avanca ate a execucao', async () => {
  status(await api('POST', `/formacoes/${s.formacaoId}/transicao`, {
    token: s.token.gestora, body: { decisao: 'DEVOLVIDA' },
  }), 400, 'devolver sem justificativa');
  for (let i = 0; i < 3; i++) {
    ok(await api('POST', `/formacoes/${s.formacaoId}/transicao`, { token: s.token.gestora, body: { decisao: 'APROVADA' } }), `aprovar etapa ${i + 1}`);
  }
  const f = ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.gestora }), 'detalhe');
  assert.equal(f.etapaFluxo, 'EXECUCAO');
});

test('inscricoes: professores entram e a turma respeita as vagas', async () => {
  s.inscricao1 = ok(await api('POST', '/inscricoes', { token: s.token.prof1, body: { turmaId: s.turmaId } }), 'inscrever prof1').id;
  s.inscricao2 = ok(await api('POST', '/inscricoes', { token: s.token.prof2, body: { turmaId: s.turmaId } }), 'inscrever prof2').id;
  status(await api('POST', '/inscricoes', { token: s.token.gestora, body: { turmaId: s.turmaId } }), 400, 'turma cheia');
});

test('encontros: o formador agenda dois encontros', async () => {
  // Logo depois das inscricoes, para que ninguem conte como inscrito depois do encontro.
  const agora = Date.now();
  s.encontro1 = ok(await api('POST', '/encontros', {
    token: s.token.formador, body: { turmaId: s.turmaId, titulo: 'Encontro 1', inicio: new Date(agora + 1000).toISOString() },
  }), 'encontro 1').id;
  s.encontro2 = ok(await api('POST', '/encontros', {
    token: s.token.formador, body: { turmaId: s.turmaId, titulo: 'Encontro 2', inicio: new Date(agora + 2000).toISOString() },
  }), 'encontro 2').id;
  await espera(Math.max(0, agora + 3000 - Date.now()));
});

test('chamada: lista os inscritos e grava as presencas', async () => {
  const lista = ok(await api('GET', `/encontros/${s.encontro1}/chamada`, { token: s.token.formador }), 'chamada 1');
  assert.deepEqual(lista.map((l: { inscricaoId: string }) => l.inscricaoId).sort(), [s.inscricao1, s.inscricao2].sort());
  assert.ok(lista.every((l: { inscritoDepois: boolean }) => !l.inscritoDepois));
  ok(await api('POST', `/encontros/${s.encontro1}/frequencia`, {
    token: s.token.formador,
    body: { registros: [{ inscricaoId: s.inscricao1, presente: true }, { inscricaoId: s.inscricao2, presente: false }] },
  }), 'chamada 1');
  // Chamada parcial: so a prof1 marcada.
  ok(await api('POST', `/encontros/${s.encontro2}/frequencia`, {
    token: s.token.formador, body: { registros: [{ inscricaoId: s.inscricao1, presente: true }] },
  }), 'chamada 2 parcial');
});

test('chamada: so aceita inscritos da turma do encontro', async () => {
  const outraTurma = ok(await api('POST', `/formacoes/${s.formacaoId}/turmas`, { token: s.token.gestora, body: { nome: 'Outra turma', vagas: 0 } }), 'outra turma').id;
  const outroEncontro = ok(await api('POST', '/encontros', {
    token: s.token.formador, body: { turmaId: outraTurma, titulo: 'Encontro de outra turma', inicio: new Date().toISOString() },
  }), 'encontro de outra turma').id;
  status(await api('POST', `/encontros/${outroEncontro}/frequencia`, {
    token: s.token.formador, body: { registros: [{ inscricaoId: s.inscricao1, presente: true }] },
  }), 400, 'presenca para quem nao e da turma');
});

test('encontros: a chamada parcial mostra quem falta marcar', async () => {
  const lista = ok(await api('GET', `/encontros?turmaId=${s.turmaId}`, { token: s.token.formador }), 'encontros');
  const porId = Object.fromEntries(lista.map((e: { id: string; semMarca: number }) => [e.id, e.semMarca]));
  assert.equal(porId[s.encontro1], 0);
  assert.equal(porId[s.encontro2], 1);
});

test('frequencia: os numeros batem com a chamada', async () => {
  const d = ok(await api('GET', '/frequencia/professores', { token: s.token.gestora }), 'frequencia');
  const porInscricao = Object.fromEntries(d.professores.map((p: { inscricaoId: string }) => [p.inscricaoId, p]));
  assert.equal(porInscricao[s.inscricao1].presencas, 2);
  assert.equal(porInscricao[s.inscricao1].frequenciaPct, 100);
  assert.equal(porInscricao[s.inscricao2].presencas, 0);
  assert.equal(porInscricao[s.inscricao2].chamadasRegistradas, 1);
  assert.ok(['CRITICO', 'EM_RISCO'].includes(porInscricao[s.inscricao2].situacao), porInscricao[s.inscricao2].situacao);
  assert.ok(d.chamadasPendentes.some((c: { semMarca: number | null }) => c.semMarca === 1), 'a chamada parcial aparece como pendente');
});

test('relatorios: conclusao, frequencia por professor e CSV contam igual', async () => {
  const conc = ok(await api('GET', '/relatorios/conclusao', { token: s.token.gestora }), 'conclusao');
  const linha = conc.find((l: { formacao: string }) => l.formacao === 'Formacao E2E');
  assert.equal(linha.inscritos, 2);
  assert.equal(linha.minimoPct, 50);
  assert.equal(linha.abaixoDoMinimo, 1);
  const freq = ok(await api('GET', '/relatorios/frequencia', { token: s.token.gestora }), 'frequencia');
  assert.equal(freq.filter((l: { formacao: string }) => l.formacao === 'Formacao E2E').length, 2);
  const csv = ok(await api('GET', '/relatorios/frequencia/csv', { token: s.token.gestora }), 'csv');
  assert.match(csv.csv, /^Participante;/);
  assert.match(csv.csv, /Ana Professora E2E;.*;Formacao E2E;Turma E2E;2;2;2;100;50;Regular/);
  ok(await api('GET', '/relatorios/conclusao/csv', { token: s.token.gestora }), 'csv conclusao');
  status(await api('GET', '/relatorios/conclusao', { token: s.token.prof1 }), 403, 'professor ve relatorio');
});

test('atividade: entrega com link e devolutiva do formador', async () => {
  const a = ok(await api('POST', `/formacoes/${s.formacaoId}/atividades`, {
    token: s.token.formador, body: { titulo: 'Plano de leitura', criterios: 'Objetivo claro.', pontuacao: 100 },
  }), 'criar atividade');
  status(await api('POST', `/atividades/${a.id}/entrega`, {
    token: s.token.prof1, body: { conteudo: 'Meu plano', anexoUrl: 'javascript:alert(1)' },
  }), 400, 'link que nao e web');
  ok(await api('POST', `/atividades/${a.id}/entrega`, {
    token: s.token.prof1, body: { conteudo: 'Meu plano de leitura em voz alta.', anexoUrl: 'https://exemplo.org/plano' },
  }), 'entregar');
  const entregas = ok(await api('GET', `/atividades/${a.id}/entregas`, { token: s.token.formador }), 'entregas');
  assert.equal(entregas.length, 1);
  const av = ok(await api('POST', `/entregas/${entregas[0].id}/avaliacao`, {
    token: s.token.formador, body: { nota: 90, feedback: 'Objetivo claro e bem aplicado.' },
  }), 'devolutiva');
  assert.equal(av.status, 'AVALIADA');
});

test('certificado: so sai com frequencia e atividades em dia; validacao publica', async () => {
  status(await api('POST', `/inscricoes/${s.inscricao2}/certificado`, { token: s.token.prof2 }), 400, 'prof2 abaixo do minimo');
  const c = ok(await api('POST', `/inscricoes/${s.inscricao1}/certificado`, { token: s.token.prof1 }), 'emitir');
  assert.match(c.codigo, /^[0-9A-F]{12}$/);
  const v = ok(await api('GET', `/certificados/validar/${c.codigo}`), 'validar');
  assert.equal(v.valido, true);
  assert.equal(v.participante, 'Ana Professora E2E');
  assert.equal(v.formacao, 'Formacao E2E');
  assert.equal(ok(await api('GET', '/certificados/validar/000000000000'), 'codigo inexistente').valido, false);
});

test('pesquisa: o professor responde uma vez e o formador ve o resultado', async () => {
  const av = ok(await api('POST', `/formacoes/${s.formacaoId}/avaliacoes`, {
    token: s.token.formador,
    body: { titulo: 'Satisfacao E2E', tipo: 'SATISFACAO', escalas: ['O encontro ajudou?'], abertas: ['O que melhorar?'] },
  }), 'criar pesquisa');
  const [escala, aberta] = av.perguntas;
  const respostas = [{ perguntaId: escala.id, valor: 5 }, { perguntaId: aberta.id, texto: 'Mais pratica.' }];
  ok(await api('POST', `/avaliacoes/${av.id}/respostas`, { token: s.token.prof1, body: { respostas } }), 'responder');
  status(await api('POST', `/avaliacoes/${av.id}/respostas`, { token: s.token.prof1, body: { respostas } }), 400, 'responder de novo');
  const res = ok(await api('GET', `/avaliacoes/${av.id}/resultados`, { token: s.token.formador }), 'resultados');
  const r = (res.resultados ?? res).find((x: { pergunta: { id: string } }) => x.pergunta.id === escala.id);
  assert.equal(r.media, 5);
  assert.equal(r.n, 1);
});

test('trilha: etapa do acervo e conclusao pelo professor', async () => {
  // Criar devolve a trilha inteira, com a etapa nova no fim.
  const trilha = ok(await api('POST', `/formacoes/${s.formacaoId}/trilha/etapas`, {
    token: s.token.formador, body: { materialId: s.materialId, duracaoMin: 20 },
  }), 'criar etapa');
  const etapa = trilha.etapas.at(-1);
  ok(await api('POST', `/trilha/etapas/${etapa.id}/conclusao`, { token: s.token.prof1, body: { concluida: true } }), 'concluir');
  const t = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.prof1 }), 'trilha do professor');
  assert.equal(t.etapas.length, 1);
  assert.ok(t.progresso, 'o professor ve o proprio progresso');
});

test('trilha: modelo pronto entra sem recurso e so chega ao professor depois de substituido', async () => {
  const antes = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.formador }), 'trilha').etapas.length;
  status(await api('POST', `/formacoes/${s.formacaoId}/trilha/modelo`, { token: s.token.formador, body: { modeloId: 'nao-existe' } }), 400, 'modelo inexistente');
  status(await api('POST', `/formacoes/${s.formacaoId}/trilha/modelo`, { token: s.token.prof1, body: { modeloId: 'acolhida' } }), 403, 'professor aplica modelo');
  const t = ok(await api('POST', `/formacoes/${s.formacaoId}/trilha/modelo`, {
    token: s.token.formador, body: { modeloId: 'acolhida' },
  }), 'aplicar modelo');
  const novas = t.etapas.slice(antes);
  assert.equal(novas.length, 3);
  assert.ok(novas.every((e: { material: unknown; tipoPrevisto: string | null }) => e.material === null && !!e.tipoPrevisto), 'sem recurso, com o tipo previsto');
  assert.deepEqual(novas.map((e: { ordem: number }) => e.ordem), [antes + 1, antes + 2, antes + 3]);

  const doProfessor = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.prof1 }), 'trilha do professor');
  assert.equal(doProfessor.etapas.length, antes, 'o professor nao ve etapa sem recurso');
  status(await api('POST', `/trilha/etapas/${novas[0].id}/conclusao`, { token: s.token.prof1, body: { concluida: true } }), 404, 'concluir etapa sem recurso');

  const depois = ok(await api('PUT', `/trilha/etapas/${novas[0].id}/recurso`, {
    token: s.token.formador, body: { titulo: 'Boas-vindas da equipe E2E', materialId: s.materialId, obrigatoria: true },
  }), 'substituir');
  const feita = depois.etapas.find((e: { id: string }) => e.id === novas[0].id);
  assert.equal(feita.material.id, s.materialId);
  assert.equal(feita.tipoPrevisto, null);
  assert.equal(feita.titulo, 'Boas-vindas da equipe E2E');
  assert.equal(feita.orientacao, novas[0].orientacao, 'sem orientacao nova, fica a do modelo');
  const agora = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.prof1 }), 'trilha do professor');
  assert.equal(agora.etapas.length, antes + 1, 'a etapa substituida chega ao professor');
});

test('paineis: Inicio de quem conduz, painel da rede e acompanhamento respondem', async () => {
  ok(await api('GET', '/painel/conducao', { token: s.token.formador }), 'painel de conducao');
  ok(await api('GET', '/dashboard', { token: s.token.gestora }), 'painel da rede');
  ok(await api('GET', `/formacoes/${s.formacaoId}/acompanhamento`, { token: s.token.gestora }), 'acompanhamento');
});

test('area do professor: minhas formacoes e participacao', async () => {
  const minhas = ok(await api('GET', '/participante/minhas-formacoes', { token: s.token.prof1 }), 'minhas formacoes');
  assert.equal(minhas.length, 1);
  const p = ok(await api('GET', `/formacoes/${s.formacaoId}/minha-participacao`, { token: s.token.prof1 }), 'participacao');
  assert.ok(p, 'a participacao existe');
});

test('Assistente: conversa e criada, listada e apagada', async () => {
  const c = ok(await api('POST', '/assistente/conversas', { token: s.token.formador, body: { formacaoId: s.formacaoId } }), 'criar');
  const lista = ok(await api('GET', '/assistente/conversas', { token: s.token.formador }), 'listar');
  assert.ok(lista.some((x: { id: string }) => x.id === c.id));
  ok(await api('DELETE', `/assistente/conversas/${c.id}`, { token: s.token.formador }), 'apagar');
});

test('auditoria: as acoes ficam registradas no municipio', async () => {
  const n = await runAsSystem((tx: any) => tx.auditLog.count({ where: { tenantId: s.tenantId } }));
  assert.ok(n >= 5, `registros de auditoria: ${n}`);
});

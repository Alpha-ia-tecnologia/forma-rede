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
    ['curadora', 'Curadora E2E', 'CURADOR'],
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
  for (const papel of ['gestora', 'curadora', 'formador', 'prof1', 'prof2']) {
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
  assert.equal(f.etapaFluxo, 'EXECUCAO', 'a formacao nasce em andamento');
  s.formacaoId = f.id;
  ok(await api('POST', `/formacoes/${f.id}/modulos`, { token: s.token.gestora, body: { titulo: 'Modulo 1', ordem: 1 } }), 'criar modulo');
  s.turmaId = ok(await api('POST', `/formacoes/${f.id}/turmas`, { token: s.token.gestora, body: { nome: 'Turma E2E', vagas: 2 } }), 'criar turma').id;
});

test('alocacao: sem turma o formador nao ve a formacao; alocado, ve so a turma dele', async () => {
  assert.deepEqual(ok(await api('GET', '/formacoes', { token: s.token.formador }), 'formacoes sem turma'), []);
  status(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.formador }), 404, 'detalhe sem turma');
  assert.equal(ok(await api('GET', '/painel/conducao', { token: s.token.formador }), 'painel sem turma').semTurmas, true);

  // A curadoria cria a turma B ja com quem conduz; a turma A recebe o formador depois.
  s.turmaB = ok(await api('POST', `/formacoes/${s.formacaoId}/turmas`, {
    token: s.token.curadora, body: { nome: 'Turma B E2E', vagas: 5, formadorIds: [s.usuarios.formador.id] },
  }), 'turma B com formador').id;
  status(await api('POST', `/formacoes/${s.formacaoId}/turmas`, {
    token: s.token.curadora, body: { nome: 'Turma com professor', formadorIds: [s.usuarios.prof1.id] },
  }), 400, 'alocar quem nao e formador');
  const rota = `/turmas/${s.turmaId}/formadores`;
  status(await api('PUT', rota, { token: s.token.formador, body: { formadorIds: [s.usuarios.formador.id] } }), 403, 'formador se aloca');
  status(await api('PUT', rota, { token: s.token.curadora, body: { formadorIds: [s.usuarios.prof2.id] } }), 400, 'alocar professor');
  const alocados = ok(await api('PUT', rota, { token: s.token.curadora, body: { formadorIds: [s.usuarios.formador.id] } }), 'alocar na turma A');
  assert.deepEqual(alocados.map((x: { nome: string }) => x.nome), ['Formador E2E']);

  // Pelo formador: fica so na turma A (sai da B).
  const f = ok(await api('PUT', `/formadores/${s.usuarios.formador.id}/turmas`, { token: s.token.curadora, body: { turmaIds: [s.turmaId] } }), 'turmas do formador');
  assert.deepEqual(f.turmas.map((t: { id: string }) => t.id), [s.turmaId]);
  const lista = ok(await api('GET', '/formadores', { token: s.token.curadora }), 'formadores');
  assert.deepEqual(lista.map((x: { nome: string }) => x.nome), ['Formador E2E']);
  const turmas = ok(await api('GET', '/turmas', { token: s.token.curadora }), 'turmas com formadores');
  assert.deepEqual(turmas.map((t: { id: string; formadores: unknown[] }) => [t.id, t.formadores.length]), [[s.turmaB, 0], [s.turmaId, 1]], 'sem formador primeiro');
  status(await api('GET', '/turmas', { token: s.token.formador }), 403, 'formador lista turmas');

  assert.deepEqual(ok(await api('GET', '/formacoes', { token: s.token.formador }), 'formacoes').map((x: { id: string }) => x.id), [s.formacaoId]);
  const d = ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.formador }), 'detalhe do formador');
  assert.deepEqual(d.turmas.map((t: { id: string }) => t.id), [s.turmaId], 'o formador ve so a turma dele');
  assert.deepEqual(d.turmas[0].formadores.map((x: { nome: string }) => x.nome), ['Formador E2E']);
  status(await api('POST', '/encontros', {
    token: s.token.formador, body: { turmaId: s.turmaB, titulo: 'Encontro na turma B', inicio: new Date().toISOString() },
  }), 404, 'encontro em turma que nao conduz');
  assert.equal(ok(await api('GET', '/painel/conducao', { token: s.token.formador }), 'painel').semTurmas, false);
  const gestao = ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.curadora }), 'detalhe da curadoria');
  assert.equal(gestao.turmas.length, 2, 'a curadoria ve todas as turmas');
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

test('encerramento: quem cria encerra e reabre, e cada vez fica no historico', async () => {
  const rota = (acao: string) => `/formacoes/${s.formacaoId}/${acao}`;
  status(await api('POST', rota('encerrar'), { token: s.token.prof1, body: {} }), 403, 'professor encerra');
  status(await api('POST', rota('reabrir'), { token: s.token.gestora, body: {} }), 400, 'reabrir em andamento');
  ok(await api('POST', rota('encerrar'), { token: s.token.gestora, body: {} }), 'encerrar');
  status(await api('POST', rota('encerrar'), { token: s.token.gestora, body: {} }), 400, 'encerrar de novo');
  assert.equal(ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.gestora }), 'detalhe').etapaFluxo, 'CONCLUIDA');
  ok(await api('POST', rota('reabrir'), { token: s.token.gestora, body: {} }), 'reabrir');
  const f = ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.gestora }), 'detalhe');
  assert.equal(f.etapaFluxo, 'EXECUCAO');
  assert.deepEqual(f.transicoes.map((x: { paraEtapa: string }) => x.paraEtapa), ['EXECUCAO', 'CONCLUIDA'], 'historico do mais recente ao mais antigo');
  assert.ok(f.transicoes.every((x: { decididoPor: string | null }) => x.decididoPor === 'Gestora E2E'));
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
    token: s.token.gestora, body: { turmaId: outraTurma, titulo: 'Encontro de outra turma', inicio: new Date().toISOString() },
  }), 'encontro de outra turma').id;
  status(await api('POST', `/encontros/${outroEncontro}/frequencia`, {
    token: s.token.gestora, body: { registros: [{ inscricaoId: s.inscricao1, presente: true }] },
  }), 400, 'presenca para quem nao e da turma');
  // O formador nao conduz a outra turma: a chamada dela nao existe para ele.
  status(await api('GET', `/encontros/${outroEncontro}/chamada`, { token: s.token.formador }), 404, 'chamada de turma que nao conduz');
  status(await api('POST', `/encontros/${outroEncontro}/frequencia`, {
    token: s.token.formador, body: { registros: [{ inscricaoId: s.inscricao1, presente: true }] },
  }), 404, 'registrar em turma que nao conduz');
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

test('trilha com IA: proposta com materiais do municipio, salva so o que foi marcado', async () => {
  const rota = `/formacoes/${s.formacaoId}/trilha/ia`;
  const pedido = { objetivo: 'Preparar para o encontro 2 sobre leitura compartilhada.', quantidade: 4, tempo: 'ate-2h', formatos: ['DOCUMENTO', 'VIDEO'], usarAcervo: true };
  status(await api('POST', rota, { token: s.token.formador, body: { ...pedido, objetivo: 'curto' } }), 400, 'objetivo curto');
  status(await api('POST', rota, { token: s.token.prof1, body: pedido }), 403, 'professor gera trilha');

  const p = ok(await api('POST', rota, { token: s.token.formador, body: pedido }), 'gerar proposta');
  assert.equal(p.geradoPorIA, true);
  assert.equal(p.etapas.length, 4);
  assert.ok(p.etapas.every((e: { material: { id: string } | null }) => !e.material || e.material.id === s.materialId), 'so material aprovado do municipio');
  assert.ok(p.etapas.some((e: { material: unknown }) => e.material), 'o material aprovado da formacao entra');

  const antes = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.formador }), 'trilha').etapas.length;
  status(await api('POST', `${rota}/${p.interacaoId}`, { token: s.token.formador, body: { incluir: [] } }), 400, 'salvar sem etapas');
  const t = ok(await api('POST', `${rota}/${p.interacaoId}`, { token: s.token.formador, body: { incluir: [0, 2] } }), 'salvar duas etapas');
  const novas = t.etapas.slice(antes);
  assert.deepEqual(novas.map((e: { titulo: string }) => e.titulo), [p.etapas[0].titulo, p.etapas[2].titulo]);
  for (const [k, i] of [0, 2].entries()) {
    assert.equal(novas[k].material?.id ?? null, p.etapas[i].material?.id ?? null);
    assert.equal(novas[k].recursoSugerido, p.etapas[i].material ? null : p.etapas[i].recursoSugerido);
  }
  status(await api('POST', `${rota}/${p.interacaoId}`, { token: s.token.formador, body: { incluir: [1] } }), 400, 'salvar de novo');

  const decisao = await runAsSystem((tx: any) => tx.aiInteracao.findUnique({ where: { id: p.interacaoId }, select: { status: true, assistente: true, decididoEm: true } }));
  assert.equal(decisao.assistente, 'gerador-trilha');
  assert.equal(decisao.status, 'EDITADA', 'salvar parte da proposta fica como editada');
  assert.ok(decisao.decididoEm);

  const outra = ok(await api('POST', rota, { token: s.token.formador, body: pedido }), 'gerar outra');
  ok(await api('POST', `/ia/interacoes/${outra.interacaoId}/decisao`, { token: s.token.formador, body: { decisao: 'REJEITAR' } }), 'descartar');
  status(await api('POST', `${rota}/${outra.interacaoId}`, { token: s.token.formador, body: { incluir: [0] } }), 400, 'salvar descartada');
});

test('trilha com IA: substituir deixa na trilha so as etapas da proposta', async () => {
  const rota = `/formacoes/${s.formacaoId}/trilha/ia`;
  const antes = ok(await api('GET', `/formacoes/${s.formacaoId}/trilha`, { token: s.token.formador }), 'trilha').etapas;
  assert.ok(antes.length > 0, 'a trilha tem etapas para substituir');
  const p = ok(await api('POST', rota, {
    token: s.token.formador,
    body: { objetivo: 'Trocar a trilha atual por um percurso de leitura em voz alta.', quantidade: 3, tempo: 'ate-1h', formatos: ['DOCUMENTO', 'LINK'], usarAcervo: true, substituir: true },
  }), 'gerar para substituir');
  const t = ok(await api('POST', `${rota}/${p.interacaoId}`, { token: s.token.formador, body: { incluir: [0, 1] } }), 'substituir');
  assert.deepEqual(t.etapas.map((e: { titulo: string }) => e.titulo), [p.etapas[0].titulo, p.etapas[1].titulo]);
  assert.deepEqual(t.etapas.map((e: { ordem: number }) => e.ordem), [1, 2]);
  const ids = new Set(antes.map((e: { id: string }) => e.id));
  assert.ok(t.etapas.every((e: { id: string }) => !ids.has(e.id)), 'nenhuma etapa anterior ficou');
});

test('atividade: o formador muda a data de entrega e o professor ve a nova', async () => {
  const a = ok(await api('POST', `/formacoes/${s.formacaoId}/atividades`, {
    token: s.token.formador, body: { titulo: 'Atividade com prazo', prazo: '2026-12-01T23:59:00-03:00', pontuacao: 10 },
  }), 'criar atividade com prazo');
  const rota = `/atividades/${a.id}/prazo`;
  status(await api('PUT', rota, { token: s.token.prof1, body: { prazo: '2026-12-10T23:59:00-03:00' } }), 403, 'professor muda prazo');
  status(await api('PUT', rota, { token: s.token.formador, body: { prazo: 'nao-e-data' } }), 400, 'data invalida');
  ok(await api('PUT', rota, { token: s.token.formador, body: { prazo: '2026-12-10T23:59:00-03:00' } }), 'mudar prazo');
  const prazoDoProfessor = async () => ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: s.token.prof1 }), 'formacao do professor')
    .atividades.find((x: { id: string }) => x.id === a.id).prazo;
  assert.equal(new Date(await prazoDoProfessor()).toISOString(), new Date('2026-12-10T23:59:00-03:00').toISOString());
  ok(await api('PUT', rota, { token: s.token.formador, body: { prazo: null } }), 'tirar prazo');
  assert.equal(await prazoDoProfessor(), null);
  const auditoria = await runAsSystem((tx: any) => tx.auditLog.count({ where: { tenantId: s.tenantId, entity: 'atividade', entityId: a.id } }));
  assert.equal(auditoria, 2, 'cada mudanca de prazo fica na auditoria');
});

test('devolutivas: a curadoria orienta, quem conduz responde e o Inicio de cada um cobra a sua vez', async () => {
  const rota = `/formacoes/${s.formacaoId}/devolutivas`;
  status(await api('POST', rota, { token: s.token.formador, body: { texto: 'Quem conduz nao escreve devolutiva.' } }), 403, 'formador cria devolutiva');
  status(await api('GET', rota, { token: s.token.prof1 }), 403, 'professor le devolutivas');
  status(await api('POST', rota, { token: s.token.curadora, body: { tema: 'TRILHA', texto: 'oi' } }), 400, 'texto curto');
  const d = ok(await api('POST', rota, {
    token: s.token.curadora, body: { tema: 'TRILHA', texto: 'Torne a etapa 2 obrigatoria antes do encontro.' },
  }), 'criar devolutiva')[0];
  assert.equal(d.tema, 'TRILHA');
  assert.equal(d.autor, 'Curadora E2E');
  assert.equal(d.aguarda, 'CONDUCAO', 'a devolutiva nova espera quem conduz');

  const pendentes = async (papel: string) => (ok(await api('GET', '/devolutivas/pendentes', { token: s.token[papel] }), `pendentes ${papel}`)
    .find((x: { formacao: { id: string } }) => x.formacao.id === s.formacaoId)?.quantidade ?? 0);
  assert.equal(await pendentes('formador'), 1, 'o Inicio do formador cobra a resposta');
  assert.equal(await pendentes('curadora'), 0);

  const respondida = ok(await api('POST', `/devolutivas/${d.id}/respostas`, {
    token: s.token.formador, body: { texto: 'Feito: a etapa 2 ficou obrigatoria.' },
  }), 'responder').find((x: { id: string }) => x.id === d.id);
  assert.equal(respondida.aguarda, 'CURADORIA');
  assert.deepEqual(respondida.respostas.map((r: { autor: string; daCuradoria: boolean }) => [r.autor, r.daCuradoria]), [['Formador E2E', false]]);
  assert.equal(await pendentes('formador'), 0);
  assert.equal(await pendentes('curadora'), 1, 'a resposta chega ao Inicio da curadoria');

  const resolucao = `/devolutivas/${d.id}/resolucao`;
  const resolvida = ok(await api('POST', resolucao, { token: s.token.curadora, body: { resolvida: true } }), 'resolver')
    .find((x: { id: string }) => x.id === d.id);
  assert.equal(resolvida.aguarda, null);
  assert.equal(resolvida.resolvidaPor, 'Curadora E2E');
  status(await api('POST', resolucao, { token: s.token.formador, body: { resolvida: true } }), 400, 'resolver de novo');
  status(await api('POST', `/devolutivas/${d.id}/respostas`, { token: s.token.formador, body: { texto: 'Mais uma coisa.' } }), 400, 'responder resolvida');
  assert.equal(await pendentes('curadora'), 0, 'resolvida sai do Inicio');

  const reaberta = ok(await api('POST', resolucao, { token: s.token.formador, body: { resolvida: false } }), 'reabrir')
    .find((x: { id: string }) => x.id === d.id);
  assert.equal(reaberta.aguarda, 'CURADORIA', 'reaberta, a vez continua de quem nao escreveu por ultimo');
  status(await api('POST', `/devolutivas/${d.id}/respostas`, { token: s.token.prof1, body: { texto: 'Professor responde.' } }), 403, 'professor responde');
  const auditoria = await runAsSystem((tx: any) => tx.auditLog.count({ where: { tenantId: s.tenantId, entity: 'devolutiva_formacao', entityId: d.id } }));
  assert.equal(auditoria, 3, 'criar, resolver e reabrir ficam na auditoria');
});

test('link de cadastro: a curadoria gera, a pessoa se cadastra e ja conduz a turma do link', async () => {
  status(await api('POST', '/convites', { token: s.token.formador, body: { validadeDias: 7 } }), 403, 'formador gera link');
  const c = ok(await api('POST', '/convites', { token: s.token.curadora, body: { validadeDias: 7, turmaIds: [s.turmaB] } }), 'gerar link');
  assert.equal(c.situacao, 'ATIVO');
  assert.deepEqual(c.turmas.map((t: { id: string }) => t.id), [s.turmaB]);
  const publico = `/convites/publico/${c.token}`;
  const v = ok(await api('GET', publico), 'link publico');
  assert.equal(v.municipio, 'Municipio de Teste E2E');
  assert.deepEqual(v.turmas.map((t: { nome: string }) => t.nome), ['Turma B E2E']);
  status(await api('GET', '/convites/publico/nao-existe-este-token-de-cadastro'), 404, 'token inexistente');
  status(await api('POST', `${publico}/cadastro`, { body: { nome: 'Nova', email: 'invalido', senha: 'curta' } }), 400, 'dados invalidos');

  const cad = ok(await api('POST', `${publico}/cadastro`, {
    body: { nome: 'Nova Formadora E2E', email: email('novaformadora').toUpperCase(), senha },
  }), 'cadastro pelo link');
  assert.equal(cad.user.role, 'FORMADOR');
  assert.equal(cad.user.email, email('novaformadora'), 'o e-mail fica em minusculas');
  const d = ok(await api('GET', `/formacoes/${s.formacaoId}`, { token: cad.accessToken }), 'formacao da nova formadora');
  assert.deepEqual(d.turmas.map((t: { id: string }) => t.id), [s.turmaB], 'ja entra na turma do link');

  status(await api('POST', `${publico}/cadastro`, { body: { nome: 'Outra', email: email('novaformadora'), senha: 'senha-errada-123' } }), 409, 'e-mail existente com outra senha');
  status(await api('POST', `${publico}/cadastro`, { body: { nome: 'Ana', email: email('prof1'), senha } }), 409, 'professor da rede pelo link');

  const lista = ok(await api('POST', `/convites/${c.id}/desativar`, { token: s.token.curadora }), 'desativar');
  const desativado = lista.find((x: { id: string }) => x.id === c.id);
  assert.equal(desativado.situacao, 'DESATIVADO');
  assert.equal(desativado.cadastros, 1);
  status(await api('GET', publico), 410, 'link desativado');
  status(await api('POST', `${publico}/cadastro`, { body: { nome: 'Tarde', email: email('tarde'), senha } }), 410, 'cadastro em link desativado');

  const vencido = ok(await api('POST', '/convites', { token: s.token.curadora, body: { validadeDias: 1 } }), 'link curto');
  await runAsSystem((tx: any) => tx.conviteFormador.update({ where: { id: vencido.id }, data: { expiraEm: new Date(Date.now() - 1000) } }));
  status(await api('GET', `/convites/publico/${vencido.token}`), 410, 'link expirado');
  const formadores = ok(await api('GET', '/formadores', { token: s.token.curadora }), 'formadores');
  assert.deepEqual(formadores.map((x: { nome: string }) => x.nome), ['Formador E2E', 'Nova Formadora E2E']);
});

test('paineis: Inicio de quem conduz, painel da rede e acompanhamento respondem', async () => {
  ok(await api('GET', '/dashboard', { token: s.token.curadora }), 'painel da rede (curadoria)');
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

// Acompanhamento da frequencia dos professores (cursistas): frequencia acumulada,
// projecao para a certificacao, ausencias seguidas e chamadas pendentes, por
// formacao, turma e escola. A regra de calculo vem de @formarede/contracts
// (resumirFrequencia), a mesma usada pelo modo demonstracao do web.
// Escopo: a gestao escolar ve so os professores das proprias escolas; o formador, so os
// das turmas em que foi alocado (common/escopo).
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { forTenant } from '@formarede/db';
import {
  AcompanhamentoFrequencia,
  AuthUser,
  contarSemMarca,
  FrequenciaProfessor,
  ordenarPorPrioridade,
  resumirAcompanhamento,
  resumirFrequencia,
} from '@formarede/contracts';
import { CurrentUser, RequirePermissions } from '../../common/security';
import { escopoConducao, naTurma } from '../../common/escopo';

export interface FiltrosFrequencia {
  formacaoId?: string;
  turmaId?: string;
  escolaId?: string;
}

@Injectable()
export class FrequenciaService {
  async professores(user: AuthUser, filtros: FiltrosFrequencia, agora = new Date()): Promise<AcompanhamentoFrequencia> {
    const db = forTenant(user.tenantId);
    const conducao = await escopoConducao(user);
    const inscricoes = await db.inscricao.findMany({
      where: { status: { in: ['CONFIRMADA', 'CONCLUIDA'] }, turmaId: naTurma(conducao) },
      include: {
        user: { select: { id: true, nome: true, email: true } },
        turma: {
          select: {
            id: true,
            nome: true,
            formacao: { select: { id: true, titulo: true, freqMinimaPct: true } },
            encontros: { select: { id: true, titulo: true, inicio: true, status: true } },
          },
        },
        frequencias: { select: { encontroId: true, presente: true, justificativa: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Escola do professor = vinculo PROFESSOR com escola (ou, na falta, qualquer vinculo com escola).
    const userIds = [...new Set([...inscricoes.map((i) => i.userId), user.id])];
    const vinculos = await db.membership.findMany({
      where: { userId: { in: userIds }, ativo: true, escolaId: { not: null } },
      select: { userId: true, role: true, escola: { select: { id: true, nome: true } } },
    });
    const escolaDe = new Map<string, { id: string; nome: string }>();
    for (const v of [...vinculos].sort((a, b) => Number(b.role === 'PROFESSOR') - Number(a.role === 'PROFESSOR'))) {
      if (v.escola && v.role !== 'GESTOR_ESCOLAR' && !escolaDe.has(v.userId)) escolaDe.set(v.userId, v.escola);
    }

    let escopo = inscricoes;
    if (user.role === 'GESTOR_ESCOLAR') {
      const minhas = new Set(
        vinculos.flatMap((v) => (v.userId === user.id && v.role === 'GESTOR_ESCOLAR' && v.escola ? [v.escola.id] : [])),
      );
      // Professor sem escola vinculada fica fora do recorte da gestao escolar.
      escopo = inscricoes.filter((i) => {
        const escola = escolaDe.get(i.userId);
        return !!escola && minhas.has(escola.id);
      });
    }

    // Opcoes dos filtros saem do escopo inteiro, antes do recorte escolhido.
    const opcoes: AcompanhamentoFrequencia['opcoes'] = {
      formacoes: unicos(escopo.map((i) => i.turma.formacao), (f) => f.id)
        .map((f) => ({ id: f.id, titulo: f.titulo })),
      turmas: unicos(escopo.map((i) => ({ id: i.turma.id, nome: i.turma.nome, formacaoId: i.turma.formacao.id })), (t) => t.id),
      escolas: unicos(escopo.flatMap((i) => escolaDe.get(i.userId) ?? []), (e) => e.id)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    };

    const recorte = escopo.filter((i) =>
      (!filtros.formacaoId || i.turma.formacao.id === filtros.formacaoId)
      && (!filtros.turmaId || i.turma.id === filtros.turmaId)
      && (!filtros.escolaId || escolaDe.get(i.userId)?.id === filtros.escolaId));

    const professores: FrequenciaProfessor[] = recorte.map((i) => ({
      inscricaoId: i.id,
      professor: i.user,
      escola: escolaDe.get(i.userId) ?? null,
      formacao: i.turma.formacao,
      turma: { id: i.turma.id, nome: i.turma.nome },
      ...resumirFrequencia(
        i.turma.encontros.map((e) => ({ id: e.id, titulo: e.titulo, inicio: e.inicio, cancelado: e.status === 'CANCELADO' })),
        i.frequencias,
        i.turma.formacao.freqMinimaPct,
        agora,
      ),
    }));

    // Encontros ja ocorridos do recorte: com chamada contam como realizados; sem marca de alguem, pendentes.
    const turmaIds = [...new Set(recorte.map((i) => i.turma.id))];
    const ocorridos = turmaIds.length
      ? await db.encontro.findMany({
        where: { turmaId: { in: turmaIds }, status: { not: 'CANCELADO' }, inicio: { lte: agora } },
        select: {
          id: true, titulo: true, inicio: true, fim: true,
          turma: { select: { nome: true, formacao: { select: { titulo: true } }, inscricoes: { where: { status: 'CONFIRMADA' }, select: { id: true, createdAt: true } } } },
          frequencias: { select: { inscricaoId: true } },
        },
        orderBy: { inicio: 'asc' },
      })
      : [];

    return {
      geradoEm: agora.toISOString(),
      resumo: {
        ...resumirAcompanhamento(professores),
        encontrosRealizados: ocorridos.filter((e) => e.frequencias.length > 0).length,
      },
      // Sem nenhuma marca ou com cursista sem marca: as duas pedem a chamada.
      chamadasPendentes: ocorridos
        .map((e) => ({ e, semMarca: contarSemMarca(e.turma.inscricoes, e.frequencias, e) }))
        .filter(({ semMarca }) => semMarca > 0)
        .map(({ e, semMarca }) => ({
          encontroId: e.id, titulo: e.titulo, inicio: e.inicio.toISOString(),
          turma: e.turma.nome, formacao: e.turma.formacao.titulo,
          semMarca: e.frequencias.length ? semMarca : null,
        })),
      professores: ordenarPorPrioridade(professores),
      opcoes,
    };
  }
}

function unicos<T>(itens: T[], chave: (t: T) => string): T[] {
  const vistos = new Map<string, T>();
  for (const t of itens) if (!vistos.has(chave(t))) vistos.set(chave(t), t);
  return [...vistos.values()];
}

@Controller('frequencia')
export class FrequenciaController {
  constructor(private readonly svc: FrequenciaService) {}

  @Get('professores')
  @RequirePermissions('frequencia:acompanhar')
  professores(
    @CurrentUser() user: AuthUser,
    @Query('formacaoId') formacaoId?: string,
    @Query('turmaId') turmaId?: string,
    @Query('escolaId') escolaId?: string,
  ) {
    return this.svc.professores(user, { formacaoId, turmaId, escolaId });
  }
}

@Module({
  controllers: [FrequenciaController],
  providers: [FrequenciaService],
})
export class FrequenciaModule {}

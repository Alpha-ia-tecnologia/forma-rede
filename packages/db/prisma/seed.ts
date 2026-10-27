// Seed Etapas 1+2: superadmin + municipio demo (Sao Paulo) com rede completa
// de demonstracao: escolas, formacao com modulo/turma/encontro, professor
// inscrito, material aprovado e atividade com prazo.
// Senha padrao de todos os usuarios demo: Formarede@2026
import bcrypt from 'bcryptjs';
import {
  prisma,
  runAsSystem,
  RoleType,
  UnidadeTipo,
  EtapaEnsino,
  EtapaFluxo,
  MaterialTipo,
  MaterialStatus,
} from '../src/index';

async function main() {
  const senhaHash = await bcrypt.hash('Formarede@2026', 10);

  const mkUser = (email: string, nome: string) =>
    prisma.user.upsert({ where: { email }, update: {}, create: { email, nome, senhaHash } });

  const superadmin = await mkUser('super@formarede.gov.br', 'Super Administrador');
  const admin = await mkUser('admin.sp@formarede.gov.br', 'Ana Gestora (Rede SP)');
  const formador = await mkUser('formador.sp@formarede.gov.br', 'Carlos Formador');
  const professor = await mkUser('prof.sp@formarede.gov.br', 'Paula Professora');

  await runAsSystem(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: 'sao-paulo' },
      update: {},
      create: {
        slug: 'sao-paulo',
        nome: 'Secretaria Municipal de Educacao de Sao Paulo',
        uf: 'SP',
        codigoIbge: '3550308',
        config: {
          create: { corPrimaria: '#0E7C6B', corSecundaria: '#0A5546', dominio: 'sp.formarede.gov.br' },
        },
      },
    });

    const regional = await tx.regional.create({
      data: { tenantId: tenant.id, nome: 'Diretoria Regional Centro', codigo: 'DRE-CENTRO' },
    });

    await tx.escola.createMany({
      data: [
        {
          tenantId: tenant.id,
          regionalId: regional.id,
          nome: 'EMEF Paulo Freire',
          tipo: UnidadeTipo.ESCOLA,
          inep: '35000001',
          etapas: [EtapaEnsino.FUND_ANOS_INICIAIS, EtapaEnsino.FUND_ANOS_FINAIS],
          municipio: 'Sao Paulo',
        },
        {
          tenantId: tenant.id,
          regionalId: regional.id,
          nome: 'CEU Polo Formativo Centro',
          tipo: UnidadeTipo.UNIDADE_FORMATIVA,
          etapas: [EtapaEnsino.INFANTIL, EtapaEnsino.EJA],
          municipio: 'Sao Paulo',
        },
      ],
    });

    await tx.membership.createMany({
      data: [
        { tenantId: tenant.id, userId: superadmin.id, role: RoleType.SUPERADMIN },
        { tenantId: tenant.id, userId: admin.id, role: RoleType.ADMIN_REDE },
        { tenantId: tenant.id, userId: formador.id, role: RoleType.FORMADOR },
        { tenantId: tenant.id, userId: professor.id, role: RoleType.PROFESSOR },
      ],
      skipDuplicates: true,
    });

    const formacao = await tx.formacao.create({
      data: {
        tenantId: tenant.id,
        titulo: 'Alfabetizacao na Idade Certa',
        tema: 'Praticas de leitura e escrita',
        objetivos: 'Fortalecer praticas de alfabetizacao nos anos iniciais.',
        cargaHoraria: 40,
        publicoAlvo: 'Professores dos anos iniciais',
        etapaFluxo: EtapaFluxo.EXECUCAO,
        freqMinimaPct: 75,
        criadoPorId: admin.id,
      },
    });

    const modulo = await tx.moduloFormacao.create({
      data: {
        tenantId: tenant.id,
        formacaoId: formacao.id,
        titulo: 'Modulo 1 - Fundamentos da alfabetizacao',
        ordem: 1,
      },
    });

    const turma = await tx.turma.create({
      data: { tenantId: tenant.id, formacaoId: formacao.id, nome: 'Turma 2026.1', vagas: 30 },
    });

    const encontro = await tx.encontro.create({
      data: {
        tenantId: tenant.id,
        turmaId: turma.id,
        moduloId: modulo.id,
        titulo: 'Encontro 1 - Acolhida e diagnostico',
        pauta: 'Apresentacao do percurso formativo e levantamento de expectativas.',
        local: 'CEU Polo Formativo Centro',
        inicio: new Date('2026-07-15T18:30:00-03:00'),
      },
    });

    // Inscricao anterior ao encontro: sem a data, ela contaria como feita depois dele.
    const inscricao = await tx.inscricao.create({
      data: { tenantId: tenant.id, turmaId: turma.id, userId: professor.id, createdAt: new Date('2026-07-01T09:00:00-03:00') },
    });

    await tx.frequencia.create({
      data: {
        tenantId: tenant.id,
        encontroId: encontro.id,
        inscricaoId: inscricao.id,
        presente: true,
      },
    });

    const material = await tx.material.create({
      data: {
        tenantId: tenant.id,
        titulo: 'Guia de praticas de leitura em sala',
        tipo: MaterialTipo.DOCUMENTO,
        autoria: 'Equipe pedagogica SME-SP',
        licenca: 'CC BY-NC 4.0',
        tags: ['alfabetizacao', 'leitura', 'anos-iniciais'],
        status: MaterialStatus.APROVADO,
        criadoPorId: admin.id,
      },
    });

    await tx.materialFormacao.create({
      data: { tenantId: tenant.id, materialId: material.id, formacaoId: formacao.id },
    });

    await tx.atividade.create({
      data: {
        tenantId: tenant.id,
        formacaoId: formacao.id,
        titulo: 'Plano de aula de leitura compartilhada',
        descricao: 'Elabore e aplique um plano de leitura compartilhada na sua turma.',
        criterios: 'Clareza dos objetivos; adequacao a etapa; registro da aplicacao.',
        prazo: new Date('2026-08-15T23:59:00-03:00'),
        pontuacao: 10,
      },
    });
  });

  await runAsSystem(async (tx) => {
    const formacao = await tx.formacao.findFirst({
      where: { titulo: 'Alfabetizacao na Idade Certa' },
    });
    if (formacao) {
      await tx.avaliacao.create({
        data: {
          tenantId: formacao.tenantId,
          formacaoId: formacao.id,
          titulo: 'Satisfacao - Encontro 1',
          tipo: 'SATISFACAO',
          anonima: true,
          perguntas: [
            { id: 'p1', tipo: 'ESCALA', texto: 'O conteudo atendeu as suas expectativas?' },
            { id: 'p2', tipo: 'ESCALA', texto: 'A metodologia favoreceu a aprendizagem?' },
            { id: 'p3', tipo: 'TEXTO', texto: 'O que pode melhorar no proximo encontro?' },
          ],
        },
      });
    }
  });

  console.log('Seed concluido.');
  console.log('  Superadmin : super@formarede.gov.br');
  console.log('  Admin rede : admin.sp@formarede.gov.br');
  console.log('  Formador   : formador.sp@formarede.gov.br');
  console.log('  Professor  : prof.sp@formarede.gov.br');
  console.log('  Senha      : Formarede@2026');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

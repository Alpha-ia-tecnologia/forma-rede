// Testes do banco: estrutura (cada modelo tem sua tabela), RLS por municipio e
// restricoes. Rodam contra o banco de DATABASE_URL, conectado com o papel da aplicacao
// (sem superusuario): e so com ele que as politicas de isolamento valem.
//   pnpm --filter @formarede/db test      (depois de "pnpm --filter @formarede/db build")
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prisma, forTenant, runAsSystem, Prisma } = require('../dist/index.js');

const marca = `${Date.now().toString(36)}`;
const ids = { a: '', b: '', formacaoA: '', formacaoB: '' };

before(async () => {
  await runAsSystem(async (tx: any) => {
    const a = await tx.tenant.create({ data: { slug: `teste-rls-a-${marca}`, nome: 'Teste RLS A', uf: 'SP' } });
    const b = await tx.tenant.create({ data: { slug: `teste-rls-b-${marca}`, nome: 'Teste RLS B', uf: 'RJ' } });
    ids.a = a.id;
    ids.b = b.id;
    ids.formacaoA = (await tx.formacao.create({ data: { tenantId: a.id, titulo: 'Formacao de A' } })).id;
    ids.formacaoB = (await tx.formacao.create({ data: { tenantId: b.id, titulo: 'Formacao de B' } })).id;
  });
});

after(async () => {
  await runAsSystem((tx: any) => tx.tenant.deleteMany({ where: { id: { in: [ids.a, ids.b].filter(Boolean) } } }));
  await prisma.$disconnect();
});

describe('estrutura', () => {
  test('cada modelo do Prisma tem sua tabela no schema', async () => {
    const tabelas: { table_name: string }[] = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`;
    const existentes = new Set(tabelas.map((t) => t.table_name));
    const faltando = Prisma.dmmf.datamodel.models
      .map((m: { name: string; dbName: string | null }) => m.dbName ?? m.name)
      .filter((nome: string) => !existentes.has(nome));
    assert.deepEqual(faltando, []);
  });

  test('o papel da aplicacao nao e superusuario nem ignora o RLS', async () => {
    const [papel]: { rolsuper: boolean; rolbypassrls: boolean }[] = await prisma.$queryRaw`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    assert.equal(papel.rolsuper, false, 'superusuario ignora todas as politicas de RLS');
    assert.equal(papel.rolbypassrls, false, 'BYPASSRLS ignora todas as politicas de RLS');
  });

  test('toda tabela com tenant_id tem RLS forcado e a politica de isolamento', async () => {
    const semRls: { tabela: string }[] = await prisma.$queryRaw`
      SELECT c.relname AS tabela
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = current_schema()
      WHERE c.relkind = 'r'
        AND (c.relname = 'tenant' OR EXISTS (
          SELECT 1 FROM information_schema.columns k
          WHERE k.table_schema = n.nspname AND k.table_name = c.relname AND k.column_name = 'tenant_id'))
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity AND EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = n.nspname AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'))`;
    assert.deepEqual(semRls.map((t) => t.tabela), []);
  });
});

describe('isolamento por municipio (RLS)', () => {
  test('sem contexto de municipio nenhuma linha aparece', async () => {
    assert.equal(await prisma.formacao.count(), 0);
    assert.equal(await prisma.tenant.count(), 0);
  });

  test('o contexto de sistema enxerga todos os municipios', async () => {
    const n = await runAsSystem((tx: any) => tx.formacao.count({ where: { id: { in: [ids.formacaoA, ids.formacaoB] } } }));
    assert.equal(n, 2);
  });

  test('cada municipio ve so as proprias formacoes', async () => {
    const deA = await forTenant(ids.a).formacao.findMany({ select: { id: true } });
    assert.deepEqual(deA.map((f: { id: string }) => f.id), [ids.formacaoA]);
    const deB = await forTenant(ids.b).formacao.findMany({ select: { id: true } });
    assert.deepEqual(deB.map((f: { id: string }) => f.id), [ids.formacaoB]);
  });

  test('nem pelo id um municipio le a linha de outro', async () => {
    assert.equal(await forTenant(ids.a).formacao.findUnique({ where: { id: ids.formacaoB } }), null);
  });

  test('um municipio nao grava linha em nome de outro', async () => {
    await assert.rejects(
      forTenant(ids.a).formacao.create({ data: { tenantId: ids.b, titulo: 'Intrusa' } }),
      /row-level security/,
    );
  });

  test('um municipio nao altera nem apaga linha de outro', async () => {
    const alteradas = await forTenant(ids.a).formacao.updateMany({ where: { id: ids.formacaoB }, data: { titulo: 'Alterada' } });
    const apagadas = await forTenant(ids.a).formacao.deleteMany({ where: { id: ids.formacaoB } });
    assert.equal(alteradas.count, 0);
    assert.equal(apagadas.count, 0);
    const b = await forTenant(ids.b).formacao.findUnique({ where: { id: ids.formacaoB } });
    assert.equal(b?.titulo, 'Formacao de B');
  });

  test('o contexto de um municipio nao vaza para a consulta seguinte', async () => {
    await forTenant(ids.a).formacao.count();
    assert.equal(await prisma.formacao.count(), 0);
  });
});

describe('restricoes', () => {
  test('o slug do municipio e unico', async () => {
    await assert.rejects(
      runAsSystem((tx: any) => tx.tenant.create({ data: { slug: `teste-rls-a-${marca}`, nome: 'Repetido', uf: 'SP' } })),
      (e: { code?: string }) => e.code === 'P2002',
    );
  });

  test('turma exige formacao existente', async () => {
    await assert.rejects(
      forTenant(ids.a).turma.create({
        data: { tenantId: ids.a, formacaoId: '00000000-0000-4000-8000-000000000000', nome: 'Sem formacao' },
      }),
      (e: { code?: string }) => e.code === 'P2003',
    );
  });

  test('apagar o municipio leva junto as linhas dele', async () => {
    const t = await runAsSystem(async (tx: any) => {
      const tenant = await tx.tenant.create({ data: { slug: `teste-rls-c-${marca}`, nome: 'Teste RLS C', uf: 'MG' } });
      await tx.formacao.create({ data: { tenantId: tenant.id, titulo: 'Formacao de C' } });
      await tx.tenant.delete({ where: { id: tenant.id } });
      return tenant;
    });
    const restantes = await runAsSystem((tx: any) => tx.formacao.count({ where: { tenantId: t.id } }));
    assert.equal(restantes, 0);
  });
});

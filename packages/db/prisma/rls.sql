-- FORMAREDE :: Row-Level Security por tenant (municipio).
-- Executado APOS o "prisma db push" (script db:rls / bootstrap).
-- Sem contexto => nenhuma linha visivel (deny by default). NULLIF: depois que uma
-- transacao fixa app.tenant_id (set_config local), a conexao devolve '' e nao NULL;
-- sem ele, ''::uuid derruba a consulta seguinte no mesmo pool (ate as de sistema).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tabela Tenant: a coluna de escopo e o proprio id.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING (current_setting('app.bypass_rls', true) = 'on'
         OR id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on'
         OR id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Demais tabelas escopadas por tenant_id (Etapas 1 + 2).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'tenant_config','regional','escola','membership','consent',
    'formacao','turma','modulo_formacao','etapa_transicao',
    'inscricao','encontro','frequencia',
    'material','material_formacao','atividade','entrega','certificado',
    'avaliacao','resposta_avaliacao','ai_interacao','plano_formativo',
    'audit_log','assistente_conversa','assistente_turno',
    'trilha_etapa','trilha_progresso','avaliacao_participacao'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (current_setting(''app.bypass_rls'', true) = ''on'' '
      '       OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'' '
      '       OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid);',
      t, t);
  END LOOP;
END $$;

-- Papel da aplicacao (formarede_app): sem superusuario e sem BYPASSRLS, para que as
-- politicas acima valham para a API (superusuario e dono ignoram RLS sem FORCE; o
-- superusuario ignora sempre). Criado uma vez por servidor (README); aqui recebe os
-- acessos ao schema atual, inclusive das tabelas que um db push criar depois.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'formarede_app') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO formarede_app;', current_schema());
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO formarede_app;', current_schema());
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO formarede_app;', current_schema());
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO formarede_app;', current_schema());
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO formarede_app;', current_schema());
  END IF;
END $$;

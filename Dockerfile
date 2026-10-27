# FORMAREDE em um so servico do Easypanel: web (porta 3000, a do dominio) e API (3333,
# so dentro do container). A web repassa /api/v1 para a API, entao basta um dominio e
# nao ha CORS. No Easypanel: servico App, builder Dockerfile, Build Path "/" e arquivo
# "Dockerfile" (os padroes). As variaveis ficam na aba Environment (README, Deploy).

FROM node:22-bookworm-slim
# openssl: o Prisma escolhe o motor de consulta pela versao do OpenSSL do sistema.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@9.12.0
WORKDIR /app

# Manifestos primeiro: a camada de dependencias so e refeita quando eles mudam.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
RUN pnpm install --frozen-lockfile --filter "@formarede/api..." --filter "@formarede/web..."

COPY tsconfig.base.json docker-entrypoint.sh ./
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web

# NEXT_PUBLIC_MOCK entra no JavaScript durante o build (o Easypanel passa as variaveis do
# servico como build args): 1 = dados de demonstracao, sem usar a API nem o banco.
# NEXT_PUBLIC_API_URL vazio: o navegador chama /api/v1 no proprio dominio da web.
ARG NEXT_PUBLIC_MOCK=0
ENV NEXT_PUBLIC_MOCK=$NEXT_PUBLIC_MOCK \
    NEXT_PUBLIC_API_URL="" \
    API_INTERNAL_URL=http://127.0.0.1:3333 \
    NEXT_TELEMETRY_DISABLED=1
# Compila contracts, db (gera o cliente Prisma), ai, a API e a web.
RUN pnpm --filter "@formarede/api..." --filter "@formarede/web..." run build \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && chown -R node:node apps/web/.next/standalone

# HOSTNAME: o Docker preenche com o id do container; o servidor do Next precisa de 0.0.0.0.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_PORT=3333
USER node
EXPOSE 3000
CMD ["bash", "docker-entrypoint.sh"]

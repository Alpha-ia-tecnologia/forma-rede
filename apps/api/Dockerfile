# API (NestJS). No Easypanel: Build Path "/" (raiz do monorepo) e Dockerfile "apps/api/Dockerfile".
# Escuta na porta 3333 (API_PORT), em /api/v1.

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
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
RUN pnpm install --frozen-lockfile --filter "@formarede/api..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/ai packages/ai
COPY apps/api apps/api
# Compila contracts, db (gera o cliente Prisma), ai e a API, nessa ordem.
RUN pnpm --filter "@formarede/api..." run build

ENV NODE_ENV=production \
    API_PORT=3333
USER node
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["node", "dist/main.js"]

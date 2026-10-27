# Web (Next.js). No Easypanel: Build Path "/" (raiz do monorepo) e Dockerfile "apps/web/Dockerfile".
# Escuta na porta 3000.

FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@9.12.0
WORKDIR /app

# Manifestos primeiro: a camada de dependencias so e refeita quando eles mudam.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@formarede/web..."

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web

# NEXT_PUBLIC_* entram no JavaScript durante o build, nao na execucao. O Easypanel passa
# as variaveis do servico como build args: mude-as e faca um novo deploy.
#   NEXT_PUBLIC_MOCK=1      dados de demonstracao em memoria, sem API nem banco
#   NEXT_PUBLIC_API_URL     endereco publico da API (sem /api/v1), quando MOCK nao for 1
ARG NEXT_PUBLIC_MOCK=0
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_MOCK=$NEXT_PUBLIC_MOCK \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@formarede/web..." run build

FROM node:22-bookworm-slim
WORKDIR /app
# HOSTNAME: o Docker preenche com o id do container; o servidor do Next precisa de 0.0.0.0.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

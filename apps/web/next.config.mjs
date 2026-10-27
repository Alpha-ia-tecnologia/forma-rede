import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Imagem unica (Dockerfile da raiz): a API roda no mesmo container e a web repassa
// /api/v1 para ela, entao o navegador fala com um so dominio, sem CORS.
const API_INTERNA = process.env.API_INTERNAL_URL;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@formarede/contracts'],
  // Imagem Docker enxuta: o build gera um servidor que leva so o que a web usa.
  // A raiz do monorepo entra no rastreio porque contracts vem do workspace.
  output: 'standalone',
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),
  ...(API_INTERNA && {
    async rewrites() {
      return [{ source: '/api/v1/:path*', destination: `${API_INTERNA}/api/v1/:path*` }];
    },
  }),
  // O repasse corta em 30 s por padrao; o plano do Copiloto pode levar mais que isso.
  experimental: { proxyTimeout: 300_000 },
};
export default nextConfig;

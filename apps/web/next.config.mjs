import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@formarede/contracts'],
  // Imagem Docker enxuta: o build gera um servidor que leva so o que a web usa.
  // A raiz do monorepo entra no rastreio porque contracts vem do workspace.
  output: 'standalone',
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '../..'),
};
export default nextConfig;

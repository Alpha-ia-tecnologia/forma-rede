import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { JetBrains_Mono, Noto_Sans } from 'next/font/google';

// Uma familia so (Noto Sans), titulos e numeros em negrito; JetBrains Mono so em codigo.
const noto = Noto_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-noto', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-jetbrains', display: 'swap' });

// Sem titulo fixo aqui: cada tela define o da aba ("Encontros · Formarede", via PageHeader),
// e um titulo no metadata seria reaplicado por cima dele a cada navegacao.
export const metadata: Metadata = {
  description: 'Plataforma inteligente de formação e acompanhamento de professores',
};

export const viewport: Viewport = { themeColor: '#f2b705' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${noto.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}

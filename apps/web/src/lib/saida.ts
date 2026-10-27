'use client';
// Trabalho nao salvo: o navegador pergunta antes de fechar ou recarregar, e os links do
// proprio app (menu, Voltar) param no lugar; a tela mostra a escolha na barra de acao.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useSaidaProtegida(ativo: boolean) {
  const router = useRouter();
  /** Para onde a pessoa tentou ir (null: ninguem tentou sair). */
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const noLink = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const alvo = new URL(a.href, window.location.href);
      // Ancora na mesma pagina (#trilha) nao e sair.
      if (alvo.origin !== window.location.origin || alvo.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setDestino(alvo.pathname + alvo.search + alvo.hash);
    };
    window.addEventListener('beforeunload', segurar);
    document.addEventListener('click', noLink, true);
    return () => {
      window.removeEventListener('beforeunload', segurar);
      document.removeEventListener('click', noLink, true);
    };
  }, [ativo]);

  const ficar = useCallback(() => setDestino(null), []);
  const sair = useCallback(() => {
    if (destino) router.push(destino);
    setDestino(null);
  }, [destino, router]);

  return { destino, ficar, sair };
}

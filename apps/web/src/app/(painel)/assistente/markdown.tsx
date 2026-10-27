'use client';
// Markdown minimo para as respostas do assistente: titulos, listas, citacoes,
// negrito, italico e codigo em linha. Gera elementos React, nunca HTML cru.
import { Fragment, type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
const INICIO_DE_BLOCO = /^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|>)/;

function inline(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(INLINE)) {
    const t = m[0];
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    const k = `${chave}-${i++}`;
    if (t.startsWith('**')) partes.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) partes.push(<code key={k}>{t.slice(1, -1)}</code>);
    else partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = inicio + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

/** Junta linhas consecutivas que casam com `re`, devolvendo o texto sem o marcador. */
function coletar(linhas: string[], i: number, re: RegExp): [string[], number] {
  const itens: string[] = [];
  while (i < linhas.length && re.test(linhas[i]!)) {
    itens.push(linhas[i]!.replace(re, ''));
    i++;
  }
  return [itens, i];
}

export function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');
  const blocos: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < linhas.length) {
    const linha = linhas[i]!;
    if (!linha.trim()) { i++; continue; }
    const k = `b${n++}`;

    const titulo = linha.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      const Tag = titulo[1]!.length <= 2 ? 'h3' : 'h4';
      blocos.push(<Tag key={k}>{inline(titulo[2]!, k)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(linha)) {
      const [itens, prox] = coletar(linhas, i, /^\s*[-*•]\s+/);
      blocos.push(<ul key={k}>{itens.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ul>);
      i = prox;
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(linha)) {
      const [itens, prox] = coletar(linhas, i, /^\s*\d+[.)]\s+/);
      blocos.push(<ol key={k}>{itens.map((t, j) => <li key={j}>{inline(t, `${k}-${j}`)}</li>)}</ol>);
      i = prox;
      continue;
    }
    if (/^>\s?/.test(linha)) {
      const [itens, prox] = coletar(linhas, i, /^>\s?/);
      blocos.push(<blockquote key={k}>{inline(itens.join(' '), k)}</blockquote>);
      i = prox;
      continue;
    }
    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i]!.trim() && (paragrafo.length === 0 || !INICIO_DE_BLOCO.test(linhas[i]!))) {
      paragrafo.push(linhas[i]!);
      i++;
    }
    blocos.push(
      <p key={k}>{paragrafo.map((t, j) => <Fragment key={j}>{j > 0 && <br />}{inline(t, `${k}-${j}`)}</Fragment>)}</p>,
    );
  }
  return <div className="md">{blocos}</div>;
}

'use client';
// Turmas e formadores da formacao (curadoria: formador:alocar). Cada formador ve e conduz so
// as turmas em que esta; turma sem formador fica marcada e com a alocacao no proprio item.
import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../../ui';
import { plural } from '../../../../lib/texto';
import { AlocarTurma } from '../../formadores/alocacao';

export interface TurmaComFormadores {
  id: string;
  nome: string;
  vagas: number;
  _count: { inscricoes: number; encontros: number };
  formadores: { id: string; nome: string }[];
}

export function TurmasFormadores({ turmas, aoMudar }: { turmas: TurmaComFormadores[]; aoMudar: () => void }) {
  const [aviso, setAviso] = useState('');
  if (!turmas.length) return null;
  const sem = turmas.filter((t) => !t.formadores.length).length;

  return (
    <section id="turmas" className="fsec" aria-labelledby="turmas-titulo">
      <div className="fsec-head">
        <div>
          <h2 id="turmas-titulo" className="section-title">Turmas e formadores</h2>
          <p className="fsec-lead">
            {sem
              ? `${plural(sem, 'turma está', 'turmas estão')} sem formador: ninguém faz a chamada nem dá devolutiva ${sem === 1 ? 'nela' : 'nelas'}.`
              : 'Cada formador vê e conduz só as turmas em que está.'}
          </p>
        </div>
      </div>
      <ul className="fsec-lista">
        {turmas.map((t) => <ItemTurma key={t.id} turma={t} aoAlocar={(texto) => { setAviso(texto); aoMudar(); }} />)}
      </ul>
      <p className="sr-only" role="status">{aviso}</p>
    </section>
  );
}

function ItemTurma({ turma, aoAlocar }: { turma: TurmaComFormadores; aoAlocar: (aviso: string) => void }) {
  const [alocando, setAlocando] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const aberto = useRef(false);
  useEffect(() => {
    if (alocando) aberto.current = true;
    else if (aberto.current) botao.current?.focus();
  }, [alocando]);
  const sem = !turma.formadores.length;
  return (
    <li className="fitem">
      <div className="fitem-topo">
        <h3 className="fitem-titulo">{turma.nome}</h3>
        {sem && <StatusBadge tom="warn">Sem formador</StatusBadge>}
      </div>
      <p className="fitem-meta">
        <span>{plural(turma._count.inscricoes, 'cursista inscrito', 'cursistas inscritos')}{turma.vagas ? ` de ${turma.vagas} vagas` : ''}</span>
        <span>{plural(turma._count.encontros, 'encontro', 'encontros')}</span>
      </p>
      {!sem && <p className="fitem-texto">Conduz: {turma.formadores.map((f) => f.nome).join(', ')}.</p>}
      {alocando ? (
        <AlocarTurma turma={turma} atuais={turma.formadores.map((f) => f.id)} aoFechar={(alocados) => {
          setAlocando(false);
          if (alocados) aoAlocar(alocados.length ? `${turma.nome}: ${alocados.map((a) => a.nome).join(', ')}.` : `${turma.nome} ficou sem formador.`);
        }} />
      ) : (
        <div className="fitem-acoes">
          <button ref={botao} type="button" className={sem ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAlocando(true)}>
            {sem ? 'Alocar formador' : 'Trocar formadores'}
          </button>
        </div>
      )}
    </li>
  );
}

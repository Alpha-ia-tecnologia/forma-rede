# Product

## Register

product

## Users

- **Gestores de rede municipal** (Secretaria de Educacao): acompanham indicadores da rede, aprovam formacoes, configuram o ambiente do municipio. Contexto: expediente administrativo, desktop, pouco tempo.
- **Formadores**: planejam e conduzem formacoes, registram frequencia, avaliam entregas. Contexto: alternam entre desktop (planejamento) e uso rapido em encontros.
- **Professores da rede (cursistas)**: participam de formacoes, entregam atividades, acompanham certificacao. Contexto: fim de expediente, cansados, muitas vezes no celular.
- **Curadores**: revisam e aprovam materiais pedagogicos que alimentam a IA e as formacoes.

Trabalho a ser feito: transformar formacao continuada de professores em melhoria real da pratica de sala de aula, com evidencias e certificacao — em redes municipais com pouca estrutura de TI.

## Product Purpose

SaaS multi-tenant de gestao de formacao continuada de professores para municipios brasileiros. Cada municipio opera um ambiente isolado (dados, identidade, regras). Cobre o ciclo completo: planejamento (com copiloto de IA governada e revisao humana obrigatoria), execucao (turmas, encontros, frequencia), aprendizagem (atividades, entregas, avaliacoes), certificacao e relatorios. Sucesso = secretarias enxergam a rede em tempo real e professores concluem formacoes que mudam a pratica.

## Brand Personality

Institucional, confiavel, acolhedor. Voz: profissional sem burocratês; direta, respeitosa, em portugues claro. Emocao-alvo: confianca de servico publico bem feito + calor humano de escola. A IA aparece sempre como assistente auditavel, nunca como magica.

## Anti-references

- **Portal de governo legado**: tabelas cinzas densas, brasoes, tipografia default, formularios hostis, jargao burocratico.
- **Template SaaS generico**: dashboard shadcn/Tailwind default, cards uniformes sem hierarquia, gradiente roxo decorativo, Inter em tudo, dark mode automatico.
- **Rede social / app gamificado**: emojis como decoracao, pontos e medalhas, tom infantilizado — o publico e adulto e profissional. O pastel dos cartoes marca categoria, nao recompensa.

## Design Principles

1. **Serio sem ser frio**: rigor institucional (dados alinhados, hierarquia clara, valor sempre em texto) com acolhimento no amarelo da marca, nas cores de categoria, nos cantos generosos, nos microtextos e nos estados vazios.
2. **Hierarquia antes de decoracao**: cada tela responde primeiro "o que exige minha atencao agora?"; ornamento so quando sobra clareza.
3. **Governanca visivel**: conteudo de IA, pendencias de revisao e trilhas de auditoria sao sempre identificaveis de relance (token semantico proprio, nunca o acento da marca).
4. **Cada municipio se reconhece**: o ambiente comunica claramente de quem e o dado (tenant sempre visivel), sem parecer um template alugado.
5. **Funciona no fim do expediente**: legibilidade alta (WCAG 2.2 AA), acoes primarias obvias, zero dependencia de hover para informacao essencial.

## Accessibility & Inclusion

- WCAG 2.2 AA: contraste >=4.5:1 em texto corrido, >=3:1 em texto grande e componentes de UI.
- `prefers-reduced-motion` respeitado (ja implementado em globals.css).
- Foco visivel em todos os controles; navegacao completa por teclado.
- Publico com fluencia digital heterogenea: rotulos literais em portugues, sem jargao de software.

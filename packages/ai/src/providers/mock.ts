// Provider Mock: plano deterministico para desenvolvimento sem chave de API
// e para testes. Mantem o fluxo de governanca identico ao provider real.
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from '../types';
import type { PlanoGerado } from '../types';

export class MockProvider implements AiProvider {
  readonly nome = 'mock';

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const tituloMatch = req.user.match(/FORMACAO: (.+)/);
    const titulo = tituloMatch?.[1] ?? 'a formacao';

    const plano: PlanoGerado = {
      objetivos: [
        `Fortalecer as praticas pedagogicas relacionadas a ${titulo}.`,
        'Promover a reflexao sobre a propria pratica docente.',
        'Apoiar a aplicacao do conteudo em sala de aula com evidencias.',
      ],
      resultadosEsperados: [
        'Professores aplicam ao menos uma estrategia nova em sala.',
        'Registro de evidencias de aplicacao pratica por participante.',
      ],
      modulos: [
        { titulo: 'Modulo 1 - Fundamentos', descricao: 'Bases conceituais e diagnostico das praticas atuais.', cargaHoraria: 8 },
        { titulo: 'Modulo 2 - Praticas em acao', descricao: 'Oficinas praticas com planejamento aplicavel.', cargaHoraria: 16 },
        { titulo: 'Modulo 3 - Aplicacao e reflexao', descricao: 'Aplicacao em sala, evidencias e devolutivas.', cargaHoraria: 16 },
      ],
      metodologias: ['Oficinas praticas', 'Estudos de caso', 'Rodas de conversa', 'Mentoria entre pares'],
      atividadesSugeridas: [
        { titulo: 'Plano de aula aplicado', descricao: 'Elaborar e aplicar um plano de aula, registrando evidencias.' },
        { titulo: 'Diario reflexivo', descricao: 'Registrar reflexoes apos cada encontro.' },
      ],
      avaliacao: 'Avaliacao processual: participacao nos encontros, entrega das atividades e evidencias de aplicacao pratica validadas pelo coordenador.',
      observacoes: 'Proposta gerada pelo provider de demonstracao (mock), sem consulta a um modelo de linguagem. Configure um provider real nas configuracoes de IA.',
    };

    return {
      text: JSON.stringify(plano),
      provider: this.nome,
      modelo: 'mock-determinista',
      tokensEntrada: Math.ceil(req.user.length / 4),
      tokensSaida: 350,
    };
  }
}

// Worker de processamento assincrono (RNF-009). As tarefas pesadas do documento
// rodam aqui, fora do caminho da requisicao: transcricao de encontros, indexacao
// semantica (RAG), geracao de relatorios/certificados e tarefas de IA (Etapa 3).
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const QUEUE = 'formarede-jobs';

/** Fila compartilhada. A API enfileira; o worker consome. */
export const jobs = new Queue(QUEUE, { connection });

type JobName =
  | 'transcrever-encontro'
  | 'indexar-material'
  | 'gerar-relatorio'
  | 'emitir-certificado'
  | 'ia-copiloto-planejamento';

const worker = new Worker<{ tenantId?: string }>(
  QUEUE,
  async (job) => {
    // Cada tarefa deve carregar tenantId para respeitar o isolamento.
    switch (job.name as JobName) {
      case 'transcrever-encontro':
        return { status: 'stub', hint: 'Integrar STT (Etapa 3, IA-05).' };
      case 'indexar-material':
        return { status: 'stub', hint: 'Gerar embeddings + pgvector (curadoria semantica).' };
      case 'gerar-relatorio':
        return { status: 'stub', hint: 'Montar relatorio e exportar (RF-116).' };
      case 'emitir-certificado':
        return { status: 'stub', hint: 'Aplicar regras de conclusao e gerar PDF (RF-120).' };
      case 'ia-copiloto-planejamento':
        return { status: 'stub', hint: 'Chamar gateway de IA com RAG + revisao humana (IA-01).' };
      default:
        return { status: 'ignored', name: job.name };
    }
  },
  { connection, concurrency: 5 },
);

worker.on('completed', (job) => console.log(`[worker] ${job.name} #${job.id} concluido`));
worker.on('failed', (job, err) => console.error(`[worker] ${job?.name} falhou:`, err.message));

console.log(`[worker] FORMAREDE consumindo a fila "${QUEUE}"...`);

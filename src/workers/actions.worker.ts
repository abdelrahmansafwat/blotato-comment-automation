import { Worker } from 'bullmq';
import { connection, ACTIONS_QUEUE, type ActionJob } from '../queues.js';

export function startActionsWorker() {
  return new Worker<ActionJob>(
    ACTIONS_QUEUE,
    async (_job) => {
      throw new Error('not implemented');
    },
    { connection },
  );
}

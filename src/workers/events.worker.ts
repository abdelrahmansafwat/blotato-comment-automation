import { Worker } from 'bullmq';
import { connection, EVENTS_QUEUE, type EventJob } from '../queues.js';

export function startEventsWorker() {
  return new Worker<EventJob>(
    EVENTS_QUEUE,
    async (_job) => {
      throw new Error('not implemented');
    },
    { connection },
  );
}

import { Worker } from 'bullmq';
import { handleComment } from '../events/handle-comment.js';
import { parseWebhookPayload } from '../meta/webhook-events.js';
import { connection, EVENTS_QUEUE, type EventJob } from '../queues.js';

export function startEventsWorker() {
  return new Worker<EventJob>(
    EVENTS_QUEUE,
    async (job) => {
      for (const event of parseWebhookPayload(job.data.payload)) {
        if (event.kind === 'comment') await handleComment(event);
      }
    },
    { connection },
  );
}

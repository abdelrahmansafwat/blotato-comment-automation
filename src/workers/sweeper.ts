import { Queue, Worker } from 'bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { run } from '../db/schema.js';
import { connection } from '../queues.js';

const SWEEPER_QUEUE = 'sweeper';
const SWEEP_INTERVAL_MINUTES = 1;

export async function startSweeper() {
  const queue = new Queue(SWEEPER_QUEUE, { connection });
  await queue.upsertJobScheduler('expire-runs', { every: SWEEP_INTERVAL_MINUTES * 60 * 1000 });

  return new Worker(SWEEPER_QUEUE, expireRuns, { connection });
}

export async function expireRuns() {
  const expired = await db
    .update(run)
    .set({ status: 'expired' })
    .where(and(eq(run.status, 'awaiting_answer'), lt(run.expiresAt, new Date())))
    .returning({ id: run.id });

  return { expired: expired.length };
}

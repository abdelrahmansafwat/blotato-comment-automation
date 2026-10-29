import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';

export const connection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
});

export const EVENTS_QUEUE = 'webhook-events';
export type EventJob = { payload: string; receivedAt: string };

export const ACTIONS_QUEUE = 'actions';
export type ActionJob =
  | { type: 'private_reply'; runId: number }
  | { type: 'final_message'; runId: number }
  | { type: 'wrong_answer'; runId: number }
  | { type: 'public_reply'; runId: number };

// BullMQ runs lower numbers first
export const JOB_PRIORITY = {
  final_message: 1,
  private_reply: 2,
  wrong_answer: 2,
  public_reply: 3,
} as const;

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: true,
};

export const eventsQueue = new Queue<EventJob>(EVENTS_QUEUE, { connection, defaultJobOptions });
export const actionsQueue = new Queue<ActionJob>(ACTIONS_QUEUE, { connection, defaultJobOptions });

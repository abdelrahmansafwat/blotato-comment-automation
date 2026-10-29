import { sql } from 'drizzle-orm';
import {
  bigserial,
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const account = pgTable(
  'account',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    igUserId: text('ig_user_id').notNull().unique(),
    username: text('username').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    status: text('status', { enum: ['connected', 'disconnected'] })
      .notNull()
      .default('connected'),
    createdAt: createdAt(),
  },
  (t) => [check('account_status_check', sql`${t.status} IN ('connected', 'disconnected')`)],
);

export const campaign = pgTable(
  'campaign',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'number' })
      .notNull()
      .references(() => account.id),
    postId: text('post_id'),
    keyword: text('keyword').notNull(),
    commentReplyText: text('comment_reply_text').notNull(),
    dmText: text('dm_text').notNull(),
    collectType: text('collect_type', { enum: ['email', 'phone', 'text'] }).notNull(),
    wrongAnswerText: text('wrong_answer_text').notNull(),
    finalMessage: text('final_message').notNull(),
    maxWrongAnswers: integer('max_wrong_answers').notNull().default(3),
    timeoutMinutes: integer('timeout_minutes').notNull().default(1440),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('campaign_post_keyword_uniq').on(t.accountId, t.postId, t.keyword).nullsNotDistinct(),
    check('campaign_keyword_lowercase', sql`${t.keyword} = lower(${t.keyword})`),
    check('campaign_collect_type_check', sql`${t.collectType} IN ('email', 'phone', 'text')`),
  ],
);

export const runStatuses = [
  'pending',
  'awaiting_answer',
  'answer_received',
  'completed',
  'rejected',
  'failed',
  'expired',
] as const;

export const run = pgTable(
  'run',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => account.id),
    campaignId: bigint('campaign_id', { mode: 'number' })
      .notNull()
      .references(() => campaign.id),
    commentId: text('comment_id').notNull().unique(),
    userId: text('user_id').notNull(),
    userName: text('user_name'),
    collectedValue: text('collected_value'),
    status: text('status', { enum: runStatuses }).notNull().default('pending'),
    wrongAnswerCount: integer('wrong_answer_count').notNull().default(0),
    lastError: text('last_error'),
    privateReplySentAt: timestamp('private_reply_sent_at', { withTimezone: true }),
    commentRepliedAt: timestamp('comment_replied_at', { withTimezone: true }),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'run_status_check',
      sql`${t.status} IN ('pending', 'awaiting_answer', 'answer_received', 'completed', 'rejected', 'failed', 'expired')`,
    ),
    uniqueIndex('run_one_active_per_user')
      .on(t.tenantId, t.campaignId, t.userId)
      .where(sql`${t.status} IN ('pending', 'awaiting_answer', 'answer_received')`),
    index('run_awaiting_expiry')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'awaiting_answer'`),
    index('run_waiting_by_user')
      .on(t.tenantId, t.userId)
      .where(sql`${t.status} = 'awaiting_answer'`),
  ],
);

export const processedMessage = pgTable('processed_message', {
  mid: text('mid').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

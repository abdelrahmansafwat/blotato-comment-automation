import { UnrecoverableError, Worker } from 'bullmq';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { account, campaign, run } from '../db/schema.js';
import { replyToComment, sendMessage, sendPrivateReply, type SendResult } from '../meta/client.js';
import { connection, ACTIONS_QUEUE, type ActionJob } from '../queues.js';
import { decryptToken } from '../security/token-encryption.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIVATE_REPLY_WINDOW_MS = 7 * DAY_MS;
const MESSAGING_WINDOW_MS = DAY_MS;
const EXPIRED_TOKEN_CODE = 190;

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

export function startActionsWorker() {
  return new Worker<ActionJob>(
    ACTIONS_QUEUE,
    async (job) => {
      const context = await loadContext(job.data.runId);
      if (!context || context.account.status === 'disconnected') return;

      if (job.data.type === 'private_reply') await privateReply(context);
      if (job.data.type === 'public_reply') await publicReply(context);
      if (job.data.type === 'wrong_answer') await wrongAnswer(context);
      if (job.data.type === 'final_message') await finalMessage(context);
    },
    { connection },
  );
}

async function loadContext(runId: number) {
  const [row] = await db
    .select()
    .from(run)
    .innerJoin(campaign, eq(run.campaignId, campaign.id))
    .innerJoin(account, eq(run.tenantId, account.id))
    .where(eq(run.id, runId));
  if (!row) return undefined;

  const token = decryptToken(row.account.accessTokenEncrypted, config.tokenEncryptionKey);
  return { ...row, token };
}

async function privateReply({ run: current, campaign: flow, account: owner, token }: Context) {
  if (current.status !== 'pending') return;
  if (Date.now() - current.createdAt.getTime() > PRIVATE_REPLY_WINDOW_MS) {
    return failRun(current.id, 'private reply window closed');
  }

  const result = await sendPrivateReply(token, owner.igUserId, current.commentId, flow.dmText);
  if (!(await checkResult(result, owner.id, current.id))) return;

  const now = new Date();
  await db
    .update(run)
    .set({
      status: 'awaiting_answer',
      privateReplySentAt: now,
      lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + flow.timeoutMinutes * 60 * 1000),
    })
    .where(and(eq(run.id, current.id), eq(run.status, 'pending')));
}

async function publicReply({ run: current, campaign: flow, account: owner, token }: Context) {
  if (current.commentRepliedAt) return;

  const result = await replyToComment(token, current.commentId, flow.commentReplyText);
  if (!(await checkResult(result, owner.id))) return;

  await db
    .update(run)
    .set({ commentRepliedAt: new Date() })
    .where(and(eq(run.id, current.id), isNull(run.commentRepliedAt)));
}

async function wrongAnswer({ run: current, campaign: flow, account: owner, token }: Context) {
  if (current.status !== 'awaiting_answer') return;

  const result = await sendMessage(token, owner.igUserId, current.userId, flow.wrongAnswerText);
  await checkResult(result, owner.id, current.id);
}

async function finalMessage({ run: current, campaign: flow, account: owner, token }: Context) {
  if (current.status !== 'answer_received') return;
  if (Date.now() - current.lastInteractionAt.getTime() > MESSAGING_WINDOW_MS) {
    return failRun(current.id, 'messaging window closed');
  }

  const result = await sendMessage(token, owner.igUserId, current.userId, flow.finalMessage);
  if (!(await checkResult(result, owner.id, current.id))) return;

  await db
    .update(run)
    .set({ status: 'completed' })
    .where(and(eq(run.id, current.id), eq(run.status, 'answer_received')));
}

async function checkResult(result: SendResult, accountId: number, runId?: number) {
  if (result.ok) return true;
  if (result.status === 429 || result.status >= 500) throw new Error(result.message);

  if (result.code === EXPIRED_TOKEN_CODE) {
    await disconnectAccount(accountId);
    return false;
  }

  if (runId) await failRun(runId, result.message);
  throw new UnrecoverableError(result.message);
}

async function failRun(runId: number, reason: string) {
  await db
    .update(run)
    .set({ status: 'failed', lastError: reason })
    .where(
      and(
        eq(run.id, runId),
        inArray(run.status, ['pending', 'awaiting_answer', 'answer_received']),
      ),
    );
}

async function disconnectAccount(accountId: number) {
  await db
    .update(account)
    .set({ status: 'disconnected' })
    .where(and(eq(account.id, accountId), eq(account.status, 'connected')));
}

import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { account, campaign, run } from '../db/schema.js';
import type { CommentEvent } from '../meta/webhook-events.js';
import { actionsQueue, JOB_PRIORITY } from '../queues.js';

export async function handleComment(comment: CommentEvent) {
  if (comment.commenterId === comment.accountIgId) return;

  const [owner] = await db.select().from(account).where(eq(account.igUserId, comment.accountIgId));
  if (!owner) return;

  const matched = await findCampaign(owner.id, comment);
  if (!matched) return;

  const [created] = await db
    .insert(run)
    .values({
      tenantId: owner.id,
      campaignId: matched.id,
      commentId: comment.commentId,
      userId: comment.commenterId,
      userName: comment.commenterUsername,
    })
    .onConflictDoNothing()
    .returning({ id: run.id });

  const runId = created?.id ?? (await findPendingRun(comment.commentId));
  if (!runId) return;

  await actionsQueue.add(
    'private_reply',
    { type: 'private_reply', runId },
    { priority: JOB_PRIORITY.private_reply, jobId: `private_reply-${runId}` },
  );
  await actionsQueue.add(
    'public_reply',
    { type: 'public_reply', runId },
    { priority: JOB_PRIORITY.public_reply, jobId: `public_reply-${runId}` },
  );
}

async function findPendingRun(commentId: string) {
  const [existing] = await db
    .select({ id: run.id })
    .from(run)
    .where(and(eq(run.commentId, commentId), eq(run.status, 'pending')));
  return existing?.id;
}

async function findCampaign(accountId: number, comment: CommentEvent) {
  const words = comment.text.toLowerCase().split(/[^\p{L}\p{N}]+/u);

  const candidates = await db
    .select()
    .from(campaign)
    .where(
      and(
        eq(campaign.accountId, accountId),
        eq(campaign.enabled, true),
        or(eq(campaign.postId, comment.mediaId), isNull(campaign.postId)),
      ),
    )
    .orderBy(sql`${campaign.postId} IS NULL`, asc(campaign.id));

  return candidates.find((candidate) => words.includes(candidate.keyword));
}

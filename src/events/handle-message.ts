import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { account, campaign, processedMessage, run } from '../db/schema.js';
import type { MessageEvent } from '../meta/webhook-events.js';
import { actionsQueue, JOB_PRIORITY } from '../queues.js';

type CollectType = 'email' | 'phone' | 'text';

export async function handleMessage(message: MessageEvent) {
  if (message.isEcho || !message.text) return;
  const answer = message.text.trim();

  const [owner] = await db.select().from(account).where(eq(account.igUserId, message.accountIgId));
  if (!owner) return;

  const jobs = await db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(processedMessage)
      .values({ mid: message.mid })
      .onConflictDoNothing()
      .returning();
    if (!fresh) return [];

    const waiting = await tx
      .select({ id: run.id, collectType: campaign.collectType })
      .from(run)
      .innerJoin(campaign, eq(run.campaignId, campaign.id))
      .where(
        and(
          eq(run.tenantId, owner.id),
          eq(run.userId, message.senderId),
          eq(run.status, 'awaiting_answer'),
        ),
      )
      .orderBy(desc(run.createdAt));

    const valid = waiting.filter((w) => isValidAnswer(w.collectType, answer));

    if (valid.length > 0) {
      const answered = [];
      for (const { id } of valid) {
        const [updated] = await tx
          .update(run)
          .set({ status: 'answer_received', collectedValue: answer, lastInteractionAt: new Date() })
          .where(and(eq(run.id, id), eq(run.status, 'awaiting_answer')))
          .returning({ id: run.id });
        if (updated) answered.push({ type: 'final_message' as const, runId: updated.id });
      }
      return answered;
    }

    const stillWaiting = [];
    for (const { id } of waiting) {
      const [updated] = await tx
        .update(run)
        .set({
          wrongAnswerCount: sql`${run.wrongAnswerCount} + 1`,
          lastInteractionAt: new Date(),
          status: sql`CASE WHEN ${run.wrongAnswerCount} + 1 >= (SELECT ${campaign.maxWrongAnswers} FROM ${campaign} WHERE ${campaign.id} = ${run.campaignId}) THEN 'rejected' ELSE 'awaiting_answer' END`,
        })
        .where(and(eq(run.id, id), eq(run.status, 'awaiting_answer')))
        .returning({ id: run.id, status: run.status });
      if (updated?.status === 'awaiting_answer') stillWaiting.push(updated.id);
    }
    return stillWaiting.slice(0, 1).map((runId) => ({ type: 'wrong_answer' as const, runId }));
  });

  for (const job of jobs) {
    await actionsQueue.add(job.type, job, { priority: JOB_PRIORITY[job.type] });
  }
}

function isValidAnswer(collectType: CollectType, answer: string) {
  if (collectType === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer);
  if (collectType === 'phone') return /^\+?\d{7,15}$/.test(answer.replace(/[\s().-]/g, ''));
  return answer.length > 0;
}

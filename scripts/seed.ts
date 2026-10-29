import { db, pool } from '../src/db/index.js';
import { account, campaign } from '../src/db/schema.js';

const [demo] = await db
  .insert(account)
  .values({ igUserId: '17841400000000000', username: 'demo_creator', accessToken: 'dev-token' })
  .onConflictDoUpdate({ target: account.igUserId, set: { username: 'demo_creator' } })
  .returning({ id: account.id });

await db
  .insert(campaign)
  .values({
    accountId: demo!.id,
    postId: null,
    keyword: 'pricing',
    commentReplyText: 'Sent you a DM!',
    dmText: 'What is your email?',
    collectType: 'email',
    wrongAnswerText: 'That does not look like an email, try again?',
    finalMessage: 'Here is the pricing: https://example.com/pricing',
  })
  .onConflictDoNothing();

console.log(`seeded account ${demo!.id}`);
await pool.end();

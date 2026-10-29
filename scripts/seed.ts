import { config } from '../src/config.js';
import { db, pool } from '../src/db/index.js';
import { account, campaign } from '../src/db/schema.js';
import { encryptToken } from '../src/security/token-encryption.js';

const accessTokenEncrypted = encryptToken('dev-token', config.tokenEncryptionKey);

const [demo] = await db
  .insert(account)
  .values({ igUserId: '17841400000000000', username: 'demo_creator', accessTokenEncrypted })
  .onConflictDoUpdate({
    target: account.igUserId,
    set: { username: 'demo_creator', accessTokenEncrypted },
  })
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

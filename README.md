# Instagram comment-to-DM automation

A backend service that watches comments on a creator's Instagram posts. When a comment contains a campaign keyword, it replies to the comment, sends the commenter a private DM asking for a value (email, phone or free text), waits for the answer, validates it, and sends a final message such as a download link.

Stack: TypeScript, Fastify, BullMQ on Redis, PostgreSQL with Drizzle.

## Running it locally

```bash
docker compose up -d                 # Postgres 17 and Redis 7
cp .env.example .env                 # then set TOKEN_ENCRYPTION_KEY:
openssl rand -base64 32
npm install
npm run migrate
npm run seed                         # one demo account and a "pricing" campaign
npm run dev                          # webhook server on :3000
npm run worker                       # events worker, actions worker and sweeper
```

The webhook URL for the Meta app is `POST /webhook`, and `GET /webhook` answers Meta's verification challenge.

## How it works

```
Meta webhook ─> POST /webhook ─> events queue ─> events worker ─> Postgres (run table)
                (checks signature,                 (parses, matches             │
                 queues the raw body)               campaigns, validates)       ▼
                                                                         actions queue
                                                                               │
                         sweeper (every minute) ─> expires old runs     actions worker ─> Instagram Graph API
```

1. **Webhook.** Checks `X-Hub-Signature-256` against the raw body, puts the raw payload on the `webhook-events` queue and returns 200 at once. No parsing or database work happens inside the request, so a slow database never makes Meta time out and retry.
2. **Events worker.** Parses the payload into comment and message events.
   - A comment that matches an enabled campaign creates a `run` row and queues two jobs: the private reply DM and the public comment reply.
   - A DM is matched to the sender's runs that are waiting for an answer.
3. **Actions worker.** Sends each queued action through the Graph API and moves the run to its next status.
4. **Sweeper.** A BullMQ job scheduler that runs every minute and expires runs whose answer deadline has passed.

### Data model

- `account`: one row per connected Instagram account (the tenant). The access token is stored encrypted (AES-256-GCM).
- `campaign`: the configuration. Post (or NULL for any post), keyword, comment reply text, DM text, what to collect, wrong-answer text, final message, max wrong answers, timeout, enabled.
- `run`: one row per person going through a campaign. This is the state.
- `processed_message`: message ids already handled, for DM deduplication.

### Run lifecycle

```
pending ─> awaiting_answer ─> answer_received ─> completed
                │
                ├─> rejected   (too many wrong answers)
                └─> expired    (no answer before expires_at)
any active status ─> failed    (Instagram refused, or a platform window closed)
```

A status records what has already been done. Every job can therefore look at the row and decide whether its step still needs doing, which makes retries and duplicate jobs safe.

## Instagram rules this design relies on

- A private reply is one message to the commenter, sent within 7 days of the comment. Meta documents no error code for a second one.
- After that, the account can only message the person if they reply, and only within 24 hours of their reply.
- Private replies are limited to 750 calls per hour per account. Rate-limited calls fail with error codes 4, 17, 32 or 613.
- Webhooks are retried for up to 36 hours and can arrive more than once.
- Public replies only work on top-level, visible comments.

Sources: [Private replies](https://developers.facebook.com/docs/instagram-platform/private-replies), [Rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting), [Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started), [Comment replies](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies). Checked October 2026.

## Decisions and trade-offs

**One fixed flow, configured per campaign.** Comment reply, DM asking for one value, validate, final message. It is not a workflow engine. It cannot branch or ask several questions. To grow it, I would add a `flow_type` column first, and a list of steps per campaign if real demand for longer flows appears.

**Multi-tenant from day one.** Meta sends every account's webhooks to one endpoint per app, so all queries are scoped by account. One deployment per customer would not remove that.

**Keyword matching.** Whole word and case-insensitive. A campaign on a specific post wins over an account-wide one, and the oldest campaign wins a tie.

**Waiting is a row, not a process.** Nothing runs while the system waits for an answer. The `awaiting_answer` row is the wait, and the incoming DM webhook resumes it.

**Database constraints do the duplicate protection.**

- `UNIQUE(comment_id)`: webhooks can arrive more than once, so the same comment can arrive twice.
- Partial unique index on `(tenant_id, campaign_id, user_id)` for active statuses: one active run per person per campaign, and the person can go through the campaign again later.
- Conditional updates everywhere (`WHERE id = ? AND status = ?`). When the sweeper and a last-second reply race, whichever commits first wins and the other changes nothing.

**One answer, several waiting runs.** If a person is waiting in two campaigns, the reply is applied to every run where it is valid. If it is valid for none, every waiting run counts a wrong answer but the person gets only one wrong-answer message.

**Priority inside one account.** Final message first, because the person did their part and the 24 hour window is running. Then the first DM, then the public comment reply. With private replies capped per hour, public replies can arrive late in a spike, but they are still sent.

**Public reply is decoupled.** The private reply DM does not need the public reply, so the public reply is its own low-priority job, tracked by `comment_replied_at`.

**Sending is at least once.** An API call and a database write can never be atomic. Where a duplicate would hurt, there is a guard: the run status, `private_reply_sent_at` and `comment_replied_at`. A duplicate final message is harmless and accepted. The run status matters most for the private reply, since only one is allowed and no error code tells us a second one was refused. The worker checks the 7 day window before sending, counted from when the run was created, and checks the final message against the 24 hour window using `last_interaction_at`.

**Retries.** 5 attempts with exponential backoff and jitter on both queues. Network errors, 429 and 5xx responses, and Meta's rate-limit error codes are retried. An expired token is handled below. Any other Instagram error marks the run `failed` with the reason in `last_error` and is never retried. A failed public reply never fails the run. The first DM and public reply jobs have fixed ids, so a webhook retry after a crash requeues a stuck `pending` run without sending anything twice.

**Expired token.** Error 190 flips the account to `disconnected`. Jobs for that account then finish without sending, and the runs keep their status, so they can be rebuilt from the rows when the account reconnects.

## What was tested

Each piece was run against the local Postgres and Redis, with a small fake Graph API server standing in for Instagram: duplicate webhooks, duplicate DMs, valid and invalid answers, the max-wrong-answers limit, Instagram errors, the 7 day window, an expired token, the sweeper, and the crash-and-retry case. It has **not** been run against the real Instagram API, which needs a reviewed Meta app.

There is no automated test suite yet. The first tests I would add are integration tests for `handleComment`, `handleMessage` and the actions worker against a real Postgres.

## Known gaps

- If the process crashes after a DM answer is saved but before the final-message job is queued, the run stays in `answer_received`. The sweeper could requeue such runs after a minute.
- Runs stuck in `pending` or `answer_received` (for example while a token is dead) are not expired by the sweeper. The 7 day and 24 hour checks make them fail cleanly when they do run.
- A request that fails after Instagram already received it is retried. For the private reply that can mean an error on the retry. For the final message, a duplicate.

## What I'd add next

- **Per-account rate limiting.** A Redis counter per account and window (`INCR` plus `EXPIRE`). When the bucket is empty, delay the job until the window resets instead of failing it. Use Meta's `X-App-Usage` and `X-Business-Use-Case-Usage` headers as an early warning, since other apps share the quota.
- **Fairness between creators.** Today all accounts share one queue, so a viral post delays everyone else by seconds. At scale: a queue per account, or BullMQ Pro groups for real round-robin.
- **Reconnect flow.** Email the creator once when the token dies, and requeue one job per active run when they reconnect, checking the platform windows first.
- **Key management.** Envelope encryption with KMS or Vault, key rotation, and refreshing long-lived tokens before they expire.
- **Operations.** A dead-letter view for failed jobs, metrics per campaign (matched, answered, completed), structured logs with run ids.
- **Product.** Multi-question flows, personalised messages with the commenter's name, and a dashboard showing collected values and runs that never got their link.

## How I used AI

See [AI_USE.md](AI_USE.md).

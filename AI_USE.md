# How I used AI on this project

I designed the system and made every decision in it: the schema, the status machine, the constraints, the priorities and the failure handling. I used Claude Code as a sparring partner for the design and to write the code, which I reviewed piece by piece before committing.

## Design

I worked through the design before any code was written, using Claude Code to challenge my proposals. Where my first idea changed, I made the call:

- I started with one deployment per customer. Claude Code flagged that Meta sends every account's webhooks to a single endpoint per app, so I switched to a multi-tenant design.
- I replaced my first idea, an undeletable default campaign for "any post", with a nullable `post_id`.
- I hadn't used a job queue before, so I walked through concrete failure timelines, like a person replying while the account is rate-limited or a token dying mid-campaign. From those I decided when to delay a job (rate limits) and when to let it finish and rebuild it later from the database row (dead tokens). Those decisions are in the README.

## Code

Claude Code wrote the code from my design, one piece at a time. I read every piece and asked questions until I understood it, and only then committed it. My review changed the code:

- I asked for an ORM instead of raw SQL, and chose Drizzle because it can express the partial unique index in the schema.
- I noticed the access tokens were stored in plain text and had them encrypted at rest.
- I chose to leave two known reliability gaps (job ids and webhook retries) for one commit at the end, so the main flow could be built first.

## Testing

Each piece was run against my local Postgres and Redis, with a small fake Instagram API server, and I checked the results before committing. There is no automated test suite yet, and it has not run against the real Instagram API.

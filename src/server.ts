import Fastify from 'fastify';
import { config } from './config.js';
import { eventsQueue } from './queues.js';
import { isValidSignature } from './meta/signature.js';

const app = Fastify({ logger: true });

app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  function keepRawBodyForSignatureCheck(_req, body, done) {
    done(null, body);
  },
);

app.get('/health', async () => ({ ok: true }));

app.get<{ Querystring: Record<string, string> }>('/webhook', async (req, reply) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === config.meta.verifyToken) return reply.send(challenge);
  return reply.code(403).send();
});

app.post('/webhook', async (req, reply) => {
  const rawBody = req.body as Buffer;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!isValidSignature(rawBody, signature, config.meta.appSecret)) {
    return reply.code(401).send();
  }
  await eventsQueue.add('meta-event', {
    payload: rawBody.toString('utf8'),
    receivedAt: new Date().toISOString(),
  });
  return reply.code(200).send('EVENT_RECEIVED');
});

app.listen({ port: config.port, host: '0.0.0.0' });

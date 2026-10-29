function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function encryptionKey(name: string): Buffer {
  const key = Buffer.from(required(name), 'base64');
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return key;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  meta: {
    appSecret: required('META_APP_SECRET'),
    verifyToken: required('META_VERIFY_TOKEN'),
    graphUrl: process.env.META_GRAPH_URL ?? 'https://graph.instagram.com/v23.0',
  },
  tokenEncryptionKey: encryptionKey('TOKEN_ENCRYPTION_KEY'),
};

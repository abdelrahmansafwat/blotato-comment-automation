import { config } from '../config.js';

export type SendResult =
  { ok: true; id: string } | { ok: false; status: number; code?: number; message: string };

type GraphResponse = {
  id?: string;
  message_id?: string;
  error?: { message: string; code?: number };
};

export async function replyToComment(
  token: string,
  commentId: string,
  message: string,
): Promise<SendResult> {
  return post(token, `/${commentId}/replies`, { message });
}

export async function sendPrivateReply(
  token: string,
  igUserId: string,
  commentId: string,
  text: string,
): Promise<SendResult> {
  return post(token, `/${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
  });
}

export async function sendMessage(
  token: string,
  igUserId: string,
  recipientId: string,
  text: string,
): Promise<SendResult> {
  return post(token, `/${igUserId}/messages`, {
    recipient: { id: recipientId },
    message: { text },
  });
}

async function post(token: string, path: string, body: object): Promise<SendResult> {
  const response = await fetch(`${config.meta.graphUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as GraphResponse;

  const id = data.id ?? data.message_id;
  if (response.ok && id) return { ok: true, id };

  return {
    ok: false,
    status: response.status,
    code: data.error?.code,
    message: data.error?.message ?? response.statusText,
  };
}

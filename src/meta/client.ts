export type SendResult =
  { ok: true; id: string } | { ok: false; status: number; code?: number; message: string };

export async function replyToComment(
  _token: string,
  _commentId: string,
  _message: string,
): Promise<SendResult> {
  throw new Error('not implemented');
}

export async function sendPrivateReply(
  _token: string,
  _igUserId: string,
  _commentId: string,
  _text: string,
): Promise<SendResult> {
  throw new Error('not implemented');
}

export async function sendMessage(
  _token: string,
  _igUserId: string,
  _recipientId: string,
  _text: string,
): Promise<SendResult> {
  throw new Error('not implemented');
}

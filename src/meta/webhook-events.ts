export type CommentEvent = {
  kind: 'comment';
  accountIgId: string;
  commentId: string;
  commenterId: string;
  commenterUsername: string;
  text: string;
  mediaId: string;
};

export type MessageEvent = {
  kind: 'message';
  accountIgId: string;
  senderId: string;
  mid: string;
  text: string | undefined;
  isEcho: boolean;
};

export type WebhookEvent = CommentEvent | MessageEvent;

type CommentChange = {
  field: string;
  value: {
    id: string;
    text: string;
    from: { id: string; username: string };
    media: { id: string };
  };
};

type Entry = Partial<CommentChange> & {
  id: string;
  changes?: CommentChange[];
  messaging?: {
    sender: { id: string };
    message?: { mid: string; text?: string; is_echo?: boolean };
  }[];
};

export function parseWebhookPayload(raw: string): WebhookEvent[] {
  const payload: { object: string; entry: Entry[] } = JSON.parse(raw);
  if (payload.object !== 'instagram') return [];

  return payload.entry.flatMap((entry) => [...parseComments(entry), ...parseMessages(entry)]);
}

function parseComments(entry: Entry): CommentEvent[] {
  const comments: CommentEvent[] = [];
  const changes = entry.changes ?? [entry as CommentChange];

  for (const { field, value } of changes) {
    if (field !== 'comments') continue;
    comments.push({
      kind: 'comment',
      accountIgId: entry.id,
      commentId: value.id,
      commenterId: value.from.id,
      commenterUsername: value.from.username,
      text: value.text,
      mediaId: value.media.id,
    });
  }

  return comments;
}

function parseMessages(entry: Entry): MessageEvent[] {
  const messages: MessageEvent[] = [];

  for (const { sender, message } of entry.messaging ?? []) {
    if (!message) continue;
    messages.push({
      kind: 'message',
      accountIgId: entry.id,
      senderId: sender.id,
      mid: message.mid,
      text: message.text,
      isEcho: message.is_echo ?? false,
    });
  }

  return messages;
}

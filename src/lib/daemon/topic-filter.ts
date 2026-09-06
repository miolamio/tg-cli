/**
 * Forum-topic membership for `message watch --topic`.
 *
 * Telegram: `replyTo.forumTopic === true` means a named topic.
 * The topic root is `replyToTopId`, or `replyToMsgId` when that flag is set.
 * General (id 1) is everything that is not a named forum topic.
 * The topic-root message itself has `id === topic`.
 */
export function messageMatchesTopic(
  msg: {
    id?: number;
    replyTo?: {
      forumTopic?: boolean;
      replyToTopId?: number;
      replyToMsgId?: number;
    } | null;
  },
  topic: number,
): boolean {
  if (msg.id === topic) return true;
  const reply = msg.replyTo;
  const forumTopic = reply?.forumTopic === true;
  const top = reply?.replyToTopId ?? (forumTopic ? reply?.replyToMsgId : undefined);
  if (topic === 1) {
    if (forumTopic && top != null && top !== 1) return false;
    return true;
  }
  return top === topic;
}

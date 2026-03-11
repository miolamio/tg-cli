import { Api } from 'telegram';

/**
 * Convert Telegram MessageEntity[] to Markdown-formatted text.
 *
 * Processes entities from end to start (descending offset) to avoid
 * offset shifts when replacing substrings with longer Markdown syntax.
 *
 * Handles: Bold, Italic, Code, Pre, TextUrl, Strike, Blockquote, MentionName.
 * Mention and Url entities are kept as-is (already readable).
 */
export function entitiesToMarkdown(
  text: string,
  entities: Api.TypeMessageEntity[] | undefined,
): string {
  if (!entities || entities.length === 0) return text;

  // Sort by offset descending so replacements don't shift earlier offsets
  const sorted = [...entities].sort((a, b) => b.offset - a.offset);

  let result = text;

  for (const entity of sorted) {
    const start = entity.offset;
    const end = start + entity.length;
    const substr = result.substring(start, end);
    let replacement = substr;

    if (entity instanceof Api.MessageEntityBold) {
      replacement = `**${substr}**`;
    } else if (entity instanceof Api.MessageEntityItalic) {
      replacement = `_${substr}_`;
    } else if (entity instanceof Api.MessageEntityCode) {
      replacement = `\`${substr}\``;
    } else if (entity instanceof Api.MessageEntityPre) {
      const lang = (entity as any).language || '';
      replacement = `\`\`\`${lang}\n${substr}\n\`\`\``;
    } else if (entity instanceof Api.MessageEntityTextUrl) {
      replacement = `[${substr}](${(entity as any).url})`;
    } else if (entity instanceof Api.MessageEntityStrike) {
      replacement = `~~${substr}~~`;
    } else if (entity instanceof Api.MessageEntityBlockquote) {
      replacement = substr
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    } else if (entity instanceof Api.MessageEntityMentionName) {
      replacement = `[${substr}](tg://user?id=${(entity as any).userId})`;
    }
    // Mention, Url, and other entities are kept as-is

    result = result.substring(0, start) + replacement + result.substring(end);
  }

  return result;
}

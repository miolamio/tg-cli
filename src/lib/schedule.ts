import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/** Parse an explicit zoned ISO timestamp; never silently schedule immediately. */
export function parseSchedule(value: string, now = Date.now()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const invalid = () => new TgError('--schedule requires a valid ISO timestamp with timezone, at least 10 seconds in the future', ErrorCode.INVALID_SCHEDULE);
  if (!match) throw invalid();
  const [, y, mo, d, h, mi, s] = match;
  const days = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > days || +h > 23 || +mi > 59 || +s > 59) throw invalid();
  const seconds = Math.floor(Date.parse(value) / 1000);
  if (!Number.isFinite(seconds) || seconds * 1000 < now + 10_000 || seconds > 2_147_483_646) throw invalid();
  return seconds;
}

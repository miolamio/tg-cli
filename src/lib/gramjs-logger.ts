import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import { isQuietMode, isVerboseMode } from './cli-mode.js';

/** Keep gramjs diagnostics on stderr, including its constructor banner. */
class GramjsLogger extends Logger {
  constructor(private readonly sensitiveValues: readonly string[]) {
    super(LogLevel.DEBUG);
  }

  override canSend(level: LogLevel): boolean {
    if (isQuietMode() || level === LogLevel.NONE) return false;
    if (!isVerboseMode() && level !== LogLevel.WARN && level !== LogLevel.ERROR) return false;
    return super.canSend(level);
  }

  override log(level: LogLevel, message: string, _color: string): void {
    if (!this.canSend(level)) return;
    // These SDK diagnostics include raw response bytes, which can contain
    // account data. A protocol failure does not require dumping its payload.
    let safeMessage = String(message)
      .replace(/(remaining data|Received response without parent request:)[\s\S]*/i, '$1 [redacted]');
    for (const secret of this.sensitiveValues) {
      if (secret) safeMessage = safeMessage.split(secret).join('[redacted]');
    }
    process.stderr.write(`[gramjs ${level}] ${safeMessage}\n`);
  }
}

/** Pass as baseLogger when constructing every TelegramClient. */
export function createGramjsLogger(sensitiveValues: readonly string[] = []): Logger {
  return new GramjsLogger(sensitiveValues);
}

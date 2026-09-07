import pc from 'picocolors';

/** Printable ASCII mascot, shared by interactive login and the README. */
const LITTLE_DAEMON = String.raw`      .------.
     /  o  o  \
    |   \__/   |
    |          |
    |  /\  /\  |
     \/  \/  \/`;

const TAGLINE = 'Telegram, from your terminal.';

function colors() {
  return pc.createColors(pc.isColorSupported
    && process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0');
}

/** Main help runs before preAction, so it must use the parsed quiet flag. */
export function formatHelpBanner(quiet = false): string {
  if (quiet || !process.stdout.isTTY || process.env.TERM === 'dumb') return '';
  const color = colors();
  return `${color.cyan('(. .)')}  ${color.bold('tg')} / ${TAGLINE}\n`;
}

/** Keep authentication data on stdout and omit decoration when any stream is redirected. */
export function showLoginBanner(quiet = false): void {
  if (quiet || !process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY
    || process.env.TERM === 'dumb') return;
  const color = colors();
  process.stderr.write(`\n${color.cyan(LITTLE_DAEMON)}\n\n${color.bold('tg')} / ${TAGLINE}\n\n`);
}

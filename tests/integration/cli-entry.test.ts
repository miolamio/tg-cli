import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..', '..');
const BINARY = join(ROOT, 'dist', 'bin', 'tg.js');

describe('CLI entry point (built binary)', () => {
  let fixtureDir: string;
  let fixtureConfig: string;
  beforeAll(() => {
    // Build the project before running integration tests
    execSync('npx tsup', { cwd: ROOT, stdio: 'pipe' });
    expect(existsSync(BINARY)).toBe(true);
    fixtureDir = mkdtempSync(join(tmpdir(), 'tg-cli-entry-'));
    fixtureConfig = join(fixtureDir, 'config.json');
    writeFileSync(fixtureConfig, JSON.stringify({ profiles: { review: { phone: '+10000000000', created: '2026-09-06T00:00:00Z' } } }));
    mkdirSync(join(fixtureDir, 'sessions'));
    writeFileSync(join(fixtureDir, 'sessions', 'review.session'), 'synthetic-not-a-real-session');
  });

  afterAll(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  });

  function runFixture(args: string[]) {
    return spawnSync(process.execPath, [BINARY, '--config', fixtureConfig, '--profile', 'review', ...args], {
      cwd: ROOT, encoding: 'utf-8', timeout: 5000,
    });
  }

  it.each([
    ['--transport', 'https', 'auth', 'login'],
    ['--transport', 'wss', '--daemon', 'chat', 'list'],
    ['message', 'watch', '--transport', 'wss'],
  ])('rejects invalid transport usage before network access: %s', (...args) => {
    const result = runFixture(args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_OPTIONS' });
  });

  it('exposes scheduled send and photo command options in help', () => {
    expect(runFixture(['message', 'send', '--help']).stdout).toContain('--schedule');
    expect(runFixture(['contact', 'set-photo', '--help']).stdout).toContain('visible only to you');
    expect(runFixture(['user', 'download-photo', '--help']).stdout).toContain('--force');
  });

  it('returns a structured invalid schedule before authenticating', () => {
    const result = runFixture(['message', 'send', 'me', 'Synthetic', '--schedule', '2030-01-01T01:00:00']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_SCHEDULE' });
  });

  it('retains schedule errors with TOON and field selection', () => {
    const result = runFixture(['--toon', '--fields', 'id', 'message', 'send', 'me', 'Synthetic', '--schedule', 'invalid']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('ok: false');
    expect(result.stdout).toContain('INVALID_SCHEDULE');
  });

  function runTerminal(args: string[], env: NodeJS.ProcessEnv = {}) {
    // Model a terminal in an isolated child while capturing its two streams separately.
    const bootstrap = `
      for (const stream of [process.stdin, process.stdout, process.stderr]) {
        Object.defineProperty(stream, 'isTTY', { value: true });
      }
    `;
    return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(bootstrap)}`, BINARY, ...args], {
      cwd: ROOT, encoding: 'utf-8', timeout: 5000,
      env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '1', FORCE_COLOR: '0', ...env },
    });
  }

  it.each([
    { args: ['--help'], banner: true },
    { args: ['help'], banner: true },
    { args: ['--quiet', '--help'], banner: false },
    { args: ['--help', '--quiet'], banner: false },
    { args: ['help', '--quiet'], banner: false },
    { args: ['auth', '--help'], banner: false },
    { args: ['help', 'message'], banner: false },
    { args: ['--version'], banner: false },
  ])('terminal branding for $args: $banner', ({ args, banner }) => {
    const result = runTerminal(args);
    expect(result.status).toBe(0);
    expect(result.stdout.includes('(. .)')).toBe(banner);
    expect(result.stderr).toBe('');
  });

  it('keeps the piped help output undecorated', () => {
    const result = runFixture(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage: tg /);
    expect(result.stdout).not.toContain('(. .)');
    expect(result.stderr).toBe('');
  });

  it('honors NO_COLOR even when FORCE_COLOR is set', () => {
    const result = runTerminal(['--help'], { NO_COLOR: '', FORCE_COLOR: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('(. .)');
    expect(result.stdout).not.toContain('\x1b[');
  });

  it('omits branding in a dumb terminal', () => {
    const result = runTerminal(['--help'], { TERM: 'dumb' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage: tg /);
  });

  it('keeps terminal command results as JSON without a mascot', () => {
    const result = runTerminal(['--config', fixtureConfig, '--profile', 'review', '--json', 'session', 'export']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
    expect(result.stdout + result.stderr).not.toContain('(. .)');
    expect(result.stdout + result.stderr).not.toContain('.------.');
  });

  it('--help exits 0 and shows Auth and Session group headings', () => {
    const output = execSync(`node ${BINARY} --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('Auth');
    expect(output).toContain('Session');
    expect(output).toContain('auth');
    expect(output).toContain('session');
  });

  it('--version exits 0 and shows package version + gramjs version', () => {
    const output = execSync(`node ${BINARY} --version`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    // Format: "X.Y.Z (gramjs A.B.C)"
    expect(output.trim()).toMatch(/\d+\.\d+\.\d+ \(gramjs \d+\.\d+\.\d+\)/);
  });

  it('auth --help shows login, status, logout subcommands', () => {
    const output = execSync(`node ${BINARY} auth --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('login');
    expect(output).toContain('status');
    expect(output).toContain('logout');
  });

  it('login help documents --phone', () => {
    expect(runFixture(['auth', 'login', '--help']).stdout).toContain('--phone <number>');
  });

  it('rejects invalid --phone in a terminal before connecting', () => {
    const result = runTerminal(['--config', fixtureConfig, '--profile', 'review', 'auth', 'login', '--phone', '@username']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(result.stderr).not.toContain('Starting authentication');
    expect(result.stderr).not.toContain('Phone number (international format):');
  });

  it('session --help shows export, import subcommands', () => {
    const output = execSync(`node ${BINARY} session --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('export');
    expect(output).toContain('import');
  });

  it('session import --help shows --skip-verify option', () => {
    const output = execSync(`node ${BINARY} session import --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('--skip-verify');
  });

  it('chat --help shows list, info, join, leave, resolve, invite-info, members subcommands', () => {
    const output = execSync(`node ${BINARY} chat --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('list');
    expect(output).toContain('info');
    expect(output).toContain('join');
    expect(output).toContain('leave');
    expect(output).toContain('resolve');
    expect(output).toContain('invite-info');
    expect(output).toContain('members');
  });

  it('message search --help shows --public', () => {
    const output = execSync(`node ${BINARY} message search --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(output).toContain('--public');
    expect(output).toContain('--peer');
    expect(output).toContain('--after');
  });

  it('message --help shows all subcommands including edit, delete, pin, unpin', () => {
    const output = execSync(`node ${BINARY} message --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('history');
    expect(output).toContain('search');
    expect(output).toContain('send');
    expect(output).toContain('forward');
    expect(output).toContain('react');
    expect(output).toContain('edit');
    expect(output).toContain('delete');
    expect(output).toContain('pin');
    expect(output).toContain('unpin');
  });

  it('message delete --help shows --revoke and --for-me flags', () => {
    const output = execSync(`node ${BINARY} message delete --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('--revoke');
    expect(output).toContain('--for-me');
  });

  it('message pin --help shows --notify flag', () => {
    const output = execSync(`node ${BINARY} message pin --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('--notify');
  });

  it('--help shows all 7 command groups: Auth, Session, Chat, Message, Media, User, Contact', () => {
    const output = execSync(`node ${BINARY} --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('Auth');
    expect(output).toContain('Session');
    expect(output).toContain('Chat');
    expect(output).toContain('Message');
    expect(output).toContain('Media');
    expect(output).toContain('User');
    expect(output).toContain('user');
    expect(output).toContain('Contact');
    expect(output).toContain('contact');
  });

  it('--help shows --no-json and --human global options', () => {
    const output = execSync(`node ${BINARY} --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('--no-json');
    expect(output).toContain('--human');
  });

  it('media --help exits 0 and shows download subcommand', () => {
    const output = execSync(`node ${BINARY} media --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('download');
  });

  it('media download --help exits 0 and shows msg-ids argument', () => {
    const output = execSync(`node ${BINARY} media download --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('msg-ids');
  });

  it('user --help shows profile, block, unblock, blocked subcommands', () => {
    const output = execSync(`node ${BINARY} user --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('profile');
    expect(output).toContain('block');
    expect(output).toContain('unblock');
    expect(output).toContain('blocked');
    expect(output).toContain('User profiles');
  });

  it('contact --help shows list, add, delete, search subcommands', () => {
    const output = execSync(`node ${BINARY} contact --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('list');
    expect(output).toContain('add');
    expect(output).toContain('delete');
    expect(output).toContain('search');
    expect(output).toContain('Contact');
  });

  it('--help shows --toon global option', () => {
    const output = execSync(`node ${BINARY} --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('--toon');
  });

  it('unknown command exits non-zero', () => {
    const result = spawnSync(process.execPath, [BINARY, 'not-a-real-command'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_OPTIONS' });
    expect(result.stderr).toBe('');
  });

  it.each([
    ['--json', 'session', 'export'],
    ['session', '--json', 'export'],
    ['session', 'export', '--json'],
  ])('session export honors explicit --json via real Commander: %j', (...args) => {
    const result = runFixture(args);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: { session: 'synthetic-not-a-real-session', phone: '+10000000000', created: '2026-09-06T00:00:00Z' },
    });
  });

  it('session export retains raw piping output when --json is not explicit', () => {
    const result = runFixture(['session', 'export', '--quiet']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('synthetic-not-a-real-session\n');
    expect(result.stderr).toBe('');
  });

  it.each([
    ['chat', 'list', '--bogus'],
    ['message', 'get'],
    ['session', 'unknown'],
    ['chat', 'list', '--limit'],
  ])('returns one structured Commander error for %j', (...args) => {
    const result = runFixture(args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_OPTIONS' });
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toBe('');
  });

  it('honors human mode even for a Commander parse failure', () => {
    const result = runFixture(['chat', 'list', '--human', '--bogus']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('INVALID_OPTIONS');
    expect(result.stderr).not.toContain(' at ');
  });

  it.each([
    { mode: [], stdout: true },
    { mode: ['--quiet'], stdout: true },
    { mode: ['--toon'], stdout: true },
    { mode: ['--human'], stdout: false },
    { mode: ['--jsonl'], stdout: false },
  ])('catches asynchronous malformed-config failures in $mode', ({ mode, stdout }) => {
    const corruptConfig = join(fixtureDir, 'corrupt.json');
    writeFileSync(corruptConfig, '{"secret-token": invalid json');
    const result = runFixture(['--config', corruptConfig, ...mode, 'chat', 'list']);
    expect(result.status).toBe(1);
    expect(stdout ? result.stdout : result.stderr).toContain('CONFIG_ERROR');
    expect(stdout ? result.stderr : result.stdout).toBe('');
    expect(result.stdout + result.stderr).not.toContain('secret-token');
    expect(result.stdout + result.stderr).not.toContain(' at ');
    if (!mode.includes('--toon') && stdout) {
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'CONFIG_ERROR' });
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
    }
  });

  it('catches an async session-file read error without an unhandled rejection', () => {
    mkdirSync(join(fixtureDir, 'sessions', 'broken.session'));
    const result = runFixture(['--profile', 'broken', 'session', 'export', '--json']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'UNKNOWN_ERROR' });
    expect(result.stderr).toBe('');
  });

  it('keeps invalid-profile failures in the selected human format', () => {
    const result = runFixture(['--human', '--profile', '../invalid', 'session', 'export']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('INVALID_INPUT');
  });

  it.each([['auth', 'status'], ['session', 'export']])('rejects an explicit empty profile before %j', (...args) => {
    const result = runFixture(['--profile', '', '--config', join(fixtureDir, 'missing-parent', 'bad.json'), ...args]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(existsSync(join(fixtureDir, 'missing-parent'))).toBe(false);
    expect(result.stderr).toBe('');
  });

  it('session import --skip-verify with empty stdin exits non-zero with NO_INPUT', () => {
    const result = spawnSync(
      process.execPath,
      [BINARY, 'session', 'import', '--skip-verify', '--json'],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        input: '\n',
        env: { ...process.env, HOME: '/tmp/tg-cli-test-home' },
      },
    );
    expect(result.status).not.toBe(0);
    const parsed = JSON.parse((result.stdout ?? '').trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('NO_INPUT');
  });

  it('completion powershell exits non-zero with a JSON error envelope', () => {
    const result = spawnSync(process.execPath, [BINARY, 'completion', 'powershell', '--json'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(result.status).not.toBe(0);
    const parsed = JSON.parse((result.stdout ?? '').trim());
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('INVALID_INPUT');
  });

  it('publishes a library entry that can be imported', async () => {
    const lib = join(ROOT, 'dist', 'index.js');
    const dts = join(ROOT, 'dist', 'index.d.ts');
    expect(existsSync(lib)).toBe(true);
    expect(existsSync(dts)).toBe(true);

    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "import { ErrorCode, withAuth, resolveEntity } from './dist/index.js'; if (!ErrorCode.NOT_AUTHENTICATED || typeof withAuth !== 'function' || typeof resolveEntity !== 'function') process.exit(2); console.log('library-console-unmodified');"],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('library-console-unmodified\n');
  });

  it('puts a shebang only on the CLI binary, not the daemon entry', () => {
    const bin = readFileSync(BINARY, 'utf-8');
    const daemon = readFileSync(join(ROOT, 'dist', 'lib', 'daemon', 'entry.js'), 'utf-8');
    expect(bin.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(daemon.startsWith('#!/usr/bin/env node')).toBe(false);
  });
});

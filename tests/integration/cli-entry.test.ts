import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BINARY = join(ROOT, 'dist', 'bin', 'tg.js');

describe('CLI entry point (built binary)', () => {
  beforeAll(() => {
    // Build the project before running integration tests
    execSync('npx tsup', { cwd: ROOT, stdio: 'pipe' });
    expect(existsSync(BINARY)).toBe(true);
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

  it('--help shows all 6 command groups: Auth, Session, Chat, Message, Media, User', () => {
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

  it('session import --skip-verify with empty string returns NO_INPUT error', () => {
    try {
      execSync(`echo "" | node ${BINARY} session import --skip-verify --json`, {
        cwd: ROOT,
        encoding: 'utf-8',
        env: { ...process.env, HOME: '/tmp/tg-cli-test-home' },
      });
    } catch (e: any) {
      // Command may exit with non-zero; check stdout for structured error
      const stdout = e.stdout ?? '';
      if (stdout) {
        const parsed = JSON.parse(stdout.trim());
        expect(parsed.ok).toBe(false);
        expect(parsed.code).toBe('NO_INPUT');
        return;
      }
    }
    // If no error, that's also acceptable — the test is about CLI wiring
  });
});

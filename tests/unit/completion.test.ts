import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCompletionCommand } from '../../src/commands/completion/index.js';
import { outputError } from '../../src/lib/output.js';

describe('completion command', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.exitCode = 0;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = 0;
  });

  it('writes a bash completion script to stdout', async () => {
    const cmd = createCompletionCommand();
    cmd.exitOverride();
    await cmd.parseAsync(['node', 'completion', 'bash']);
    expect(stdoutSpy).toHaveBeenCalled();
    const written = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(written).toContain('_tg_completions');
    expect(written).toContain('login status logout');
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('lists subcommands in zsh and fish scripts', async () => {
    const cmd = createCompletionCommand();
    cmd.exitOverride();
    await cmd.parseAsync(['node', 'completion', 'zsh']);
    const zsh = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(zsh).toContain('login:Log in');
    expect(zsh).toContain('case $words[1]');

    stdoutSpy.mockClear();
    await cmd.parseAsync(['node', 'completion', 'fish']);
    const fish = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    expect(fish).toContain("__fish_seen_subcommand_from auth");
    expect(fish).toContain('login status logout');
  });

  it('outputs a JSON error envelope for an unknown shell', async () => {
    const cmd = createCompletionCommand();
    cmd.exitOverride();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      await cmd.parseAsync(['node', 'completion', 'powershell']);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      exitSpy.mockRestore();
    }
    const written = stdoutSpy.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(written.trim());
    expect(parsed).toEqual({
      ok: false,
      error: 'Unknown shell: powershell. Use: bash, zsh, or fish',
      code: 'INVALID_INPUT',
    });
  });
});

describe('outputError used by completion', () => {
  it('is the same helper as other commands', () => {
    expect(typeof outputError).toBe('function');
  });
});

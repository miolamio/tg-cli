import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock readline/promises before importing the module
const mockQuestion = vi.fn();
const mockClose = vi.fn();

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

import { createPrompt } from '../../src/lib/prompt.js';

describe('createPrompt', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('ask() calls readline question and returns the answer', async () => {
    mockQuestion.mockResolvedValueOnce('user input');

    const prompt = createPrompt();
    const answer = await prompt.ask('Enter name: ');

    expect(mockQuestion).toHaveBeenCalledWith('Enter name: ');
    expect(answer).toBe('user input');
  });

  it('askSecret() writes prompt to stderr and suppresses echo', async () => {
    mockQuestion.mockResolvedValueOnce('s3cret');

    const prompt = createPrompt();
    const answer = await prompt.askSecret('Password: ');

    // Prompt written to stderr directly
    expect(stderrSpy).toHaveBeenCalledWith('Password: ');
    // Question called with empty string (muted output)
    expect(mockQuestion).toHaveBeenCalledWith('');
    expect(answer).toBe('s3cret');
    // Newline written after secret input
    expect(stderrSpy).toHaveBeenCalledWith('\n');
  });

  it('askSecret() restores echo even on error', async () => {
    mockQuestion.mockRejectedValueOnce(new Error('readline error'));

    const prompt = createPrompt();
    await expect(prompt.askSecret('Token: ')).rejects.toThrow('readline error');

    // Newline still written (finally block)
    expect(stderrSpy).toHaveBeenCalledWith('\n');
  });

  it('close() calls readline close', () => {
    const prompt = createPrompt();
    prompt.close();
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

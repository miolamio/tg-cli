import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----

// Mock output
const mockOutputSuccess = vi.fn();
const mockOutputError = vi.fn();
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: (...args: any[]) => mockOutputSuccess(...args),
  outputError: (...args: any[]) => mockOutputError(...args),
  logStatus: vi.fn(),
}));

// Hoisted mock state for telegram client
const {
  mockConnect,
  mockDestroy,
  mockSendFile,
} = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockSendFile: vi.fn().mockResolvedValue({ id: 99, message: '', date: 1710000000 }),
}));

const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  sendFile: mockSendFile,
};

// Mock telegram with Api classes needed for polls
vi.mock('telegram', () => {
  class Poll {
    constructor(public params: any) {}
  }
  class PollAnswer {
    constructor(public params: any) {}
  }
  class TextWithEntities {
    constructor(public params: any) {}
  }
  class InputMediaPoll {
    constructor(public params: any) {}
  }
  return {
    TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
    sessions: {
      StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })),
    },
    Api: {
      Poll,
      PollAnswer,
      TextWithEntities,
      InputMediaPoll,
    },
  };
});

vi.mock('telegram/Helpers.js', () => ({
  generateRandomLong: vi.fn(() => BigInt(123456)),
}));

// Mock config
vi.mock('../../src/lib/config.js', () => ({
  createConfig: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    path: '/tmp/mock-config.json',
  })),
  getCredentialsOrThrow: vi.fn(() => ({ apiId: 12345, apiHash: 'testhash' })),
}));

// Mock session store
const mockStoreWithLock = vi.fn().mockImplementation(async (_profile: string, fn: (s: string) => Promise<any>) => {
  return fn('test-session');
});

vi.mock('../../src/lib/session-store.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    withLock: mockStoreWithLock,
    filePath: (p: string) => `/mock/sessions/${p}.session`,
  })),
}));

// Mock client module
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));

// Mock peer resolution
const mockResolveEntity = vi.fn().mockResolvedValue({ id: BigInt(456), className: 'Channel' });
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: (...args: any[]) => mockResolveEntity(...args),
}));

// Mock serialize
const mockSerializeMessage = vi.fn().mockReturnValue({
  id: 99,
  text: '',
  date: '2026-03-13T00:00:00.000Z',
  senderId: '123',
  senderName: 'Tester',
  replyToMsgId: null,
  forwardFrom: null,
  mediaType: 'poll',
  type: 'message',
});
vi.mock('../../src/lib/serialize.js', () => ({
  bigIntToString: (v: bigint) => String(v),
  serializeMessage: (...args: any[]) => mockSerializeMessage(...args),
}));

// Mock errors (use actual translateTelegramError)
vi.mock('../../src/lib/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/errors.js')>();
  return {
    ...actual,
    translateTelegramError: actual.translateTelegramError,
  };
});

// Import after mocks
import { validatePollOpts, messagePollAction } from '../../src/commands/message/poll.js';

// Create a mock Command context
function createMockCommandContext(opts: Record<string, any> = {}) {
  return {
    optsWithGlobals: vi.fn(() => ({
      profile: 'default',
      quiet: false,
      config: undefined,
      json: true,
      human: false,
      verbose: false,
      ...opts,
    })),
  };
}

describe('validatePollOpts', () => {
  const validOpts = {
    question: 'Favorite color?',
    option: ['Red', 'Blue'],
  };

  it('returns null for valid basic poll', () => {
    expect(validatePollOpts(validOpts)).toBeNull();
  });

  it('rejects empty question', () => {
    const result = validatePollOpts({ ...validOpts, question: '' });
    expect(result).toEqual({ error: 'Poll question cannot be empty', code: 'EMPTY_QUESTION' });
  });

  it('rejects whitespace-only question', () => {
    const result = validatePollOpts({ ...validOpts, question: '   ' });
    expect(result).toEqual({ error: 'Poll question cannot be empty', code: 'EMPTY_QUESTION' });
  });

  it('rejects question > 300 chars', () => {
    const result = validatePollOpts({ ...validOpts, question: 'x'.repeat(301) });
    expect(result).toEqual({ error: 'Question too long (max 300 chars)', code: 'QUESTION_TOO_LONG' });
  });

  it('rejects < 2 options', () => {
    const result = validatePollOpts({ ...validOpts, option: ['Only one'] });
    expect(result).toEqual({ error: 'Poll requires 2-10 options', code: 'TOO_FEW_OPTIONS' });
  });

  it('rejects > 10 options', () => {
    const opts = { ...validOpts, option: Array.from({ length: 11 }, (_, i) => `Opt ${i}`) };
    const result = validatePollOpts(opts);
    expect(result).toEqual({ error: 'Poll requires 2-10 options', code: 'TOO_MANY_OPTIONS' });
  });

  it('rejects empty option', () => {
    const result = validatePollOpts({ ...validOpts, option: ['Red', ''] });
    expect(result).toEqual({ error: 'Poll option cannot be empty', code: 'EMPTY_OPTION' });
  });

  it('rejects whitespace-only option', () => {
    const result = validatePollOpts({ ...validOpts, option: ['Red', '  '] });
    expect(result).toEqual({ error: 'Poll option cannot be empty', code: 'EMPTY_OPTION' });
  });

  it('rejects option > 100 chars', () => {
    const result = validatePollOpts({ ...validOpts, option: ['Red', 'x'.repeat(101)] });
    expect(result).toEqual({ error: 'Option too long (max 100 chars)', code: 'OPTION_TOO_LONG' });
  });

  it('rejects duplicate option text', () => {
    const result = validatePollOpts({ ...validOpts, option: ['Red', 'Blue', 'Red'] });
    expect(result).toEqual({ error: "Duplicate option text: 'Red'", code: 'DUPLICATE_OPTION' });
  });

  it('rejects --quiz without --correct', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true });
    expect(result).toEqual({ error: 'Quiz mode requires --correct <index>', code: 'QUIZ_MISSING_CORRECT' });
  });

  it('rejects --solution without --quiz', () => {
    const result = validatePollOpts({ ...validOpts, solution: 'Because reasons' });
    expect(result).toEqual({ error: '--solution requires --quiz mode', code: 'SOLUTION_WITHOUT_QUIZ' });
  });

  it('rejects --multiple with --quiz', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true, correct: '1', multiple: true });
    expect(result).toEqual({ error: 'Quiz mode cannot use --multiple', code: 'QUIZ_MULTIPLE_CONFLICT' });
  });

  it('rejects --correct out of range (too high)', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true, correct: '5' });
    expect(result).toEqual({ error: 'Correct index must be 1-2', code: 'INVALID_CORRECT_INDEX' });
  });

  it('rejects --correct out of range (zero)', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true, correct: '0' });
    expect(result).toEqual({ error: 'Correct index must be 1-2', code: 'INVALID_CORRECT_INDEX' });
  });

  it('rejects --correct NaN', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true, correct: 'abc' });
    expect(result).toEqual({ error: 'Correct index must be 1-2', code: 'INVALID_CORRECT_INDEX' });
  });

  it('rejects --close-in <= 0', () => {
    const result = validatePollOpts({ ...validOpts, closeIn: '0' });
    expect(result).toEqual({ error: 'Close-in seconds must be > 0', code: 'INVALID_CLOSE_IN' });
  });

  it('rejects --close-in NaN', () => {
    const result = validatePollOpts({ ...validOpts, closeIn: 'soon' });
    expect(result).toEqual({ error: 'Close-in seconds must be > 0', code: 'INVALID_CLOSE_IN' });
  });

  it('accepts valid quiz poll', () => {
    const result = validatePollOpts({ ...validOpts, quiz: true, correct: '1', solution: 'Reason' });
    expect(result).toBeNull();
  });

  it('accepts valid poll with --multiple, --public, --close-in', () => {
    const result = validatePollOpts({ ...validOpts, multiple: true, public: true, closeIn: '30' });
    expect(result).toBeNull();
  });
});

describe('messagePollAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendFile.mockResolvedValue({ id: 99, message: '', date: 1710000000 });
  });

  it('sends basic poll via sendFile with InputMediaPoll', async () => {
    const ctx = createMockCommandContext({
      question: 'Favorite color?',
      option: ['Red', 'Blue'],
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockSendFile).toHaveBeenCalledTimes(1);
    const call = mockSendFile.mock.calls[0];
    // First arg is entity, second is options with file: InputMediaPoll
    expect(call[1]).toHaveProperty('file');
    expect(mockOutputSuccess).toHaveBeenCalled();
    expect(mockOutputError).not.toHaveBeenCalled();
  });

  it('sends quiz poll with correctAnswers', async () => {
    const ctx = createMockCommandContext({
      question: 'Capital of France?',
      option: ['Berlin', 'Paris', 'London'],
      quiz: true,
      correct: '2',
      solution: 'Paris is the capital of France',
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockSendFile).toHaveBeenCalledTimes(1);
    const call = mockSendFile.mock.calls[0];
    const inputMedia = call[1].file;
    // correctAnswers should reference index 1 (0-based for option 2)
    expect(inputMedia.params.correctAnswers).toBeDefined();
    expect(inputMedia.params.solution).toBe('Paris is the capital of France');
    expect(mockOutputSuccess).toHaveBeenCalled();
  });

  it('sends poll with --multiple, --public, --close-in', async () => {
    const ctx = createMockCommandContext({
      question: 'Pick colors',
      option: ['Red', 'Blue', 'Green'],
      multiple: true,
      public: true,
      closeIn: '60',
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockSendFile).toHaveBeenCalledTimes(1);
    const call = mockSendFile.mock.calls[0];
    const inputMedia = call[1].file;
    const poll = inputMedia.params.poll;
    expect(poll.params.multipleChoice).toBe(true);
    expect(poll.params.publicVoters).toBe(true);
    expect(poll.params.closePeriod).toBe(60);
    expect(mockOutputSuccess).toHaveBeenCalled();
  });

  it('calls outputError for validation failure without calling sendFile', async () => {
    const ctx = createMockCommandContext({
      question: '',
      option: ['Red', 'Blue'],
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockOutputError).toHaveBeenCalledWith('Poll question cannot be empty', 'EMPTY_QUESTION');
    expect(mockSendFile).not.toHaveBeenCalled();
  });

  it('returns serialized MessageItem via outputSuccess', async () => {
    const ctx = createMockCommandContext({
      question: 'Test?',
      option: ['A', 'B'],
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockSerializeMessage).toHaveBeenCalled();
    expect(mockOutputSuccess).toHaveBeenCalledWith(expect.objectContaining({
      id: 99,
      mediaType: 'poll',
    }));
  });

  it('translates RPCError via translateTelegramError', async () => {
    mockSendFile.mockRejectedValueOnce({ errorMessage: 'CHAT_SEND_POLL_FORBIDDEN' });

    const ctx = createMockCommandContext({
      question: 'Test?',
      option: ['A', 'B'],
    });
    await messagePollAction.call(ctx as any, 'testchat');

    expect(mockOutputError).toHaveBeenCalledWith(
      'You cannot send polls in this chat',
      'CHAT_SEND_POLL_FORBIDDEN',
    );
  });
});

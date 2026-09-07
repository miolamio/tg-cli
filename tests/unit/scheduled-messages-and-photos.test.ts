import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeDaemonCommand } from '../../src/lib/daemon/execute.js';
import { validateDaemonCommand } from '../../src/lib/daemon/command-protocol.js';
import { parseSchedule } from '../../src/lib/schedule.js';
import { formatData } from '../../src/lib/format.js';

const now = Date.parse('2030-01-01T00:00:00Z');
describe('schedule timestamps', () => {
  it('normalizes a zoned timestamp to Telegram seconds', () => {
    expect(parseSchedule('2030-01-01T04:00:00+03:00', now)).toBe(Date.parse('2030-01-01T01:00:00Z') / 1000);
  });
  it.each(['', 'tomorrow', '2030-01-01T01:00:00', '2030-02-30T01:00:00Z',
    '2030-01-01T24:00:00Z', '2030-01-01T00:00:01Z', '2029-01-01T00:00:00Z',
    '2030-01-01T01:00:00+25:00', '2040-01-01T00:00:00Z'])('rejects unsafe timestamp %s', value => {
    expect(() => parseSchedule(value, now)).toThrow();
  });
});

describe('scheduled sends and photo commands via daemon execute', () => {
  let client: any;
  let dir: string;
  let previousExitCode: typeof process.exitCode;
  const invoke = (argv: string[], extras = {}) => executeDaemonCommand(client, 'default', { argv, cwd: dir, ...extras }, new AbortController().signal);
  beforeEach(() => {
    previousExitCode = process.exitCode;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    dir = mkdtempSync(join(tmpdir(), 'tg-photo-test-'));
    client = {
      getEntity: vi.fn().mockResolvedValue(new Api.User({ id: bigInt(7), accessHash: bigInt(11), firstName: 'Synthetic' })),
      sendMessage: vi.fn().mockResolvedValue(new Api.Message({ id: 31, peerId: new Api.PeerUser({ userId: bigInt(7) }), date: now / 1000, message: 'Synthetic' })),
      uploadFile: vi.fn().mockResolvedValue(new Api.InputFile({ id: bigInt(2), parts: 1, name: 'test.png', md5Checksum: '' })),
      invoke: vi.fn().mockResolvedValue({ photo: { id: bigInt(987) } }),
      downloadProfilePhoto: vi.fn().mockResolvedValue(Buffer.from('synthetic-photo')),
      connect: vi.fn(), destroy: vi.fn(),
    };
  });
  afterEach(() => {
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.destroy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(previousExitCode);
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes scheduling plus reply target and stdin through the daemon', async () => {
    const result = await invoke(['message', 'send', 'me', '-', '--schedule', '2030-01-01T04:00:00+03:00', '--reply-to', '12'], { stdin: 'Scheduled synthetic text\n' });
    expect(result).toMatchObject({ output: { ok: true, data: { scheduledAt: '2030-01-01T01:00:00.000Z' } }, exitCode: 0 });
    expect(client.sendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: 'Scheduled synthetic text', replyTo: 12, schedule: now / 1000 + 3600 }));
    expect(client.sendMessage).toHaveBeenCalledOnce();
  });

  it('keeps immediate sends unchanged', async () => {
    const result = await invoke(['message', 'send', 'me', 'Immediate']);
    expect(result.output.ok).toBe(true);
    expect(client.sendMessage.mock.calls[0][1]).not.toHaveProperty('schedule');
    expect((result.output as any).data).not.toHaveProperty('scheduledAt');
  });

  it('rejects invalid schedule before resolving or sending', async () => {
    const result = await invoke(['message', 'send', 'me', 'Text', '--schedule', '2030-01-01T01:00:00']);
    expect(result).toMatchObject({ output: { ok: false, code: 'INVALID_SCHEDULE' }, exitCode: 1 });
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('does not accidentally send immediately if resolution outlives the schedule', async () => {
    client.getEntity.mockImplementationOnce(async () => {
      vi.mocked(Date.now).mockReturnValue(now + 3600_000);
      return new Api.User({ id: bigInt(7), accessHash: bigInt(11) });
    });
    const result = await invoke(['message', 'send', 'me', 'Text', '--schedule', '2030-01-01T01:00:00Z']);
    expect(result).toMatchObject({ output: { ok: false, code: 'INVALID_SCHEDULE' } });
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('uses caller cwd and sets a personal photo without suggesting or sending', async () => {
    writeFileSync(join(dir, 'photo.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const result = await invoke(['contact', 'set-photo', 'synthetic', 'photo.png']);
    expect(result).toMatchObject({ output: { ok: true, data: { userId: '7', photoId: '987', personal: true, size: 8 } }, exitCode: 0 });
    const request = client.invoke.mock.calls[0][0];
    expect(request).toBeInstanceOf(Api.photos.UploadContactProfilePhoto);
    expect(request.save).toBe(true);
    expect(request.suggest).toBe(false);
    expect(client.uploadFile.mock.calls[0][0].file.path).toBe(join(dir, 'photo.png'));
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid photo input before authentication', async () => {
    expect(await invoke(['contact', 'set-photo', 'synthetic', 'missing.png'])).toMatchObject({ output: { ok: false, code: 'FILE_NOT_FOUND' } });
    writeFileSync(join(dir, 'bad.png'), 'not an image');
    expect(await invoke(['contact', 'set-photo', 'synthetic', 'bad.png'])).toMatchObject({ output: { ok: false, code: 'INVALID_PHOTO' } });
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it('reports an unknown photo result without repeating the upload', async () => {
    writeFileSync(join(dir, 'photo.jpg'), Buffer.from([255, 216, 255, 0]));
    client.invoke.mockResolvedValueOnce({ photo: {} });
    expect(await invoke(['contact', 'set-photo', 'synthetic', 'photo.jpg'])).toMatchObject({ output: { ok: false, code: 'PHOTO_RESULT_UNAVAILABLE' } });
    expect(client.uploadFile).toHaveBeenCalledOnce();
    expect(client.invoke).toHaveBeenCalledOnce();
  });

  it('downloads a profile photo into the caller directory', async () => {
    const result = await invoke(['user', 'download-photo', 'synthetic', '--output', 'avatar.jpg']);
    expect(result).toMatchObject({ output: { ok: true, data: { userId: '7', profilePhoto: true, path: join(dir, 'avatar.jpg') } }, exitCode: 0 });
    expect(readFileSync(join(dir, 'avatar.jpg')).toString()).toBe('synthetic-photo');
    expect(client.downloadProfilePhoto).toHaveBeenCalledWith(expect.anything(), { isBig: true });
  });

  it('preserves existing output unless force is explicit', async () => {
    writeFileSync(join(dir, 'avatar.jpg'), 'original');
    expect(await invoke(['user', 'download-photo', 'synthetic', '-o', 'avatar.jpg'])).toMatchObject({ output: { ok: false, code: 'FILE_EXISTS' } });
    expect(client.downloadProfilePhoto).not.toHaveBeenCalled();
    expect(readFileSync(join(dir, 'avatar.jpg')).toString()).toBe('original');
    expect((await invoke(['user', 'download-photo', 'synthetic', '-o', 'avatar.jpg', '--force'])).exitCode).toBe(0);
    expect(readFileSync(join(dir, 'avatar.jpg')).toString()).toBe('synthetic-photo');
  });

  it('does not overwrite a file created during the download', async () => {
    client.downloadProfilePhoto.mockImplementationOnce(async () => {
      writeFileSync(join(dir, 'avatar.jpg'), 'concurrent');
      return Buffer.from('new');
    });
    expect(await invoke(['user', 'download-photo', 'synthetic', '-o', 'avatar.jpg'])).toMatchObject({ output: { ok: false, code: 'FILE_EXISTS' } });
    expect(readFileSync(join(dir, 'avatar.jpg')).toString()).toBe('concurrent');
  });

  it('does not create an empty file when no photo is visible', async () => {
    client.downloadProfilePhoto.mockResolvedValueOnce(Buffer.alloc(0));
    expect(await invoke(['user', 'download-photo', 'synthetic', '-o', 'avatar.jpg'])).toMatchObject({ output: { ok: false, code: 'NO_PROFILE_PHOTO' } });
    expect(existsSync(join(dir, 'avatar.jpg'))).toBe(false);
  });

  it('rejects non-user peers before upload/download', async () => {
    client.getEntity.mockResolvedValue({ className: 'Channel', id: bigInt(8) });
    writeFileSync(join(dir, 'photo.jpg'), Buffer.from([255, 216, 255, 0]));
    expect(await invoke(['contact', 'set-photo', 'channel', 'photo.jpg'])).toMatchObject({ output: { ok: false, code: 'NOT_A_USER' } });
    expect(await invoke(['user', 'download-photo', 'channel', '-o', 'avatar.jpg'])).toMatchObject({ output: { ok: false, code: 'NOT_A_USER' } });
    expect(client.uploadFile).not.toHaveBeenCalled();
    expect(client.downloadProfilePhoto).not.toHaveBeenCalled();
  });

  it('requires cwd for file commands over the API', () => {
    for (const argv of [['contact', 'set-photo', 'me', 'p.png'], ['user', 'download-photo', 'me', '-o', 'p.jpg']]) {
      expect(() => validateDaemonCommand({ argv })).toThrow();
    }
  });

  it('renders photo results for humans', () => {
    expect(formatData({ id: 31, text: 'Synthetic', date: '2030-01-01T00:00:00Z', scheduledAt: '2030-01-01T01:00:00Z' })).toContain('Scheduled for');
    expect(formatData({ userId: '7', photoId: '987', personal: true, size: 8 })).toContain('visible only to you');
    expect(formatData({ userId: '7', profilePhoto: true, path: '/tmp/avatar.jpg', size: 10 })).toContain('/tmp/avatar.jpg');
  });
});

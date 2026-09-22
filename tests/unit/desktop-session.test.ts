import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, unlinkSync, utimesSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { sessions } from 'telegram';
import { readDesktopSession, desktopKeyFingerprint } from '../../src/lib/desktop-session.js';

const vectors = JSON.parse(readFileSync(new URL('../fixtures/desktop/synthetic-tdata.json', import.meta.url), 'utf8'));
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tg-desktop-reader-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
function fixture(name: string) {
  const vector = vectors[name];
  for (const [file, data] of Object.entries<string>(vector.files)) writeFileSync(join(dir, file), Buffer.from(data, 'base64'));
  return vector;
}
async function assertAccount(result: Awaited<ReturnType<typeof readDesktopSession>>, expected: any) {
  const session = new sessions.StringSession(result.sessionString);
  await session.load();
  expect(result.userId).toBe(expected.userId);
  expect(session.dcId).toBe(expected.dc);
  expect(session.port).toBe(443);
  expect(session.authKey!.getKey()).toEqual(Buffer.alloc(256, expected.keyByte));
  expect(result.keyFingerprints).toContain(desktopKeyFingerprint(Buffer.alloc(256, expected.keyByte)));
}

describe('TG-63 Desktop storage', () => {
  it('reads independent plain and passcoded Desktop fixtures', async () => {
    for (const name of ['plain', 'passcoded']) {
      const vector = fixture(name);
      await assertAccount(await readDesktopSession(dir, { passcode: name === 'passcoded' ? 'fixture-passcode' : undefined }), vector.expected[0]);
    }
  });
  it('requires an explicit stored index for multiple accounts', async () => {
    const vector = fixture('multi');
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_OPTIONS', message: expect.stringContaining('0, 2, 5') });
    await expect(readDesktopSession(dir, { account: 1 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await assertAccount(await readDesktopSession(dir, { account: 5 }), vector.expected[2]);
  });
  it('selects a sparse account without touching other account files', async () => {
    const vector = fixture('multi');
    const selectedFile = Object.keys(vector.files)[2];
    for (const name of Object.keys(vector.files)) if (name !== 'key_datas' && name !== selectedFile) unlinkSync(join(dir, name));
    await assertAccount(await readDesktopSession(dir, { account: 2 }), vector.expected[1]);
  });
  it('automatically selects a sole nonzero account index', async () => {
    const vector = fixture('sole-nonzero');
    await assertAccount(await readDesktopSession(dir), vector.expected[0]);
    expect((await readDesktopSession(dir)).userId).toBe('9007199254740995');
  });
  it('ignores multiple retired keys for the same DC', async () => {
    const vector = fixture('retired-keys');
    const result = await readDesktopSession(dir);
    await assertAccount(result, vector.expected[0]);
    expect(result.keyFingerprints).toHaveLength(2);
  });
  it('rejects malformed decrypted structures', async () => {
    for (const name of Object.keys(vectors).filter(key => key.startsWith('invalid-'))) {
      fixture(name);
      await expect(readDesktopSession(dir), name).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    }
  });
  it('rejects corrupt containers and incorrect passcodes without data disclosure', async () => {
    fixture('passcoded');
    await expect(readDesktopSession(dir, { passcode: 'do-not-echo-me' })).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    for (const length of [0, 8, 23, 40]) {
      writeFileSync(join(dir, 'key_datas'), Buffer.alloc(length));
      await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    }
    fixture('plain');
    const data = readFileSync(join(dir, 'key_datas')); data[20] ^= 1;
    writeFileSync(join(dir, 'key_datas'), data);
    const error = await readDesktopSession(dir).catch(error => error);
    expect(error.message).not.toContain(dir);
    expect(error.message).not.toContain('do-not-echo-me');
    expect(error.code).toBe('INVALID_SESSION');
  });
  it('uses legacy backups only when the modern file is absent', async () => {
    const vector = fixture('plain');
    const original = readFileSync(join(dir, 'key_datas'));
    writeFileSync(join(dir, 'key_data0'), original);
    writeFileSync(join(dir, 'key_data1'), 'corrupt-newer');
    utimesSync(join(dir, 'key_data0'), 1, 1);
    utimesSync(join(dir, 'key_data1'), 2, 2);
    writeFileSync(join(dir, 'key_datas'), 'corrupt-modern');
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    unlinkSync(join(dir, 'key_datas'));
    await assertAccount(await readDesktopSession(dir), vector.expected[0]);
    expect(readdirSync(dir)).toContain('key_data1');
  });
  it('rejects oversized files, symlinks and nonregular files', async () => {
    fixture('plain');
    writeFileSync(join(dir, 'key_datas'), Buffer.alloc(1024 * 1024 + 1));
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    unlinkSync(join(dir, 'key_datas'));
    writeFileSync(join(dir, 'source'), Buffer.from(vectors.plain.files.key_datas, 'base64'));
    symlinkSync(join(dir, 'source'), join(dir, 'key_datas'));
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    unlinkSync(join(dir, 'key_datas'));
    mkdirSync(join(dir, 'key_datas'));
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
    rmSync(join(dir, 'key_datas'), { recursive: true });
    expect(spawnSync('mkfifo', [join(dir, 'key_datas')]).status).toBe(0);
    await expect(readDesktopSession(dir)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  });
  it('does not read chat maps or change source files', async () => {
    fixture('multi');
    writeFileSync(join(dir, 'map'), 'not-a-valid-map');
    const before = Object.fromEntries(readdirSync(dir).map(name => [name, readFileSync(join(dir, name))]));
    await readDesktopSession(dir, { account: 2 });
    expect(Object.fromEntries(readdirSync(dir).map(name => [name, readFileSync(join(dir, name))]))).toEqual(before);
  });
});

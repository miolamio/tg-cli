import { createHash, pbkdf2, timingSafeEqual } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { IGE } from 'telegram/crypto/IGE.js';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

const deriveKey = promisify(pbkdf2);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ACCOUNTS = 6;
const DC_ADDRESSES = ['149.154.175.53', '149.154.167.51', '149.154.175.100', '149.154.167.91', '91.108.56.130'];

/** Sensitive values are returned only to the importer, never rendered as output. */
export interface DesktopSession {
  sessionString: string;
  userId: string;
  keyFingerprints: string[];
}

function invalid(): never {
  throw new TgError('Cannot read supported Telegram Desktop tdata. Check the directory, local passcode and file integrity.', ErrorCode.INVALID_SESSION);
}

/** SHA256 is used only for local duplicate detection; fingerprints are not logged. */
export function desktopKeyFingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex');
}

class Reader {
  private offset = 0;
  constructor(private readonly data: Buffer) {}
  get remaining(): number { return this.data.length - this.offset; }
  bytes(size: number): Buffer {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.remaining) invalid();
    const result = this.data.subarray(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }
  int(): number { return this.bytes(4).readInt32BE(); }
  array(): Buffer { return this.bytes(this.bytes(4).readUInt32BE()); }
  end(): void { if (this.remaining !== 0) invalid(); }
}

function statIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    invalid();
  }
}

/** Avoid following links or blocking on a FIFO; cap allocation before reading. */
function readBounded(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.size < 24 || before.size > MAX_FILE_BYTES) invalid();
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) invalid();
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length !== before.size) invalid();
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function container(path: string): Buffer {
  const data = readBounded(path);
  if (data.subarray(0, 4).toString('ascii') !== 'TDF$' || data.readInt32LE(4) <= 0) invalid();
  const body = data.subarray(8, -16);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  const checksum = createHash('md5').update(body).update(size).update(data.subarray(4, 8)).update(data.subarray(0, 4)).digest();
  if (!timingSafeEqual(checksum, data.subarray(-16))) invalid();
  return body;
}

/** Match Desktop safe-save selection, without its destructive legacy cleanup. */
function readContainer(directory: string, name: string): Buffer {
  const modern = join(directory, `${name}s`);
  if (statIfPresent(modern)) return container(modern);
  const legacy = ['0', '1'].map(suffix => {
    const path = join(directory, name + suffix);
    return { path, stat: statIfPresent(path) };
  }).filter(item => item.stat).sort((a, b) => Number(b.stat!.mtimeMs) - Number(a.stat!.mtimeMs));
  for (const candidate of legacy) {
    try { return container(candidate.path); } catch { /* Try the other legacy save. */ }
  }
  invalid();
}

/** Desktop local encryption uses the old MTProto AES-IGE key schedule (x = 8). */
function decrypt(envelope: Buffer, key: Buffer): Buffer {
  if (key.length !== 256 || envelope.length < 32 || envelope.length % 16 !== 0) invalid();
  const msg = envelope.subarray(0, 16);
  const sha = (...parts: Buffer[]) => createHash('sha1').update(Buffer.concat(parts)).digest();
  const a = sha(msg, key.subarray(8, 40));
  const b = sha(key.subarray(40, 56), msg, key.subarray(56, 72));
  const c = sha(key.subarray(72, 104), msg);
  const d = sha(msg, key.subarray(104, 136));
  const aesKey = Buffer.concat([a.subarray(0, 8), b.subarray(8, 20), c.subarray(4, 16)]);
  const iv = Buffer.concat([a.subarray(8, 20), b.subarray(0, 8), c.subarray(16, 20), d.subarray(0, 8)]);
  const plain = new IGE(aesKey, iv).decryptIge(envelope.subarray(16));
  if (!timingSafeEqual(sha(plain).subarray(0, 16), msg)) invalid();
  const length = plain.readUInt32LE();
  if (length < 4 || length > plain.length || plain.length - length >= 16) invalid();
  return plain.subarray(4, length);
}

function accountFile(index: number): string {
  const name = index === 0 ? 'data' : `data#${index + 1}`;
  return [...createHash('md5').update(name).digest().subarray(0, 8)]
    .map(byte => byte.toString(16).padStart(2, '0').split('').reverse().join('')).join('').toUpperCase();
}

function readKeys(reader: Reader, retired = false): Map<number, Buffer> {
  const count = reader.int();
  if (count < 0 || count > (retired ? 1024 : 5) || count > Math.floor(reader.remaining / 260)) invalid();
  const keys = new Map<number, Buffer>();
  for (let i = 0; i < count; i++) {
    const dc = reader.int();
    if (dc < 1 || dc > 5 || (!retired && keys.has(dc))) invalid();
    const key = reader.bytes(256);
    if (key.every(byte => byte === 0)) invalid();
    keys.set(dc, key);
  }
  return keys;
}

/** Read modern official Desktop storage only; no chat maps, network or source writes. */
export async function readDesktopSession(directory: string, options: { account?: number; passcode?: string } = {}): Promise<DesktopSession> {
  try {
    const outer = new Reader(readContainer(directory, 'key_data'));
    const salt = outer.array();
    const encryptedKey = outer.array();
    const encryptedInfo = outer.array();
    outer.end();
    if (salt.length !== 32) invalid();
    const passcode = options.passcode ?? '';
    const passHash = createHash('sha512').update(salt).update(passcode, 'utf8').update(salt).digest();
    const passKey = await deriveKey(passHash, salt, passcode ? 100000 : 1, 256, 'sha512');
    const localKey = decrypt(encryptedKey, passKey);
    if (localKey.length !== 256) invalid();
    const info = new Reader(decrypt(encryptedInfo, localKey));
    const count = info.int();
    if (count < 1 || count > MAX_ACCOUNTS) invalid();
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      const index = info.int();
      if (index < 0 || index >= MAX_ACCOUNTS || indices.includes(index)) invalid();
      indices.push(index);
    }
    if (info.remaining === 4) info.int(); // Active account does not override explicit selection.
    info.end();
    if (options.account === undefined && count > 1) {
      throw new TgError(`Multiple Desktop accounts. Choose --account INDEX from: ${indices.join(', ')}.`, ErrorCode.INVALID_OPTIONS);
    }
    const index = options.account ?? indices[0];
    if (!indices.includes(index)) {
      throw new TgError(`Desktop account index is unavailable. Available indices: ${indices.join(', ')}.`, ErrorCode.INVALID_OPTIONS);
    }
    const file = new Reader(readContainer(directory, accountFile(index)));
    const auth = new Reader(decrypt(file.array(), localKey));
    file.end();
    if (auth.int() !== 75) invalid();
    const fields = new Reader(auth.array());
    auth.end();
    const shortId = fields.int();
    let dc = fields.int();
    let userId = BigInt(shortId);
    if (shortId === -1 && dc === -1) {
      userId = fields.bytes(8).readBigUInt64BE();
      dc = fields.int();
    }
    if (userId <= 0n || dc < 1 || dc > 5) invalid();
    const keys = readKeys(fields);
    readKeys(fields, true); // Several retired keys can belong to the same DC; none is used.
    fields.end();
    const key = keys.get(dc);
    if (!key) invalid();
    // Telethon-compatible IPv4 StringSession; gramjs accepts this wire format.
    const address = Buffer.from(DC_ADDRESSES[dc - 1].split('.').map(Number));
    const port = Buffer.alloc(2);
    port.writeUInt16BE(443);
    return {
      sessionString: '1' + Buffer.concat([Buffer.from([dc]), address, port, key]).toString('base64'),
      userId: userId.toString(),
      keyFingerprints: [...keys.values()].map(desktopKeyFingerprint),
    };
  } catch (error) {
    if (error instanceof TgError) throw error;
    invalid();
  }
}

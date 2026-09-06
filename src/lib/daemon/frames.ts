/** Maximum UTF-8 bytes in one NDJSON frame, excluding the newline delimiter. */
export const MAX_FRAME_BYTES = 1_048_576;

/**
 * Incremental, byte-bounded NDJSON framing. Counts individual frames rather than
 * whole data events, which may contain several lines or fragments of UTF-8 text.
 */
export class JsonLineDecoder {
  private chunks: Buffer[] = [];
  private bytes = 0;

  push(chunk: Buffer, onLine: (line: string) => void): void {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.subarray(offset, end);
      this.bytes += part.length;
      if (this.bytes > MAX_FRAME_BYTES) throw new Error('Message too large');
      if (part.length) this.chunks.push(part);
      if (newline === -1) return;
      const line = Buffer.concat(this.chunks, this.bytes).toString('utf-8');
      this.chunks = [];
      this.bytes = 0;
      onLine(line);
      offset = newline + 1;
    }
  }
}

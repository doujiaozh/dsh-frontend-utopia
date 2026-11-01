export function computePercent(loaded: number, total: number): number {
  return total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.byteLength;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * 边读边报进度：把 fetch 的 ReadableStream 消费成 ArrayBuffer，同时在回调里推进度条。
 */
export async function streamToArrayBufferWithProgress(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress?: (loaded: number, total: number, percent: number) => void
): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(received, total, computePercent(received, total));
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* 已释放 */ }
  }
  return concatBytes(chunks).buffer;
}

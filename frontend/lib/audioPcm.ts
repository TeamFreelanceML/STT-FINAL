/** Target rate for backend / STT-style pipelines */
export const TARGET_SAMPLE_RATE = 16_000;

export function rmsFloat32(block: Float32Array): number {
  if (block.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < block.length; i++) {
    const x = block[i];
    sum += x * x;
  }
  return Math.sqrt(sum / block.length);
}

/**
 * Linear resample (mono) to targetRate. Returns a new Float32Array.
 */
export function resampleLinear(
  input: Float32Array,
  inputRate: number,
  targetRate: number,
): Float32Array {
  if (inputRate === targetRate || input.length === 0) {
    return input;
  }
  const ratio = inputRate / targetRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = srcPos - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export function workletModuleUrl(): string {
  if (typeof window === "undefined") {
    return "/audio/pcm-processor.js";
  }
  return new URL("/audio/pcm-processor.js", window.location.origin).href;
}

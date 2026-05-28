import fs from "fs";
import sharp from "sharp";
import { FrameRecord, PHashRecord } from "../types";

/**
 * Computes a 64-bit dHash (difference hash) for an image. The image is cropped
 * to a centered 16:9 inner region first to strip YouTube letterboxing and
 * typical webcam/face-cam overlays, then resized to 9x8 grayscale. Each output
 * bit encodes "is this pixel brighter than its right neighbor?".
 *
 * dHash is robust to brightness changes, small shifts, and JPEG noise — well
 * suited for matching a UI screen against a reference even when small overlays
 * or compression artifacts vary frame to frame.
 *
 * @param imagePath - Absolute path to the image to hash.
 * @returns 64-bit hash as a BigInt.
 */
async function dHash(imagePath: string): Promise<bigint> {
  const meta = await sharp(imagePath).metadata();
  const w = meta.width ?? 1280;
  const h = meta.height ?? 720;
  const cropW = Math.floor(w * 0.9);
  const cropH = Math.floor(h * 0.8);
  const cropX = Math.floor((w - cropW) / 2);
  const cropY = Math.floor((h - cropH) / 2);

  const raw = await sharp(imagePath)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = raw[row * 9 + col];
      const right = raw[row * 9 + col + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/**
 * Counts the number of differing bits between two 64-bit hashes.
 *
 * @param a - First hash.
 * @param b - Second hash.
 * @returns Hamming distance in the range [0, 64].
 */
function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Loads and hashes the reference scoreboard image. Returns null if the file
 * doesn't exist so callers can fall back to the OCR-only slow path.
 *
 * @param refPath - Absolute path to the reference scoreboard PNG.
 * @returns The reference hash, or null if no reference is present.
 */
export async function loadReferenceHash(
  refPath: string,
): Promise<bigint | null> {
  if (!fs.existsSync(refPath)) return null;
  return dHash(refPath);
}

/**
 * Filters frames by perceptual hash distance to the reference scoreboard.
 * Frames within `threshold` Hamming distance are returned as candidates.
 *
 * @param args.frames - All sampled frames.
 * @param args.refHash - Reference scoreboard hash.
 * @param args.threshold - Maximum Hamming distance to accept (0–64). Default 12 is permissive.
 * @returns Candidate frames sorted by their original frameId.
 */
export async function filterByPHash(args: {
  frames: FrameRecord[];
  refHash: bigint;
  threshold: number;
}): Promise<PHashRecord[]> {
  const { frames, refHash, threshold } = args;
  const out: PHashRecord[] = [];
  const total = frames.length;

  for (let i = 0; i < total; i++) {
    const f = frames[i];
    try {
      const h = await dHash(f.filePath);
      const d = hamming(h, refHash);
      if (d <= threshold) {
        out.push({ ...f, hashHex: h.toString(16), distance: d });
      }
    } catch (err) {
      console.warn(
        `[phash] frame ${f.frameId} hash failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    if ((i + 1) % 500 === 0 || i === total - 1) {
      console.log(`[phash] ${i + 1}/${total} candidates=${out.length}`);
    }
  }

  return out;
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import sharp = require('sharp');

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const OWNED_PATH =
  /^identity-images\/(business|user)\/[1-9]\d*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;

@Injectable()
export class ImageStorageService {
  private readonly downloads = new Map<string, {
    value: { buffer: Buffer; contentType: string }; expires: number;
  }>();
  private readonly pendingDownloads = new Map<string, Promise<{ buffer: Buffer; contentType: string }>>();
  private cachedBytes = 0;
  private readonly maxCachedBytes = 32 * 1024 * 1024;
  private readonly maxCachedImages = 128;
  private readonly cacheTtlMs = 10 * 60 * 1000;

  private expireDownloads() {
    for (const [key, entry] of this.downloads) {
      if (entry.expires <= Date.now()) {
        this.cachedBytes -= entry.value.buffer.length;
        this.downloads.delete(key);
      }
    }
  }

  async normalize(buffer: Buffer, kind: 'business' | 'user', forPdf = false): Promise<Buffer> {
    if (!buffer?.length || buffer.length > IMAGE_MAX_BYTES) {
      throw new BadRequestException('Image must be at most 5 MB');
    }
    try {
      const image = sharp(buffer, {
        limitInputPixels: 16_000_000,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 16_000_000 ||
        (metadata.pages ?? 1) !== 1
      ) {
        throw new Error('Unsupported raster image');
      }
      // PDF template displays a centered cover crop at 38 mm. 640 pixels
      // retain approximately 428 pixels/inch there; never enlarge small logos.
      const size = forPdf ? 640 : kind === 'business' ? 1600 : 512;
      // Full decode + re-encode removes metadata and rejects corrupt payloads.
      const normalized = await image
        .rotate()
        .resize(size, size, { fit: forPdf ? 'cover' : 'inside', position: 'centre', withoutEnlargement: true })
        .png()
        .toBuffer();
      if (normalized.length > IMAGE_MAX_BYTES)
        throw new Error('Normalized image too large');
      return normalized;
    } catch {
      throw new BadRequestException(
        'Upload a valid single-frame PNG, JPEG or WebP image (up to 16 megapixels)',
      );
    }
  }

  async upload(
    kind: 'business' | 'user',
    id: number,
    buffer: Buffer,
  ): Promise<string> {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Invalid image owner');
    const normalized = await this.normalize(buffer, kind);
    const path = `identity-images/${kind}/${id}/${randomUUID()}.png`;
    await admin
      .storage()
      .bucket()
      .file(path)
      .save(normalized, {
        resumable: false,
        metadata: {
          contentType: 'image/png',
          cacheControl: 'private, no-store',
        },
      });
    return path;
  }

  /** Only accepts server-owned immutable asset paths, never URLs or arbitrary bucket paths. */
  async download(
    path: string,
    purpose: 'original' | 'pdf' = 'original',
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!OWNED_PATH.test(path ?? ''))
      throw new BadRequestException('Invalid image path');
    const cacheKey = purpose === 'pdf' ? `pdf:${path}` : path;
    this.expireDownloads();
    const cached = this.downloads.get(cacheKey);
    if (cached) {
      this.downloads.delete(cacheKey);
      this.downloads.set(cacheKey, cached);
      return { ...cached.value, buffer: Buffer.from(cached.value.buffer) };
    }
    let pending = this.pendingDownloads.get(cacheKey);
    if (!pending) {
      pending = this.downloadUncached(path, purpose === 'pdf');
      // Bound in-flight dedup bookkeeping as well as the retained image cache.
      if (this.pendingDownloads.size < 128) this.pendingDownloads.set(cacheKey, pending);
    }
    try {
      const value = await pending;
      if (!this.downloads.has(cacheKey)) {
        this.expireDownloads();
        while (this.downloads.size && (this.cachedBytes + value.buffer.length > this.maxCachedBytes
          || this.downloads.size >= this.maxCachedImages)) {
          const key = this.downloads.keys().next().value;
          this.cachedBytes -= this.downloads.get(key).value.buffer.length;
          this.downloads.delete(key);
        }
        if (value.buffer.length <= this.maxCachedBytes) {
          this.downloads.set(cacheKey, { value, expires: Date.now() + this.cacheTtlMs });
          this.cachedBytes += value.buffer.length;
        }
      }
      return { ...value, buffer: Buffer.from(value.buffer) };
    } finally {
      if (this.pendingDownloads.get(cacheKey) === pending) this.pendingDownloads.delete(cacheKey);
    }
  }

  private async downloadUncached(path: string, forPdf: boolean): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const file = admin.storage().bucket().file(path);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > IMAGE_MAX_BYTES)
        throw new BadRequestException('Stored image too large');
      const [buffer] = await file.download();
      return {
        buffer: await this.normalize(
          buffer,
          path.startsWith('identity-images/business/') ? 'business' : 'user',
          forPdf,
        ),
        contentType: 'image/png',
      };
    } catch (error) {
      if (Number(error?.code) === 404)
        throw new NotFoundException('Image not found');
      throw error;
    }
  }
}

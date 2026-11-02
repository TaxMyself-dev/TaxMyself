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
  async normalize(buffer: Buffer, kind: 'business' | 'user'): Promise<Buffer> {
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
      const size = kind === 'business' ? 1600 : 512;
      // Full decode + re-encode removes metadata and rejects corrupt payloads.
      const normalized = await image
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
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
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!OWNED_PATH.test(path ?? ''))
      throw new BadRequestException('Invalid image path');
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

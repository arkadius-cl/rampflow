import { createHash } from 'node:crypto';
import type { OwnerDb } from '../../../../test/db.ts';
import type { TenantId, UserId } from '../../../db/ids.ts';
import { tenantLogo } from '../schema.ts';

// Test images for TN-05 and a logo row written as the owner.

/** A 1x1 transparent PNG. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** JPEG magic bytes padded to `size`; the API checks magic bytes, not the full image. */
export const jpegOf = (size: number) => {
  const bytes = Buffer.alloc(size, 0);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
);

export async function logoFor(db: OwnerDb, tenantId: TenantId, updatedBy: UserId) {
  const sha256 = createHash('sha256').update(PNG_1PX).digest();
  await db.insert(tenantLogo).values({
    tenantId,
    contentType: 'image/png',
    bytes: PNG_1PX,
    byteSize: PNG_1PX.length,
    sha256,
    updatedBy,
  });
  return { sha: sha256.toString('hex') };
}

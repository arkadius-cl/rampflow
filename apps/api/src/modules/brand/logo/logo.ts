import { createHash } from 'node:crypto';
import type { Entitlements } from '@rampflow/shared';
import { LOGO_MAX_BYTES, type LogoView, logoUrl } from '@rampflow/shared/modules/brand/api';
import { LogoContentType } from '@rampflow/shared/modules/brand/values';
import { ErrorCode } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { tenantLogo } from '../schema.ts';

// TN-05. The logo is stored in the database (at most 256 KB per tenant) and served under a URL
// that carries its SHA-256, so it can be cached forever.

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, magic: readonly number[]) =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

/** The image type by magic bytes, whatever the client claims. SVG and everything else is `null`. */
export function sniffLogo(bytes: Uint8Array): LogoContentType | null {
  if (startsWith(bytes, PNG)) return LogoContentType.png;
  if (startsWith(bytes, JPEG)) return LogoContentType.jpeg;
  return null;
}

const issue = (code: 'too_big' | 'invalid_format', message: string) =>
  new ApiError(ErrorCode.validation_failed, 'Invalid logo', {
    issues: [{ path: [], code, message }],
  });

export const tooBig = () => issue('too_big', `At most ${LOGO_MAX_BYTES} bytes`);

/** 422 unless the bytes are a PNG or JPEG of at most 256 KB. */
export function parseLogo(bytes: Uint8Array): { contentType: LogoContentType; bytes: Buffer } {
  if (bytes.length > LOGO_MAX_BYTES) throw tooBig();
  const contentType = sniffLogo(bytes);
  if (!contentType || bytes.length === 0) throw issue('invalid_format', 'PNG or JPEG only');
  return { contentType, bytes: Buffer.from(bytes) };
}

type LogoRow = Pick<
  typeof tenantLogo.$inferSelect,
  'tenantId' | 'contentType' | 'byteSize' | 'sha256' | 'updatedAt'
>;

function view(row: LogoRow): LogoView {
  return {
    url: logoUrl(row.tenantId, row.sha256.toString('hex')),
    contentType: row.contentType,
    byteSize: row.byteSize,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const meta = {
  tenantId: tenantLogo.tenantId,
  contentType: tenantLogo.contentType,
  byteSize: tenantLogo.byteSize,
  sha256: tenantLogo.sha256,
  updatedAt: tenantLogo.updatedAt,
};

export async function readLogo(tx: Tx, tenantId: TenantId): Promise<LogoView | null> {
  const [row] = await tx.select(meta).from(tenantLogo).where(eq(tenantLogo.tenantId, tenantId));
  return row ? view(row) : null;
}

export async function writeLogo(
  tx: Tx,
  tenantId: TenantId,
  logo: { contentType: LogoContentType; bytes: Buffer },
  userId: UserId,
  now: Date,
): Promise<LogoView> {
  const set = {
    contentType: logo.contentType,
    bytes: logo.bytes,
    byteSize: logo.bytes.length,
    sha256: createHash('sha256').update(logo.bytes).digest(),
    updatedBy: userId,
    updatedAt: now,
  };
  const [row] = await tx
    .insert(tenantLogo)
    .values({ tenantId, ...set })
    .onConflictDoUpdate({ target: tenantLogo.tenantId, set })
    .returning(meta);
  if (!row) throw new Error('logo upsert returned nothing');
  return view(row);
}

export async function deleteLogo(tx: Tx, tenantId: TenantId): Promise<void> {
  await tx.delete(tenantLogo).where(eq(tenantLogo.tenantId, tenantId));
}

/** The logo bytes, only while their hash is `sha256Hex` (an old URL answers 404). */
export async function logoBytes(tx: Tx, tenantId: TenantId, sha256Hex: string) {
  const [row] = await tx.select().from(tenantLogo).where(eq(tenantLogo.tenantId, tenantId));
  if (!row || row.sha256.toString('hex') !== sha256Hex) return null;
  return { contentType: row.contentType, bytes: row.bytes };
}

/**
 * The absolute logo URL for emails and pages of tenant `tenantId`, or `null` without a logo or
 * while `brand.logo` is off. Works under every party that reads `tenant_logo` (tenant, carrier,
 * carrier at tenant, driver, public).
 */
export async function currentLogoUrl(
  tx: Tx,
  tenantId: TenantId,
  entitlements: Entitlements,
  origin: string,
): Promise<string | null> {
  if (!entitlements.modules.brand || !entitlements.features['brand.logo']) return null;
  const [row] = await tx
    .select({ sha256: tenantLogo.sha256 })
    .from(tenantLogo)
    .where(eq(tenantLogo.tenantId, tenantId));
  return row ? logoUrl(tenantId, row.sha256.toString('hex'), origin) : null;
}

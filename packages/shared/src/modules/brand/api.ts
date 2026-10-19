// Shapes of /api/t/:orgId/brand/logo and the public logo URL (TN-05).

export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** 256 KB. One byte more answers 422. */
export const LOGO_MAX_BYTES = 262_144;

/**
 * Where the logo with content hash `sha256Hex` is served. The hash makes the URL immutable, so
 * caches keep it forever and a new upload gets a new URL. Emails pass the app origin.
 */
export const logoUrl = (tenantId: string, sha256Hex: string, origin = '') =>
  `${origin}/api/public/logos/${tenantId}/${sha256Hex}`;

export interface LogoView {
  url: string;
  contentType: LogoContentType;
  byteSize: number;
  updatedAt: string;
}

export interface LogoResponse {
  logo: LogoView | null;
}

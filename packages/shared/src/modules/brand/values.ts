import type { ValueOf } from '../../values/define.ts';

/** The values are MIME types, not identifiers, so the keys name the format. */
export const LogoContentType = {
  png: 'image/png',
  jpeg: 'image/jpeg',
} as const;
export type LogoContentType = ValueOf<typeof LogoContentType>;

import type { ValueOf } from '../../values/define.ts';
import { ImageContentType } from '../../values/http.ts';

export const LogoContentType = {
  png: ImageContentType.png,
  jpeg: ImageContentType.jpeg,
} as const;
export type LogoContentType = ValueOf<typeof LogoContentType>;

/** Why the browser rejects a chosen logo file before uploading it. */
export const LogoProblem = {
  type: 'type',
  size: 'size',
} as const;
export type LogoProblem = ValueOf<typeof LogoProblem>;

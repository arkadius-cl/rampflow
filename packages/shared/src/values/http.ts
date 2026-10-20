import type { ValueOf } from './define.ts';

/** The request methods the API routes use. */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;
export type HttpMethod = ValueOf<typeof HttpMethod>;

/** Image MIME types the apps store or serve; the values are not identifiers, so keys name the format. */
export const ImageContentType = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
} as const;
export type ImageContentType = ValueOf<typeof ImageContentType>;

/** The cookies the API sets: the staff session, the driver session and the phone's safety passes. */
export const CookieName = {
  rf_session: 'rf_session',
  rf_driver: 'rf_driver',
  rf_device: 'rf_device',
} as const;
export type CookieName = ValueOf<typeof CookieName>;

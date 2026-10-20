import type { ValueOf } from './define.ts';

/** `KeyboardEvent.key` values the UI and the end-to-end tests use. */
export const KeyboardKey = {
  Enter: 'Enter',
  Escape: 'Escape',
} as const;
export type KeyboardKey = ValueOf<typeof KeyboardKey>;

/** `document.visibilityState`. */
export const VisibilityState = {
  visible: 'visible',
  hidden: 'hidden',
} as const;
export type VisibilityState = ValueOf<typeof VisibilityState>;

/** `DOMException.name` values the UI handles. */
export const DomExceptionName = {
  AbortError: 'AbortError',
} as const;
export type DomExceptionName = ValueOf<typeof DomExceptionName>;

/** `Intl.DisplayNames` types the UI uses. */
export const DisplayNamesType = {
  language: 'language',
  region: 'region',
} as const;
export type DisplayNamesType = ValueOf<typeof DisplayNamesType>;

/** `<input type>` values the forms pass as data. */
export const HtmlInputType = {
  text: 'text',
  number: 'number',
  tel: 'tel',
  search: 'search',
} as const;
export type HtmlInputType = ValueOf<typeof HtmlInputType>;

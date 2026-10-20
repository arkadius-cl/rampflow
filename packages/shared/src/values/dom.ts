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

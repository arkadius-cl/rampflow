import { useEffect, useState } from 'react';

// Emailed tokens travel only in the URL fragment (/invite#<token>, ADR-0003, ADR-0011): the
// browser never sends a fragment to a server, so it stays out of request lines, logs and Referer.
// The page takes it once, removes it from the address bar and history, then posts it.

let taken: { path: string; token: string } | null = null;

function takeFragment(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash) {
    taken = { path: window.location.pathname, token: decodeURIComponent(hash) };
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }
  // A second render (React strict mode, a remount) finds the fragment gone but keeps the token.
  return taken?.path === window.location.pathname ? taken.token : null;
}

/** The token of a link like `/auth/magic#<token>`, or `null` when the page was opened without one. */
export function useFragmentToken(): string | null {
  const [token] = useState(takeFragment);
  return token;
}

const exchanges = new Map<string, Promise<unknown>>();

export type Exchange<T> =
  | { status: 'pending' }
  | { status: 'done'; value: T }
  | { status: 'failed'; error: unknown };

/**
 * Posts a single-use token exactly once per page load, however often the component mounts:
 * a second POST of a used token would answer 401 after the first one already succeeded.
 */
export function useExchangeOnce<T>(key: string | null, exchange: () => Promise<T>): Exchange<T> {
  const [state, setState] = useState<Exchange<T>>({ status: 'pending' });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the exchange belongs to the key; a new closure for the same key must not post again
  useEffect(() => {
    if (!key) return;
    let promise = exchanges.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = exchange();
      exchanges.set(key, promise);
    }
    let live = true;
    promise.then(
      (value) => live && setState({ status: 'done', value }),
      (error: unknown) => live && setState({ status: 'failed', error }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

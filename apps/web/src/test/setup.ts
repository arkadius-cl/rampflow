import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom lays nothing out, so it has no scrolling to do.
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

// The toaster follows the color scheme; jsdom answers no media query.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

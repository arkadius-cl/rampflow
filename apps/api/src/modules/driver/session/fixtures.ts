import { randomInt } from 'node:crypto';
import { TEST_ORIGIN } from '../../../../test/http.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';

// The driver phone against the real HTTP surface: a cookie jar per phone and a client address
// per test, so the exchange limit of one test never reaches another.

export const VISIT_DAY = new Date('2026-11-02T07:00:00Z');

export type Jar = Map<string, string>;

const randomIp = () => `198.51.${randomInt(0, 255)}.${randomInt(1, 255)}`;

export function driverHarness(start: Date = VISIT_DAY) {
  const clock = testClock(start);
  const app = createApp({ clock });
  const ip = randomIp();

  const request = async (
    method: string,
    path: string,
    o: { body?: unknown; jar?: Jar; ip?: string } = {},
  ) => {
    const cookie = o.jar ? [...o.jar].map(([k, v]) => `${k}=${v}`).join('; ') : '';
    const res = await app.request(
      path,
      {
        method,
        headers: {
          Origin: TEST_ORIGIN,
          ...(o.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      },
      { incoming: { socket: { remoteAddress: o.ip ?? ip } } } as never,
    );
    if (o.jar) {
      for (const line of res.headers.getSetCookie()) {
        const [pair = ''] = line.split(';');
        const at = pair.indexOf('=');
        const name = pair.slice(0, at);
        const value = pair.slice(at + 1);
        if (/Max-Age=0/i.test(line) || value === '') o.jar.delete(name);
        else o.jar.set(name, value);
      }
    }
    return res;
  };

  /** Opens `/d#<token>` on the phone of `jar`: the exchange puts `rf_driver` into the jar. */
  const open = (token: string, jar: Jar = new Map()) =>
    request('POST', '/api/public/driver-session', { body: { token }, jar }).then((res) => ({
      res,
      jar,
    }));

  return { app, clock, ip, request, open };
}

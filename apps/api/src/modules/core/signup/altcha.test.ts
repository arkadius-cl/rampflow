import { describe, expect, it } from 'vitest';
import { createSignupChallenge, verifySignupSolution } from './altcha.ts';
import { solve } from './fixtures.ts';

// Design decision 6: a real challenge solved with altcha-lib's solver, as the widget does it.

const now = new Date();
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe('ALTCHA', () => {
  it('accepts a solved challenge once', async () => {
    const payload = await solve(await createSignupChallenge(now));
    expect(await verifySignupSolution(payload, minutes(1))).toBe(true);
    expect(await verifySignupSolution(payload, minutes(2))).toBe(false);
  });

  it('refuses a tampered payload', async () => {
    const challenge = await createSignupChallenge(now);
    const payload = JSON.parse(Buffer.from(await solve(challenge), 'base64').toString('utf8'));
    const cheaper = {
      ...payload,
      challenge: { ...payload.challenge, parameters: { ...payload.challenge.parameters, cost: 1 } },
    };
    const wrongKey = { ...payload, solution: { ...payload.solution, derivedKey: '00'.repeat(32) } };
    for (const tampered of [cheaper, wrongKey]) {
      const encoded = Buffer.from(JSON.stringify(tampered)).toString('base64');
      expect(await verifySignupSolution(encoded, minutes(1))).toBe(false);
    }
    expect(await verifySignupSolution('not base64 json', minutes(1))).toBe(false);
  });

  it('refuses a challenge issued 11 minutes earlier', async () => {
    const payload = await solve(await createSignupChallenge(now));
    expect(await verifySignupSolution(payload, minutes(11))).toBe(false);
    expect(await verifySignupSolution(payload, minutes(9))).toBe(true);
  });
});

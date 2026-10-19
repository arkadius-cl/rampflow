import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';

// ADR-0003, "Passwords": scrypt N=2^14, r=16, p=1, 16-byte salt, 64-byte key, stored as
// scrypt$N$r$p$<salt b64>$<hash b64> so the cost can rise later and old hashes still verify.

const COST = { N: 16_384, r: 16, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...cost, maxmem: MAX_MEMORY },
      (e, key) => (e ? reject(e) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

const STORED = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

/** `false` for a wrong password and for a malformed hash; never throws on user input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = STORED.exec(stored);
  if (!m) return false;
  const [, n, r, p, salt, hash] = m;
  const expected = Buffer.from(hash ?? '', 'base64');
  const key = await derive(password, Buffer.from(salt ?? '', 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;

/**
 * Verified against when the email is unknown or has no password, so the response time does not
 * reveal which addresses have accounts. Built once per process with the current cost.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}

#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
// Per-checkout environment: ports and database names that keep parallel worktrees apart.
//
//   node scripts/checkout-env.mjs              print this checkout's env
//   node scripts/checkout-env.mjs --write      write it into .env (keeps other keys)
//   node scripts/checkout-env.mjs run -- cmd   run cmd with process env > .env > checkout defaults
//   node scripts/checkout-env.mjs --e2e [run -- cmd]   the same for this checkout's e2e profile
//
// The main checkout (where .git is a directory) keeps rampflow, 3000, 5173 and 5174.
// A worktree gets rampflow_<slug> and port block n: 3000+10n, 5173+10n, 5174+10n.
// The e2e profile derives from the dev env: database <db>_e2e and every port +5, so e2e runs
// never write to the dev database and never reuse a running `pnpm dev`. It turns ENABLE_API_DOCS off.
//
// The dev profile serves the app on the LAN: APP_ORIGIN is http://<DEV_HOST>:<WEB_PORT>, where
// DEV_HOST is the machine's LAN address unless set, and APP_EXTRA_ORIGINS lists its other
// addresses. Both are computed on every run, never written, so a new DHCP lease needs no rewrite.
import { CheckoutEnvArg } from '../packages/shared/src/values/cli.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, '.env');

/** Keys this script derives per checkout. Everything else comes from `.env.example`. */
const CHECKOUT_KEYS = [
  'API_PORT',
  'WEB_PORT',
  'DRIVER_PORT',
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
];

const PG = {
  host: 'localhost',
  port: 5432,
  owner: 'rampflow:rampflow',
  app: 'rampflow_app:rampflow_app',
};
const MAX_BLOCK = 99;

function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

function isMainCheckout(dir) {
  const git = join(dir, '.git');
  return existsSync(git) && statSync(git).isDirectory();
}

function slugOf(dir) {
  return basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function hashedBlock(slug) {
  return 1 + (createHash('sha256').update(slug).digest().readUInt32BE(0) % MAX_BLOCK);
}

function databaseName(dir) {
  return isMainCheckout(dir) ? 'rampflow' : `rampflow_${slugOf(dir)}`;
}

function envFor(dir, block) {
  const db = databaseName(dir);
  return {
    API_PORT: String(3000 + 10 * block),
    WEB_PORT: String(5173 + 10 * block),
    DRIVER_PORT: String(5174 + 10 * block),
    DATABASE_URL: `postgres://${PG.app}@${PG.host}:${PG.port}/${db}`,
    MIGRATION_DATABASE_URL: `postgres://${PG.owner}@${PG.host}:${PG.port}/${db}`,
  };
}

function blockOf(env) {
  const api = Number(env.API_PORT);
  return Number.isInteger(api) && api > 3000 && (api - 3000) % 10 === 0 ? (api - 3000) / 10 : null;
}

function defaultBlock(dir) {
  return isMainCheckout(dir) ? 0 : hashedBlock(slugOf(dir));
}

/** Blocks other checkouts of this repository use, from their `.env` or their hashed default. */
function blocksOfOtherCheckouts() {
  let listing = '';
  try {
    listing = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch {
    return new Set();
  }
  const taken = new Set();
  for (const line of listing.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const dir = line.slice('worktree '.length);
    if (dir === root) continue;
    taken.add(blockOf(readEnvFile(join(dir, '.env'))) ?? defaultBlock(dir));
  }
  return taken;
}

function pickFreeBlock() {
  if (isMainCheckout(root)) return 0;
  const taken = blocksOfOtherCheckouts();
  const start = hashedBlock(slugOf(root));
  for (let i = 0; i < MAX_BLOCK; i++) {
    const block = 1 + ((start - 1 + i) % MAX_BLOCK);
    if (!taken.has(block)) return block;
  }
  throw new Error('No free port block left; remove stale worktrees.');
}

/** Keys the dev profile computes on every run. Printed, never written to `.env`. */
const RUNTIME_KEYS = ['DEV_HOST', 'APP_ORIGIN', 'APP_EXTRA_ORIGINS'];

const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && isIPv4(a.address) && !a.internal)
    .map((a) => a.address);
}

/**
 * The source address of the default route, the one other devices in the LAN reach. A container
 * or VM bridge can also hold a private address, so the first private address is only a fallback.
 */
function defaultRouteAddress() {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    socket.on('error', () => {
      socket.close();
      resolve(undefined);
    });
    // connect() on UDP sends nothing; it only asks the routing table for a source address.
    socket.connect(9, '192.0.2.1', () => {
      const { address } = socket.address();
      socket.close();
      resolve(address);
    });
  });
}

/** The app's origin on the LAN, and every other address of this machine the browser may use. */
function lanOrigins(env) {
  const addresses = lanAddresses();
  const routed = addresses.includes(ROUTE_ADDRESS) ? ROUTE_ADDRESS : undefined;
  const host =
    env.DEV_HOST ||
    routed ||
    addresses.find((a) => PRIVATE_IPV4.test(a)) ||
    addresses[0] ||
    'localhost';
  const at = (h) => `http://${h}:${env.WEB_PORT}`;
  const origin = process.env.APP_ORIGIN || at(host);
  const extras = new Set(['localhost', '127.0.0.1', ...addresses].map(at));
  extras.delete(origin);
  return { DEV_HOST: host, APP_ORIGIN: origin, APP_EXTRA_ORIGINS: [...extras].join(',') };
}

/** process env, then the LAN origins, then `.env`, then the checkout defaults, then the example file. */
function resolvedEnv() {
  const file = readEnvFile(envPath);
  const block = blockOf(file) ?? defaultBlock(root);
  const env = {
    ...readEnvFile(join(root, '.env.example')),
    ...envFor(root, block),
    ...file,
    ...process.env,
  };
  return { ...env, ...lanOrigins(env), ...process.env };
}

const E2E_PORT_OFFSET = 5;

/** The e2e profile of a resolved dev env: its own database and its own servers. */
function e2eEnv(env) {
  const shift = (key) => String(Number(env[key]) + E2E_PORT_OFFSET);
  const suffixed = (key) => {
    const url = new URL(env[key]);
    url.pathname = `${url.pathname}_e2e`;
    return url.toString();
  };
  const web = shift('WEB_PORT');
  const { DEV_HOST: _, ...rest } = env;
  return {
    ...rest,
    API_PORT: shift('API_PORT'),
    WEB_PORT: web,
    DRIVER_PORT: shift('DRIVER_PORT'),
    APP_ORIGIN: `http://localhost:${web}`,
    APP_EXTRA_ORIGINS: '',
    DATABASE_URL: suffixed('DATABASE_URL'),
    MIGRATION_DATABASE_URL: suffixed('MIGRATION_DATABASE_URL'),
    // Swagger UI is a dev tool; e2e runs the app as users get it.
    ENABLE_API_DOCS: '0',
  };
}

function format(env) {
  return [...CHECKOUT_KEYS, ...RUNTIME_KEYS]
    .filter((k) => env[k] !== undefined)
    .map((k) => `${k}=${env[k]}`)
    .join('\n');
}

function write() {
  const file = readEnvFile(envPath);
  const block = blockOf(file) ?? pickFreeBlock();
  const merged = { ...readEnvFile(join(root, '.env.example')), ...file, ...envFor(root, block) };
  // An APP_ORIGIN from an older write would pin the browser origin to localhost.
  const { APP_ORIGIN: _, APP_EXTRA_ORIGINS: __, ...kept } = merged;
  // The dev servers listen on the LAN, so the published example secret would let any device
  // there forge links and sign-in tokens.
  if (!kept.TOKEN_SECRET || kept.TOKEN_SECRET.startsWith('dev-only')) {
    kept.TOKEN_SECRET = randomBytes(32).toString('hex');
  }
  const body = Object.entries(kept)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(envPath, `# Written by scripts/checkout-env.mjs for ${basename(root)}.\n${body}\n`);
  console.log(`Wrote ${envPath} (port block ${block})\n${format(resolvedEnv())}`);
}

function run(env, argv) {
  const [cmd, ...args] = argv;
  if (!cmd) throw new Error('usage: checkout-env.mjs [--e2e] run -- <command> [args...]');
  const child = spawn(cmd, args, { stdio: 'inherit', env, shell: false });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
}

const argv = process.argv.slice(2);
const e2e = argv[0] === CheckoutEnvArg.e2e;
const [mode, ...rest] = e2e ? argv.slice(1) : argv;
const ROUTE_ADDRESS = await defaultRouteAddress();
const env = () => (e2e ? e2eEnv(resolvedEnv()) : resolvedEnv());
if (mode === CheckoutEnvArg.run) {
  run(env(), rest[0] === CheckoutEnvArg.end_of_options ? rest.slice(1) : rest);
} else if (mode === CheckoutEnvArg.write && !e2e) write();
else if (mode === undefined) console.log(format(env()));
else {
  console.error(`unknown argument ${mode}`);
  process.exit(2);
}

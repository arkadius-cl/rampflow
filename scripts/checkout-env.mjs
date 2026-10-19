#!/usr/bin/env node
// Per-checkout environment: ports and database names that keep parallel worktrees apart.
//
//   node scripts/checkout-env.mjs              print this checkout's env
//   node scripts/checkout-env.mjs --write      write it into .env (keeps other keys)
//   node scripts/checkout-env.mjs run -- cmd   run cmd with process env > .env > checkout defaults
//
// The main checkout (where .git is a directory) keeps rampflow, 3000, 5173 and 5174.
// A worktree gets rampflow_<slug> and port block n: 3000+10n, 5173+10n, 5174+10n.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, '.env');

/** Keys this script derives per checkout. Everything else comes from `.env.example`. */
const CHECKOUT_KEYS = [
  'API_PORT',
  'WEB_PORT',
  'DRIVER_PORT',
  'APP_ORIGIN',
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
  const api = 3000 + 10 * block;
  const web = 5173 + 10 * block;
  return {
    API_PORT: String(api),
    WEB_PORT: String(web),
    DRIVER_PORT: String(5174 + 10 * block),
    APP_ORIGIN: `http://localhost:${web}`,
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

/** process env, then `.env`, then the example file, then the checkout defaults. */
function resolvedEnv() {
  const file = readEnvFile(envPath);
  const block = blockOf(file) ?? defaultBlock(root);
  return {
    ...readEnvFile(join(root, '.env.example')),
    ...envFor(root, block),
    ...file,
    ...process.env,
  };
}

function format(env) {
  return CHECKOUT_KEYS.map((k) => `${k}=${env[k]}`).join('\n');
}

function write() {
  const file = readEnvFile(envPath);
  const block = blockOf(file) ?? pickFreeBlock();
  const merged = { ...readEnvFile(join(root, '.env.example')), ...file, ...envFor(root, block) };
  const body = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  writeFileSync(envPath, `# Written by scripts/checkout-env.mjs for ${basename(root)}.\n${body}\n`);
  console.log(`Wrote ${envPath} (port block ${block})\n${format(merged)}`);
}

function run(argv) {
  const [cmd, ...args] = argv;
  if (!cmd) throw new Error('usage: checkout-env.mjs run -- <command> [args...]');
  const child = spawn(cmd, args, { stdio: 'inherit', env: resolvedEnv(), shell: false });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'run') run(rest[0] === '--' ? rest.slice(1) : rest);
else if (mode === '--write') write();
else if (mode === undefined) console.log(format(resolvedEnv()));
else {
  console.error(`unknown argument ${mode}`);
  process.exit(2);
}

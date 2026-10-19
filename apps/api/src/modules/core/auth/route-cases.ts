import { defineAccountCases } from '../../../../test/route-cases.ts';
import { account, authTokenFor } from './fixtures.ts';

export const accountCases = defineAccountCases([
  {
    method: 'POST',
    path: '/api/auth/login',
    credential: 'none',
    arrange: async (_w, db) => {
      const a = await account(db);
      return { actor: null, body: { email: a.email, password: a.password } };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    credential: 'session',
    arrange: async (w) => ({ actor: w.A.users.dispatcher }),
  },
  {
    method: 'POST',
    path: '/api/auth/magic-link',
    credential: 'none',
    arrange: async (_w, db) => ({ actor: null, body: { email: (await account(db)).email } }),
  },
  {
    method: 'POST',
    path: '/api/auth/magic-link/exchange',
    credential: 'token',
    arrange: async (_w, db) => {
      const a = await account(db);
      return {
        actor: null,
        body: { token: await authTokenFor(db, 'magic_link', a.id) },
        otherToken: await authTokenFor(db, 'password_reset', a.id),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/magic-link/inspect',
    credential: 'token',
    singleUse: false,
    arrange: async (_w, db) => {
      const a = await account(db);
      return {
        actor: null,
        body: { token: await authTokenFor(db, 'magic_link', a.id) },
        otherToken: await authTokenFor(db, 'password_reset', a.id),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/auth/password-reset',
    credential: 'none',
    arrange: async (_w, db) => ({ actor: null, body: { email: (await account(db)).email } }),
  },
  {
    method: 'POST',
    path: '/api/auth/password-reset/confirm',
    credential: 'token',
    arrange: async (_w, db) => {
      const a = await account(db);
      const token = await authTokenFor(db, 'password_reset', a.id);
      return {
        actor: null,
        body: { token, password: 'a new password 2026' },
        otherToken: await authTokenFor(db, 'magic_link', a.id),
      };
    },
  },
]);

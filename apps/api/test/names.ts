/** `<checkout db>_tpl`: migrated once per run. */
export const templateDatabase = (base: string) => `${base}_tpl`;

/** `<checkout db>_test_<n>`: one clone of the template per vitest worker. */
export const workerPrefix = (base: string) => `${base}_test_`;
export const workerDatabase = (base: string, poolId: string) => `${workerPrefix(base)}${poolId}`;

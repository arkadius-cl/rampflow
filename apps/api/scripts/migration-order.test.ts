import { describe, expect, it } from 'vitest';
import { uniqueKeysFirst } from './migration-order.ts';

const join = (...statements: string[]) => statements.join('--> statement-breakpoint\n');

describe('uniqueKeysFirst', () => {
  it('moves unique keys and unique indexes ahead of the first foreign key', () => {
    const column = 'ALTER TABLE "a" ADD COLUMN "x" text;';
    const fk =
      'ALTER TABLE "b" ADD CONSTRAINT "b_fk" FOREIGN KEY ("id","x") REFERENCES "public"."a"("id","x");';
    const index =
      'CREATE UNIQUE INDEX "a_x_idx" ON "a" USING btree ("x") WHERE "a"."x" is not null;';
    const unique = 'ALTER TABLE "a" ADD CONSTRAINT "a_id_x_key" UNIQUE("id","x");';
    const check = 'ALTER TABLE "a" ADD CONSTRAINT "a_x_check" CHECK ("a"."x" in (\'y\'));';
    expect(uniqueKeysFirst(join(column, fk, index, unique, check))).toBe(
      join(column, index, unique, fk, check),
    );
  });

  it('leaves a migration without a late unique key unchanged', () => {
    const sql = join(
      'ALTER TABLE "a" ADD CONSTRAINT "a_key" UNIQUE("x");',
      'CREATE POLICY "p" ON "a";',
    );
    expect(uniqueKeysFirst(sql)).toBe(sql);
  });
});

// drizzle-kit 0.31 emits new foreign keys before new unique keys. A composite foreign key onto a
// key added in the same migration (ADR-0017's profile keys) then fails with "there is no unique
// constraint matching given keys". Moving the unique keys ahead of the first foreign key keeps the
// migration generated DDL in an order Postgres accepts.

const BREAKPOINT = '--> statement-breakpoint';

const isUniqueKey = (statement: string) =>
  /^ALTER TABLE "[^"]+" ADD CONSTRAINT "[^"]+" UNIQUE\(/.test(statement) ||
  /^CREATE UNIQUE INDEX /.test(statement);
const isForeignKey = (statement: string) => / FOREIGN KEY \(/.test(statement);

export function uniqueKeysFirst(sql: string): string {
  const statements = sql.split(BREAKPOINT).map((s) => s.trim());
  const firstForeignKey = statements.findIndex(isForeignKey);
  if (firstForeignKey === -1) return sql;
  const late = statements.filter((s, i) => i > firstForeignKey && isUniqueKey(s));
  if (late.length === 0) return sql;
  const rest = statements.filter((s) => !late.includes(s));
  rest.splice(firstForeignKey, 0, ...late);
  return `${rest.join(`${BREAKPOINT}\n`)}`;
}

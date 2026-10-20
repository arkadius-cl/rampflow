/** The member type of a value set: `ValueOf<typeof BookingStatus>` is `'requested' | ...`. */
export type ValueOf<T> = T[keyof T];

/** A value set's members as a non-empty tuple, the shape Drizzle's `enum` and `oneOf` take. */
export function values<const T extends Readonly<Record<string, string>>>(
  set: T,
): readonly [ValueOf<T>, ...ValueOf<T>[]] {
  return Object.values(set) as unknown as readonly [ValueOf<T>, ...ValueOf<T>[]];
}

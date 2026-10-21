/** Letters NFD keeps whole, so `wlochy` finds Włochy as `osterreich` finds Österreich. */
const FOLD: Readonly<Record<string, string>> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
};

/** Folds case and accents, so a search matches what users type without them. */
export const searchable = (text: string) =>
  text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łøđßæœ]/g, (c) => FOLD[c] ?? c);

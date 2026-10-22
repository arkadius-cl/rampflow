// The rules of `pnpm design:check` (ADR-0021). Pure functions so the test runs them on strings.

type ValueOf<T> = T[keyof T];

/** A rule the check enforces. Its member is the id printed next to each finding. */
export const DesignRule = {
  hex_colour: 'hex-colour',
  colour_function: 'colour-function',
  arbitrary_colour: 'arbitrary-colour',
  inline_style: 'inline-style',
  font_family: 'font-family',
  touch_density: 'touch-density',
  removed_signal: 'removed-signal',
} as const;
export type DesignRule = ValueOf<typeof DesignRule>;

/** What to write instead, printed under the findings of a rule. */
export const FIX: Record<DesignRule, string> = {
  [DesignRule.hex_colour]: 'use a token class (bg-primary, text-status-done-foreground, ...)',
  [DesignRule.colour_function]: 'colour values live only in apps/web/src/styles/theme.css',
  [DesignRule.arbitrary_colour]: 'use a token class instead of an arbitrary colour value',
  [DesignRule.inline_style]:
    'use Tailwind classes; for a runtime value set a CSS variable and ignore the line with a reason',
  [DesignRule.font_family]: 'fonts come from --font-sans and --font-mono (font-sans, font-mono)',
  [DesignRule.touch_density]: 'use data-density="halle" (gate, dock) or "fahrer" (driver)',
  [DesignRule.removed_signal]: 'the signal colour is gone; use status-called-solid',
};

const COLOUR_UTILITY =
  '(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|decoration|divide|shadow|caret|accent|placeholder)';

const PATTERNS: Record<DesignRule, RegExp> = {
  [DesignRule.hex_colour]: /(?<![\w&])(?<!href=["'])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g,
  [DesignRule.colour_function]: /\b(?:oklch|oklab|rgba?|hsla?)\(/g,
  [DesignRule.arbitrary_colour]: new RegExp(
    `\\b${COLOUR_UTILITY}-\\[(?:#|oklch|oklab|rgb|hsl|color:)`,
    'g',
  ),
  [DesignRule.inline_style]: /\bstyle=\{\{/g,
  [DesignRule.font_family]: /\bfont-family\b|\bfontFamily\b/g,
  [DesignRule.touch_density]: /data-density=\\?["']touch\\?["']|\bdensity\s*[:=]\s*["']touch["']/g,
  // tone-* stays: those are the BadgeTone aliases re-pointed to the status tokens (ADR-0021).
  [DesignRule.removed_signal]: new RegExp(
    `\\b${COLOUR_UTILITY}-signal(?:-foreground)?\\b|--(?:color-)?signal\\b`,
    'g',
  ),
};

/** File kinds a rule applies to. Inline style is a JSX construct. */
const APPLIES: Record<DesignRule, (file: string) => boolean> = {
  [DesignRule.hex_colour]: () => true,
  [DesignRule.colour_function]: () => true,
  [DesignRule.arbitrary_colour]: () => true,
  [DesignRule.inline_style]: (file) => file.endsWith('.tsx'),
  [DesignRule.font_family]: () => true,
  [DesignRule.touch_density]: () => true,
  [DesignRule.removed_signal]: () => true,
};

/** A broader rule that a more specific one on the same spot already explains. */
const SHADOWED_BY: Partial<Record<DesignRule, DesignRule>> = {
  [DesignRule.hex_colour]: DesignRule.arbitrary_colour,
  [DesignRule.colour_function]: DesignRule.arbitrary_colour,
};

export const IGNORE_MARK = 'design-check-ignore:';

export interface Finding {
  file: string;
  line: number;
  col: number;
  rule: DesignRule;
  text: string;
}

/** Every rule violation in one file's text. A line carrying `design-check-ignore: <reason>`, or
 * following one, is skipped; the reason is mandatory. */
export function scan(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split('\n');
  lines.forEach((text, i) => {
    if (ignored(text) || (i > 0 && ignored(lines[i - 1] ?? ''))) return;
    const hits = new Map<DesignRule, number[]>();
    for (const rule of Object.values(DesignRule)) {
      if (!APPLIES[rule](file)) continue;
      for (const m of text.matchAll(PATTERNS[rule])) {
        hits.set(rule, [...(hits.get(rule) ?? []), m.index]);
      }
    }
    for (const [rule, cols] of hits) {
      const over = SHADOWED_BY[rule];
      for (const col of cols) {
        if (over && hits.get(over)?.some((c) => c <= col && col - c < 24)) continue;
        findings.push({ file, line: i + 1, col: col + 1, rule, text: text.trim() });
      }
    }
  });
  return findings.sort((a, b) => a.line - b.line || a.col - b.col);
}

function ignored(line: string): boolean {
  const at = line.indexOf(IGNORE_MARK);
  return (
    at >= 0 &&
    line
      .slice(at + IGNORE_MARK.length)
      .replace(/\*\/|\}/g, '')
      .trim().length > 0
  );
}

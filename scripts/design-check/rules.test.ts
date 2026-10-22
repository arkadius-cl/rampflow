import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DesignRule, scan } from './rules.ts';

const rules = (file: string, source: string) => scan(file, source).map((f) => f.rule);

test('reports raw colour values with their line and column', () => {
  const found = scan('a.tsx', 'const a = 1;\n<rect fill="#111" />\n');
  assert.deepEqual(
    found.map((f) => [f.rule, f.line, f.col]),
    [[DesignRule.hex_colour, 2, 13]],
  );
  assert.deepEqual(rules('a.css', '.x { color: #0E6E73; }'), [DesignRule.hex_colour]);
  assert.deepEqual(rules('a.css', '.x { color: oklch(0.4 0.1 250); }'), [
    DesignRule.colour_function,
  ]);
  assert.deepEqual(rules('a.ts', "const c = 'rgba(0,0,0,.4)';"), [DesignRule.colour_function]);
});

test('reports an arbitrary colour class once, not also as a hex colour', () => {
  assert.deepEqual(rules('a.tsx', '<div className="bg-[#fff] text-[oklch(0.1_0_0)]" />'), [
    DesignRule.arbitrary_colour,
    DesignRule.arbitrary_colour,
  ]);
});

test('reports inline style only in tsx, and font families everywhere', () => {
  assert.deepEqual(rules('a.tsx', '<div style={{ top: 4 }} />'), [DesignRule.inline_style]);
  assert.deepEqual(rules('a.ts', 'const s = "style={{";'), []);
  assert.deepEqual(rules('a.css', 'body { font-family: Geist; }'), [DesignRule.font_family]);
  assert.deepEqual(rules('a.tsx', "const s = { fontFamily: 'x' };"), [DesignRule.font_family]);
});

test('reports the removed touch density and signal names, keeps the BadgeTone aliases', () => {
  assert.deepEqual(rules('a.tsx', '<div data-density="touch" />'), [DesignRule.touch_density]);
  assert.deepEqual(rules('a.css', '[data-density="touch"] { }'), [DesignRule.touch_density]);
  assert.deepEqual(rules('a.tsx', '<i className="bg-tone-danger-bg text-signal-foreground" />'), [
    DesignRule.removed_signal,
  ]);
  assert.deepEqual(rules('a.css', '.x { color: var(--signal); }'), [DesignRule.removed_signal]);
});

test('keeps token classes, anchors, entities and the new densities silent', () => {
  const clean = [
    '<a href="#add">x</a>',
    '<span>&#123;</span>',
    '<div className="bg-status-done text-status-done-foreground border-status-done-foreground" />',
    '<div data-density="halle" className="h-control rounded-control shadow-md" />',
    '<div className="bg-status-called-solid font-mono" />',
    'const issue = "B-1042";',
  ].join('\n');
  assert.deepEqual(scan('a.tsx', clean), []);
});

test('skips a line with a reasoned ignore mark, on the line or the line above', () => {
  assert.deepEqual(
    rules('a.tsx', '<rect fill="#000" /> {/* design-check-ignore: QR stays black */}'),
    [],
  );
  assert.deepEqual(
    rules('a.tsx', '// design-check-ignore: runtime position\n<div style={{ top }} />'),
    [],
  );
  assert.deepEqual(rules('a.tsx', '// design-check-ignore:\n<div style={{ top }} />'), [
    DesignRule.inline_style,
  ]);
});

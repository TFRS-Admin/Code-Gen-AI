import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptComponentCode, extractTFRSClasses, getAllTFRSTokens } from './tfrs-adapter';

test('adaptComponentCode: adapts color tokens in a className attribute', () => {
  const original = '<button className="bg-blue-500 text-white">Click</button>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('bg-tfrs-red'));
  assert.ok(adapted.includes('text-tfrs-ink'));
  assert.ok(!adapted.includes('bg-blue-500'));
  assert.ok(!adapted.includes('text-white'));
});

test('adaptComponentCode: passes through already-TFRS-compatible spacing tokens', () => {
  const original = '<div className="p-4 gap-4 space-y-2">Content</div>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('p-4'));
  assert.ok(adapted.includes('gap-4'));
  assert.ok(adapted.includes('space-y-2'));
});

test('adaptComponentCode: adapts hover states to the TFRS command accent', () => {
  const original = '<button className="bg-blue-500 hover:bg-blue-600">Click</button>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('bg-tfrs-red'));
  assert.ok(adapted.includes('hover:bg-tfrs-red-bright'));
});

test('adaptComponentCode: replaces rounded-lg with rounded-sm per the TFRS styling rules', () => {
  const original = '<div className="rounded-lg border-gray-200">Panel</div>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('rounded-sm'));
  assert.ok(!adapted.includes('rounded-lg'));
  assert.ok(adapted.includes('border-tfrs-border'));
});

test('adaptComponentCode: replaces shadow-xl with a tactical border per the TFRS styling rules', () => {
  const original = '<div className="shadow-xl bg-white">Card</div>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('border-tfrs-border-strong'));
  assert.ok(adapted.includes('bg-tfrs-elevated'));
  assert.ok(!adapted.includes('shadow-xl'));
});

test('adaptComponentCode: uppercases generic heading weight per docs/07-design-system.md', () => {
  const original = '<h2 className="font-bold text-xl">Section</h2>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('font-black'));
  assert.ok(adapted.includes('uppercase'));
  assert.ok(adapted.includes('tracking-wider'));
});

test('adaptComponentCode: handles template literal classNames', () => {
  const original = '<div className={`p-4 ${extraClass} bg-blue-500`}>Content</div>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('p-4'));
  assert.ok(adapted.includes('bg-tfrs-red'));
  assert.ok(adapted.includes('${extraClass}'));
});

test('adaptComponentCode: preserves non-mapped layout classes untouched', () => {
  const original = '<div className="flex items-center justify-between">Content</div>';
  const adapted = adaptComponentCode(original);
  assert.ok(adapted.includes('flex'));
  assert.ok(adapted.includes('items-center'));
  assert.ok(adapted.includes('justify-between'));
});

test('extractTFRSClasses: extracts only the TFRS-branded classes present in adapted code', () => {
  const adapted = '<button className="bg-tfrs-red text-tfrs-ink hover:bg-tfrs-red-bright font-black">Click</button>';
  const classes = extractTFRSClasses(adapted);
  assert.ok(classes.includes('bg-tfrs-red'));
  assert.ok(classes.includes('text-tfrs-ink'));
  assert.ok(classes.includes('hover:bg-tfrs-red-bright'));
  assert.ok(!classes.includes('font-black'), 'generic (non-tfrs) utility classes should not be reported as TFRS classes');
});

test('extractTFRSClasses: returns an empty, sorted array for code with no TFRS classes', () => {
  const classes = extractTFRSClasses('<div className="flex gap-2">Content</div>');
  assert.deepEqual(classes, []);
});

test('getAllTFRSTokens: exposes the full mapping without allowing external mutation', () => {
  const tokens = getAllTFRSTokens();
  assert.equal(tokens['bg-blue-500'], 'bg-tfrs-red');
  tokens['bg-blue-500'] = 'mutated';
  assert.equal(getAllTFRSTokens()['bg-blue-500'], 'bg-tfrs-red');
});

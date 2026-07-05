import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAdapter } from './registry';

const DISALLOWED_PACKAGES = ['mui', '@mui/material', 'bootstrap', 'antd', '@chakra-ui/react'];

test('getAdapter: throws for an unknown adapter type', () => {
  assert.throws(() => getAdapter('bogus' as any), /Unknown adapter type: bogus/);
});

test('getAdapter("internal"): returns an adapter whose getAll() yields only internal components with required fields', async () => {
  const adapter = getAdapter('internal');
  const components = await adapter.getAll();

  assert.ok(components.length > 0);
  for (const c of components) {
    assert.equal(c.source, 'internal');
    assert.equal(typeof c.name, 'string');
    assert.ok(c.name.length > 0);
    assert.equal(typeof c.category, 'string');
    assert.equal(typeof c.version, 'string');
    assert.equal(typeof c.license, 'string');
    assert.ok(Array.isArray(c.dependencies));
    assert.ok(Array.isArray(c.tfrsClasses));
    // Internal components ship pre-adapted to the TFRS design system.
    assert.ok(c.tfrsClasses.length > 0, `${c.name} should carry TFRS classes`);
  }
});

test('getAdapter("internal"): search() filters by name/category/description substring, case-insensitively', async () => {
  const adapter = getAdapter('internal');
  const byName = await adapter.search('tacticalcard');
  assert.ok(byName.some((c) => c.name === 'TacticalCard'));

  const byCategory = await adapter.search('data-display');
  assert.ok(byCategory.length > 0);
  assert.ok(byCategory.every((c) => c.category.toLowerCase().includes('data-display')));

  const empty = await adapter.search('');
  const all = await adapter.getAll();
  assert.equal(empty.length, all.length);
});

test('getAdapter("shadcn"): returns an adapter whose getAll() yields only MIT-licensed components with no disallowed dependencies', async () => {
  const adapter = getAdapter('shadcn');
  const components = await adapter.getAll();

  assert.ok(components.length > 0);
  for (const c of components) {
    assert.equal(c.source, 'shadcn');
    assert.equal(c.license, 'MIT');
    assert.ok(Array.isArray(c.dependencies));
    for (const dep of c.dependencies) {
      assert.ok(
        !DISALLOWED_PACKAGES.includes(dep.toLowerCase()),
        `${c.name} depends on disallowed package ${dep}`
      );
    }
  }
});

test('getAdapter("shadcn"): search() matches on component name', async () => {
  const adapter = getAdapter('shadcn');
  const results = await adapter.search('dialog');
  assert.ok(results.some((c) => c.name === 'dialog'));
});

test('getAll(): returns fresh arrays each call so callers cannot mutate the underlying catalog', async () => {
  const adapter = getAdapter('internal');
  const first = await adapter.getAll();
  first[0].dependencies.push('mutated');
  const second = await adapter.getAll();
  assert.ok(!second[0].dependencies.includes('mutated'));
});

import assert from 'node:assert/strict';
import test from 'node:test';

test('preferences default to Letter and left 100% math, validate stored data, and tolerate unavailable storage', async () => {
  const { loadPreferences, savePreferences } = await import('../src/core/preferences');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const defaults = { pageSize: 'Letter', mathAlignment: 'left', mathScale: 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8 };
  assert.deepEqual(loadPreferences(storage), defaults);
  const chosen = { pageSize: 'A4' as const, mathAlignment: 'center' as const, mathScale: 137, lineSpacing: 1.35, paragraphSpacing: 21, bulletLineSpacing: 1.5, bulletSpacing: 12 };
  savePreferences(chosen, storage);
  assert.deepEqual(loadPreferences(storage), chosen);
  assert.deepEqual(JSON.parse(values.get('apetek.preferences.v2')!), chosen);
  values.set('apetek.preferences.v2', '{broken');
  assert.deepEqual(loadPreferences(storage), defaults);
  assert.deepEqual(JSON.parse(values.get('apetek.preferences.v2')!), defaults);
  values.set('apetek.preferences.v2', JSON.stringify({ pageSize: 'Legal', mathAlignment: 'right', mathScale: -100, lineSpacing: 0, paragraphSpacing: 100 }));
  assert.deepEqual(loadPreferences(storage), defaults);
  const blocked = { getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadPreferences(blocked), defaults);
  assert.doesNotThrow(() => savePreferences(chosen, blocked));
});

test('old v2 preferences default to independent single bullet lines and 8px gaps, validating both ranges', async () => {
  const { loadPreferences, savePreferences } = await import('../src/core/preferences');
  const values = new Map<string, string>([['apetek.preferences.v2', JSON.stringify({ mathScale: 137, paragraphSpacing: 21 })]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  assert.equal(loadPreferences(storage).bulletSpacing, 8);
  assert.equal(loadPreferences(storage).bulletLineSpacing, 1);
  assert.equal(loadPreferences(storage).mathScale, 137);
  for (const gap of [0, 12, 40]) {
    savePreferences({ ...loadPreferences(storage), bulletSpacing: gap }, storage);
    assert.equal(loadPreferences(storage).bulletSpacing, gap);
    assert.equal(JSON.parse(values.get('apetek.preferences.v2')!).bulletSpacing, gap);
  }
  for (const gap of [-1, 41, '12', null]) {
    values.set('apetek.preferences.v2', JSON.stringify({ bulletSpacing: gap }));
    assert.equal(loadPreferences(storage).bulletSpacing, 8);
  }
  for (const lineSpacing of [1, 1.5, 3]) {
    savePreferences({ ...loadPreferences(storage), bulletLineSpacing: lineSpacing }, storage);
    assert.equal(loadPreferences(storage).bulletLineSpacing, lineSpacing);
  }
  for (const lineSpacing of [0, 4, '2', null]) {
    values.set('apetek.preferences.v2', JSON.stringify({ bulletLineSpacing: lineSpacing }));
    assert.equal(loadPreferences(storage).bulletLineSpacing, 1);
  }
});

test('v1 preferences migrate physical math size once and v2 accepts integer percentages and finite spacing boundaries', async () => {
  const { loadPreferences, savePreferences } = await import('../src/core/preferences');
  const values = new Map<string, string>([['apetek.preferences.v1', JSON.stringify({ pageSize: 'A4', mathAlignment: 'center', mathScale: 75 })]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const migrated = { pageSize: 'A4', mathAlignment: 'center', mathScale: 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8 };
  assert.deepEqual(loadPreferences(storage), migrated);
  assert.deepEqual(JSON.parse(values.get('apetek.preferences.v2')!), migrated);
  assert.equal(values.has('apetek.preferences.v1'), false);
  assert.deepEqual(loadPreferences(storage), migrated, 'A second load must not multiply math size again.');
  savePreferences({ pageSize: 'Letter', mathAlignment: 'left', mathScale: 137, lineSpacing: 3, paragraphSpacing: 0, bulletLineSpacing: 3, bulletSpacing: 40 }, storage);
  assert.equal(loadPreferences(storage).mathScale, 137);
  assert.equal(loadPreferences(storage).lineSpacing, 3);
  assert.equal(loadPreferences(storage).paragraphSpacing, 0);
  values.set('apetek.preferences.v2', JSON.stringify({ mathScale: 137.5, lineSpacing: '2', paragraphSpacing: -1 }));
  assert.deepEqual(loadPreferences(storage), { pageSize: 'Letter', mathAlignment: 'left', mathScale: 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8 });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RevisionRenderer } from '../src/core/revisions';

test('late render completion cannot replace a newer preview and readers await the newest result', async () => {
  const commits: string[] = [];
  let finishOld!: (value: string) => void;
  let finishNew!: (value: string) => void;
  const renderer = new RevisionRenderer<string>(value => commits.push(value));
  renderer.update(() => new Promise(resolve => { finishOld = resolve; }));
  const reading = renderer.current();
  renderer.update(() => new Promise(resolve => { finishNew = resolve; }));
  finishNew('new');
  finishOld('old');
  assert.equal(await reading, 'new');
  assert.deepEqual(commits, ['new']);
});

test('a superseded failed render cannot fail a reader waiting for the newest document', async () => {
  let rejectOld!: (error: Error) => void;
  const renderer = new RevisionRenderer<string>(() => {});
  renderer.update(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  const reading = renderer.current();
  renderer.update(async () => 'newest');
  rejectOld(new Error('obsolete failure'));
  assert.equal(await reading, 'newest');
});

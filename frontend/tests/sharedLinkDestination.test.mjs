import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual TypeScript destination policy without introducing a test-runtime dependency.
const source = readFileSync(new URL('../src/features/shared-links/sharedLinkDestination.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const policy = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const post = '/post/123456789012345678901234';
const profile = '/profile/aaaaaaaaaaaaaaaaaaaaaaaa';

test('copied post and profile destinations survive login/signup', () => {
  assert.equal(policy.sharedLinkReturn({ search: `?next=${encodeURIComponent(post)}`, state: null }), post);
  assert.equal(policy.sharedLinkReturn({ search: '', state: { from: profile } }), profile);
  assert.equal(policy.sharedLinkAuthURL('/signup', post), `/signup?next=${encodeURIComponent(post)}`);
  assert.equal(policy.sharedLinkAuthURL('/login', profile), `/login?next=${encodeURIComponent(profile)}`);
});
test('ordinary login/signup retain their current destinations', () => {
  assert.equal(policy.sharedLinkReturn({ search: '', state: null }), null);
  assert.equal(policy.sharedLinkAuthURL('/signup', null), '/signup');
  assert.equal(policy.sharedLinkAuthURL('/login', null), '/login');
});
test('external, protocol-relative, script and malformed redirects are rejected', () => {
  for (const value of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/post/bad', `${post}/extra`, `${post}?next=//evil.example`, `${profile}#evil`, ` ${post}`, null, 12]) {
    assert.equal(policy.sharedLinkDestination(value), null, String(value));
  }
});
test('a safe router destination can recover from an unsafe next query', () => {
  assert.equal(policy.sharedLinkReturn({ search: '?next=https://evil.example', state: { from: post } }), post);
  assert.equal(policy.sharedLinkAuthURL('/signup', '//evil.example'), '/signup');
});

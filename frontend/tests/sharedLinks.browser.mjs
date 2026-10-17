import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.SHARED_LINK_TEST_URL || 'http://127.0.0.1:4179';
const POST = '123456789012345678901234', TEXT = '222222222222222222222222', AUTHOR = 'aaaaaaaaaaaaaaaaaaaaaaaa', VIEWER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const image = { id: POST, user_id: AUTHOR, user: { id: AUTHOR, first_name: 'Shared', last_name: 'Author' }, type: 'image', caption: 'Copied media post fixture', media: [{ id: 'photo', url: `${BASE}/fixture.svg`, type: 'image', order: 0 }], likes_count: 0, comments_count: 0, shares_count: 0, is_self: false, is_following: false, created_at: '2026-10-16T10:00:00Z', updated_at: '2026-10-16T10:00:00Z' };
const text = { ...image, id: TEXT, type: 'text', caption: 'Copied text post fixture', text: 'Copied text post fixture', media: [], text_background: { kind: 'solid', value: '#d4efff' }, text_color: '#111827', text_style: 'bold_center' };
const profile = { id: AUTHOR, first_name: 'Shared', last_name: 'Author', bio: 'Copied profile fixture', followers_count: 2, following_count: 1, posts_count: 2, is_self: false, is_following: false, can_message: true };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] });
let passed = 0;
async function run(name, test, options = {}) {
 const ctx = await browser.newContext(options), controls = { meStatus: 200, postStatus: 200 };
 await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/fixture.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d4efff"/></svg>' });
  if (url.pathname.startsWith('/api/')) {
   const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
   if (url.pathname === '/api/auth/me') return json(controls.meStatus === 200 ? { id: VIEWER, first_name: 'Viewer', last_name: 'Account' } : { error: 'Session unavailable' }, controls.meStatus);
   if (['/api/auth/login', '/api/auth/signup'].includes(url.pathname)) return json({ token: 'valid-session', user: { id: VIEWER } });
   if ([`/api/posts/${POST}`, `/api/posts/${TEXT}`].includes(url.pathname)) return json(controls.postStatus === 200 ? { post: url.pathname.endsWith(TEXT) ? text : image } : { error: 'Unavailable' }, controls.postStatus);
   if (url.pathname === `/api/users/${AUTHOR}/profile`) return json({ profile });
   if (url.pathname.includes('/reactions')) return json({ reactions: [], total: 0, counts: {}, my_reaction: null });
   if (url.pathname.includes('/comments')) return json({ comments: [], has_more: false });
   if (url.pathname.includes('/verified-badges')) return json({ badges: [] });
   if (url.pathname.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: '' });
   if (url.pathname.includes('/notifications')) return json({ items: [], notifications: [], unread_count: 0, has_more: false });
   return json({ posts: [], has_more: false, next_cursor: '', users: [], followers: [], following: [] });
  }
  if (url.origin !== BASE) return route.abort();
  return route.continue();
 });
 const page = await ctx.newPage(), errors = [];
 page.on('pageerror', e => errors.push(e.message));
 try { await test(page, controls, ctx); assert.deepEqual(errors, [], `Uncaught errors: ${name}`); passed++; console.log(`PASS ${name}`); }
 catch (error) { console.error(`FAIL ${name}; URL ${page.url()}; ${await page.locator('body').innerText().catch(() => '')}`); throw error; }
 finally { await ctx.close(); }
}
const login = (page, token = 'valid-session') => page.addInitScript(token => sessionStorage.setItem('token', token), token);
const see = (page, value) => page.getByText(value, { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
try {
 for (const path of [`/post/${POST}`, `/profile/${AUTHOR}`]) await run(`signed out ${path.split('/')[1]} goes to signup`, async page => {
  await page.goto(`${BASE}${path}`); await page.waitForURL(u => u.pathname === '/signup', { timeout: 20000 });
  assert.equal(new URL(page.url()).searchParams.get('next'), path); await page.getByPlaceholder('Email or Phone').waitFor();
 });
 await run('signed in media link and refresh', async page => { await login(page); await page.goto(`${BASE}/post/${POST}`); await see(page, image.caption); await page.reload(); await see(page, image.caption); });
 await run('signed in text post', async page => { await login(page); await page.goto(`${BASE}/post/${TEXT}`); await see(page, text.text); });
 await run('signed in copied profile', async page => { await login(page); await page.goto(`${BASE}/profile/${AUTHOR}`); await see(page, profile.bio); });
 await run('expired session goes to signup', async (page, control) => { control.meStatus = 401; await login(page, 'expired-session'); await page.goto(`${BASE}/post/${POST}`); await page.waitForURL(u => u.pathname === '/signup'); assert.equal(await page.evaluate(() => sessionStorage.getItem('token')), null); });
 await run('server failure keeps session and retries', async (page, control) => { control.meStatus = 503; await login(page); await page.goto(`${BASE}/post/${POST}`); await see(page, 'Unable to open this link'); assert.equal(await page.evaluate(() => sessionStorage.getItem('token')), 'valid-session'); control.meStatus = 200; await page.getByRole('button', { name: 'Try again' }).click(); await see(page, image.caption); });
 await run('deleted post displays unavailable state', async (page, control) => { control.postStatus = 404; await login(page); await page.goto(`${BASE}/post/${POST}`); await see(page, 'Post unavailable'); });
 await run('fresh tab restores already-open session', async (page, _control, ctx) => { await login(page); await page.goto(`${BASE}/post/${POST}`); await see(page, image.caption); const next = await ctx.newPage(); await next.goto(`${BASE}/profile/${AUTHOR}`); await see(next, profile.bio); assert.equal(await next.evaluate(() => sessionStorage.getItem('token')), 'valid-session'); });
 await run('signup to login returns to copied post', async page => {
  await page.goto(`${BASE}/post/${POST}`); await page.waitForURL(u => u.pathname === '/signup'); await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.waitForURL(u => u.pathname === '/login'); await page.getByRole('heading', { name: 'Sign In to your Account', exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.get('next'), `/post/${POST}`);
  await page.getByPlaceholder('Email or Phone').fill('shared-link-test@example.com'); await page.getByPlaceholder('Password', { exact: true }).fill('CopyLink!4826'); await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.waitForURL(u => u.pathname === `/post/${POST}`); await see(page, image.caption);
 });
 await run('completed signup returns to copied profile', async page => {
  await page.goto(`${BASE}/profile/${AUTHOR}`); await page.waitForURL(u => u.pathname === '/signup');
  await page.getByPlaceholder('Email or Phone').fill('shared-link-test@example.com'); await page.getByPlaceholder('Password', { exact: true }).fill('CopyLink!4826'); await page.locator('#signup-policy-agreement').check(); await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByPlaceholder('First name', { exact: true }).fill('Shared'); await page.getByPlaceholder('Last name', { exact: true }).fill('Viewer'); await page.getByLabel('Gender', { exact: true }).selectOption('other'); await page.getByLabel('Birth year').selectOption('1996'); await page.getByLabel('Birth month').selectOption('1'); await page.getByLabel('Birth day').selectOption('2');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click(); await page.waitForURL(u => u.pathname === `/profile/${AUTHOR}`); await see(page, profile.bio);
 });
 await run('mobile link fits viewport', async page => { await login(page); await page.goto(`${BASE}/post/${TEXT}`); await see(page, text.text); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }, { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
 console.log(`Browser flows passed: ${passed}`);
} finally { await browser.close(); }

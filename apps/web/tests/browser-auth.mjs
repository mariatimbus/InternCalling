/** Local integration tests over Chrome DevTools Protocol; no browser automation dependency required. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = "http://127.0.0.1:3102";
const control = async (input) => (await fetch("http://127.0.0.1:8300/__test", input ? { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } } : {})).json();
const pages = await (await fetch("http://127.0.0.1:9224/json/list")).json();
const ws = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
ws.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id) { const task = pending.get(message.id); pending.delete(message.id); if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result); } };
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(expression) { for (let i = 0; i < 400; i++) { try { if (await evaluate(`!!(${expression})`)) return; } catch { /* Navigation can replace the execution context. */ } await sleep(50); } throw new Error(`Timed out: ${expression}`); }
async function check(name, expression) { assert.ok(await evaluate(expression), name); console.log(`PASS: ${name}`); }
async function navigate(route) { await send("Page.navigate", { url: origin + route }); await until("document.readyState === 'complete'"); }
async function click(expression) { const point = await evaluate(`(() => { const element = (${expression}); if (!element) throw Error('Control missing'); element.scrollIntoView({ block: 'center' }); const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }); await sleep(100); }
const button = (text) => `[...document.querySelectorAll('button')].find(element => element.textContent === ${JSON.stringify(text)} && element.getClientRects().length)`;
async function press(text) { await click(button(text)); }
async function input(selector, value) { await click(`document.querySelector(${JSON.stringify(selector)})`); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 }); await send("Input.insertText", { text: value }); }
async function viewport(width, height = 1000) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
const artifacts = path.join(tmpdir(), "interncalling-b3-review"); await mkdir(artifacts, { recursive: true });
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(result.data, "base64")); }
async function signIn(email, password) { await navigate("/sign-in"); await until("document.querySelector('input[name=email]')"); await input("input[name=email]", email); await input("input[name=password]", password); await press("Sign in"); }
async function signOut() { await navigate("/settings"); await until("location.pathname === '/settings' && document.querySelector('h1')?.textContent === 'Account settings'"); await press("Sign out"); await until("location.pathname === '/sign-in'"); }
async function watchSecondTab() {
  const { targetId } = await send("Target.createTarget", { url: origin + "/profile", background: true });
  const targets = await (await fetch("http://127.0.0.1:9224/json/list")).json();
  const other = new WebSocket(targets.find((page) => page.id === targetId).webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { other.onopen = resolve; other.onerror = reject; });
  let id = 0; const tasks = new Map();
  other.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id) { const resolve = tasks.get(message.id); tasks.delete(message.id); resolve(message.result); } };
  async function wait(expression) {
    for (let i = 0; i < 200; i++) {
      const result = await new Promise((resolve) => { const current = ++id; tasks.set(current, resolve); other.send(JSON.stringify({ id: current, method: "Runtime.evaluate", params: { expression: `!!(${expression})`, returnByValue: true } })); });
      if (result?.result?.value) return; await sleep(50);
    }
    throw Error("Second tab did not reach the expected state");
  }
  return { wait, close: async () => { other.close(); await send("Target.closeTarget", { targetId }); } };
}

try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.clearBrowserCookies"); await viewport(1440);
  await control({ reset: true });
  for (const route of ["/jobs", "/profile", "/applications", "/settings", "/onboarding"]) {
    const response = await fetch(origin + route, { redirect: "manual" });
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get("location"), origin).pathname, "/sign-in");
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  console.log("PASS: all protected routes redirect before returning private content and disable caching");
  const password = randomUUID() + "aA1!", email = `new-${randomUUID()}@example.test`;
  await signIn(email, password); await until("document.querySelector('[role=alert]')?.textContent.includes('Check your email and password')");
  console.log("PASS: invalid credentials show a useful message");
  await navigate("/sign-up"); await until("document.querySelector('input[name=email]')"); await screenshot("sign-up-desktop");
  await input("input[name=email]", email); await input("input[name=password]", password); await press("Create account");
  await until("location.pathname === '/onboarding' && document.querySelector('h1')?.textContent.includes('Set up your profile')");
  await check("new account enters onboarding with one main landmark and one form", "document.querySelectorAll('main').length === 1 && document.querySelectorAll('form').length === 1");
  await screenshot("onboarding-desktop");
  await click("document.querySelector('input[value=bachelor]')");
  for (const [name, value] of [["university", "Local Test University"], ["field_of_study", "Computer Science"], ["graduation_year", "2027"], ["location", "Bucharest, Romania"]]) await input(`input[name=${name}]`, value);
  await viewport(320, 812); await screenshot("onboarding-mobile");
  await check("onboarding fits a 320px viewport", "document.documentElement.scrollWidth === innerWidth");
  await control({ failProfile: true }); await press("Show my internships"); await until("document.querySelector('[role=alert]')?.textContent.includes('could not reach')");
  let state = await control(); const writes = state.events.filter((event) => ["PUT", "PATCH"].includes(event.type));
  assert.equal(writes.at(-2).path, "/api/v1/profile/skills"); assert.equal(writes.at(-1).path, "/api/v1/profile"); assert.equal(state.profiles[0].profile.degree_level, null);
  console.log("PASS: failed final save keeps profile incomplete; skills are persisted before the profile");
  await control({ failProfile: false }); await press("Show my internships"); await until("location.pathname === '/jobs' && document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 3");
  await viewport(1440); await screenshot("jobs-desktop");
  await check("real feed reuses rounded cards with actual match scores", "document.body.textContent.includes('84') && !document.body.textContent.includes('Illustrative demo') && !document.body.textContent.includes('Demo student') && parseFloat(getComputedStyle(document.querySelector('article')).borderTopLeftRadius) >= 20");
  await check("desktop split panel remains visible", "document.querySelector('[aria-label=\"Selected opportunity\"]').getBoundingClientRect().width > 0");
  await send("Page.reload"); await until("location.pathname === '/jobs' && document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 3"); console.log("PASS: session and completed profile survive refresh");
  await navigate("/onboarding"); await until("location.pathname === '/jobs'"); console.log("PASS: completed user skips onboarding");
  await input("input[name=q]", "Data"); await press("Search"); await until("document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 1"); console.log("PASS: search uses the backend search parameter");
  await viewport(320, 812); await screenshot("jobs-mobile"); await check("jobs fit mobile without horizontal overflow", "document.documentElement.scrollWidth === innerWidth");
  await click("document.querySelector('article h3 button')"); await until("document.querySelector('dialog[open]')"); await screenshot("detail-mobile");
  await check("mobile detail is an accessible dialog", "document.querySelector('dialog[open]').contains(document.activeElement)"); await press("Close");
  await navigate("/profile"); await until("document.body.textContent.includes('Local Test University')");
  await check("profile and skills reflect persisted answers", "document.body.textContent.includes('python') && document.body.textContent.includes('2027')");
  await viewport(1440); await control({ wrongOwner: true }); await navigate("/jobs"); await until("document.body.textContent.includes('temporarily unavailable')");
  await check("mismatched profile owner fails closed", "!document.querySelector('article h3') && !document.body.textContent.includes('Local Test University')");
  await control({ wrongOwner: false, apiOffline: true }); await navigate("/jobs"); await until("document.body.textContent.includes('temporarily unavailable')"); console.log("PASS: API failure shows a safe recovery page");
  await control({ apiOffline: false, failMatch: true }); await navigate("/jobs"); await until("document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 3");
  await check("matching failure keeps jobs usable without fabricated scores", "document.body.textContent.includes('Your match is currently unavailable') && !document.body.textContent.includes('84%')");
  await control({ failMatch: false });
  const other = await watchSecondTab();
  try {
    await other.wait("document.body.innerText.includes('Local Test University')");
    await signOut();
    await other.wait("location.pathname === '/sign-in' && !document.body.innerText.includes('Local Test University')");
    console.log("PASS: signing out hides private content in another open tab");
  } finally { await other.close(); }
  const privateEntry = (await send("Page.getNavigationHistory")).entries.findLast((entry) => entry.url.startsWith(origin) && /^\/(jobs|profile|settings)(\?|$)/.test(new URL(entry.url).pathname));
  assert.ok(privateEntry, "a previous private page remains in browser history");
  await send("Page.navigateToHistoryEntry", { entryId: privateEntry.id }); await until("location.pathname === '/sign-in'");
  console.log("PASS: sign-out and browser Back do not restore the private page");
  const second = `returning-${randomUUID()}@example.test`;
  await control({ seed: { email: second, password, completed: true } }); await signIn(second, password); await until("location.pathname === '/jobs' && document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 3");
  await navigate("/profile"); await until("document.body.textContent.includes('Second Test University')"); await check("second user sees only their own profile", "!document.body.textContent.includes('Local Test University') && !document.body.textContent.includes('python')");
  await control({ authOffline: true }); await navigate("/jobs");
  await until("document.body.textContent.includes('temporarily unavailable')");
  await check("provider outage fails closed without showing the private workspace", "!document.querySelector('[aria-label=\"Recommended opportunities\"]')");
  await control({ authOffline: false }); await navigate("/profile"); await until("document.body.textContent.includes('Second Test University')");
  console.log("PASS: provider recovery preserves the existing session");
  await signOut(); await control({ shortSession: true }); await signIn(second, password); await until("location.pathname === '/jobs' && document.querySelectorAll('[aria-label=\"Recommended opportunities\" ] article h3').length === 3");
  state = await control(); assert.ok(state.events.some((event) => event.type === "refresh")); console.log("PASS: expiring provider session refreshes through official SDK cookies");
  await control({ shortSession: false, revoked: true }); await navigate("/jobs"); await until("location.pathname === '/sign-in'"); console.log("PASS: revoked session cannot access protected content"); await control({ revoked: false }); await send("Network.clearBrowserCookies");
  await control({ confirmEmail: true }); const confirmed = `confirm-${randomUUID()}@example.test`;
  await navigate("/sign-up"); await until("document.querySelector('input[name=email]')"); await input("input[name=email]", confirmed); await input("input[name=password]", password); await press("Create account");
  await until("document.querySelector('[role=status]')?.textContent.includes('Check your email')"); state = await control();
  await control({ emailRateLimit: true });
  await navigate("/sign-up"); await until("document.querySelector('input[name=email]')");
  await input("input[name=email]", confirmed); await input("input[name=password]", password); await press("Create account");
  await until("document.querySelector('[role=alert]')?.textContent.includes('Confirmation emails are temporarily limited')");
  await control({ emailRateLimit: false });
  await navigate(`/auth/callback?code=${encodeURIComponent(state.confirmationCode)}`); await until("location.pathname === '/onboarding'"); console.log("PASS: an earlier confirmation link remains usable after a rejected sign-up; PKCE enters onboarding");
  await send("Network.clearBrowserCookies"); await control({ confirmEmail: false, rateLimit: true }); await signIn(second, password);
  await until("document.querySelector('[role=alert]')?.textContent.includes('Too many authentication requests')"); console.log("PASS: rate limiting shows a useful message");
  await control({ rateLimit: false, emailRateLimit: true });
  await navigate("/sign-up"); await until("document.querySelector('input[name=email]')");
  await input("input[name=email]", `email-limit-${randomUUID()}@example.test`); await input("input[name=password]", password); await press("Create account");
  await until("document.querySelector('[role=alert]')?.textContent.includes('Confirmation emails are temporarily limited')");
  await check("email quota shows inbox guidance without a misleading minutes promise", "document.querySelector('[role=alert]').textContent.includes('inbox and spam') && !document.querySelector('[role=alert]').textContent.includes('few minutes')");
  await control({ emailRateLimit: false });
  await navigate("/sign-in"); await until("document.querySelector('input[name=email]')");
  await check("Google is available as a separate action without email validation", "[...document.querySelectorAll('button')].some(button => button.textContent === 'Continue with Google') && document.querySelectorAll('main form').length === 2");
  await screenshot("google-sign-in-desktop");
  await press("Continue with Google"); await until("document.querySelector('[role=alert]')?.textContent.includes('currently unavailable')");
  await check("disabled Google provider keeps email sign-in usable", "location.pathname === '/sign-in' && !document.querySelector('input[name=email]').disabled");
  await control({ googleEnabled: true, authOffline: true }); await press("Continue with Google");
  await until("document.querySelector('[role=alert]')?.textContent.includes('could not connect')"); console.log("PASS: Google provider network failure shows a recoverable message");
  await control({ authOffline: false, googleDeny: true }); await press("Continue with Google");
  await until("location.pathname === '/sign-in' && document.querySelector('[role=status]')?.textContent.includes('cancelled')");
  await check("cancelled Google consent returns safely without upstream error details", "!document.body.textContent.includes('upstream-detail-must-not-be-displayed')");
  await control({ googleDeny: false }); await navigate("/sign-up"); await until("document.querySelector('input[name=email]')");
  await viewport(320, 812); await screenshot("google-sign-up-mobile");
  await check("Google button fits the mobile sign-up page", "document.documentElement.scrollWidth === innerWidth && [...document.querySelectorAll('button')].some(button => button.textContent === 'Continue with Google')");
  await press("Continue with Google"); await until("location.pathname === '/onboarding' && document.querySelector('h1')?.textContent.includes('Set up your profile')");
  state = await control(); assert.ok(state.events.some((event) => event.type === "google-oauth" && event.pkce && event.prompt === "select_account"));
  console.log("PASS: new Google user completes SDK PKCE callback and enters onboarding");
  await press("Sign out"); await until("location.pathname === '/sign-in'");
  await control({ seed: { email: "google-only@example.test", password, completed: true } });
  await press("Continue with Google"); await until("location.pathname === '/jobs' && document.querySelectorAll('[aria-label=\"Recommended opportunities\"] article h3').length === 3");
  await check("returning Google user skips onboarding and sees their jobs", "!document.body.textContent.includes('Set up your profile')");
  await signOut();
  for (const path of ["/sign-in", "/sign-up"]) {
    await navigate(path); await until("document.querySelector('input[name=email]')");
    await check("Apple is hidden while Google and LinkedIn remain available", "['Google','LinkedIn'].every(name => [...document.querySelectorAll('button')].some(button => button.textContent === 'Continue with ' + name)) && ![...document.querySelectorAll('button')].some(button => button.textContent.includes('Apple'))");
  }
  for (const [provider, name, setting] of [["linkedin_oidc", "LinkedIn", "linkedinEnabled"]]) {
    await navigate("/sign-in"); await until("document.querySelector('input[name=email]')");
    await press(`Continue with ${name}`); await until(`document.querySelector('[role=alert]')?.textContent.includes('${name} sign-in is currently unavailable')`);
    await control({ [setting]: true, deniedProvider: provider }); await press(`Continue with ${name}`);
    await until(`document.querySelector('[role=status]')?.textContent.includes('${name} sign-in was cancelled')`);
    await control({ deniedProvider: null }); await press(`Continue with ${name}`);
    await until("location.pathname === '/onboarding'");
    await press("Sign out"); await until("location.pathname === '/sign-in'");
    await control({ seed: { email: `${provider}-only@example.test`, password, completed: true } });
    await press(`Continue with ${name}`); await until("location.pathname === '/jobs'");
    await signOut();
    console.log(`PASS: ${name} disabled recovery, cancellation, PKCE, new-user onboarding and returning-user access`);
  }
  console.log(`Browser checks passed. Screenshots: ${artifacts}`);
} finally { ws.close(); }

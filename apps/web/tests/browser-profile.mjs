/** Local integration tests over Chrome DevTools Protocol; no browser automation dependency required. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = "http://127.0.0.1:3102";
const control = async (input) => (await fetch("http://127.0.0.1:8300/__test", input ? { method: "POST", body: JSON.stringify(input), headers: { "Content-Type": "application/json" } } : {})).json();
const pages = await (await fetch("http://127.0.0.1:9338/json/list")).json();
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
const artifacts = path.resolve(".next/b4-browser-review"); await mkdir(artifacts, { recursive: true });
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(result.data, "base64")); }
async function signIn(email, password) { await navigate("/sign-in"); await until("document.querySelector('input[name=email]')"); await input("input[name=email]", email); await input("input[name=password]", password); await press("Sign in"); }
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.clearBrowserCookies"); await viewport(1440);
  const email = "profile-editor@example.test", password = "B4SyntheticTestOnly123!";
  await control({ reset: true }); await control({ seed: { email, password, completed: true, skills: ["python"] } });
  await signIn(email, password); await until("location.pathname === '/jobs'");
  await navigate("/profile"); await until("[...document.querySelectorAll('button')].some(b => b.textContent === 'Edit profile')");
  await check("missing headline/bio show Not provided; existing skills remain visible", "document.querySelectorAll('dd').length === 7 && [...document.querySelectorAll('dd')].filter(x=>x.textContent === 'Not provided').length === 2 && document.body.textContent.includes('python')");
  await press("Edit profile"); await until("document.querySelector('input[name=headline]')");
  await input("input[name=headline]", "Discard this edit"); await input("textarea[name=bio]", "Discard this bio"); await press("Cancel");
  assert.equal((await control()).events.filter(x=>x.type === "profile-patch").length, 0);
  await press("Edit profile"); await until("document.querySelector('input[name=headline]')");
  await check("Cancel discards both edits without an API write", "document.querySelector('input[name=headline]').value === '' && document.querySelector('textarea[name=bio]').value === ''");
  await input("input[name=headline]", "Profile browser headline"); await press("Save"); await until("document.querySelector('[role=status]')?.textContent === 'Profile saved.'");
  let state = await control(); let patches = state.events.filter(x=>x.type === "profile-patch");
  assert.deepEqual(patches[0].body, { headline: "Profile browser headline" }); assert.equal(state.profiles[0].skills[0].name, "python");
  console.log("PASS: only changed headline is PATCHed; skills and other profile values persist");
  await navigate("/profile"); await until("document.body.textContent.includes('Profile browser headline')");
  await press("Edit profile"); await until("document.querySelector('textarea[name=bio]')");
  await input("textarea[name=bio]", "Retryable bio"); await control({ failProfile: true }); await press("Save");
  await until("document.querySelector('[role=alert]')?.textContent.includes('try Save again')");
  await check("failed save preserves entered bio and enables retry/cancel", "document.querySelector('textarea[name=bio]').value === 'Retryable bio' && [...document.querySelectorAll('button')].some(b=>b.textContent === 'Save' && !b.disabled) && [...document.querySelectorAll('button')].some(b=>b.textContent === 'Cancel' && !b.disabled)");
  await control({ failProfile: false, profileDelay: true });
  const before = (await control()).events.filter(x=>x.type === "profile-patch").length;
  await evaluate("(()=>{const f=document.querySelector('textarea[name=bio]').closest('form'); f.requestSubmit(); f.requestSubmit(); return true})()");
  await until("document.querySelector('form[aria-busy=true]')");
  await check("saving disables Save and Cancel and announces progress", "[...document.querySelectorAll('button')].some(b=>b.textContent.startsWith('Saving') && b.disabled) && [...document.querySelectorAll('button')].some(b=>b.textContent === 'Cancel' && b.disabled)");
  await until("document.querySelector('[role=status]')?.textContent === 'Profile saved.'");
  state = await control(); patches = state.events.filter(x=>x.type === "profile-patch");
  assert.equal(patches.length, before + 1); assert.deepEqual(patches.at(-1).body, { bio: "Retryable bio" });
  console.log("PASS: retry succeeds and duplicate submissions produce only one PATCH");
  await control({ profileDelay: false }); await press("Edit profile"); await until("document.querySelector('input[name=graduation_year]')");
  await input("input[name=graduation_year]", "9999"); await press("Save"); await until("document.querySelector('input[name=graduation_year]')?.getAttribute('aria-invalid') === 'true'");
  assert.equal((await control()).events.filter(x=>x.type === "profile-patch").length, patches.length);
  await press("Cancel"); await press("Edit profile"); await until("document.querySelector('textarea[name=bio]')");
  await input("textarea[name=bio]", ""); await input("input[name=graduation_year]", ""); await press("Save");
  await until("document.querySelector('[role=status]')?.textContent === 'Profile saved.'");
  state = await control(); assert.deepEqual(state.events.filter(x=>x.type === "profile-patch").at(-1).body, { bio: null, graduation_year: null });
  await navigate("/profile"); await until("document.querySelectorAll('dd').length === 7");
  await check("cleared persisted fields show Not provided and profile remains editable", "[...document.querySelectorAll('dd')].filter(x=>x.textContent === 'Not provided').length === 2 && [...document.querySelectorAll('button')].some(b=>b.textContent === 'Edit profile')");
  await navigate("/jobs"); await until("location.pathname === '/onboarding'");
  await navigate("/settings"); await until("location.pathname === '/onboarding'");
  await navigate("/applications"); await until("location.pathname === '/onboarding'");
  console.log("PASS: existing completion guards remain on Jobs, Settings and Applications");
  await navigate("/profile"); await until("[...document.querySelectorAll('button')].some(b=>b.textContent === 'Edit profile')");
  await press("Edit profile"); await until("document.querySelector('input[name=graduation_year]')");
  await input("input[name=graduation_year]", "2026"); await press("Save"); await until("document.querySelector('[role=status]')?.textContent === 'Profile saved.'");
  await screenshot("profile-desktop"); await viewport(320, 1000); await press("Edit profile"); await until("document.querySelector('textarea[name=bio]')");
  await check("mobile form fits and keeps original rounded inputs", "document.documentElement.scrollWidth === innerWidth && getComputedStyle(document.querySelector('input[name=headline]')).borderRadius === '24px'");
  await screenshot("profile-edit-mobile"); await press("Cancel");
  console.log("B4 profile browser checks passed with synthetic loopback services; no hosted accounts/data were used.");
} finally { ws.close(); }

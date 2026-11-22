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
const artifacts = path.resolve(".next/b4-skills-browser-review"); await mkdir(artifacts, { recursive: true });
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(result.data, "base64")); }
async function signIn(email, password) { await navigate("/sign-in"); await until("document.querySelector('input[name=email]')"); await input("input[name=email]", email); await input("input[name=password]", password); await press("Sign in"); }
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.clearBrowserCookies"); await viewport(1440);
  const email = "skills-profile@example.test", password = "B4SyntheticTestOnly123!";
  await control({ reset: true }); await control({ seed: { email, password, completed: true, skills: ["python"] } });
  await signIn(email, password); await until("location.pathname === '/jobs'");
  await navigate("/profile"); await until("document.querySelector('input[role=combobox]:not(:disabled)')");
  await until("!document.body.textContent.includes('Loading skill suggestions')"); await sleep(200);
  await check("authenticated persisted skills are shown", "!!document.querySelector('button[aria-label=\"Remove python\"]')");
  await input("input[name=skill]", "PyThOn");
  await until("document.body.textContent.includes('already added')");
  await check("duplicates are rejected case-insensitively", "[...document.querySelectorAll('button')].some(b=>b.textContent === 'Add skill' && b.disabled) && document.body.textContent.includes('already added')");
  await press("Edit profile"); await input("input[name=headline]", "Unsaved draft");
  await input("input[name=skill]", "ReA");
  await until("document.querySelector('[role=option]')?.textContent === 'react'");
  await send("Input.dispatchKeyEvent", {type:"keyDown", key:"ArrowDown", code:"ArrowDown", windowsVirtualKeyCode:40});
  await check("keyboard selection has an accessible active descendant", "!!document.querySelector('[role=combobox]').getAttribute('aria-activedescendant')");
  await control({skillsDelay:true});
  await send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
  await until("document.body.textContent.includes('Saving skill changes')");
  await check("pending UI keeps previous persisted list and disables submissions", "!document.querySelector('button[aria-label=\"Remove react\"]') && document.querySelector('input[name=skill]').disabled");
  await until("document.querySelector('button[aria-label=\"Remove react\"]')");
  await check("skill revalidation preserves profile editing draft", "document.querySelector('input[name=headline]').value === 'Unsaved draft'");
  await press("Cancel"); await control({skillsDelay:false});
  await input("input[name=skill]", "  CI/CD  "); await until("document.body.textContent.includes('No matching suggestions')");
  await press("Add skill"); await until("document.querySelector('button[aria-label=\"Remove ci/cd\"]')");
  await navigate("/profile"); await until("document.querySelector('button[aria-label=\"Remove ci/cd\"]')");
  console.log("PASS: custom skills normalize and persist after reload");
  await control({failSkills:true}); await click("document.querySelector('button[aria-label=\"Remove react\"]')");
  await until("[...document.querySelectorAll('button')].some(b=>b.textContent === 'Retry skill change')");
  await check("failed removal retains the previous confirmed skill", "!!document.querySelector('button[aria-label=\"Remove react\"]')");
  await control({failSkills:false}); await press("Retry skill change");
  await until("!document.querySelector('button[aria-label=\"Remove react\"]') && document.body.textContent.includes('Skill removed.')");
  await sleep(250); await click("document.querySelector('button[aria-label=\"Remove ci/cd\"]')");
  await until("!document.querySelector('button[aria-label=\"Remove ci/cd\"]')");
  let state = await control();
  assert.deepEqual(state.events.filter(x=>x.type === "skill-mutation").at(-1).body, {names:["python"]});
  console.log("PASS: retry removes persisted skill; slash-name removal preserves remaining skills");
  await control({catalogOffline:true}); await navigate("/profile"); await until("document.body.textContent.includes('Retry suggestions')");
  await input("input[name=skill]", "rust"); await press("Add skill"); await until("document.querySelector('button[aria-label=\"Remove rust\"]')");
  await control({catalogOffline:false}); await press("Retry suggestions"); await until("!document.body.textContent.includes('Retry suggestions')");
  console.log("PASS: suggestions failure is retryable and does not block valid custom skills");
  await control({skillsReadOffline:true}); await navigate("/profile");
  await until("document.body.textContent.includes('Retry loading skills')");
  await check("initial selected-skills failure is not shown as an empty list", "document.querySelector('input[name=skill]').disabled && !document.body.textContent.includes('No skills added yet.')");
  await control({skillsReadOffline:false}); await press("Retry loading skills"); await until("document.querySelector('button[aria-label=\"Remove rust\"]')");
  await control({skillsDelay:true}); await input("input[name=skill]", "go");
  const before = (await control()).events.filter(x=>x.type === "skill-mutation").length;
  await evaluate("(()=>{const f=document.querySelector('input[name=skill]').closest('form');f.requestSubmit();f.requestSubmit();return true})()");
  await until("document.querySelector('button[aria-label=\"Remove go\"]')");
  state = await control(); assert.equal(state.events.filter(x=>x.type === "skill-mutation").length, before+1);
  console.log("PASS: duplicate submissions produce exactly one mutation");
  await control({skillsDelay:false}); await input("input[name=skill]", "sql");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await check("Escape closes the autocomplete", "document.querySelector('[role=combobox]').getAttribute('aria-expanded') === 'false'");
  await screenshot("skills-desktop"); await viewport(320);
  await check("mobile controls fit and preserve rounded styling", "document.documentElement.scrollWidth === innerWidth && getComputedStyle(document.querySelector('input[name=skill]')).borderRadius === '24px'");
  await screenshot("skills-mobile");
  await navigate("/jobs"); await until("location.pathname === '/jobs' && document.body.textContent.includes('opportunit')");
  state = await control(); assert.ok(state.events.some(x=>x.path?.endsWith("/match")));
  console.log("PASS: subsequent Jobs matching requests still run after skills updates");

  await navigate("/onboarding?edit=1"); await until("document.body.textContent.includes('Step 1 of 7')"); await sleep(250);
  for (let step = 2; step <= 6; step++) { await press("Continue"); await until("document.body.textContent.includes('Step " + step + " of 7')"); }
  await check("onboarding still loads the updated persisted skills", "!!document.querySelector('button[aria-label=\\\"Remove python\\\"]') && !!document.querySelector('button[aria-label=\\\"Remove rust\\\"]') && !!document.querySelector('button[aria-label=\\\"Remove go\\\"]')");
  await press("Continue"); await until("document.body.textContent.includes('Ready to find your matches?')"); await press("Find my matches"); await until("location.pathname === '/jobs'");
  state = await control(); assert.deepEqual(state.profiles[0].skills.map(x=>x.name).sort(), ["go", "python", "rust"]);
  console.log("PASS: existing onboarding save flow preserves the updated skill set");
  console.log("B4 skills browser checks passed using synthetic loopback services only.");
} finally { ws.close(); }

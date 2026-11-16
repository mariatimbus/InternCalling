/** Read-only verification of the real public catalog. Requires the dedicated CDP test browser. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.env.B3_BROWSER_BASE_URL ?? "http://localhost:3000";
const catalog = await (await fetch("http://127.0.0.1:8000/api/v1/opportunities?is_active=true&page_size=100")).json();
assert.ok(catalog.total > 0, "real opportunities are published");
const official = new Set(catalog.items.map((item) => item.url));
const targets = await (await fetch((process.env.B3_CDP_ENDPOINT ?? "http://127.0.0.1:9224") + "/json/list")).json();
const ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const tasks = new Map();
ws.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id) { const task = tasks.get(message.id); tasks.delete(message.id); if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result); } };
function send(method, params = {}) { return new Promise((resolve, reject) => { const current = ++id; tasks.set(current, { resolve, reject }); ws.send(JSON.stringify({ id: current, method, params })); }); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error("Browser evaluation failed"); return result.result.value; }
async function until(expression) { for (let i = 0; i < 300; i++) { try { if (await evaluate(`!!(${expression})`)) return; } catch { /* Navigation may replace the execution context. */ } await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error(`Timed out: ${expression}`); }
async function navigate(route) { await send("Page.navigate", { url: base + route }); await until("document.readyState === 'complete'"); }
async function check(name, expression) { assert.ok(await evaluate(expression), name); console.log(`PASS: ${name}`); }
const directory = process.env.B3_SCREENSHOT_DIR ?? path.join(tmpdir(), "interncalling-live-catalog");
await mkdir(directory, { recursive: true });
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(directory, `${name}.png`), Buffer.from(result.data, "base64")); }

try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("/"); await until("document.querySelectorAll('main article a[target=_blank]').length > 0");
  await check("home contains real opportunities without fictional workspace wording", "!/demo|fictional|example internships|illustrative/i.test(document.body.innerText)");
  let urls = await evaluate("[...document.querySelectorAll('main article a[target=_blank]')].map(link => link.href)");
  assert.ok(urls.length && urls.every((url) => official.has(url)), "home links come from the real API catalog");
  await screenshot("home-desktop");
  await navigate("/explore"); await until("document.querySelectorAll('main article').length === 12");
  await check("catalog shows the actual database total", `document.querySelector('main').innerText.includes('${catalog.total} opportunities')`);
  const all = new Set();
  for (let page = 1; page <= Math.ceil(catalog.total / 12); page++) {
    await navigate(`/explore?page=${page}`); await until("document.querySelector('main article a[target=_blank]')");
    urls = await evaluate("[...document.querySelectorAll('main article h3 a')].map(link => link.href)");
    for (const url of urls) { assert.ok(official.has(url)); all.add(url); }
  }
  assert.equal(all.size, catalog.total); console.log("PASS: all published opportunities are reachable through pagination with official links");
  await navigate("/explore?q=Cloudflare"); await until("document.querySelectorAll('main article').length === 1");
  await check("search filters actual employer data", "document.querySelector('main article').innerText.includes('Cloudflare')");
  await navigate("/explore?type=internship"); await until("document.querySelector('main article')");
  await check("internship filter preserves correct category labels", "[...document.querySelectorAll('main article')].every(card => card.innerText.includes('Internship'))");
  await navigate("/preview/jobs"); await until("location.pathname === '/explore'");
  await check("retired workspace links contain no fictional data", "!/demo|fictional|example internships|illustrative/i.test(document.body.innerText)");
  await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 812, deviceScaleFactor: 1, mobile: true });
  await navigate("/explore"); await until("document.querySelector('main article')");
  await check("real catalog fits a 320px viewport", "document.documentElement.scrollWidth === innerWidth");
  await screenshot("explore-mobile");
  await navigate("/sign-in"); await until("document.querySelector('input[name=email]')");
  await check("Google and LinkedIn are available and Apple is hidden", "['Google','LinkedIn'].every(name => [...document.querySelectorAll('button')].some(button => button.textContent === 'Continue with ' + name)) && ![...document.querySelectorAll('button')].some(button => button.textContent.includes('Apple'))");
  await screenshot("social-mobile");
  console.log(`Read-only live catalog checks passed. Screenshots: ${directory}`);
} finally { ws.close(); }

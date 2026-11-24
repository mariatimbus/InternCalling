import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(file, deps = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", outputText)(name => { assert.ok(name in deps, name); return deps[name]; }, exports);
  return exports;
}
const model = await load("../src/lib/resume-pdf.ts");
const { ResumePdfController } = await load("../src/lib/resume-pdf-controller.ts", { "./resume-pdf": model });
const { createResumePdfPreviewService } = await load("../src/lib/resume-pdf-preview-service.ts", { "./resume-pdf": model });
const pdf = (name = "synthetic.pdf", type = "application/pdf", bytes = 12) => new File([new Uint8Array(bytes)], name, { type });
const metadata = (id = "original", fileName = "previous.pdf") => ({ id, revision: 1, fileName, sizeBytes: 12, contentType: "application/pdf", uploadedAt: "2026-11-17T12:00:00.000Z" });
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function setup(initial = null, override = {}) {
  let saved = initial; const calls = [];
  const service = {
    async load() { calls.push("load"); return saved ? structuredClone(saved) : null; },
    async upload(file, options) { calls.push(["upload", file, options.replace]); saved = metadata("new", file.name); return structuredClone(saved); },
    async access() { calls.push("access"); return { kind: "authorized", url: "https://example.invalid/private-resume", expiresAt: new Date(Date.now()+60000).toISOString() }; },
    async remove() { calls.push("remove"); saved = null; }, ...override,
  };
  const c = new ResumePdfController(service); await c.load();
  return { c, service, calls, set: value => { saved = value; }, saved: () => saved };
}
test("one non-empty PDF up to exactly 5 MiB; sensible MIME mismatch and unknown-type handling", () => {
  for (const files of [[], [pdf(),pdf()], [pdf("empty.pdf", "application/pdf", 0)], [pdf("large.pdf", "application/pdf", model.MAX_RESUME_BYTES+1)], [pdf("renamed.txt")], [pdf("wrong.pdf", "text/plain")]]) assert.ok(model.validateResumeSelection(files).error);
  assert.equal(model.validateResumeSelection([pdf("CV.PDF", "application/pdf", model.MAX_RESUME_BYTES)]).error, undefined);
  for (const type of ["", "application/octet-stream"]) assert.ok(model.validateResumeSelection([pdf("cv.pdf",type)]).warning);
  assert.equal(model.validateResumeSelection([pdf()]).warning, undefined);
});
test("real unconnected mode selects/checks but cannot upload, access or remove", async () => {
  const c = new ResumePdfController(); await c.load();
  c.select([pdf()]); await c.upload(); await c.open("view"); c.requestDelete(); await c.remove();
  assert.equal(c.state.status, "unconnected"); assert.equal(c.state.confirmed, null); assert.ok(c.state.selected); assert.equal(c.state.notice, "");
  c.select([]); assert.ok(c.state.selected); c.clearSelection(); assert.equal(c.state.selected, null); c.dispose();
});
test("loading failure and malformed metadata stay unknown, never empty/uploaded; retry recovers", async () => {
  let fail = true; const f = await setup(metadata(), { async load() { if (fail) throw new Error("private details"); return metadata(); } });
  assert.equal(f.c.state.status, "unavailable"); f.c.select([pdf()]); await f.c.upload(); assert.equal(f.c.state.confirmed,null);
  fail = false; await f.c.load(); assert.equal(f.c.state.confirmed.id,"original"); f.c.dispose();
  const invalid = await setup(null, { async load() { return { id: "incomplete" }; } }); assert.equal(invalid.c.state.status,"unavailable"); invalid.c.dispose();
});
test("replacement preserves prior metadata until service confirms; progress is byte-based or indeterminate", async () => {
  const gate = deferred(); let options, count = 0;
  const f = await setup(metadata(), { async upload(file, config) { count++; options = config; return gate.promise; } });
  f.c.select([pdf("replacement.pdf")]); const pending = f.c.upload(); await f.c.upload();
  assert.equal(count,1); assert.equal(f.c.state.confirmed.fileName,"previous.pdf"); assert.equal(f.c.state.progress,null);
  assert.deepEqual(options.replace,{ id:"original", revision:1 });
  options.onProgress({ transferredBytes: 0,totalBytes:1000 }); assert.equal(f.c.state.progress,0);
  options.onProgress({ transferredBytes: 250,totalBytes:1000 }); assert.equal(f.c.state.progress,25);
  options.onProgress({ transferredBytes: 999,totalBytes:1000 }); assert.equal(f.c.state.progress,99);
  options.onProgress({ transferredBytes: NaN,totalBytes:1000 }); assert.equal(f.c.state.progress,null);
  gate.resolve(metadata("new","replacement.pdf")); await pending;
  assert.equal(f.c.state.confirmed.id,"new"); assert.equal(f.c.state.selected,null); assert.match(f.c.state.notice,/uploaded/);
  options.onProgress({ transferredBytes:1,totalBytes:2 }); assert.equal(f.c.state.progress,null); f.c.dispose();
});
test("failed upload/replacement retains selected file and prior confirmed resume, then retry works", async () => {
  let fail = true; const f = await setup(metadata(), { async upload(file) { if (fail) throw new Error("private details"); return metadata("new",file.name); } });
  f.c.select([pdf("retry.pdf")]); await f.c.upload();
  assert.equal(f.c.state.confirmed.id,"original"); assert.equal(f.c.state.selected.name,"retry.pdf"); assert.doesNotMatch(f.c.state.error,/private details/); assert.equal(f.c.state.notice,"");
  fail = false; await f.c.upload(); assert.equal(f.c.state.confirmed.id,"new"); f.c.dispose();
});
test("cancel stops updates, waits for late response, then reconciles metadata before another write", async () => {
  const gate = deferred(); let options, count = 0;
  const f = await setup(metadata(), { async upload(file,config) { count++; options=config; return gate.promise; } });
  f.c.select([pdf("late.pdf")]); const pending = f.c.upload(); f.c.cancelUpload();
  assert.equal(options.signal.aborted,true); assert.equal(f.c.state.busy,"cancelling");
  options.onProgress({ transferredBytes:10,totalBytes:10 }); assert.equal(f.c.state.progress,null);
  await f.c.upload(); assert.equal(count,1); assert.equal(f.c.state.confirmed.id,"original");
  f.set(metadata("late","late.pdf")); gate.resolve(metadata("late","late.pdf")); await pending;
  assert.equal(f.c.state.confirmed.id,"late"); assert.equal(f.c.state.busy,null); assert.match(f.c.state.notice,/current resume status/); assert.doesNotMatch(f.c.state.notice,/uploaded|cancelled/i); f.c.dispose();
});
test("abort rejection reconciles, and failed reconciliation blocks writes until retry", async () => {
  let failLoad = false;
  const f = await setup(metadata(), { async load() { if(failLoad) throw new Error("offline"); return metadata(); }, async upload(file,{ signal }) { return new Promise((resolve,reject) => signal.addEventListener("abort",() => reject(new DOMException("Aborted","AbortError")),{ once:true })); } });
  f.c.select([pdf()]); const pending = f.c.upload(); failLoad=true; f.c.cancelUpload(); await pending;
  assert.equal(f.c.state.status,"unavailable"); assert.equal(f.c.state.confirmed.id,"original"); assert.equal(f.c.state.busy,null);
  failLoad=false; await f.c.load(); assert.equal(f.c.state.status,"ready"); f.c.dispose();
});
test("cancel before submission and invalid reselection never change confirmed metadata", async () => {
  const f=await setup(metadata()); f.c.select([pdf()]); f.c.clearSelection(); assert.equal(f.c.state.selected,null);
  f.c.select([pdf("not-a-pdf.txt")]); assert.ok(f.c.state.error); assert.equal(f.c.state.confirmed.id,"original"); assert.equal(f.calls.filter(row=>Array.isArray(row)).length,0); f.c.dispose();
});
test("delete failure retains the confirmed PDF; confirmation/retry and conflict recovery are safe", async () => {
  let fail=true; const f=await setup(metadata(), { async remove() { if(fail) throw new model.ResumePdfConflict("conflict"); } });
  await f.c.remove(); assert.equal(f.c.state.confirmed.id,"original"); f.c.requestDelete(); f.c.keepResume(); assert.equal(f.c.state.deleting,false);
  f.c.requestDelete(); await f.c.remove(); assert.equal(f.c.state.confirmed.id,"original"); assert.match(f.c.state.error,/changed elsewhere/);
  fail=false; f.c.requestDelete(); await f.c.remove(); assert.equal(f.c.state.confirmed,null); f.c.dispose();
});
test("unmount ignores late upload/access results and releases late local object URLs", async () => {
  const upload=deferred(), f=await setup(metadata(), { async upload() { return upload.promise; } });
  f.c.select([pdf()]); const pending=f.c.upload(); f.c.dispose(); const snapshot=f.c.state; upload.resolve(metadata("late")); await pending; assert.equal(f.c.state,snapshot);
  const access=deferred(); let released=0;
  const service={ load:async()=>metadata(), access:async()=>access.promise, upload:async()=>metadata(), remove:async()=>{} };
  const c=new ResumePdfController(service,true); await c.load(); const opening=c.open("view"); c.dispose();
  access.resolve({kind:"local-preview",url:"blob:https://example.invalid/preview",release(){released++;}}); await opening; assert.equal(released,1);
});
test("only safe unexpired HTTPS access is accepted; blobs require explicit preview", async () => {
  const future=new Date(Date.now()+60000).toISOString();
  for(const url of ["javascript:alert(1)","http://example.invalid/pdf","https://user:fake@example.invalid/pdf","https://@example.invalid/pdf","https://example.invalid/a b"]){assert.equal(model.safeResumeAccess({kind:"authorized",url,expiresAt:future},false),false);}
  assert.equal(model.safeResumeAccess({kind:"authorized",url:"https://example.invalid/pdf",expiresAt:"2020-01-01"},false),false);
  const local={kind:"local-preview",url:"blob:https://example.invalid/pdf",release(){}};
  assert.equal(model.safeResumeAccess(local,false),false); assert.equal(model.safeResumeAccess(local,true),true);
  const f=await setup(metadata(),{async access(){return {kind:"authorized",url:"javascript:alert(1)",expiresAt:future};}});await f.c.open("view");assert.equal(f.c.state.access,null);assert.ok(f.c.state.error);f.c.dispose();
});
test("preview uploads are indeterminate, cancellable, replace-safe and release object URLs", async () => {
  let made=0;const revoked=[]; const service=createResumePdfPreviewService({delayMs:0,urls:{createObjectURL(){return "blob:https://example.invalid/" + ++made;},revokeObjectURL(url){revoked.push(url);}}});
  const c=new ResumePdfController(service,true);await c.load();c.select([pdf("first.pdf")]);await c.upload();assert.equal(c.state.progress,null);assert.match(c.state.notice,/Simulated/);
  await c.open("view");assert.equal(made,1);await c.open("download");assert.equal(made,2);assert.equal(revoked.length,1);
  c.select([pdf("second.pdf")]);service.failNext("upload");await c.upload();assert.equal(c.state.confirmed.fileName,"first.pdf");assert.equal(revoked.length,2);
  await c.open("view");await c.upload();assert.equal(c.state.confirmed.fileName,"second.pdf");assert.equal(revoked.length,3);
  await c.open("view");service.failNext("remove");c.requestDelete();await c.remove();assert.equal(c.state.confirmed.fileName,"second.pdf");
  await c.open("view");c.dispose();service.dispose();assert.equal(revoked.length,made);
  const next=createResumePdfPreviewService({delayMs:0});assert.equal(await next.load({signal:new AbortController().signal}),null);next.dispose();
});

test("preview aborts before commit, reports no invented bytes, and resets on reload", async () => {
  const service=createResumePdfPreviewService({delayMs:2}), abort=new AbortController();let events=0;
  const uploading=service.upload(pdf(),{replace:null,signal:abort.signal,onProgress(){events++;}});abort.abort();
  await assert.rejects(uploading,{name:"AbortError"});assert.equal(events,0);
  assert.equal(await service.load({signal:new AbortController().signal}),null);service.dispose();
});
test("pending deletion cannot duplicate, cancel confirmation or select a different file", async () => {
  const gate=deferred();let count=0;
  const f=await setup(metadata(),{async remove(){count++;await gate.promise;}});
  f.c.requestDelete();const pending=f.c.remove();await f.c.remove();f.c.keepResume();f.c.select([pdf("ignored.pdf")]);
  assert.equal(count,1);assert.equal(f.c.state.deleting,true);assert.equal(f.c.state.selected,null);
  gate.resolve();await pending;assert.equal(f.c.state.confirmed,null);f.c.dispose();
});
test("authorized links expire and require a fresh access request", async () => {
  const f=await setup(metadata(),{async access(){return {kind:"authorized",url:"https://example.invalid/private",expiresAt:new Date(Date.now()+20).toISOString()};}});
  await f.c.open("view");assert.ok(f.c.state.access);await new Promise(r=>setTimeout(r,35));assert.equal(f.c.state.access,null);assert.match(f.c.state.notice,/expired/);f.c.dispose();
});
const jsx=(type,props)=>({type,props:props??{}}),runtime={jsx,jsxs:jsx};
function nodes(tree){return !tree||typeof tree!=="object"?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
const button=(tree,label)=>nodes(tree).find(n=>n.type==="Button"&&n.props.children===label);
async function component(service, props = {}) {
  const values=[],refs=[],effects=[];let index=0,refIndex=0;
  const react={useId:()=>"pdf-fixture",useRef(current){const slot=refIndex++;return refs[slot]??={current};},useEffect(effect){effects.push(effect);},useState(initial){const slot=index++;if(!(slot in values))values[slot]=typeof initial==="function"?initial():initial;return [values[slot],next=>{values[slot]=typeof next==="function"?next(values[slot]):next;}];}};
  const helpers=await load("../src/lib/resume-pdf-controller.ts",{"./resume-pdf":model});
  const {ResumePdfSection}=await load("../src/components/profile/resume-pdf-section.tsx",{react,"react/jsx-runtime":runtime,"@/lib/resume-pdf-controller":helpers,"@/lib/resume-pdf":model,"@/components/ui/button":{Button:"Button"},"@/components/ui/error-state":{ErrorState:"ErrorState"}});
  const render=()=>{index=0;refIndex=0;return ResumePdfSection({service,children:jsx("ExistingLinkEditor",{}),linkInitiallyOpen:true,...props});};
  const initial=render(),cleanup=effects[0]();await new Promise(r=>setImmediate(r));
  const select=file=>nodes(render()).find(n=>n.type==="input").props.onChange({target:{files:[file],value:"selected"}});
  return {render,initial,select,cleanup};
}
test("Profile resume disables unavailable upload and keeps confirmed PDF actions when connected", async () => {
  const unavailable = await component(undefined, { profileLayout: true });
  assert.equal(nodes(unavailable.render()).find(n => n.type === "input").props.disabled, true);
  assert.match(JSON.stringify(unavailable.render()), /PDF upload is currently unavailable/);
  assert.doesNotMatch(JSON.stringify(unavailable.render()), /Use a link instead|ExistingLinkEditor/);
  unavailable.cleanup();
  const connected = await component({ load: async () => metadata() }, { profileLayout: true });
  const tree = connected.render();
  assert.equal(nodes(tree).find(n => n.type === "input").props.disabled, false);
  assert.match(JSON.stringify(tree), /Upload one PDF, up to 5 MiB/);
  assert.match(JSON.stringify(tree), /Extracting information from it is currently unavailable/);
  for (const label of ["View PDF", "Download PDF", "Remove PDF"]) assert.equal(button(tree, label).props.disabled, false);
  connected.cleanup();
});
test("real component keeps file selection local, exposes fallback and never fabricates uploaded state", async()=>{
  const f=await component();f.select(pdf());const tree=f.render();
  assert.equal(button(tree,"Upload unavailable").props.disabled,true);
  assert.match(JSON.stringify(tree),/Selected locally/);assert.doesNotMatch(JSON.stringify(tree),/Confirmed uploaded PDF|No PDF uploaded/);
  assert.ok(nodes(tree).some(n=>n.type==="summary"&&n.props.children==="Use a link instead"));
  assert.ok(nodes(tree).some(n=>n.type==="ExistingLinkEditor"));
  assert.equal(nodes(tree).find(n=>n.type==="details").props.open,true);
  assert.equal(nodes(tree).find(n=>n.type==="progress"),undefined);
  button(tree,"Cancel selection").props.onClick();assert.equal(button(f.render(),"Upload unavailable"),undefined);f.cleanup();
});
test("component shows indeterminate until actual service bytes; cancellation retains previous metadata",async()=>{
  const gate=deferred();let options;const previous=metadata();
  const service={load:async()=>previous,upload:async(file,config)=>{options=config;return gate.promise;},access:async()=>{},remove:async()=>{}};
  const f=await component(service);f.select(pdf("replacement.pdf"));button(f.render(),"Replace PDF").props.onClick();
  let progress=nodes(f.render()).find(n=>n.type==="progress");assert.equal(progress.props.value,undefined);assert.match(JSON.stringify(f.render()),/previous.pdf/);
  options.onProgress({transferredBytes:5,totalBytes:10});progress=nodes(f.render()).find(n=>n.type==="progress");assert.equal(progress.props.value,50);
  button(f.render(),"Cancel upload").props.onClick();assert.equal(options.signal.aborted,true);assert.equal(nodes(f.render()).find(n=>n.type==="progress"),undefined);
  gate.resolve(metadata("late"));await new Promise(r=>setImmediate(r));assert.match(JSON.stringify(f.render()),/previous.pdf/);f.cleanup();
});
test("preview route is development-only and does not render in production/test",async()=>{
  const {default:Page}=await load("../src/app/dev/resume-upload/page.tsx",{"next/navigation":{notFound(){throw new Error("404");}},"@/components/dev/resume-upload-preview":{ResumeUploadPreview:"Preview"},"react/jsx-runtime":runtime});
  const old=process.env.NODE_ENV;
  try {for(const mode of ["production","test"]){process.env.NODE_ENV=mode;assert.throws(()=>Page(),/404/);}process.env.NODE_ENV="development";assert.equal(Page().type,"Preview");}
  finally {if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});

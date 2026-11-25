import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const cache = new Map();
function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const exports = {}; cache.set(key, exports);
  const {outputText} = ts.transpileModule(readFileSync(url, "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  new Function("require","exports",outputText)(name => {assert.ok(name.startsWith("."),name);return load(new URL(name+".ts",url));}, exports);
  return exports;
}
const {createProfileServices} = load(new URL("../src/lib/profile-services.ts",import.meta.url));
const {workspaceProxy} = load(new URL("../src/lib/api/workspace-proxy.ts",import.meta.url));
const {ProjectConflict} = load(new URL("../src/lib/projects.ts",import.meta.url));
const {LanguageDuplicate} = load(new URL("../src/lib/languages.ts",import.meta.url));
const origin = "https://interncalling.example";
const uuid = "00000000-0000-4000-8000-000000000001";
const source = {id:uuid,revision:1};
const metadata = {...source,fileName:"resume.pdf",sizeBytes:20,contentType:"application/pdf",uploadedAt:"2026-11-22T12:00:00Z"};
const response = value => Response.json(value);

test("live collections preserve request ID after network/malformed success and use cookie-scoped routes",async()=>{
  const calls=[];let failures=2;
  const service=createProfileServices({transport:async(path,init)=>{calls.push({path,init});if(failures--===2)throw new Error("dropped response");if(failures===0)return new Response("malformed",{headers:{"Content-Type":"application/json"}});return response({id:uuid,revision:1,position:1,name:"Solver"});}});
  for(let i=0;i<2;i++)await assert.rejects(service.projects.create({name:"Solver"}));
  const saved=await service.projects.create({name:"Solver"});assert.equal(saved.name,"Solver");
  assert.ok(calls.every(call=>call.path==="/api/backend/workspace/collections/projects"));
  assert.equal(new Set(calls.map(call=>call.init.headers["Idempotency-Key"])).size,1);
  for(const {init}of calls){assert.equal(init.credentials,"same-origin");assert.equal(init.headers.Authorization,undefined);assert.equal(init.cache,"no-store");}
});

test("collection adapter maps stale versions and duplicate language to editor conflicts",async()=>{
  let code="workspace_conflict";
  const service=createProfileServices({transport:async()=>Response.json({error:{code}},{status:409})});
  await assert.rejects(service.projects.update(uuid,1,{name:"Solver"}),ProjectConflict);
  code="duplicate_language";await assert.rejects(service.languages.create({name:"French"}),LanguageDuplicate);
});

test("private PDF adapter uploads bytes with replacement scope, fetches privately and releases blob exactly once",async()=>{
  const calls=[],revoked=[];
  const service=createProfileServices({urls:{createObjectURL:()=>"blob:private",revokeObjectURL:url=>revoked.push(url)},transport:async(path,init)=>{calls.push({path,init});return path.includes("/file?")?new Response("%PDF-test",{headers:{"Content-Type":"application/pdf"}}):response(metadata);}});
  const file=new File(["%PDF-test"],"my-cv.pdf",{type:"application/pdf"});let progress;
  await service.pdf.upload(file,{replace:source,signal:new AbortController().signal,onProgress:p=>{progress=p;}});
  assert.equal(calls[0].init.body,file);assert.match(calls[0].path,/replace_id=.*replace_revision=1/);assert.equal(progress.transferredBytes,file.size);
  const access=await service.pdf.access(source,{signal:new AbortController().signal,intent:"download"});
  assert.equal(access.kind,"authenticated");access.release();access.release();assert.deepEqual(revoked,["blob:private"]);
});

test("tailored PDF download requests persisted export metadata and its actual private file",async()=>{
  const calls=[];const service=createProfileServices({urls:{createObjectURL:()=>"blob:approved",revokeObjectURL:()=>{}},transport:async path=>{calls.push(path);return path.endsWith("/file")?new Response("%PDF-approved",{headers:{"Content-Type":"application/pdf"}}):response({id:uuid,draft:{id:uuid,revision:"2"},status:"ready"});}});
  const value=await service.tailoring.download(uuid,{signal:new AbortController().signal});
  assert.equal(value.content,"approved-resume");assert.equal(value.access.kind,"authenticated");
  assert.deepEqual(calls,[`/api/backend/workspace/tailoring/export/${uuid}`,`/api/backend/workspace/tailoring/export/${uuid}/file`]);
});

function proxyRequest(path,method="GET",headers={},body){return new Request(origin+"/api/backend/"+path,{method,headers,...(body?{body}: {})});}
function deps(transport){return {baseUrl:"https://api.example",token:async()=>"verified-session-token",transport};}
test("proxy forwards only verified server identity and allows private JSON/PDF with no-store",async()=>{
  let upstream;
  const result=await workspaceProxy(proxyRequest("workspace/snapshot","GET",{Authorization:"Bearer attacker",Cookie:"secret-session"}),["workspace","snapshot"],deps(async(url,init)=>{upstream={url,init};return response({ok:true});}));
  assert.equal(result.status,200);assert.equal(result.headers.get("cache-control"),"private, no-store");
  assert.equal(upstream.url.href,"https://api.example/api/v1/workspace/snapshot");
  assert.equal(upstream.init.headers.Authorization,"Bearer verified-session-token");assert.equal(upstream.init.headers.Cookie,undefined);assert.equal(upstream.init.redirect,"error");
});

test("proxy rejects cross-origin writes, arbitrary paths, oversized bodies and unauthenticated reads before upstream",async()=>{
  let calls=0;const dependencies=deps(async()=>{calls++;return response({});});
  assert.equal((await workspaceProxy(proxyRequest("workspace/collections/projects","POST",{Origin:"https://evil.example","Content-Type":"application/json"},"{}"),["workspace","collections","projects"],dependencies)).status,403);
  for(const path of [["workspace","..","auth"],["auth","users"],["workspace","collections","projects?x=y"]])assert.equal((await workspaceProxy(proxyRequest("workspace/snapshot"),path,dependencies)).status,404);
  assert.equal((await workspaceProxy(proxyRequest("workspace/resume","POST",{Origin:origin,"Content-Type":"application/pdf","Content-Length":String(5*1024*1024+1)},"pdf"),["workspace","resume"],dependencies)).status,413);
  assert.equal((await workspaceProxy(proxyRequest("workspace/snapshot"),["workspace","snapshot"],{...dependencies,token:async()=>null})).status,401);assert.equal(calls,0);
});

test("proxy sanitizes upstream errors, rejects invalid queries and forwards safe idempotency",async()=>{
  const result=await workspaceProxy(proxyRequest("workspace/collections/projects","POST",{Origin:origin,"Content-Type":"application/json","Idempotency-Key":uuid},"{}"),["workspace","collections","projects"],deps(async(_url,init)=>{assert.equal(init.headers["Idempotency-Key"],uuid);return Response.json({error:{code:"workspace_conflict",message:"SECRET DATABASE PARAMS"}},{status:409});}));
  assert.equal(result.status,409);assert.equal((await result.json()).error.code,"workspace_conflict");
  for(const query of ["?user_id="+uuid,"?revision=1&revision=2","?replace_id=evil"]){const res=await workspaceProxy(proxyRequest("workspace/resume"+query),["workspace","resume"],deps(async()=>{throw Error("must not call");}));assert.equal(res.status,400);}
});


test("proxy bounds upstream responses before returning a private body",async()=>{
  const result = await workspaceProxy(proxyRequest("workspace/snapshot"),["workspace","snapshot"],deps(async()=>new Response("private",{headers:{"Content-Type":"application/json","Content-Length":String(16*1024*1024+1)}})));
  assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/private/);
});

test("ATS check and tailored PDFs go through the proxy; other document kinds do not", async () => {
  const { addKeyword, checkAts, tailoredPdf, documentError } = load(new URL("../src/lib/ats.ts", import.meta.url));
  assert.deepEqual(addKeyword(["Python"], "  python "), ["Python"]);
  assert.deepEqual(addKeyword(["Python"], " Kubernetes  Engine "), ["Python", "Kubernetes Engine"]);
  assert.deepEqual(addKeyword([], "x".repeat(61)), []);
  assert.deepEqual(addKeyword(Array.from({ length: 30 }, (_, i) => "k" + i), "one more").length, 30);
  let sent;
  const report = await checkAts(uuid, ["Excel"], async (url, init) => { sent = { url, init }; return response({ score: 5, label: "Fair match", rows: [] }); });
  assert.equal(sent.url, `/api/backend/workspace/ats/${uuid}`);
  assert.deepEqual(JSON.parse(sent.init.body), { keywords: ["Excel"] });
  assert.equal(report.score, 5);
  await assert.rejects(tailoredPdf(uuid, "resume", [], async () => Response.json({ error: { code: "pdf_renderer_unavailable" } }, { status: 503 })), /pdf_renderer_unavailable/);
  assert.match(documentError("pdf_renderer_unavailable"), /starting up/);

  let upstream;
  const pdf = async (url) => { upstream = url; return new Response("%PDF-1.7", { headers: { "Content-Type": "application/pdf" } }); };
  for (const kind of ["resume", "cover-letter"]) {
    const path = ["workspace", "documents", uuid, kind];
    const result = await workspaceProxy(proxyRequest(path.join("/"), "POST", { Origin: origin, "Content-Type": "application/json" }, "{}"), path, deps(pdf));
    assert.equal(result.status, 200);
    assert.equal(upstream.href, `https://api.example/api/v1/${path.join("/")}`);
    assert.equal(result.headers.get("content-disposition"), `inline; filename="${kind}.pdf"`);
  }
  const essay = ["workspace", "documents", uuid, "essay"];
  assert.equal((await workspaceProxy(proxyRequest(essay.join("/"), "POST", { Origin: origin, "Content-Type": "application/json" }, "{}"), essay, deps(pdf))).status, 404);
});

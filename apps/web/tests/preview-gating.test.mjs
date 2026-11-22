import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";

const root=new URL("../src/app/dev/",import.meta.url);
for(const name of await readdir(root)){
  test(`/dev/${name} rejects production/test before rendering demo content`,async()=>{
    const source=await readFile(new URL(`${name}/page.tsx`,root),"utf8");
    const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
    const exports={};let renders=0;
    const runtime={jsx(){renders++;return "preview";},jsxs(){renders++;return "preview";}};
    new Function("require","exports",outputText)(dependency=>{
      if(dependency==="next/navigation")return{notFound(){throw new Error("404");}};
      if(dependency==="react/jsx-runtime")return runtime;
      assert.ok(dependency.startsWith("@/components/dev/"),dependency);
      return new Proxy({},{get:()=>()=>null});
    },exports);
    const previous=process.env.NODE_ENV;
    try{
      for(const mode of ["production","test"]){process.env.NODE_ENV=mode;assert.throws(()=>exports.default(),/404/);assert.equal(renders,0);}
      process.env.NODE_ENV="development";assert.equal(exports.default(),"preview");assert.equal(renders,1);
    }finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
  });
}

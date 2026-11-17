import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(file,deps={}){const {outputText}=ts.transpileModule(await readFile(new URL(file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});const exports={};new Function("require","exports",outputText)(name=>{assert.ok(name in deps,name);return deps[name];},exports);return exports;}
const profile=await load("../src/lib/profile-edit.ts"),experience=await load("../src/lib/experience.ts"),urls=await load("../src/lib/resume-link.ts"),skills=await load("../src/lib/profile-skills.ts");
const projects=await load("../src/lib/projects.ts",{"./experience":experience,"./resume-link":urls}),certificates=await load("../src/lib/certificates.ts",{"./experience":experience,"./resume-link":urls}),honours=await load("../src/lib/honours.ts",{"./experience":experience,"./resume-link":urls}),languages=await load("../src/lib/languages.ts",{"./resume-link":urls}),publications=await load("../src/lib/publications.ts",{"./experience":experience,"./resume-link":urls});
const model=await load("../src/lib/resume-review.ts",{"./profile-edit":profile,"./experience":experience,"./projects":projects,"./certificates":certificates,"./honours":honours,"./languages":languages,"./publications":publications,"./profile-skills":skills});
const preview=await load("../src/lib/resume-review-preview-service.ts",{"./resume-review":model});
const onboardingRules=await load("../src/lib/onboarding.ts");
const cvRules=await load("../src/lib/cv-onboarding.ts",{"./onboarding":onboardingRules});
const {ResumeReviewController}=await load("../src/lib/resume-review-controller.ts",{"./resume-review":model});

const pdfModel=await load("../src/lib/resume-pdf.ts");
const pdfPreview=await load("../src/lib/resume-pdf-preview-service.ts",{"./resume-pdf":pdfModel});
const scenarioData=await load("../src/lib/cv-onboarding-scenarios.ts");
const {createCvOnboardingPreviewServices}=await load("../src/lib/cv-onboarding-preview-service.ts",{"./resume-pdf-preview-service":pdfPreview,"./resume-review-preview-service":preview,"./resume-review":model,"./onboarding":onboardingRules,"./cv-onboarding":cvRules,"./cv-onboarding-scenarios":scenarioData});

const {CvOnboardingDemoSession}=await load("../src/lib/cv-onboarding-demo-session.ts",{"./cv-onboarding-preview-service":{createCvOnboardingPreviewServices}});
const signal=()=>({signal:new AbortController().signal});
const sampleFile=name=>new File(["%PDF-1.7 fictional bytes"],name,{type:"application/pdf"});
async function ready(demo,name="sample.pdf"){const saved=await demo.services.pdf.upload(sampleFile(name),{...signal(),replace:null,onProgress(){}});let job=await demo.services.review.start(saved,signal());job=await demo.services.review.status(job.id,signal());return {saved,job,result:await demo.services.review.result(job.id,signal())};}
const factory=options=>createCvOnboardingPreviewServices({...options,delayMs:0});
test("default Complete sample covers seven valid profile fields, skills and all six valid collections",async()=>{
  const owner=new CvOnboardingDemoSession(factory);assert.equal(owner.state.scenario,"complete");const {result}=await ready(owner.state.demo);assert.equal(model.isParsingResult(result),true);
  assert.deepEqual(Object.keys(profile.validateProfileDraft(result.proposed.profile)),[]);for(const key of profile.editableProfileFields)assert.ok(result.proposed.profile[key]?.trim(),key);
  assert.ok(result.proposed.skills.length);for(const name of result.proposed.skills)assert.ok(skills.validateSkillName(name).name);
  for(const section of model.reviewSections){const candidate=result.proposed.collections.find(row=>row.section===section);assert.ok(candidate,section);assert.deepEqual(model.reviewCollectionErrors(section,candidate.values),{});for(const key of Object.keys(model.reviewDefaults[section]))assert.notEqual(candidate.values[key],undefined,section+"."+key);}
  owner.dispose();
});
test("complete sample is fictional and independent of the chosen PDF; full acceptance works only in demo memory",async()=>{
  const a=factory({scenario:"complete"}),b=factory({scenario:"complete"});const first=await ready(a,"one.pdf"),second=await ready(b,"different.pdf");assert.deepEqual(first.result.proposed,second.result.proposed);
  const draft=model.createReviewDraft(first.result);for(const row of Object.values(draft.profile))row.apply=true;for(const row of draft.skills)row.apply=true;for(const row of draft.collections){row.decision="add";for(const field of Object.values(row.fields))field.apply=true;}
  const built=model.buildReviewChanges(first.result,draft,"full-sample");assert.deepEqual(built.errors,{});assert.deepEqual(cvRules.cvConfirmationErrors(a.snapshot(),built.changes),{});
  const receipt=await a.services.review.confirm(built.changes,signal());assert.equal(cvRules.isConfirmedOnboardingComplete(receipt.snapshot),true);for(const section of model.reviewSections)assert.equal(receipt.snapshot.collections[section].length,1);assert.equal(b.snapshot().profile.headline,"");a.dispose();b.dispose();
});
test("Incomplete extraction keeps several required fields and optional facts unknown, with known saved emptiness separate",async()=>{
  const demo=factory({scenario:"incomplete"}),{result}=await ready(demo),draft=model.createReviewDraft(result);
  for(const key of ["university","graduation_year","location"]){assert.equal(result.proposed.profile[key],null);draft.profile[key].apply=true;}
  assert.ok(Object.keys(cvRules.onboardingReviewErrors(result,draft)).length>=3);
  const language=result.proposed.collections.find(row=>row.section==="languages"),project=result.proposed.collections.find(row=>row.section==="projects");assert.equal(language.values.native,null);assert.equal(language.values.cefr,null);assert.equal(project.values.technologies,null);
  assert.equal(result.snapshot.collections.publications.length,0);assert.equal(result.proposed.collections.some(row=>row.section==="publications"),false);assert.match(result.warnings.join(" "),/unknown, not known-empty/);
  for(const [key,value]of Object.entries({degree_level:"bachelor",university:"Reviewer university",field_of_study:"Computer Science",graduation_year:"2028",location:"Reviewer city"}))draft.profile[key]={apply:true,value};
  const built=model.buildReviewChanges(result,draft,"corrected-missing");assert.deepEqual(built.errors,{});const receipt=await demo.services.review.confirm(built.changes,signal());assert.equal(receipt.snapshot.profile.location,"Reviewer city");assert.equal(receipt.snapshot.collections.publications.length,0);demo.dispose();
});
test("scenario switch Cancel preserves the exact current session, file, edited proposals and confirmation identity",async()=>{
  const owner=new CvOnboardingDemoSession(factory),demo=owner.state.demo,{result,saved}=await ready(demo);const review=new ResumeReviewController(demo.services.review,saved,undefined,0,cvRules.onboardingReviewErrors);await review.process();review.edit(draft=>{for(const key of cvRules.cvRequiredFields)draft.profile[key].apply=true;draft.profile.headline={apply:true,value:"Reviewer correction"};});review.prepare();const before=review.state;
  owner.observe({step:"review",pdf:{confirmed:saved},source:saved});owner.request("incomplete");assert.equal(owner.state.pending,"incomplete");assert.equal(owner.state.scenario,"complete");owner.cancel();
  assert.equal(owner.state.demo,demo);assert.equal(owner.state.epoch,0);assert.equal(owner.state.pending,null);assert.equal(demo.isActive(),true);assert.equal(review.state,before);assert.equal(review.state.changes.requestId,before.changes.requestId);assert.equal((await demo.services.pdf.load(signal())).fileName,"sample.pdf");assert.equal(result.source.id,saved.id);review.dispose();owner.dispose();
});
test("confirmed switch retires old pending results/confirmation and starts an empty isolated scenario",async()=>{
  const owner=new CvOnboardingDemoSession(options=>createCvOnboardingPreviewServices({...options,delayMs:10})),old=owner.state.demo,{result,job,saved}=await ready(old);const draft=model.createReviewDraft(result);for(const key of cvRules.cvRequiredFields)draft.profile[key].apply=true;const built=model.buildReviewChanges(result,draft,"old-pending");
  const pendingResult=old.services.review.result(job.id,signal()),pendingConfirmation=old.services.review.confirm(built.changes,signal());
  owner.observe({step:"review",pdf:{confirmed:saved},source:saved});owner.request("incomplete");owner.confirm();assert.equal(owner.state.scenario,"incomplete");assert.equal(owner.state.epoch,1);assert.equal(old.isActive(),false);
  const outcomes=await Promise.allSettled([pendingResult,pendingConfirmation]);assert.ok(outcomes.every(row=>row.status==="rejected"));assert.equal(owner.state.demo.snapshot().profile.headline,"");assert.equal(await owner.state.demo.services.pdf.load(signal()),null);await assert.rejects(old.services.review.result(job.id,signal()),model.ResumeReviewConflict);owner.dispose();
});
const jsx=(type,props,key)=>({type,props:props??{},key}),runtime={jsx,jsxs:jsx};
function nodes(tree){return !tree||typeof tree!=="object"?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
async function page(){const values=[],effects=[];let cursor=0;const react={useState(initial){const slot=cursor++;if(!(slot in values))values[slot]=typeof initial==="function"?initial():initial;return [values[slot],next=>{values[slot]=typeof next==="function"?next(values[slot]):next;}];},useEffect(effect){effects.push(effect);},useCallback:callback=>callback};class FastOwner extends CvOnboardingDemoSession{constructor(){super(factory);}}const {OnboardingPreview}=await load("../src/components/dev/onboarding-preview.tsx",{react,"react/jsx-runtime":runtime,"@/components/onboarding/cv-onboarding-flow":{CvOnboardingFlow:"Flow"},"@/lib/cv-onboarding-demo-session":{CvOnboardingDemoSession:FastOwner},"@/lib/cv-onboarding-scenarios":scenarioData,"@/components/ui/button":{Button:"Button"},"@/components/ui/drawer":{Drawer:"Drawer"}});const render=()=>{cursor=0;return OnboardingPreview();};render();const cleanup=effects[0]();return {render,cleanup,owner:values[0]};}
function banner(tree){const component=nodes(tree).find(node=>typeof node.type==="function"&&node.type.name==="DemoNotice"&&node.props.sticky);return component.type(component.props);}
test("exact prominent demo notice remains outside upload/processing/review/confirmation and switching controls",async()=>{
  const f=await page(),expected="Demo mode "+String.fromCharCode(0x2014)+" your PDF is not analyzed. The information below is sample data.";
  for(const [step,phase]of [["pdf","idle"],["review","processing"],["review","review"],["review","saving"],["complete","success"]]){const flow=nodes(f.render()).find(node=>node.type==="Flow");flow.props.onStateChange({step,pdf:{confirmed:null},source:null,review:{phase}});const notice=banner(f.render());assert.equal(notice.props.children,expected);assert.match(notice.props.className,/sticky top-0/);assert.match(notice.props.className,/border-2/);assert.equal(notice.props.role,"note");}
  const selector=nodes(f.render()).find(node=>node.type==="input"&&node.props.value==="incomplete");selector.props.onChange();const dialog=nodes(f.render()).find(node=>node.type==="Drawer");assert.equal(dialog.props.open,true);const flow=nodes(f.render()).find(node=>node.type==="Flow"),key=flow.key;dialog.props.onClose();assert.equal(nodes(f.render()).find(node=>node.type==="Flow").key,key);assert.equal(f.owner.state.scenario,"complete");f.cleanup();f.owner.dispose();
});
test("scenario controls are outside the product flow and a confirmed UI switch remounts it",async()=>{
  const f=await page();const flow=nodes(f.render()).find(node=>node.type==="Flow");assert.equal(flow.props.preview,true);assert.equal(flow.props.scenario,undefined);flow.props.onStateChange({step:"manual",pdf:{confirmed:null},source:null});nodes(f.render()).find(node=>node.type==="input"&&node.props.value==="incomplete").props.onChange();const dialog=nodes(f.render()).find(node=>node.type==="Drawer");const confirm=nodes(dialog.props.footer).find(node=>node.type==="Button"&&node.props.children==="Switch scenario and discard demo");confirm.props.onClick();assert.notEqual(nodes(f.render()).find(node=>node.type==="Flow").key,flow.key);assert.equal(f.owner.state.scenario,"incomplete");assert.equal(banner(f.render()).props["aria-label"],"Demo mode");f.cleanup();f.owner.dispose();
});
test("demo processing/confirmation/success copy explicitly disclaims analysis and real account saves",async()=>{
  const react={useId:()=>"fixture",useEffect(){},useRef:()=>({current:null}),useState:initial=>[typeof initial==="function"?initial():initial,()=>{}]};const controller=await load("../src/lib/resume-review-controller.ts",{"./resume-review":model});
  const ui=await load("../src/components/profile/resume-review-flow.tsx",{react,"react/jsx-runtime":runtime,"@/lib/resume-review-controller":controller,"@/lib/profile-edit":profile,"@/lib/resume-review":model,"@/lib/cv-onboarding":cvRules,"@/lib/profile-skills":skills,"@/components/ui/button":{Button:"Button"},"@/components/ui/input":{Input:"Input"},"@/components/ui/select":{Select:"Select"},"@/components/ui/field":{Field:"Field",fieldControl:""},"./grouped-skill-picker":{GroupedSkillPicker:"Picker"}});
  assert.match(ui.demoReviewMessage({phase:"processing",uncertain:false}),/synthetic.*PDF is not analyzed/);for(const phase of ["saving","success"]){assert.match(ui.demoReviewMessage({phase,uncertain:false}),/demo memory only/);assert.match(ui.demoReviewMessage({phase,uncertain:false}),/real account/);}
});

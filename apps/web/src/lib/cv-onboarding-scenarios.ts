/** Development fixture data only; never derived from a selected PDF. */
import type { ParsingResult } from "./resume-review";
export type CvDemoScenario = "complete" | "incomplete";
export const cvDemoScenarioLabels:Record<CvDemoScenario,string>={complete:"Complete sample",incomplete:"Incomplete extraction"};
export function cvDemoProposals(scenario:CvDemoScenario):Pick<ParsingResult,"proposed"|"warnings">{
  if(scenario==="incomplete")return {
    warnings:["Sample data only. University, graduation year and location are unknown; enter them before confirming.","No award or publication proposals were supplied in this sample. Their presence is unknown, not known-empty."],
    proposed:{profile:{headline:"Fictional student developer",bio:null,degree_level:"bachelor",university:null,field_of_study:"Computer Science",graduation_year:null,location:null},skills:["python"],collections:[
      {key:"role",section:"experience",values:{role:"Student Developer",organization:"Fable Labs (fictional)",location:null,startDate:"2024",endDate:null,current:null,description:null,achievements:null},warnings:["End date, current status and responsibilities are unknown. Do not infer them."]},
      {key:"project",section:"projects",values:{name:"Sample campus project",role:null,description:null,technologies:null,startDate:null,endDate:null,ongoing:null,repositoryUrl:null,demoUrl:null},warnings:["Dates, technologies and links are unknown, not empty confirmed lists."]},
      {key:"certificate",section:"certificates",values:{name:"Sample web credential",organization:"Fictional Learning Institute",issueDate:"2025",expirationDate:null,doesNotExpire:null,credentialId:null,credentialUrl:null},warnings:["Expiration is unknown; this does not mean the credential never expires."]},
      {key:"language",section:"languages",values:{name:"English",cefr:null,native:null,referenceName:null,referenceUrl:null},warnings:["Proficiency and native status are unknown."]},
    ]},
  };
  return {
    warnings:["All values are fictional sample data, independent of your selected PDF. Reference links and DOI are not verified."],
    proposed:{profile:{headline:"Fictional student building accessible campus tools",bio:"A fictional computing student interested in accessible applications and data projects. This biography is sample data.",degree_level:"bachelor",university:"Lumen Example University (fictional)",field_of_study:"Computer Science",graduation_year:"2028",location:"Example City"},skills:["python","javascript","typescript"],collections:[
      {key:"role",section:"experience",values:{role:"Software Engineering Intern",organization:"Fable Labs (fictional)",location:"Example City",startDate:"2024-06",endDate:"2024-08",current:false,description:"Built a fictional student support dashboard with an imaginary team.",achievements:"Added keyboard navigation to sample screens\nDocumented a fictional API"},warnings:[]},
      {key:"project",section:"projects",values:{name:"Campus Route Planner (sample)",role:"Student developer",description:"A fictional route-planning application used only as a demonstration.",technologies:["python","typescript"],startDate:"2024",endDate:"2025-02",ongoing:false,repositoryUrl:"https://example.invalid/sample/repository",demoUrl:"https://example.invalid/sample/demo"},warnings:[]},
      {key:"certificate",section:"certificates",values:{name:"Sample Web Foundations",organization:"Fictional Learning Institute",issueDate:"2025-01",expirationDate:"2027-01",doesNotExpire:false,credentialId:"SAMPLE-001",credentialUrl:"https://example.invalid/sample/credential"},warnings:["Fictional reference only; no credential is verified."]},
      {key:"award",section:"honours",values:{title:"Sample Student Innovation Award",organization:"Fictional Computing Society",receivedDate:"2025",description:"A fictional award for a demonstration project.",referenceUrl:"https://example.invalid/sample/award"},warnings:[]},
      {key:"language",section:"languages",values:{name:"English",cefr:"B2",native:false,referenceName:"Self-reported sample proficiency",referenceUrl:"https://example.invalid/sample/language"},warnings:["Sample proficiency is self-reported, not verified or certified."]},
      {key:"publication",section:"publications",values:{title:"Fictional Study of Campus Routing",authors:"Alex Example\nRowan Sample",publisher:"Imaginary Student Computing Journal",publicationDate:"2025-02",doi:"10.1000/fictional-sample",publicationUrl:"https://example.invalid/sample/publication",description:"A fictional abstract illustrating an ordered-author publication entry."},warnings:["Fictional publication and DOI; registration and authorship are not verified."]},
    ]},
  };
}

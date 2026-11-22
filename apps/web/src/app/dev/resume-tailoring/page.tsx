import { notFound } from "next/navigation";
import { ResumeTailoringPreview } from "@/components/dev/resume-tailoring-preview";
export const dynamic="force-dynamic";
export const metadata={title:"Resume tailoring development preview",robots:{index:false,follow:false}};
export default function ResumeTailoringPreviewPage(){if(process.env.NODE_ENV!=="development")notFound();return <ResumeTailoringPreview/>;}

import { notFound } from "next/navigation";
import { OnboardingPreview } from "@/components/dev/onboarding-preview";
export const dynamic="force-dynamic";
export const metadata={title:"CV-first onboarding development preview",robots:{index:false,follow:false}};
export default function OnboardingPreviewPage(){if(process.env.NODE_ENV!=="development")notFound();return <OnboardingPreview/>;}

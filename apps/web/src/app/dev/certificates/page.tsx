import { notFound } from "next/navigation";
import { CertificatesPreview } from "@/components/dev/certificates-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Certificates development preview", robots: { index: false, follow: false } };
export default function CertificatesPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CertificatesPreview />;
}

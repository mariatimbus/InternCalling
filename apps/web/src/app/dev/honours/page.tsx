import { notFound } from "next/navigation";
import { HonoursPreview } from "@/components/dev/honours-preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "Honours & Awards development preview", robots: { index: false, follow: false } };
export default function HonoursPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HonoursPreview />;
}

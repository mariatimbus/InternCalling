import type { Metadata } from "next";
import { ScrollBackdrop } from "@/components/brand/scroll-backdrop";
import "./globals.css";

export const metadata: Metadata = {
  title: "InternCalling",
  applicationName: "InternCalling",
  icons: { icon: { url: "/interncalling-logo.jpeg", type: "image/jpeg" } },
  description:
    "InternCalling helps students discover European tech internships and track their next steps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ScrollBackdrop />
        <a href="#main-content" className="sr-only rounded-control bg-primary px-4 py-3 text-on-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-10">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

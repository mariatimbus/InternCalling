"use client";

import Image from "next/image";
import { useState } from "react";
import { CompanyMark } from "./company-mark";

type AvatarSize = "sm" | "md";
type AvatarProps = { companyName?: string; initials?: string; logoUrl?: string | null; size?: AvatarSize };

// No remote image origin is configured. Accept only app-served company logo assets.
const localLogo = /^\/company-logos\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

function CompanyLogo({ src, initials, size }: { src: string; initials: string; size: AvatarSize }) {
  const [failed, setFailed] = useState(false);
  const pixels = size === "sm" ? 40 : 48;
  if (failed) return <CompanyMark initials={initials} size={size} />;

  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control bg-accent/10 p-1.5 ${size === "sm" ? "size-10" : "size-12"}`}>
    <Image src={src} alt="" width={pixels} height={pixels} sizes={`${pixels}px`} unoptimized className="size-full object-contain"
      onError={() => setFailed(true)} />
  </span>;
}

/** Decorative company avatar. Keep the company name visible beside it. */
export function CompanyAvatar({ companyName, initials, logoUrl, size = "md" }: AvatarProps) {
  const fallback = initials?.trim() || "–";
  if (!logoUrl || !localLogo.test(logoUrl)) return <CompanyMark initials={fallback} size={size} />;

  return <CompanyLogo key={JSON.stringify([companyName, fallback, logoUrl])} src={logoUrl} initials={fallback} size={size} />;
}

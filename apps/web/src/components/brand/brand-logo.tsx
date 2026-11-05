import Image from "next/image";

/** Shared InternCalling identity. The wordmark labels the decorative original logo. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}>
      <Image src="/interncalling-logo.jpeg" alt="" width={40} height={40} sizes="40px" className="size-10 shrink-0 rounded-full object-cover" />
      <span className="text-lg font-semibold tracking-tight text-foreground">InternCalling</span>
    </span>
  );
}

import Link from "next/link";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { ErrorState } from "@/components/ui/error-state";
import { hasRecoverySession } from "@/lib/auth/recovery-server";
import { invalidRecoveryMessage } from "@/lib/auth/recovery";

export const metadata = { title: "Reset password | InternCalling", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export const dynamic = "force-dynamic";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.invalid || !await hasRecoverySession()) return <section className="mx-auto w-full max-w-md space-y-6">
    <ErrorState variant="danger" title="Request a new reset link" description={invalidRecoveryMessage} />
    <p><Link href="/forgot-password" className="text-accent underline underline-offset-4">Request another reset email</Link></p>
    <p><Link href="/sign-in" className="text-accent underline underline-offset-4">Back to sign in</Link></p>
  </section>;
  return <PasswordRecoveryForm mode="reset" />;
}

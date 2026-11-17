import { redirect } from "next/navigation";
import { getVerifiedAuth } from "@/lib/auth/account";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata = { title: "Create account | InternCalling", robots: { index: false, follow: false } };
export default async function SignUpPage() {
  const auth = await getVerifiedAuth();
  if (auth.kind === "signed-in") redirect("/jobs");
  return <AuthForm mode="sign-up" configured={auth.kind !== "not-configured"} notice={auth.kind === "unavailable" ? "Authentication is temporarily unavailable. Please try again." : undefined} />;
}

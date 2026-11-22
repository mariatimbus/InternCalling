import { redirect } from "next/navigation";
import { getVerifiedAuth } from "@/lib/auth/account";
import { isSocialProvider, socialProviderName } from "@/lib/auth/social-providers";
import { AuthForm } from "@/components/auth/auth-form";
export const metadata = { title: "Sign in | InternCalling", robots: { index: false, follow: false } };
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await getVerifiedAuth();
  if (auth.kind === "signed-in") redirect("/jobs");
  const query = await searchParams;
  const provider = query["oauth-error"];
  if (query["password-reset"] === "1") return <AuthForm mode="sign-in" configured={auth.kind !== "not-configured"} notice="Your password has been reset. Sign in with your new password." />;
  const notice = isSocialProvider(provider) ? `${socialProviderName(provider)} sign-in was cancelled or could not be completed. Try again, or sign in with email.` : query["google-error"] ? "Google sign-in was cancelled or could not be completed. Try again, or sign in with email." : query["confirmation-error"] ? "That confirmation link could not be completed. Try signing in, or use the latest confirmation email." : query["signed-out"] ? "You have been signed out." : auth.kind === "unavailable" ? "Authentication is temporarily unavailable. Please try again." : undefined;
  return <AuthForm mode="sign-in" configured={auth.kind !== "not-configured"} notice={notice} />;
}

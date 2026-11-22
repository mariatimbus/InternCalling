import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export const metadata = { title: "Forgot password | InternCalling", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <PasswordRecoveryForm mode="request" />;
}

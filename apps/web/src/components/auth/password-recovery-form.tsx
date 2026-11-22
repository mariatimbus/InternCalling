"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, resetPassword, finishPasswordRecovery } from "@/app/auth/recovery/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";

export function PasswordRecoveryForm({ mode }: { mode: "request" | "reset" }) {
  const resetting = mode === "reset";
  const [state, action, pending] = useActionState(resetting ? resetPassword : requestPasswordReset, {} as ActionState);
  const [signOutState, signOutAction, signingOut] = useActionState(finishPasswordRecovery, {} as ActionState);
  const finishing = resetting && !!state.success;
  return <section className="mx-auto w-full max-w-md rounded-panel bg-card p-6 sm:p-10">
    <h1 className="page-title">{resetting ? "Reset your password" : "Forgot your password?"}</h1>
    <p className="reading-text mt-3">{resetting ? "Choose a new password that meets your account’s password policy." : "Enter your email and we’ll send you a password reset link."}</p>
    {state.success && <p role="status" className="mt-6 text-sm leading-6 font-semibold">{state.success}</p>}
    {finishing ? <form action={signOutAction} className="mt-6 space-y-5">
      {(signOutState.error || state.error) && <ErrorState variant="danger" title="Sign-out could not finish" description={signOutState.error || state.error} />}
      <Button type="submit" className="w-full" disabled={signingOut}>{signingOut ? "Signing out…" : "Finish signing out"}</Button>
    </form> : !state.success && <form action={action} className="mt-6 space-y-5">
      {resetting ? <>
        <Input label="New password" name="password" type="password" autoComplete="new-password" required maxLength={128} disabled={pending} />
        <Input label="Confirm new password" name="confirmation" type="password" autoComplete="new-password" required maxLength={128} disabled={pending} />
      </> : <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email} disabled={pending} />}
      {state.error && <ErrorState variant="danger" title={resetting ? "Password reset could not finish" : "Reset link could not be sent"} description={state.error} />}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? (resetting ? "Resetting password…" : "Sending reset link…") : resetting ? "Reset password" : "Send reset link"}</Button>
    </form>}
    {resetting && <p className="mt-5 text-sm"><Link href="/forgot-password" className="text-accent underline underline-offset-4">Request another reset email</Link></p>}
    <p className="mt-6 text-sm"><Link href="/sign-in" className="text-accent underline underline-offset-4">Back to sign in</Link></p>
  </section>;
}

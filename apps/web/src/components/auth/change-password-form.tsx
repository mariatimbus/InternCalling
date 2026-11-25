"use client";
import { useActionState } from "react";
import { changePassword } from "@/app/(workspace)/settings/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { Icon } from "@/components/ui/icon";

/** Change the password, or set one for accounts that only sign in with Google. */
export function ChangePasswordForm({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const [state, action, pending] = useActionState(changePassword, {} as ActionState);
  return <section aria-labelledby="password-title" className="space-y-5 rounded-panel border border-line bg-card p-5 sm:p-7">
    <div>
      <h2 id="password-title" className="section-title flex items-center gap-2.5"><Icon name="settings" className="text-accent" />{hasPassword ? "Change password" : "Set a password"}</h2>
      <p className="page-description text-sm">{hasPassword
        ? "Enter your current password, then choose a new one."
        : "You sign in with Google. Setting a password also lets you sign in with your email address."}</p>
    </div>
    <form action={action} key={state.success ?? "form"} className="max-w-md space-y-4">
      {/* The account email helps password managers save the new password. */}
      <input type="text" name="username" autoComplete="username" value={email} hidden readOnly />
      {hasPassword && <Input label="Current password" name="current" type="password" autoComplete="current-password" required maxLength={128} disabled={pending} />}
      <Input label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending} />
      <Input label="Confirm new password" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending} />
      {state.error && <ErrorState variant="danger" title="Password not changed" description={state.error} />}
      {state.success && <p role="status" className="text-sm font-semibold">{state.success}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}</Button>
    </form>
  </section>;
}

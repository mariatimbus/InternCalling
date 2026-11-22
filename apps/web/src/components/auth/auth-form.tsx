"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, signInWithProvider } from "@/app/auth/actions";
import type { ActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { ProviderMark } from "./provider-mark";
import { visibleSocialProviders, type VisibleSocialProvider } from "@/lib/auth/social-providers";

export function AuthForm({ mode, configured, notice }: { mode: "sign-in" | "sign-up"; configured: boolean; notice?: string }) {
  const signingUp = mode === "sign-up";
  const [state, action, pending] = useActionState(signingUp ? signUp : signIn, {} as ActionState);
  const [socialState, socialAction, socialPending] = useActionState(signInWithProvider, {} as ActionState);
  const busy = pending || socialPending;
  const [activeProvider, setActiveProvider] = useState<VisibleSocialProvider | null>(null);
  return <section className="mx-auto w-full max-w-md rounded-panel bg-card p-6 sm:p-10">
    <h1 className="page-title">{signingUp ? "Your next chapter starts here." : "Welcome back."}</h1>
    <p className="reading-text mt-3">{signingUp ? "Create your InternCalling account to find internships that fit your studies and skills." : "Sign in to your internship workspace."}</p>
    {!configured && <p role="alert" className="mt-6 rounded-control border border-border p-4 text-sm">Sign-in is not configured yet. Set the public Supabase project URL and publishable key to enable authentication.</p>}
    {notice && <p role="status" className="reading-text mt-5">{notice}</p>}
    {state.success ? <div className="mt-6 space-y-6"><p role="status" className="text-sm leading-6">{state.success}</p><Link className="text-accent underline" href="/sign-in">Back to sign in</Link></div> : <>
    <form action={socialAction} className="mt-7 space-y-3">
      {visibleSocialProviders.map((provider) => <Button key={provider.id} type="submit" name="provider" value={provider.id} variant="secondary" className="w-full gap-3" disabled={busy || !configured} onClick={() => setActiveProvider(provider.id)}><ProviderMark provider={provider.id} />{socialPending && activeProvider === provider.id ? `Connecting to ${provider.name}...` : `Continue with ${provider.name}`}</Button>)}
      {socialState.error && <p role="alert" className="text-sm leading-6">{socialState.error}</p>}
    </form>
    <div className="my-6 flex items-center gap-4 text-xs text-muted"><span className="h-px flex-1 bg-border/40" /><span>or continue with email</span><span className="h-px flex-1 bg-border/40" /></div>
    <form action={action} className="space-y-5">
      <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.email} disabled={busy || !configured} />
      <Input label="Password" name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={signingUp ? 8 : undefined} maxLength={128} hint={signingUp ? "Use at least 8 characters." : undefined} disabled={busy || !configured} />
      {!signingUp && <div className="text-right text-sm"><Link href="/forgot-password" className="text-accent underline underline-offset-4">Forgot your password?</Link></div>}
      {state.error && (!signingUp && state.invalidCredentials
        ? <ErrorState variant="danger" title="Sign-in failed" description="Incorrect email or password. Please try again." />
        : <p role="alert" className="text-sm">{state.error}</p>)}
      <Button type="submit" className="w-full" disabled={busy || !configured}>{pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}</Button>
    </form></>}
    <p className="mt-7 text-sm text-muted">{signingUp ? "Already have an account? " : "New to InternCalling? "}<Link href={signingUp ? "/sign-in" : "/sign-up"} className="text-accent underline underline-offset-4">{signingUp ? "Sign in" : "Create an account"}</Link></p>
  </section>;
}

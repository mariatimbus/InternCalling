"use client";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div className="p-6"><ErrorState title="We could not load this page." description="Check your connection and try again. Your saved data is unchanged." action={<Button onClick={reset}>Try again</Button>} /></div>;
}

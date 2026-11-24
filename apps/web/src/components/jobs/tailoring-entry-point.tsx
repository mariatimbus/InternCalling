/** No service is connected here. Preserve the existing application action. */
export function TailoringEntryPoint({ title, organization, embedded = false }: {
  title: string; organization: string; embedded?: boolean;
}) {
  const content = <div className="space-y-3 text-sm">
    <p className="break-words">{title} · {organization || "Organization not specified"}</p>
    <p role="status">Job-specific tailoring is not available yet. You can still use your standard resume and the original opportunity link.</p>
    <p className="text-muted">Your standard resume and saved Profile will stay unchanged.</p>
    <a href="/profile" className="inline-flex min-h-11 items-center text-primary underline">Review your Profile and standard resume</a>
  </div>;
  return embedded ? content : <details className="rounded-panel border border-border p-4">
    <summary className="cursor-pointer text-sm font-medium">Tailor resume for this job</summary>
    <div className="mt-3">{content}</div>
  </details>;
}

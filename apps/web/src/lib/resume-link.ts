export type ResumeSaveResult = { resumeUrl?: string | null; error?: string; success?: string };

/** No network access: this validates a link's syntax, never its availability. */
export function validateResumeUrl(value: unknown): { resumeUrl?: string | null; error?: string } {
  if (value === null) return { resumeUrl: null };
  if (typeof value !== "string") return { error: "Enter an absolute HTTP or HTTPS URL, or leave it blank to remove the link." };
  const text = value.trim();
  if (!text) return { resumeUrl: null };
  if (text.length > 512) return { error: "Use a resume URL of 512 characters or fewer." };
  if (!/^https?:\/\//i.test(text) || /[\u0000-\u0020\u007f\\\\]/.test(text)) return { error: "Enter an absolute HTTP or HTTPS URL without spaces or backslashes." };
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || /^https?:\/\/[^/?#]*@/i.test(text)) return { error: "Use an HTTP or HTTPS URL without embedded login credentials." };
    return { resumeUrl: text };
  } catch { return { error: "Check the URL and include http:// or https:// and a valid host." }; }
}

export function safeResumeUrl(value: unknown): string | null {
  const validated = validateResumeUrl(value);
  return validated.error ? null : validated.resumeUrl ?? null;
}

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CompanyAvatar } from "@/components/jobs/company-avatar";

const initial = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "–";

/**
 * One profile credential, laid out like a professional profile: the issuer's logo, the
 * title in bold, the issuer, muted facts, a "Show credential" button and a pencil to edit.
 */
export function CredentialEntry({ title, issuer, logoName, logoUrl, logoIcon, facts, link, linkLabel = "Show credential", children, disabled, onEdit, onDelete }: {
  title: string; issuer?: string; logoName: string; logoUrl: string | null; logoIcon?: ReactNode;
  facts: (string | false | null | undefined)[]; link?: string | null; linkLabel?: string; children?: ReactNode;
  disabled: boolean; onEdit: () => void; onDelete: () => void;
}) {
  return <article className="flex min-w-0 gap-4 [overflow-wrap:anywhere]">
    <div className="shrink-0">{logoIcon && !logoUrl
      ? <span aria-hidden="true" className="inline-flex size-16 items-center justify-center rounded-lg bg-accent/10 text-accent">{logoIcon}</span>
      : <CompanyAvatar companyName={logoName} initials={initial(logoName || title)} logoUrl={logoUrl} />}</div>
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug text-foreground">{title}</h3>
          {issuer && <p className="mt-0.5 text-sm text-foreground">{issuer}</p>}
          {facts.filter(Boolean).map(fact => <p key={fact as string} className="mt-0.5 text-sm text-muted">{fact}</p>)}
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 px-2" aria-label={`Edit ${title}`} disabled={disabled} onClick={onEdit}>
          <Icon name="pencil" />
        </Button>
      </div>
      {children}
      {link && <a href={link} target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-foreground/50 px-4 text-sm font-semibold text-foreground hover:border-foreground hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {linkLabel}<Icon name="external-link" className="size-4" /><span className="sr-only"> (opens in a new tab)</span>
      </a>}
      <div className="mt-1 flex justify-end"><Button variant="ghost" size="sm" className="text-xs" aria-label={`Delete ${title}`} disabled={disabled} onClick={onDelete}>Delete</Button></div>
    </div>
  </article>;
}

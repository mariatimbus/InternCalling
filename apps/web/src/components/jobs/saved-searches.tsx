import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { isSaved, searchHref, type SavedSearch, type SearchFields } from "@/lib/saved-searches";

/** Saved searches as links, each with an email toggle; plus "Save this search" when there is one. */
export function SavedSearches({ saved, current, action }: { saved: SavedSearch[]; current: SearchFields; action: (form: FormData) => Promise<void> }) {
  const canSave = Object.values(current).some((value) => value.trim()) && !isSaved(saved, current) && saved.length < 10;
  if (!saved.length && !canSave) return null;
  return <section aria-label="Saved searches" className="flex min-w-0 flex-wrap items-center gap-2">
    {saved.map((row) => <div key={row.id} className="inline-flex max-w-full items-center rounded-full border border-border bg-surface text-sm">
      <Link href={searchHref(row)} prefetch={false} className="min-h-10 truncate py-2 ps-4 pe-2 text-foreground hover:text-accent">{row.name}</Link>
      <form action={action}>
        <input type="hidden" name="intent" value="alert" /><input type="hidden" name="id" value={row.id} /><input type="hidden" name="alert" value={String(!row.alert)} />
        <button type="submit" aria-pressed={row.alert} title={row.alert ? "Emailing you new matches daily" : "Email me new matches"}
          className={`min-h-10 px-2 text-xs ${row.alert ? "font-semibold text-accent" : "text-muted hover:text-foreground"}`}>
          {row.alert ? "Emailing" : "Email me"}<span className="sr-only"> for {row.name}</span>
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="intent" value="remove" /><input type="hidden" name="id" value={row.id} />
        <button type="submit" aria-label={`Remove saved search ${row.name}`} className="min-h-10 rounded-e-full pe-3 ps-1 text-muted hover:text-foreground">×</button>
      </form>
    </div>)}
    {canSave && <form action={action}>
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="q" value={current.search} /><input type="hidden" name="location" value={current.location} />
      <input type="hidden" name="degree_level" value={current.degree} /><input type="hidden" name="study_year" value={current.year} />
      <button type="submit" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-accent underline underline-offset-4">
        <Icon name="bookmark" className="size-4" />Save this search
      </button>
    </form>}
  </section>;
}

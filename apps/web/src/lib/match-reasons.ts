// Matching v2 reasons (see docs/api.md): what fits, what the posting also asks for, and notes.
const fitReason = /^(?:Matches \d+ of \d+ skills|Matches interests): \S|^\S.* role fits your background$|^Involves .+ work from your background$/;
const fitPhrases = new Set(["In a location you chose", "Remote, as you prefer", "Remote-friendly", "In your country", "Posted this week"]);
const gapReason = /^(?:Also asks for: |None of your skills are mentioned; it asks for )\S/;
const discountReasons = new Set(["Requirements not stated in the posting", "Some requirements are not stated in the posting"]);

export const isFitReason = (reason: string) => fitReason.test(reason) || fitPhrases.has(reason);
export const isGapReason = (reason: string) => gapReason.test(reason);
export const discountNote = (reasons: readonly string[]) => reasons.find((reason) => discountReasons.has(reason));

/** The one reason a card shows: the strongest fit (skills first), never a gap or a note. */
export function topReason(reasons: readonly string[] | undefined): string | undefined {
  const fits = (reasons ?? []).filter(isFitReason);
  return fits.find((reason) => reason.startsWith("Matches ") && reason.includes(" skills")) ?? fits[0];
}

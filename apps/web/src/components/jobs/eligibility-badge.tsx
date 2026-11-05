import { Icon } from "@/components/ui/icon";

export type EligibilityStatus = "eligible" | "review" | "unknown";
const labels: Record<EligibilityStatus, string> = { eligible: "Meets requirements", review: "Check requirements", unknown: "Eligibility not checked" };

/** Text and icon communicate the supplied outcome; the component never decides eligibility. */
export function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Icon name={status === "eligible" ? "check" : "profile"} className="size-3.5 text-accent" />{labels[status]}</span>;
}

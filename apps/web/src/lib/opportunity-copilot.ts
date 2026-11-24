import type { OpportunityAssessment } from "./api/opportunity-assessment";
import type { Eligibility, Match, Skill } from "./api/types";
import { discountNote, isFitReason, isGapReason } from "./match-reasons";

const scoreComponents = [
  ["skills", "Skills"],
  ["field_fit", "Role fit"],
  ["interests", "Interests"],
  ["location", "Location"],
  ["recency", "Recently posted"],
  ["ai", "AI similarity"],
] as const;
const aiEvaluation = /^AI similarity: (?:0\.\d{2}|1\.00) \(embeddings\)$/;

function explainMatch(match: Match) {
  const reasons = match.reasons ?? [];
  const aiPoints = match.components?.ai;
  const aiEvaluated = aiPoints > 0 || reasons.some((reason) => aiEvaluation.test(reason));
  return {
    score: match.score,
    positiveReasons: reasons.filter((reason) => isFitReason(reason) || (aiPoints > 0 && aiEvaluation.test(reason))),
    gaps: reasons.filter(isGapReason),
    components: scoreComponents.flatMap(([key, label]) => {
      const points = match.components?.[key];
      return Number.isFinite(points) && (key !== "ai" || aiEvaluated) ? [{ label, points }] : [];
    }),
    note: discountNote(reasons),
  };
}

// The API provides human-readable reasons without a structured missing-data source.
const checkOfficialListing = "Check the official listing.";
const eligibilityNextSteps = new Map([
  ["Student has not declared a degree level", "Add your degree level to your profile."],
  ["Student study year is not known", "Check your current study year against the accepted years."],
  ["Student graduation year is not known", "Add your expected graduation year to your profile."],
  ["Student location is not known; cannot compare", "Add your location to your profile."],
  ["Opportunity does not specify a degree level", checkOfficialListing],
  ["Opportunity does not specify accepted study years", checkOfficialListing],
  ["No structured graduation restriction available", checkOfficialListing],
  ["Opportunity does not specify a location", checkOfficialListing],
]);

function explainEligibility(eligibility: Eligibility) {
  const rules = (eligibility.reasons ?? []).map(({ rule, status, reason }) =>
    ({ rule, label: rule.replaceAll("_", " "), status, reason }));
  const checks = new Map<string, { labels: string[]; status: Eligibility["status"]; nextStep?: string; reason?: string }>();
  let suggestProfile = false;
  for (const { rule, label, status, reason } of rules) {
    if (status === "eligible") continue;
    const nextStep = status === "not_eligible" ? undefined : eligibilityNextSteps.get(reason);
    if (nextStep && nextStep !== checkOfficialListing) suggestProfile = true;
    const key = nextStep ? status + nextStep : rule;
    const grouped = checks.get(key);
    if (grouped) grouped.labels.push(label);
    else checks.set(key, { labels: [label], status, nextStep, reason: status === "not_eligible" ? reason : undefined });
  }
  return {
    status: eligibility.status, rules, suggestProfile,
    toCheck: Array.from(checks).sort(([, a], [, b]) =>
      Number(b.status === "not_eligible") - Number(a.status === "not_eligible")),
  };
}

function compareSkills(listed: Skill[] | null, profile: Skill[] | null) {
  if (!listed) return { status: "listing-unavailable" } as const;
  if (!profile) return { status: "profile-unavailable" } as const;
  const profileIds = new Set(profile.map(({ id }) => id));
  return {
    status: "ready",
    matched: listed.filter(({ id }) => profileIds.has(id)),
    gaps: listed.filter(({ id }) => !profileIds.has(id)),
  } as const;
}

export type OpportunityCopilotData = {
  loading: boolean;
  match: ReturnType<typeof explainMatch> | null;
  eligibility: ReturnType<typeof explainEligibility> | null;
  skills: ReturnType<typeof compareSkills>;
};

export function prepareOpportunityCopilot(
  assessment: OpportunityAssessment | null, listed: Skill[] | null, profile: Skill[] | null,
): OpportunityCopilotData {
  return {
    loading: !assessment,
    match: assessment?.match && Number.isFinite(assessment.match.score) ? explainMatch(assessment.match) : null,
    eligibility: assessment?.eligibility ? explainEligibility(assessment.eligibility) : null,
    skills: compareSkills(listed, profile),
  };
}

export type DegreeLevel = "bachelor" | "master";
export type StudyYear = "first" | "second" | "third" | "fourth" | "fifth" | "sixth";
export type Profile = {
  study_year?: StudyYear | null; interests?: string[] | null;
  preferred_tech_domains?: string[] | null; preferred_locations?: string[] | null;
  remote_preferred?: boolean | null;
  id: string; user_id: string; degree_level: DegreeLevel | null;
  university: string | null; field_of_study: string | null;
  graduation_year: number | null; location: string | null;
};
export type Skill = { id: string; name: string };
export type Opportunity = {
  id: string; title: string; description: string | null; organization: string | null;
  location: string | null; url: string; deadline: string | null; posted_at: string | null;
  opportunity_type: string; is_active: boolean; skills: Skill[];
  degree_level?: "bachelor" | "master" | "both" | null; study_year?: number[] | null;
};
export type OpportunityPage = { items: Opportunity[]; page: number; page_size: number; total: number };
export type Match = {
  score: number;
  eligibility: "eligible" | "possibly_eligible" | "not_eligible" | "unknown";
  components: { skills: number; field_fit: number; interests: number; location: number; ai: number };
  reasons: string[];
};
export type Application = {
  id: string; opportunity_id: string; status: "saved" | "applied" | "interview" | "offer" | "rejected";
  notes: string | null; applied_at: string | null; updated_at: string;
  created_at: string;
  opportunity: { id: string; title: string; organization: string | null; deadline: string | null };
};

/** Validate the fields used for access decisions before trusting an API profile. */
export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.user_id === "string"
    && (p.degree_level === null || p.degree_level === "bachelor" || p.degree_level === "master")
    && ["university", "field_of_study", "location"].every((key) => p[key] === null || typeof p[key] === "string")
    && (p.graduation_year === null || (Number.isInteger(p.graduation_year) && Number(p.graduation_year) >= 1900 && Number(p.graduation_year) <= 2100));
}

export type Eligibility = { status: Match["eligibility"]; reasons: { rule: string; status: Match["eligibility"]; reason: string }[] };
export type Recommendation = { opportunity: Opportunity; match: Match; eligibility: Eligibility };
export type RecommendationPage = { items: Recommendation[]; page: number; page_size: number; total: number };

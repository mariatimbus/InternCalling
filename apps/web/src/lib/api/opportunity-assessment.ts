import type { ApiClient } from "./client";
import type { Eligibility, Match } from "./types";

export type OpportunityAssessment = {
  match: Match | null;
  eligibility: Eligibility | null;
};

export async function readOpportunityAssessment(api: ApiClient, id: string): Promise<OpportunityAssessment> {
  const path = "/api/v1/opportunities/" + encodeURIComponent(id);
  const [match, eligibility] = await Promise.allSettled([
    api.request<Match>(path + "/match"),
    api.request<Eligibility>(path + "/eligibility"),
  ]);
  return {
    match: match.status === "fulfilled" ? match.value ?? null : null,
    eligibility: eligibility.status === "fulfilled" ? eligibility.value ?? null : null,
  };
}

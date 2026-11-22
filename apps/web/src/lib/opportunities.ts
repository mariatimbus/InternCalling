import type { Opportunity } from "./api/types";
import type { JobSummary } from "@/components/jobs/job-card";

export const opportunityTypes = ["internship", "job", "research", "scholarship", "fellowship", "hackathon", "competition", "early_career", "open_source", "grant", "other"] as const;
export function opportunityTypeLabel(value: string) {
  return ({ internship: "Internship", job: "Job", research: "Research", scholarship: "Scholarship", fellowship: "Fellowship", hackathon: "Hackathon", competition: "Competition", early_career: "Early career", open_source: "Open source", grant: "Grant", other: "Opportunity" } as Record<string, string>)[value] ?? "Opportunity";
}
export function officialOpportunityUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function opportunitySummary(job: Pick<Opportunity, "id" | "title" | "organization" | "opportunity_type"> & Partial<Pick<Opportunity, "location" | "skills" | "description">>): JobSummary {
  const company = job.organization || "Organization not specified";
  return { id: job.id, title: job.title, company, initials: company.slice(0, 2).toUpperCase(), location: job.location || "Location not specified", country: "", workMode: null, duration: "", compensation: "", postedLabel: "", skills: job.skills?.map((skill) => skill.name) ?? [], matchScore: null, eligibility: "unknown", description: job.description ?? undefined, category: opportunityTypeLabel(job.opportunity_type) };
}

import type { Opportunity } from "@/lib/api/types";

export function safeJobSource(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export const degreeLabels = { bachelor: "Bachelor’s", master: "Master’s", both: "Bachelor’s or master’s" } as const;

export function studyYears(value: Opportunity["study_year"]) {
  return value?.filter((year) => Number.isInteger(year) && year >= 1 && year <= 6).join(", ");
}

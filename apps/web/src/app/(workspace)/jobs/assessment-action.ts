"use server";

import { readOpportunityAssessment } from "@/lib/api/opportunity-assessment";
import { requireCompletedAccount } from "@/lib/auth/account";

export async function loadOpportunityAssessment(id: string) {
  const { api } = await requireCompletedAccount();
  if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return { match: null, eligibility: null };
  }
  return readOpportunityAssessment(api, id);
}

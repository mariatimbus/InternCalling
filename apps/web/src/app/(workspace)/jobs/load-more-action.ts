"use server";

import { requireCompletedAccount } from "@/lib/auth/account";
import type { RecommendationPage } from "@/lib/api/types";
import { readJobsQuery, recommendationParams, type JobsQuery } from "@/lib/jobs-url";

export async function loadMoreRecommended(query: JobsQuery, page: number): Promise<RecommendationPage> {
  const { api } = await requireCompletedAccount();
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("Invalid page");
  const params = recommendationParams(readJobsQuery(query), page);
  return api.request<RecommendationPage>("/api/v1/opportunities/recommended?" + params);
}

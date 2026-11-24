"use server";

import { getPublicCatalog } from "@/lib/api/catalog";
import { opportunityTypes } from "@/lib/opportunities";

export async function loadExplorePage(filters: { search?: string; type?: string }, page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new Error("Invalid page");
  const search = typeof filters?.search === "string" ? filters.search.slice(0, 200) : "";
  const type = opportunityTypes.some((value) => value === filters?.type) ? filters.type! : "";
  return getPublicCatalog({ search, type, page });
}

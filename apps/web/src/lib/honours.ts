/** Live editor contract; persisted through /api/backend/workspace/collections. */
import type { CollectionService } from "./experience";
import { partialDate } from "./experience";
import { validateResumeUrl } from "./resume-link";
export type HonourDraft = { title: string; organization: string; receivedDate: string; description: string; referenceUrl: string };
export type Honour = HonourDraft & { id: string; revision: number; position: number };
export type HonoursService = CollectionService<Honour, HonourDraft>;
export class HonourConflict extends Error {}
export const emptyHonour = (): HonourDraft => ({ title: "", organization: "", receivedDate: "", description: "", referenceUrl: "" });
export function honourDraft(entry: Honour): HonourDraft {
  return { title: entry.title, organization: entry.organization, receivedDate: entry.receivedDate, description: entry.description, referenceUrl: entry.referenceUrl };
}
export function validateHonour(draft: HonourDraft): Partial<Record<keyof HonourDraft, string>> {
  const errors: Partial<Record<keyof HonourDraft, string>> = {};
  if (!draft.title.trim() || draft.title.trim().length > 255) errors.title = "Enter 1 to 255 characters.";
  if (draft.organization.trim().length > 255) errors.organization = "Use 255 characters or fewer.";
  if (draft.receivedDate.trim() && !partialDate(draft.receivedDate)) errors.receivedDate = "Enter YYYY or YYYY-MM, with a year from 1900 to 2100, or leave blank.";
  if (draft.description.length > 5000) errors.description = "Use 5000 characters or fewer.";
  if (validateResumeUrl(draft.referenceUrl).error) errors.referenceUrl = "Enter an absolute HTTP/HTTPS URL without credentials, up to 512 characters, or leave blank.";
  return errors;
}

/** PROVISIONAL frontend/service contract. No backend fields or routes are agreed. */
import type { CollectionService } from "./experience";
import { validateResumeUrl } from "./resume-link";
export const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = typeof cefrLevels[number];
export type LanguageDraft = { name: string; cefr: CefrLevel | ""; native: boolean; referenceName: string; referenceUrl: string };
export type Language = LanguageDraft & { id: string; revision: number; position: number };
export type LanguagesService = CollectionService<Language, LanguageDraft>;
export class LanguageConflict extends Error {}
export class LanguageDuplicate extends Error {}
export const emptyLanguage = (): LanguageDraft => ({ name: "", cefr: "", native: false, referenceName: "", referenceUrl: "" });
export const normalizeLanguageName = (name: string): string => name.trim().toLowerCase();
export function hasDuplicateLanguageName(name: string, entries: readonly Pick<Language, "id" | "name">[], editingId?: string): boolean {
  return entries.some(entry => entry.id !== editingId && normalizeLanguageName(entry.name) === normalizeLanguageName(name));
}
export function languageDraft(entry: Language): LanguageDraft {
  return { name: entry.name, cefr: entry.cefr, native: entry.native, referenceName: entry.referenceName, referenceUrl: entry.referenceUrl };
}
export function setLanguageNative(draft: LanguageDraft, native: boolean): LanguageDraft {
  return { ...draft, native, cefr: native ? "" : draft.cefr };
}
export function validateLanguage(draft: LanguageDraft, entries: readonly Pick<Language, "id" | "name">[] = [], editingId?: string): Partial<Record<keyof LanguageDraft, string>> {
  const errors: Partial<Record<keyof LanguageDraft, string>> = {};
  if (!draft.name.trim() || draft.name.trim().length > 255) errors.name = "Enter 1 to 255 characters.";
  else if (hasDuplicateLanguageName(draft.name, entries, editingId)) errors.name = "This language is already listed. Edit the existing entry instead.";
  if (typeof draft.native !== "boolean") errors.native = "Choose whether this is a native language.";
  if (draft.cefr !== "" && !cefrLevels.includes(draft.cefr)) errors.cefr = "Choose a CEFR level or leave proficiency unspecified.";
  if (draft.native && draft.cefr !== "") errors.cefr = "Native language and CEFR are separate. Clear the CEFR level for a native language.";
  if (draft.referenceName.trim().length > 255) errors.referenceName = "Use 255 characters or fewer.";
  if (validateResumeUrl(draft.referenceUrl).error) errors.referenceUrl = "Enter an absolute HTTP/HTTPS URL without credentials, up to 512 characters, or leave blank.";
  return errors;
}

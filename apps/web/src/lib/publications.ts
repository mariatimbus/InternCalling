/** Live editor contract; persisted through /api/backend/workspace/collections. */
import type { CollectionService } from "./experience";
import { partialDate } from "./experience";
import { validateResumeUrl } from "./resume-link";
export type PublicationDraft = { title: string; authors: string; publisher: string; publicationDate: string; doi: string; publicationUrl: string; description: string };
export type Publication = Omit<PublicationDraft, "authors"> & { authors: string[]; id: string; revision: number; position: number };
export type PublicationsService = CollectionService<Publication, PublicationDraft>;
export class PublicationConflict extends Error {}
export const emptyPublication = (): PublicationDraft => ({ title: "", authors: "", publisher: "", publicationDate: "", doi: "", publicationUrl: "", description: "" });
/** One author per line, preserving order and repeated names; no comma splitting or inferred authors. */
export const publicationAuthors = (value: string): string[] => value.split("\n").map(name => name.trim()).filter(Boolean);
export function publicationDraft(entry: Publication): PublicationDraft {
  return { title: entry.title, authors: entry.authors.join("\n"), publisher: entry.publisher, publicationDate: entry.publicationDate, doi: entry.doi, publicationUrl: entry.publicationUrl, description: entry.description };
}
/** Syntax-only local validation. Never resolves a DOI or verifies a publication. */
export function normalizeDoi(value: string): { doi?: string; url?: string; error?: string } {
  const text = value.trim();
  if (!text) return { doi: "" };
  const invalid = { error: "Enter a DOI identifier (10.1000/example) or https://doi.org/10.1000/example without credentials, query or fragment; use 512 characters or fewer." };
  if (text.length > 512 || /[\s\p{C}\\]/u.test(text)) return invalid;
  let identifier = text;
  if (/^https:\/\/doi\.org\//i.test(text)) {
    if (/[?#]/.test(text) || validateResumeUrl(text).error) return invalid;
    try { identifier = decodeURIComponent(text.slice("https://doi.org/".length)); } catch { return invalid; }
  }
  if (!/^10\.\d+(?:\.\d+)*\/[^\s]+$/u.test(identifier) || /[\s\p{C}\\]/u.test(identifier)) return invalid;
  const slash = identifier.indexOf("/"), prefix = identifier.slice(0, slash), suffix = identifier.slice(slash + 1);
  if (suffix === "." || suffix === "..") return invalid;
  try {
    // Encode the whole suffix (including extra slashes) so #/?/% cannot become URL structure.
    const encode = (part: string) => encodeURIComponent(part).replace(/[!'()*]/g, character => "%" + character.charCodeAt(0).toString(16).toUpperCase());
    return { doi: identifier, url: "https://doi.org/" + encode(prefix) + "/" + encode(suffix) };
  } catch { return invalid; }
}
export function validatePublication(draft: PublicationDraft): Partial<Record<keyof PublicationDraft, string>> {
  const errors: Partial<Record<keyof PublicationDraft, string>> = {};
  if (!draft.title.trim() || draft.title.trim().length > 255) errors.title = "Enter 1 to 255 characters.";
  const authors = publicationAuthors(draft.authors);
  if (authors.length > 100 || authors.some(name => name.length > 255)) errors.authors = "Use up to 100 authors, one per line, with 255 characters or fewer per author.";
  if (draft.publisher.trim().length > 255) errors.publisher = "Use 255 characters or fewer.";
  if (draft.publicationDate.trim() && !partialDate(draft.publicationDate)) errors.publicationDate = "Enter YYYY or YYYY-MM, with a year from 1900 to 2100, or leave blank.";
  if (draft.description.length > 5000) errors.description = "Use 5000 characters or fewer.";
  const doi = normalizeDoi(draft.doi); if (doi.error) errors.doi = doi.error;
  if (validateResumeUrl(draft.publicationUrl).error) errors.publicationUrl = "Enter an absolute HTTP/HTTPS URL without credentials, up to 512 characters, or leave blank.";
  return errors;
}

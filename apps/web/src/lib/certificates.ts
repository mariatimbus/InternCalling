/** PROVISIONAL frontend contract. No backend schema or endpoints are agreed. */
import type { CollectionService } from "./experience";
import { partialDate } from "./experience";
import { validateResumeUrl } from "./resume-link";
export type CertificateDraft = { name: string; organization: string; issueDate: string; expirationDate: string; doesNotExpire: boolean; credentialId: string; credentialUrl: string };
export type Certificate = CertificateDraft & { id: string; revision: number; position: number };
export type CertificatesService = CollectionService<Certificate, CertificateDraft>;
export class CertificateConflict extends Error {}
export const emptyCertificate = (): CertificateDraft => ({ name: "", organization: "", issueDate: "", expirationDate: "", doesNotExpire: false, credentialId: "", credentialUrl: "" });
export function certificateDraft(entry: Certificate): CertificateDraft {
  return { name: entry.name, organization: entry.organization, issueDate: entry.issueDate, expirationDate: entry.expirationDate, doesNotExpire: entry.doesNotExpire, credentialId: entry.credentialId, credentialUrl: entry.credentialUrl };
}
export function validateCertificate(draft: CertificateDraft): Partial<Record<keyof CertificateDraft, string>> {
  const errors: Partial<Record<keyof CertificateDraft, string>> = {};
  for (const key of ["name", "organization"] as const) if (!draft[key].trim() || draft[key].trim().length > 255) errors[key] = "Enter 1 to 255 characters.";
  if (draft.credentialId.trim().length > 255) errors.credentialId = "Use 255 characters or fewer.";
  const issue = partialDate(draft.issueDate), expiration = partialDate(draft.expirationDate);
  for (const key of ["issueDate", "expirationDate"] as const) if (draft[key].trim() && !partialDate(draft[key])) errors[key] = "Enter YYYY or YYYY-MM, with a year from 1900 to 2100, or leave blank.";
  if (draft.doesNotExpire && draft.expirationDate.trim()) errors.expirationDate = "A non-expiring credential cannot have an expiration date.";
  // Compare only known precision; no artificial month or day for a year-only value.
  if (!draft.doesNotExpire && issue && expiration && (expiration.year < issue.year || expiration.year === issue.year && issue.month !== undefined && expiration.month !== undefined && expiration.month < issue.month)) errors.expirationDate = "Expiration date cannot be before issue date.";
  if (validateResumeUrl(draft.credentialUrl).error) errors.credentialUrl = "Enter an absolute HTTP/HTTPS URL without credentials, up to 512 characters, or leave blank.";
  return errors;
}

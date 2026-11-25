import employers from "../../../api/src/opportunity_api/ingestion/sources/employers.json";

const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const companyDomains = new Map(employers.filter(employer => employer.domain).map(employer => [
  `${employer.provider}.${employer.identifier.toLowerCase()}`, employer.domain,
]));

/** App-served logo path from the API domain or the same employer registry used by ingestion. */
export function companyLogoUrl(domain: string | null | undefined, source?: string | null): string | null {
  const known = domain || (source ? companyDomains.get(source.toLowerCase()) : null);
  return known && known.length <= 100 && DOMAIN.test(known) ? `/company-logos/${known}.png` : null;
}

/** The domain inside a logo path, or null for anything else. */
export function logoDomain(file: string): string | null {
  const domain = file.endsWith(".png") ? file.slice(0, -4) : "";
  return companyLogoUrl(domain) ? domain : null;
}

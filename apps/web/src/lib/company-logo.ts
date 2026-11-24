const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/** App-served logo path for a company website domain; null when there is none to show. */
export function companyLogoUrl(domain: string | null | undefined): string | null {
  return domain && domain.length <= 100 && DOMAIN.test(domain) ? `/company-logos/${domain}.png` : null;
}

/** The domain inside a logo path, or null for anything else. */
export function logoDomain(file: string): string | null {
  const domain = file.endsWith(".png") ? file.slice(0, -4) : "";
  return companyLogoUrl(domain) ? domain : null;
}

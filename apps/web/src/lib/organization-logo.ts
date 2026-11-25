import employers from "../../../api/src/opportunity_api/ingestion/sources/employers.json";
import { companyLogoUrl } from "./company-logo";

// Issuers students often list that are not employers in the ingestion registry.
const KNOWN: Record<string, string> = {
  meta: "meta.com", facebook: "meta.com", google: "google.com", "google cloud": "cloud.google.com", microsoft: "microsoft.com",
  "amazon web services": "aws.amazon.com", aws: "aws.amazon.com", amazon: "amazon.com", apple: "apple.com", ibm: "ibm.com",
  oracle: "oracle.com", cisco: "cisco.com", "red hat": "redhat.com", nvidia: "nvidia.com", intel: "intel.com", sap: "sap.com",
  salesforce: "salesforce.com", linkedin: "linkedin.com", "linkedin learning": "linkedin.com", coursera: "coursera.org",
  udemy: "udemy.com", edx: "edx.org", datacamp: "datacamp.com", codecademy: "codecademy.com", "freecodecamp": "freecodecamp.org",
  hackerrank: "hackerrank.com", kaggle: "kaggle.com", forage: "theforage.com", "the forage": "theforage.com", "wells fargo": "wellsfargo.com",
  "jp morgan": "jpmorgan.com", "jpmorgan chase": "jpmorgan.com", "goldman sachs": "goldmansachs.com", "morgan stanley": "morganstanley.com",
  blackrock: "blackrock.com", citadel: "citadel.com", optiver: "optiver.com", deloitte: "deloitte.com", pwc: "pwc.com", ey: "ey.com", kpmg: "kpmg.com",
  accenture: "accenture.com", mckinsey: "mckinsey.com", bcg: "bcg.com", siemens: "siemens.com", paypal: "paypal.com", nasa: "nasa.gov", esa: "esa.int",
  "cambridge english": "cambridgeenglish.org", "cambridge assessment english": "cambridgeenglish.org", ielts: "ielts.org", toefl: "ets.org", ets: "ets.org",
  "goethe-institut": "goethe.de", "goethe institut": "goethe.de", testdaf: "testdaf.de", "institut français": "institutfrancais.com",
  "france education international": "france-education-international.fr", delf: "france-education-international.fr", dalf: "france-education-international.fr",
  "instituto cervantes": "cervantes.es", dele: "cervantes.es", icdl: "icdl.org", ecdl: "icdl.org", "icdl / ecdl": "icdl.org",
  harvard: "harvard.edu", "harvard university": "harvard.edu", mit: "mit.edu", stanford: "stanford.edu", "university of cambridge": "cam.ac.uk",
  "university of oxford": "ox.ac.uk", "university of bucharest": "unibuc.ro", "politehnica university of bucharest": "upb.ro", ieee: "ieee.org", acm: "acm.org",
  "google developers": "developers.google.com", github: "github.com", mongodb: "mongodb.com",
};
const EMPLOYERS = new Map(employers.filter(e => e.domain).map(e => [e.name.toLowerCase(), e.domain as string]));
// Hosts that only hold the credential; their logo is not the issuer's.
const CREDENTIAL_HOSTS = /(?:^|\.)(?:credly|accredible|badgr|youracclaim|certificates?|drive\.google|docs\.google|dropbox|onedrive|github\.io|bit\.ly)\./i;

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]$/, "");

/** The issuer's website domain: known issuers and employers by name, else the credential link's site. */
export function organizationDomain(name: string | null | undefined, url?: string | null): string | null {
  const wanted = key(name ?? "");
  if (wanted) {
    const known = KNOWN[wanted] ?? EMPLOYERS.get(wanted);
    if (known) return known;
    // "Meta Android Developer" issued by "Meta via Coursera": the first known name wins.
    const first = Object.keys(KNOWN).filter(n => n.length > 3).sort((a, b) => b.length - a.length).find(n => wanted.startsWith(n + " "));
    if (first) return KNOWN[first];
  }
  try {
    const host = url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : "";
    return host && !CREDENTIAL_HOSTS.test(host + ".") ? host : null;
  } catch { return null; }
}

/** App-served logo for an issuing organisation, or null to show its initial. */
export function organizationLogo(name: string | null | undefined, url?: string | null): string | null {
  return companyLogoUrl(organizationDomain(name, url));
}

/** "2026-07" -> "Jul 2026"; "2026" stays "2026". */
export function monthYear(value: string | null | undefined): string {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value?.trim() ?? "");
  if (!match) return value?.trim() ?? "";
  if (!match[2]) return match[1];
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${match[1]}` : match[1];
}

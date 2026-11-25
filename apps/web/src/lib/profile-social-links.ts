export type SocialLinks = { linkedin: string; github: string };

const hosts = { linkedin: "linkedin.com", github: "github.com" } as const;

export function validSocialLink(value: string, service: keyof SocialLinks): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && [hosts[service], `www.${hosts[service]}`].includes(url.hostname)
      && !!url.pathname.replaceAll("/", "") && !url.username && !url.password && !url.port && value.length <= 512;
  } catch { return false; }
}

export function socialLinksFromMetadata(metadata: Record<string, unknown> | undefined): SocialLinks {
  const linkedin = metadata?.profile_linkedin_url;
  const github = metadata?.profile_github_url;
  return {
    linkedin: typeof linkedin === "string" && validSocialLink(linkedin, "linkedin") ? linkedin : "",
    github: typeof github === "string" && validSocialLink(github, "github") ? github : "",
  };
}

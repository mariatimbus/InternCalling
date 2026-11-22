export const socialProviders = [
  { id: "google", name: "Google" },
  { id: "apple", name: "Apple" },
  { id: "linkedin_oidc", name: "LinkedIn" },
] as const;

// Preserve server-side Apple support while hiding its unconfigured UI option.
export const visibleSocialProviders = socialProviders.filter((provider) => provider.id !== "apple");
export type VisibleSocialProvider = typeof visibleSocialProviders[number]["id"];

export type SocialProvider = typeof socialProviders[number]["id"];
export function isSocialProvider(value: unknown): value is SocialProvider {
  return socialProviders.some((provider) => provider.id === value);
}
export function socialProviderName(value: SocialProvider): string {
  return socialProviders.find((provider) => provider.id === value)!.name;
}

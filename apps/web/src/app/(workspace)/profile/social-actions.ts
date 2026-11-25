"use server";

import { revalidatePath } from "next/cache";
import { getVerifiedAuth } from "@/lib/auth/account";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { socialLinksFromMetadata, validSocialLink, type SocialLinks } from "@/lib/profile-social-links";

export async function saveSocialLinks(links: SocialLinks): Promise<{ links?: SocialLinks; error?: string }> {
  const auth = await getVerifiedAuth();
  if (auth.kind !== "signed-in") return { error: "Sign in again to save your links." };
  if (!links || typeof links.linkedin !== "string" || typeof links.github !== "string"
    || !validSocialLink(links.linkedin.trim(), "linkedin") || !validSocialLink(links.github.trim(), "github")) {
    return { error: "Enter valid HTTPS profile links for LinkedIn and GitHub." };
  }
  try {
    const client = await createServerSupabaseClient(true);
    const { data, error } = await client.auth.updateUser({ data: {
      profile_linkedin_url: links.linkedin.trim(), profile_github_url: links.github.trim(),
    } });
    if (error || data.user?.id !== auth.user.id) throw error ?? new Error("Profile owner mismatch");
    revalidatePath("/profile");
    return { links: socialLinksFromMetadata(data.user.user_metadata) };
  } catch { return { error: "Links could not be saved. Please try again." }; }
}

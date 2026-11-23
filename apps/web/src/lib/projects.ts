/** Live editor contract; persisted through /api/backend/workspace/collections. */
import type { CollectionService } from "./experience";
import { validateExperience, emptyExperience } from "./experience";
import { validateResumeUrl } from "./resume-link";
export type ProjectDraft = { name: string; role: string; description: string; technologies: string[]; startDate: string; endDate: string; ongoing: boolean; repositoryUrl: string; demoUrl: string };
export type Project = ProjectDraft & { id: string; revision: number; position: number };
export type ProjectsService = CollectionService<Project, ProjectDraft>;
export class ProjectConflict extends Error {}
export const emptyProject = (): ProjectDraft => ({ name: "", role: "", description: "", technologies: [], startDate: "", endDate: "", ongoing: false, repositoryUrl: "", demoUrl: "" });
export function projectDraft(entry: Project): ProjectDraft {
  return { name: entry.name, role: entry.role, description: entry.description, technologies: [...entry.technologies], startDate: entry.startDate, endDate: entry.endDate, ongoing: entry.ongoing, repositoryUrl: entry.repositoryUrl, demoUrl: entry.demoUrl };
}
export function validateProject(draft: ProjectDraft): Partial<Record<keyof ProjectDraft, string>> {
  const errors: Partial<Record<keyof ProjectDraft, string>> = {};
  const shared = validateExperience({ ...emptyExperience(), role: draft.name, organization: "Project", startDate: draft.startDate, endDate: draft.endDate, current: draft.ongoing, description: draft.description });
  if (shared.role) errors.name = shared.role;
  if (draft.startDate.trim() && shared.startDate) errors.startDate = shared.startDate;
  if ((draft.endDate.trim() || draft.ongoing) && shared.endDate) errors.endDate = shared.endDate.replace("currently working here", "Ongoing").replace("Current roles", "Ongoing projects");
  if (shared.description) errors.description = shared.description;
  if (draft.role.trim().length > 255) errors.role = "Use 255 characters or fewer.";
  for (const key of ["repositoryUrl", "demoUrl"] as const) if (validateResumeUrl(draft[key]).error) errors[key] = "Enter an absolute HTTP/HTTPS URL without credentials, up to 512 characters, or leave blank.";
  if (draft.technologies.length > 100 || draft.technologies.some(name => !name.trim() || name.trim().length > 100) || new Set(draft.technologies.map(name => name.trim().toLowerCase())).size !== draft.technologies.length) errors.technologies = "Use up to 100 distinct technologies, each 1-100 characters.";
  return errors;
}

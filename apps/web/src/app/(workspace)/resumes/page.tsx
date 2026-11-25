import { requireAccount } from "@/lib/auth/account";
import { ResumeLibrary } from "@/components/resumes/resume-library";

export const metadata = { title: "Resumes | InternCalling" };

export default async function ResumesPage() {
  await requireAccount();
  return <div className="workspace-page"><ResumeLibrary /></div>;
}

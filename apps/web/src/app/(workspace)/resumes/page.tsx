import { requireAccount } from "@/lib/auth/account";
import { ResumeLibrary } from "@/components/resumes/resume-library";

export const metadata = { title: "Resumes | InternCalling" };

export default async function ResumesPage() {
  await requireAccount();
  return <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8"><ResumeLibrary /></div>;
}

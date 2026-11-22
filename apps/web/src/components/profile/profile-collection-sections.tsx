/** UI section identifiers only. Collection fields and backend contracts are provisional. */
export const profileCollectionSections = [
  { id: "experience", title: "Experience" },
  { id: "projects", title: "Projects" },
  { id: "certificates", title: "Certificates" },
  { id: "honours-awards", title: "Honours & Awards" },
  { id: "languages", title: "Languages" },
  { id: "publications", title: "Publications" },
] as const;
export type ProfileCollectionSection = typeof profileCollectionSections[number];

export function UnconnectedProfileSection({ section }: { section: ProfileCollectionSection }) {
  return <section aria-labelledby={"profile-section-" + section.id} className="min-w-0 rounded-panel bg-card p-6 sm:p-8">
    <h2 id={"profile-section-" + section.id} className="section-title">{section.title}</h2>
    <p className="mt-3 reading-text">This section is not connected yet</p>
  </section>;
}

export function ProfileCollectionSections() {
  return <div className="mt-8 grid gap-5 sm:grid-cols-2">{profileCollectionSections.filter(section => section.id !== "experience" && section.id !== "projects" && section.id !== "certificates" && section.id !== "honours-awards" && section.id !== "languages").map((section) => <UnconnectedProfileSection key={section.id} section={section} />)}</div>;
}

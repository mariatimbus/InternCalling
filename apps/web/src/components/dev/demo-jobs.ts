import type { JobDetail } from "@/components/jobs/detail-panel";

/** Fictional UI fixtures. Scores, eligibility and compensation are illustrative, not verified opportunities. */
export const demoJobs: readonly JobDetail[] = [
  {
    id: "northstar-frontend", title: "Frontend Engineering Intern", company: "Northstar Labs", initials: "NL",
    location: "Amsterdam, Netherlands", country: "Netherlands", workMode: "Hybrid", duration: "6 months", compensation: "€900–1,200 / month", postedLabel: "Demo listing",
    skills: ["React", "TypeScript", "Accessibility"], matchScore: 94, eligibility: "eligible",
    description: "Help a small product team make everyday tools more useful. You will pair with experienced engineers, ship thoughtful interfaces and learn how a product grows from a prototype into something people rely on.",
    responsibilities: ["Build accessible React interfaces with the design team.", "Write and review small, well-tested changes.", "Take part in weekly product conversations and mentoring sessions."],
    requirements: ["Currently studying computer science or a related subject.", "Comfortable with JavaScript, HTML and CSS.", "Able to work in the Netherlands; confirm work authorization with the employer."],
    deadlineLabel: "Demo deadline: 15 January 2027. Not a real vacancy.",
    deadlineText: "Apply by 15 Jan 2027 (demo)",
  },
  {
    id: "canopy-backend", title: "Backend Software Engineering Intern", company: "Canopy Systems", initials: "CS",
    location: "Berlin, Germany", country: "Germany", workMode: "Hybrid", duration: "6 months", compensation: "€1,100 / month", postedLabel: "Demo listing",
    skills: ["Python", "PostgreSQL", "APIs"], matchScore: 88, eligibility: "eligible",
    description: "Work on the services behind a collaborative planning tool. Learn to design clear APIs and understand how data moves through a modern application.",
    responsibilities: ["Implement small API endpoints with a mentor.", "Improve database queries and automated tests.", "Document technical decisions for the team."],
    requirements: ["Enrolled in a relevant Bachelor's or Master's program.", "Some experience with Python and relational databases.", "Available for a six-month placement in Berlin."],
    deadlineLabel: "Demo deadline: 22 January 2027. Not a real vacancy.",
    deadlineText: "Apply by 22 Jan 2027 (demo)",
  },
  {
    id: "orbit-data", title: "Data Science Intern", company: "Orbit Analytics", initials: "OA",
    location: "Paris, France", country: "France", workMode: "On-site", duration: "4 months", compensation: "€1,000 / month", postedLabel: "Demo listing",
    skills: ["Python", "SQL", "Data analysis"], matchScore: 81, eligibility: "review",
    description: "Turn complex datasets into clear answers with a team focused on responsible analytics. Explore patterns, validate assumptions and communicate findings.",
    responsibilities: ["Clean and explore structured datasets.", "Create reproducible analysis notebooks.", "Share findings through clear visualizations."],
    requirements: ["Studying statistics, mathematics or computer science.", "Basic Python and SQL experience.", "Check whether your university can provide a placement agreement."],
    deadlineLabel: "Demo deadline: 29 January 2027. Not a real vacancy.",
    deadlineText: "Apply by 29 Jan 2027 (demo)",
  },
  {
    id: "meridian-platform", title: "Platform Engineering Intern", company: "Meridian Cloud", initials: "MC",
    location: "Dublin, Ireland", country: "Ireland", workMode: "Remote", duration: "3 months", compensation: "Paid · amount to confirm", postedLabel: "Demo listing",
    skills: ["Linux", "Docker", "Python"], matchScore: 77, eligibility: "unknown",
    description: "Learn how engineering teams build dependable development environments. Work alongside platform engineers on practical tools and documentation.",
    responsibilities: ["Improve local development tooling.", "Help maintain build pipelines.", "Document and investigate small reliability issues."],
    requirements: ["Interest in Linux and cloud infrastructure.", "Comfortable writing small scripts.", "Remote eligibility and permitted work locations must be confirmed."],
    deadlineLabel: "Demo deadline: 5 February 2027. Not a real vacancy.",
    deadlineText: "Apply by 5 Feb 2027 (demo)",
  },
  {
    id: "pixel-product", title: "Product Engineering Intern", company: "Pixel Grove", initials: "PG",
    location: "Bucharest, Romania", country: "Romania", workMode: "Hybrid", duration: "3 months", compensation: "Paid · amount to confirm", postedLabel: "Demo listing",
    skills: ["TypeScript", "React", "Testing"], matchScore: 91, eligibility: "eligible",
    description: "Join a small team building useful software for independent creators. Work across the interface and the API with guidance from a dedicated mentor.",
    responsibilities: ["Ship small end-to-end product improvements.", "Investigate user feedback with the team.", "Add meaningful tests for new features."],
    requirements: ["Currently enrolled in a technical degree.", "A small personal or university programming project.", "Available to collaborate with the Bucharest team."],
    deadlineLabel: "Demo deadline: 12 February 2027. Not a real vacancy.",
    deadlineText: "Apply by 12 Feb 2027 (demo)",
  },
];

export const demoCountries = [...new Set(demoJobs.map((job) => job.country))].sort();

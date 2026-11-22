# InternCalling design refinement

This records the first refinement. The user's later [rounded-card direction](rounded-cards.md) defines the current shapes, catalogue default and scrolling behavior.

## Brief and direction

Use the installed frontend-design skill to make the internship workspace more deliberate and easier to scan. Retain the original logo, dark brand palette, scroll-responsive gradient and B2 interactions. Keep the UI English and keep fixture interactions separate from authentication, API and persistence.

The design centers on the internship decision: compare a compact list while reading the selected role. Avoid decorative statistics, repeated slogans, all-caps eyebrows, prominent framing around every label and marketing copy inside the workspace.

| Role | Existing palette |
| --- | --- |
| Foundation | Navy `#29263B` |
| Background depth | Indigo `#142A7B` and violet `#4A3F74` |
| Main action | Electric blue `#2862CF` |
| Secondary text | Lavender `#B2BCDC` |
| Main text | Warm white `#FFFBF0` |

Use Segoe UI with Helvetica Neue/Arial fallbacks, without downloading fonts. Headings use weight 600 and restrained tracking; body copy stays normal weight. Card titles are 16px, supporting copy/navigation 14px and compact metadata 12px. Native mobile fields remain 16px. Controls keep an 8px radius; cards use 12px; skill labels use a smaller 6px radius.

## Layout plan

```text
Desktop
+------------------+---------------------------------------------+
| InternCalling    | Breadcrumb                  Demo disclosure |
| Jobs             +---------------------------------------------+
| Profile          | Page title, tabs, search and inline filters  |
| Applications     +-------------------+-------------------------+
| Settings         | Compact job list  | Selected internship     |
|                  | independent      | company, facts, actions |
| Demo identity    | scroll            | readable role brief     |
+------------------+-------------------+-------------------------+

Mobile
+----------------------------------------+
| Menu / InternCalling              Demo |
| Page title and tabs                    |
| Search                         Filters |
| Job list                              |
| Detail and filters open in drawers     |
+----------------------------------------+
```

Left alignment and a stable type hierarchy connect the public home, Jobs, Profile and Settings. The public hero pairs a concrete product promise with example roles that link to their own detail selection. The workspace keeps promotional content out of the job comparison area.

## Critique and implementation decisions

- The earlier screen spent too much height on a tagline, a permanent notice and an introductory headline. Replace these with a compact breadcrumb, visible Demo disclosure and a functional page title.
- Equal emphasis on borders, badges and large match circles made the list slow to scan. Use quieter separators, fewer badge outlines, compact scores and a clear selected-card state. A full-card selection target retains a separate save control.
- Mobile facets previously pushed results below the first screen. Keep search visible and move country/workplace into the accessible shared Drawer, with an active-filter count and reset action.
- The first visual review found inconsistent mobile tab-count alignment. Stack counts consistently below labels on small screens. Larger screens keep them inline.
- The detail facts were too tall in the first refinement. Put workplace, duration and compensation in one row on wide screens, while narrower views retain wrapping.
- Long slash-separated navigation labels wrapped when active. Use Jobs, Profile, Applications and Settings, with fuller context inside each page.
- Keep the requested background blend, with a quieter 0.08–0.42 opacity range. Reduced motion keeps the blend static at 0.08. No new unrelated animation or decorative assets.

## Component and routing notes

CompanyMark and PageHeading provide shared company initials and page hierarchy. MatchScore accepts sm/md display sizes. EligibilityBadge uses a readable icon/text treatment, without computing eligibility. Input, Select, Badge and Button retain their native contracts and use the same surface/border tokens.

`/preview/jobs?job=<fixture-id>` initializes the selected demo job. The server page reads asynchronous searchParams using the installed Next.js PageProps helper, so that route is rendered on demand. Valid role links also open the detail drawer on mobile; unknown IDs fall back to the first demo role. No API lookup occurs. The shared demo provider still retains saved/applied state during client navigation and resets on reload.

## Verification — 4 November 2026

Lint, typecheck and production build passed. The main browser suite passed 65 assertions; three additional assertions confirmed the visible mobile Close control, dismissal with Close and selection from the company's area of a job card. Checks cover filters using native keyboard input, unique field IDs, saved/applied state, route navigation, direct links, focus restoration, Escape, reduced motion, 200% text sizing and 320/390/1024/1440px layouts. No browser runtime errors or external/API requests occurred in the main suite.

Desktop/mobile screenshots were reviewed for Jobs, the public home, filters, direct role details, Profile and Settings. The preview remains fictional and public; real authentication, API/RLS behavior and resume uploads remain outside this design task. No dependencies, package versions, backend logic or infrastructure were changed by the refinement.

# B2 workspace foundation

## Scope and authentication boundary

The shared shell is ready for future authenticated pages, but this task does not implement authentication. There is no Supabase frontend dependency or existing authenticated route group in this checkout. Do not treat AppShell, a route group, a hidden navigation item or a noindex directive as an authorization boundary.

`/preview/jobs`, `/preview/profile`, `/preview/applications`, `/preview/settings` and `/preview/components` are public, clearly labeled UI demonstrations. `/preview` redirects to `/preview/jobs`. The preview is available in development and production builds for review and has noindex metadata. Fixtures live under `components/dev`, never in an API repository or persistence module. Companies, listings, scores and eligibility values are fictional. No personal data, authentication, API calls, external application submissions, browser storage or uploads are involved. State survives client navigation inside the shared layout and resets on reload. Profile and display-preference examples are local to their own page.

When authentication is implemented, create a server route layout that verifies the Supabase session before rendering AppShell. Supply real navigation destinations to AppShell and adapt verified API data to the presentation models. Use the same shell around all authenticated pages. Keep the public home and preview separate. Do not copy the demo provider into product routes or import fixtures into production data access.

## Implemented components

All exports are named. Filenames use kebab-case; component/type names use PascalCase. Direct imports use `@/components/...`. All UI, identifiers and comments are English.

| Component / file | Main contract |
| --- | --- |
| `layout/app-shell.tsx` / AppShell | `navigation`, optional `notice`, `children`; pathname-aware frame and mobile drawer; owns the page's single main landmark |
| `navigation/sidebar.tsx` / Sidebar | Typed navigation items, `activePath`, optional `onNavigate`; actual links with `aria-current` |
| `ui/top-tabs.tsx` / TopTabs | Typed options, controlled `value` and `onChange`, unique `id`, `panelId`, accessible `label`; caller renders the associated tabpanel |
| `jobs/filter-bar.tsx` / FilterBar | Controlled `JobFilters`, `onChange`, country options; caller owns filtering/fetching |
| `jobs/job-card.tsx` / JobCard | `JobSummary`, selected/saved/applied display state, select/save callbacks; separate native action buttons |
| `jobs/match-score.tsx` / MatchScore | `number` or `null`; clamps finite values to 0–100, displays unknown explicitly; never computes matching |
| `jobs/eligibility-badge.tsx` / EligibilityBadge | Caller-provided `eligible`, `review` or `unknown`; never checks rules |
| `ui/badge.tsx` / Badge | Native span properties; neutral/accent; non-interactive |
| `ui/button.tsx` / Button | Existing native properties/refs, primary/secondary/ghost, sm/md; defaults to button/primary/md |
| `ui/input.tsx` / Input | Native input properties/refs, visible label, hint/error, generated or supplied id, optional wrapper class |
| `ui/select.tsx` / Select | Same field contract with native select/option behavior |
| `ui/drawer.tsx` / Drawer | Controlled open/onClose, title, description, children, id, navigation/detail size, optional closeAt media query |
| `jobs/detail-panel.tsx` / DetailPanel | `JobDetail`, optional actions and heading ID; same content inside desktop pane/mobile drawer |
| `ui/loading-skeleton.tsx` / LoadingSkeleton | Accessible label and optional row count; static decorative placeholders, one status announcement |
| `ui/empty-state.tsx` / EmptyState | Title, optional description and real action slot |
| `ui/error-state.tsx` / ErrorState | Safe title/description, optional retry action slot; alert semantics, no raw server errors |

`ui/field.tsx` shares label, description and error wiring. `ui/icon.tsx` contains original decorative line icons with no extra dependency. Button retains its native API, variants and sizes; its theme styling now uses the shared dark-theme accent tokens.

## Layout and visual system

- Desktop starts at 1024px: an inset persistent 208–224px sidebar and Card view catalogue by default. Selecting a card or choosing Split view opens the list/detail panes with independent vertical scrolling. Card view uses natural main-area page scrolling.
- Below 1024px: an always-available Menu action exposes all destinations. Selecting a job opens a full-height modal drawer. Search, filters, tabs and save remain available from the list.
- Shell uses viewport height; mobile main content scrolls normally. Detail content and navigation remain scrollable inside their drawers.
- Use the InternCalling dark theme: navy/violet surfaces, warm-white main text, lavender secondary text, electric-blue actions and pale-blue inline accents. Use semantic tokens, opacity tints and thin borders. The original nine brand colors remain unchanged. The user-approved scroll gradient blends navy, indigo and violet; no heavy shadows or automatic theme switching.
- Use Segoe UI with Helvetica Neue/Arial fallbacks. Use text-xs for metadata/field labels, text-sm for secondary content/actions and desktop fields, text-base for mobile fields/card titles, and text-2xl for page/detail titles. Reserve the public hero scale for the home page.
- Use the Tailwind spacing scale with generous opportunity-card padding. JobCard has comfortable and compact presentation densities. Controls/cards use 24px radii, panels use 32px, and labels/tabs use capsule shapes. See the [rounded-card direction](rounded-cards.md) for the current hierarchy.
- Default, hover, selected, disabled, invalid, loading and unknown states use the same palette. Selection is communicated through text/ARIA as well as color. Filter fields keep visible labels. Clear filters is disabled when there is nothing to clear.

## Keyboard and semantics

- One document-level Skip to content link targets the current layout's single main-content landmark. The root remains a Server Component.
- Sidebar is ordinary semantic navigation, not an ARIA menu. Active links have aria-current=page; mobile trigger exposes aria-expanded/aria-controls. Navigation closes on activation or entering desktop width.
- TopTabs uses tablist/tab/tabpanel relationships, roving tabIndex, automatic activation with Left/Right/Home/End, Enter/Space native buttons and a sliding capsule indicator only when motion is allowed.
- Native dialog showModal supplies background inertness and keyboard containment. Drawer sets initial focus to Close, synchronizes Escape with the controlled state, locks background body scrolling and restores trigger focus. Hidden/removed triggers fall back to main-content. Only one drawer should be opened at a time by a caller.
- Selecting a desktop card moves focus to its detail region; mobile focus enters the detail dialog. Save actions have specific accessible names and pressed state. No nested links/buttons or fake destinations.
- Input and Select preserve native validation/keyboard behavior, associate hints/errors with aria-describedby and set aria-invalid when error text is provided. Ref and native properties pass through.
- MatchScore has a textual accessible percentage or unavailable label; its ring is decorative. Eligibility always includes a text label. ErrorState announces an error; LoadingSkeleton announces loading without animated announcements.

## Verification

Run the actual package scripts from apps/web: `npm run lint`, `npm run typecheck`, `npm run build`.

Manually or in a browser check: desktop/mobile layouts; 320px width and zoom; keyboard-only navigation; tab arrows/Home/End; search, country/workplace filters and reset; save/unsave and applied tab counts; selected detail consistency when results change; navigation across all preview routes; mobile dialog containment, Escape, close, focus return and resize to desktop; public home layout; component error/empty/loading/disabled/invalid states.

After moving routes, a stale `.next/dev/types/validator.ts` from an earlier dev run may still point to the former page path. Regenerate development types by starting the dev server, or remove only that generated validator and run typecheck again. Do not alter source types or tsconfig to hide stale generated errors.

### Local results — 4 November 2026

- `npm run lint`, `npm run typecheck` and `npm run build` passed. No dependencies were installed or changed.
- The optimized production build was tested in a separate headless Edge profile using native browser clicks and keyboard events. All 42 browser assertions passed, including 1440px, 1024px, 390px and 320px layouts, 200% text sizing, reduced motion, filters, saved/applied state, client navigation, modal focus containment, Escape, focus restoration and the public home.
- No browser runtime errors or external/API requests occurred during those scenarios.
- The first typecheck found a stale generated development validator after the public page moved. Removing only that generated validator and regenerating types resolved it. A browser check also found overflowing tab text at 200%; the label now wraps and the check passes.
- Real sign-in/session restoration and API/RLS behavior were not tested because they are not implemented in this UI-only preview. The task definition came from the supplied brief; the linked Notion task database was not accessible through the configured connection, and no Notion state was changed.

### InternCalling branding update

The user explicitly renamed the product to InternCalling and requested the dark theme and a gradient that changes on scroll. This supersedes the earlier light-theme direction. `components/brand/brand-logo.tsx` reuses the original JPEG with an accessible wordmark. It is shared by public, desktop and mobile navigation; the original logo also appears on the public home and in browser metadata. The default API display title and package/documentation branding use InternCalling.

`components/brand/scroll-backdrop.tsx` listens passively for scroll events from the document and nested scroll containers, including job panes and drawers. One requestAnimationFrame updates a CSS variable without React state updates or API access. Route navigation resets the blend. Reduced motion keeps the effect static. The original nine palette primitives remain unchanged; dark semantic roles and a pale-blue inline accent maintain readable contrast. Native controls and dialog surfaces also use the dark scheme.

The existing GitHub/Notion resource links, Supabase project identifiers, SQLite filenames and applied SQL migrations retain their actual identities. No infrastructure resources, databases or remote repositories were renamed or reconnected. No environment/secret files were read or changed. Package locks changed only in the local package names; dependency versions and integrity entries are unchanged.

Validation at the branding stage on 4 November 2026: lint, typecheck and production build passed. All 53 browser assertions passed, including logo/icon/title identity, dark controls, list/detail/page scroll gradients, reduced motion, existing workspace interactions, mobile layouts and 200% text sizing. No browser runtime errors or external/API requests occurred. At that stage the standard surface had approximately 7.5:1 secondary-text contrast, 3.4:1 field-border contrast and 5.4:1 primary-button text contrast. These ratios described the tokens at that stage, not every transparent blend. Backend business logic was unchanged; backend unit tests were not run.

The subsequent [frontend-design refinement](design-refinement.md) defines the current visual hierarchy, surface tints, mobile filter drawer, direct role links and validation results. Jobs, Profile, Applications and Settings continue to share AppShell. The Demo notice now uses a visible header disclosure rather than a permanent banner.

The latest [rounded-card adaptation](rounded-cards.md) supersedes the earlier compact shape values and always-open split layout. It follows the user's AISafety reference while keeping the InternCalling palette, original logo and B2 interactions.

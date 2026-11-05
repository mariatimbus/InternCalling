# InternCalling web

Next.js App Router, strict TypeScript, Tailwind CSS v4, and ESLint. Requires Node.js 22+ and npm. From `apps/web`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables or backend services are required for this initial page.

On Windows with nvm, run `nvm list` and activate an installed compatible version with `nvm use <version>` if `node --version` reports no active version. The local setup was verified with Node.js 24.22.0 and npm 11.19.1.

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build. The public home is a static introduction. The B2 workspace is available at `/preview/jobs`; all listings and interactions there are explicitly fictional. Real discovery, authentication, and application tracking are not connected yet.

## API environment configuration

From `apps/web`, create your local configuration in PowerShell:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env.local -ErrorAction Stop -Confirm
```

If `.env.local` already exists, edit it instead of copying over it. The local file is ignored by Git; `.env.example` is the shared template. Next.js loads environment files from `apps/web`, not from the monorepo root or `src`.

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`, without the `/api/v1` prefix. Future requests will add their endpoint paths, such as `/api/v1/opportunities` or `/health`.

`src/lib/env.ts` exports `API_BASE_URL`. It reads `process.env.NEXT_PUBLIC_API_BASE_URL` directly so Next.js can inline it into browser code, requires an absolute HTTP or HTTPS URL, and removes trailing slashes. Missing, blank, or invalid values throw a clear error when the module is imported; errors do not include the supplied value. The initial page does not import this module or make API requests, so it still runs without configuration or a backend.

The `NEXT_PUBLIC_` prefix makes the value public: never put credentials or secret keys in it. Restart `npm run dev` after changing `.env.local`. For production, set the variable in the build environment before `npm run build`; changing it after the build requires rebuilding the application.

## App shell

`src/app/layout.tsx` owns the document, global styles, scroll backdrop and keyboard-accessible Skip to content link. `src/app/(public)/layout.tsx` provides the public header, main area and footer; its `page.tsx` contains the InternCalling introduction and workspace-preview link. The route group does not change the `/` URL.

`src/app/preview/layout.tsx` reuses `AppShell` for Jobs, Profile, Applications, Settings and the component gallery. Desktop navigation persists across these routes. Jobs opens in a rounded Card view catalogue with natural page scrolling. At 1024px and above, selecting a card or choosing Split view opens independently scrolling list/detail panes; smaller screens use full-height detail, filter and navigation drawers. Every page has one `main-content` landmark.

Open `/preview/jobs` for search, filters, saved/applied tabs and detail selection. Open `/preview/components` for field, loading, empty, error and drawer states. Preview changes live only in memory and reset on reload. The preview is public, is marked `noindex`, and is available in both development and production builds for review. It must never receive real user data. It does not import `src/lib/env.ts`, call the API or use Supabase. See [B2 workspace integration](docs/b2-workspace.md) for contracts, validation and the future authentication boundary.

## Theme

See [UI system conventions](docs/ui-system.md) for spacing, typography, existing tokens and accessibility rules. B2 adds the shared workspace components and mobile navigation; [B2 workspace integration](docs/b2-workspace.md) lists their implemented APIs.

`src/app/globals.css` defines the nine brand colors and semantic roles with Tailwind v4 `@theme`. Prefer `bg-background`, `text-foreground`, `text-muted`, `bg-primary`, `text-on-primary`, and `border-border`. Radius tokens: `rounded-card` and `rounded-control`.

Use the InternCalling dark theme on every screen: navy/violet backgrounds, warm-white text, lavender secondary text, electric-blue actions and pale-blue inline accents. The original logo is shared through `BrandLogo` and used as the browser icon. `ScrollBackdrop` gently changes the background blend as the active page, job pane or drawer scrolls; reduced motion keeps it static. The palette and accessibility rules are documented in the repository's `AGENTS.md`.

The earlier [design refinement notes](docs/design-refinement.md) record the typography and mobile foundation. Public example roles link to `/preview/jobs?job=<fixture-id>` so the selected role opens directly, including in the mobile detail drawer. This preview route reads query parameters on the server and is rendered on demand; it still uses only fictional local fixtures.

The [rounded opportunity catalogue](docs/rounded-cards.md) is the latest visual direction, following the user's AISafety reference. It keeps the same colors, uses softer 24–32px shapes and shares OpportunityCardContent between Jobs and the public home. Back to cards returns from desktop details to the catalogue and restores focus.

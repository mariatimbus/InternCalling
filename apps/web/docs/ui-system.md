# UI system conventions

## Status and scope

B2 stage 1 established the conventions below. B2 now implements the workspace shell, navigation, jobs presentation components and shared controls. See [B2 workspace integration](b2-workspace.md) for the current component inventory and route boundary.
The current shape and catalogue direction is documented in [rounded opportunity cards](rounded-cards.md), following the user's AISafety reference.
The original palette, public home route and Home link are retained. The InternCalling rebrand applies the user-requested dark theme, shared logo and updated public introduction. Workspace pages share a separate AppShell. The public `/preview` routes demonstrate the UI using fictional, memory-only data; they are not authenticated product pages.
Standalone Card, Modal and LoadingState remain proposals. Drawer implements the native dialog behavior directly; a second modal presentation can extract that base when needed.

Keep components presentation-focused: accept typed data and callbacks, without API calls, authentication, persistence, or product rules. The product is named InternCalling. Keep the supplied palette and minimalist design. The user-approved dark theme includes a restrained scroll-responsive background gradient; reduced motion keeps it static. Avoid heavy shadows and unrelated animation.

## Established conventions

### Spacing

Use the existing Tailwind spacing scale. Values below assume the default 16px root font size; use the utilities rather than hard-coded pixels.

| Size | Tailwind examples | Typical use |
| --- | --- | --- |
| 0.25rem / 4px | `gap-1`, `p-1` | Small separation inside compact elements |
| 0.5rem / 8px | `gap-2`, `mt-2`, `px-2` | Label-to-control spacing, small internal gaps |
| 0.75rem / 12px | `gap-3`, `px-3` | Compact control padding |
| 1rem / 16px | `gap-4`, `p-4` | Spacing between fields, compact panels |
| 1.5rem / 24px | `gap-6`, `p-6` | Default card padding, related content groups |
| 2rem / 32px | `gap-8`, `p-8` | Larger groups, roomy desktop cards |
| 3rem / 48px | `gap-12`, `mt-12` | Separation between sections |

Prefer `gap-*` for sibling layout. Use responsive utilities when needed, for example `p-6 sm:p-8`. Workspace pages use compact 16–40px gutters; the public home uses wider editorial spacing. See [design refinement](design-refinement.md) for the current layout hierarchy.

### Typography

Use `font-sans` (Segoe UI, Helvetica Neue, Arial, sans-serif). This local system stack avoids font downloads and keeps controls legible. Choose heading levels by document structure, independently of visual size.

| Utility | Default size | Use |
| --- | --- | --- |
| `text-xs` | 0.75rem / 12px | Compact metadata, field labels and badges |
| `text-sm` | 0.875rem / 14px | Body copy, navigation, errors and desktop controls |
| `text-base` | 1rem / 16px | Card titles and mobile form controls |
| `text-lg` | 1.125rem / 18px | Small panel titles and introductory text |
| `text-2xl` | 1.5rem / 24px | Section or dialog titles |
| `text-4xl sm:text-6xl` | 2.25rem / 36px; 3.75rem / 60px | Existing landing-page hero only |

Use `font-normal` for body text, `font-medium` for labels/actions, and `font-semibold` for titles. Prefer `leading-relaxed` for paragraphs and `leading-tight` for large headings. Keep explanatory text readable and allow wrapping and browser zoom.

### Existing color and radius tokens

The source of truth is [`src/app/globals.css`](../src/app/globals.css). Use semantic utilities in components; do not repeat color literals.

| Role / token | Utility example | Existing brand value |
| --- | --- | --- |
| Background / surface | `bg-background`, `bg-surface`, `bg-elevated` | Navy `#29263B`; surface and elevated add restrained warm-white tints |
| Opportunity card | `bg-card` | Semantic blend of the existing surface and electric blue |
| Main text | `text-foreground` | Warm white `#FFFBF0` |
| Secondary text | `text-muted` | Lavender blue `#B2BCDC` |
| Primary action | `bg-primary`, `text-primary` | Electric blue `#2862CF` |
| Primary hover | `hover:bg-primary-hover` | Royal blue `#1F3CA3` |
| Text on primary | `text-on-primary` | Warm white `#FFFBF0` |
| Borders | `border-border` | Lavender blue at 56% opacity; layouts may use lighter opacity utilities |
| Inline accent / hover | `text-accent`, `hover:text-accent-hover` | Pale blue `#C0C9E5` / warm white |
| Keyboard focus | Global `:focus-visible`; `outline-focus` if needed | Pale blue `#C0C9E5` |

The original nine primitive colors remain unchanged. Indigo and violet create the dark background blend; selection uses pale blue/indigo. Primary stays electric blue for filled actions. Use accent for readable inline links, icons and selected labels on dark backgrounds. Native controls and dialogs also use the dark color scheme; there is no automatic light-mode switch.

| Radius token | Utility | Use |
| --- | --- | --- |
| `--radius-control`: 1.5rem / 24px | `rounded-control` | Rounded controls and link focus shapes |
| `--radius-card`: 1.5rem / 24px | `rounded-card` | Opportunity and form cards |
| `--radius-panel`: 2rem / 32px | `rounded-panel` | Larger panels and drawer corners |

### File organization and naming

The following locations record the initial file conventions. Modal and SiteHeader remain proposals; the implemented workspace inventory and preview locations are listed in b2-workspace.md.

```text
src/components/ui/button.tsx           # Button and ButtonProps
src/components/ui/field.tsx            # Shared label, hint and error structure
src/components/ui/modal.tsx            # Shared modal behavior
src/components/ui/drawer.tsx           # Lateral presentation using the modal base
src/components/navigation/site-header.tsx
src/components/dev/ui-preview.tsx      # Future development-only preview
docs/ui-system.md
```

Use kebab-case filenames, PascalCase component/type names, and named exports. Import components directly, for example `@/components/ui/button` once implemented. Keep styles with their component; share field structure/styles between Input and Select. Application pages consume components instead of copying button/input class lists. Use `className` for contextual layout without overriding the component's variant styling.

### TypeScript properties and code documentation

- Extend the relevant native React element properties so `disabled`, `required`, ARIA attributes, events, and refs remain usable. Avoid `any` and broad polymorphic APIs.
- Use explicit string unions for variants and sizes; document defaults. Keep native controlled/uncontrolled input behavior rather than adding a second value API.
- Pass actions as callbacks and content as `children` or explicit display properties. Do not embed product workflows.
- Keep Server Components where possible. Add `"use client"` only where state, browser APIs, or event handling requires it; keep the root layout on the server.
- Add JSDoc to exported components and non-obvious properties: purpose, defaults, accessibility requirements, and a short usage example. Examples must state when they describe an API not yet implemented.

Button's implemented type/documentation shape (the implementation imports the React type directly):

```tsx
type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  /** Visual emphasis; defaults to primary. */
  variant?: "primary" | "secondary" | "ghost";
  /** Defaults to md. */
  size?: "sm" | "md";
};
// Usage: <Button type="button" variant="secondary">Close</Button>
```

### Accessibility and keyboard behavior

- Give each field a visible label associated with its unique `id` using `htmlFor`. A placeholder is an example, not a label.
- Associate hints and errors using `aria-describedby`. Set `aria-invalid` when invalid; errors must explain the issue in text, without relying only on color. Validation decisions belong to the caller.
- Preserve the global focus outline (2px pale blue, 4px offset). Never remove it without an equally visible replacement. Keep Skip to content functional.
- Use native buttons, inputs and selects. Preserve Tab/Shift+Tab order and native select arrow-key behavior; avoid positive `tabIndex` values. Buttons work with Enter/Space, links with Enter.
- Icon-only controls require an accessible name. Decorative visuals are hidden from assistive technology. Loading messages use a restrained status announcement; avoid repeatedly announcing animations.
- Provide sufficiently large touch targets, allow text wrapping, and verify mobile layouts and zoom. Honor reduced-motion preferences when adding indicators or transitions.
- For modal overlays, including the implemented Drawer: use native `<dialog>` with `showModal()`, an accessible title, an appropriate initial focus target, and a visible close button. Keep Tab/Shift+Tab inside while open, handle Escape and synchronize React state, prevent background interaction/scroll, and restore focus to the trigger when it still exists. Verify these behaviors in browsers rather than assuming native behavior covers every case.
- Mobile navigation uses the same modal behavior, with a trigger exposing `aria-expanded` and `aria-controls`. Close on link activation and on switching to desktop layout. Use a `<nav>` of ordinary links, not an ARIA `menu` requiring specialized arrow-key interactions.

### Actions versus navigation

Use a button to perform an action, such as opening a dialog. Default reusable buttons to `type="button"`; use `type="submit"` explicitly for form submission.

Use Next.js `Link` to navigate to an existing internal route. Do not nest buttons inside links, use `href="#"` as a fake action, or add links to unimplemented pages. Current destinations include `/` and the documented `/preview` routes.

```tsx
// Native action example; onOpen is supplied by the caller.
<button type="button" onClick={onOpen}>Open dialog</button>
// Existing navigation destination, with Link imported from next/link.
<Link href="/">Home</Link>
```

## Implemented component: Button

Import the named export from `@/components/ui/button`. Defaults are `variant="primary"`, `size="md"`, and `type="button"`. Native button properties, including `disabled`, ARIA attributes, events, and React 19 refs, are forwarded to the button. `children` becomes its visible content; `className` adds contextual layout classes.

Variants use complete, static Tailwind class strings: primary uses primary/on-primary with a primary-hover background; secondary uses surface/border and foreground text with an elevated hover surface; ghost uses muted text and becomes elevated/foreground on hover. Hover styling applies only when enabled. Disabled buttons use native disabled behavior, reduced opacity, and a not-allowed cursor. Keyboard focus uses the shared pale-blue outline.

Both sizes use `text-sm`, `py-2`, and `rounded-control`: `sm` uses `min-h-10 px-3`; `md` uses `min-h-11 px-4`. Minimum heights allow text to wrap and the control to grow.

```tsx
import { Button } from "@/components/ui/button";

<Button>Continue</Button>
<Button variant="secondary" size="sm">Close</Button>
<Button variant="ghost" disabled>Unavailable</Button>
<Button type="submit" className="mt-4">Submit</Button>
```

These are isolated usage snippets, not additions to the current page. To supply `onClick`, render Button from a Client Component; Button itself does not require `"use client"`. Use Next.js Link for navigation instead of Button.

## Original component contracts and current status

Input, Select, Badge, Drawer and EmptyState below are implemented. Card, standalone Modal and LoadingState remain proposed. The implemented LoadingSkeleton covers the B2 loading placeholder. Sizes use rem-based utilities; pixel equivalents assume a 16px root font.

| Component | Proposed variants and dimensions | Proposed properties / behavior |
| --- | --- | --- |
| Input | One visual variant; default `min-h-11 px-3 py-2 text-base rounded-control` | Native input properties plus visible `label`, optional `hint` and `error`; required/disabled/invalid are states, not variants |
| Select | Same sizing and field styling as Input | Native `<select>` properties and `<option>` children; same label/hint/error contract |
| Badge | `neutral` (subtle accent surface), `accent` (primary tint/accent text); `rounded-full px-3 py-1 text-xs` | Text/children and variant; non-interactive; no product-status vocabulary |
| Card | One variant; `p-6 sm:p-8 rounded-card border border-border bg-surface` | Native container properties and `children`; caller chooses heading level; not clickable by default |
| Modal | One central presentation; `w-full max-w-lg`, viewport gutter `p-4`, scrollable panel, `rounded-card` | Controlled `open`, `onClose`, required title, optional description, `children`; shared accessible dialog behavior |
| Drawer | Right-side presentation; `navigation` (`max-w-sm`) or `detail` (`max-w-2xl`); full viewport height, scrollable content | Controlled `open`, `onClose`, title, description, children; native dialog behavior with focus restoration and optional responsive close query |
| EmptyState | One variant; `p-6`, `text-lg` title and `text-sm` description | Required title, optional description and action slot; caller supplies a real action |
| LoadingState | One variant; `text-sm` message and small decorative indicator | Accessible message, status announcement; caller owns loading state; no data fetching |

Do not add success/danger palettes or libraries without a concrete need. B2 explicitly authorizes workspace navigation, compact jobs, eligibility/match presentation and previews. These keep the existing brand tokens; product outcomes are supplied by the caller, not calculated in presentation components.

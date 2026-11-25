---
name: "InternCalling"
description: "A light, readable opportunity workspace for students."
colors:
  pale-blue: "#c0c9e5"
  lavender-blue: "#b2bcdc"
  electric-blue: "#2862cf"
  cobalt-blue: "#2e46aa"
  royal-blue: "#1f3ca3"
  indigo: "#142a7b"
  violet: "#4a3f74"
  navy: "#29263b"
  warm-white: "#fffbf0"
  background: "color-mix(in srgb, var(--color-warm-white) 65%, var(--color-pale-blue))"
  elevated: "color-mix(in srgb, var(--color-warm-white) 88%, var(--color-pale-blue))"
  nav-track: "color-mix(in srgb, var(--color-warm-white) 72%, var(--color-pale-blue))"
  line: "color-mix(in srgb, var(--color-lavender-blue) 36%, var(--color-warm-white))"
  danger-surface: "#fff1f2"
  danger-border: "#be123c"
  danger-foreground: "#881337"
typography:
  display:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "clamp(2.125rem, 1.43rem + 3.05vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  section:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  card:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.016em"
  body:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.9375rem"
    lineHeight: 1.65
  metadata:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: 1.45
  control:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4285714286
  label:
    fontFamily: "\"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3333333333
rounded:
  control: "0.5rem"
  card: "0.875rem"
  panel: "1rem"
  badge: "0.375rem"
  sidebar-panel: "0.75rem"
spacing:
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "7": "1.75rem"
  "8": "2rem"
  "9": "2.25rem"
  "12": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.warm-white}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.royal-blue}"
  button-secondary:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.navy}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.violet}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  field:
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  badge-neutral:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.violet}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "0.25rem 0.5rem"
  badge-accent:
    textColor: "{colors.royal-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "0.25rem 0.5rem"
  opportunity-card:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.navy}"
    rounded: "{rounded.card}"
    padding: "1rem"
  navigation-item:
    textColor: "{colors.violet}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
---

# Design System: InternCalling

## Overview

**Creative North Star: "The Student Workspace"**

InternCalling presents opportunities and personal experience as readable documents. Warm-white surfaces sit on a pale-blue tinted ground; navy text and violet supporting copy keep the hierarchy quiet, with blue reserved for actions and selection. The existing name and logo remain the identity anchors.

The interface favors comparison and editing: clear titles, recognizable organization marks, small factual labels, structured detail sections and a CV-style profile. It is a light Operate interface with restrained borders, generous spacing and no decorative gradients or background animation.

**Key Characteristics:**
- Light document surfaces and flat borders.
- Consistent logo, title, company and fact hierarchy.
- Consistent controls with visible keyboard focus and clear error text.
- Responsive lists, detail drawers and profile sections.

## Colors

A restrained blue identity supports warm document surfaces and legible dark text. Frontmatter contains each distinct primitive or mixed surface once; semantic aliases remain in `apps/web/src/app/globals.css`.

### Primary

- **Electric blue:** primary actions and progress; royal blue supplies primary hover, active links and accent text.
- **Cobalt blue:** keyboard focus outlines and the display accent utility. Indigo supplies deeper accent hover and selection text.

### Secondary

- **Violet:** metadata, field labels and secondary navigation text.
- **Pale blue / lavender blue:** surface mixing, selection fill and borders; these are accents rather than light-background reading text.

### Neutral

- **Warm white:** surface, card, logo surface and text on primary actions.
- **Navy:** foreground and body copy.
- **Background / elevated / navigation track / line:** the distinct mixed values in frontmatter are the canonical surface and separator recipes. Keep their CSS color-mix expressions intact.
- **Danger surface / border / foreground:** reserved error treatment; do not turn these into a second brand palette.

**The Semantic Color Rule.** Use semantic application color utilities; keep the brand primitives centralized in globals.css.

## Typography

One sans-serif stack serves interface headings, reading text and labels. The existing logo remains separate artwork. Frontmatter records the shared utility sizes at their base breakpoint; these are interface roles, not a requirement for a new editorial display face.

- **Display:** large introductory utility; fluid size and tight spacing from the display token.
- **Headline:** fixed `1.75rem` page title with `1.25` line height; consistent across workspace and account screens.
- **Section:** `1.125rem`, semibold, with `1.4` line height; profile sections pair this role with the existing outline icon family. The profile document and its sidebar use `1.5` line height.
- **Card:** opportunity titles increase to `1.125rem` at `640px`.
- **Body:** reading copy uses the body role; extended profile biography is constrained with `max-width: 65ch`.
- **Metadata / control / label:** compact supporting facts, buttons and chips. Inputs use `1rem` on small screens and `0.875rem` from `640px`.

The body enables font features `cv11` and `ss01`. Preserve natural sentence case and wrapping; do not force long organization or opportunity names onto one line.

## Layout

The public frame centers a maximum `80rem` container with horizontal padding of `1.5rem`, `2.5rem` from `640px`, and `3.5rem` from `1024px`. Opportunity listings use full-width rows. The workspace occupies the dynamic viewport height, with a fixed frame and independently scrolling main region. Shared workspace pages use a maximum `80rem` container with `1rem` side padding, increasing to `1.75rem` from `640px` and `2.25rem` from `1280px`; vertical padding is `1.5rem`, increasing to `2rem` from `640px`. Page descriptions use subdued violet text beneath the title. Its persistent navigation appears at `1024px`, measuring `14rem`, then `15rem` from `1280px`. The header has a minimum height of `4rem`.

Use the quarter-rem spacing rhythm in frontmatter. Cards use `1rem` padding, increasing to `1.25rem` in comfortable layouts at `640px`. Profile content centers within `80rem`; the CV document has `1.5rem` padding, increasing to `2rem` at `640px`. Its sections use separators and `1.75rem` vertical padding rather than nested cards. At `1024px`, profile tools occupy a `19rem` sidebar beside the document; the column gap grows from `2rem` to `3rem` at `1280px`.

In the jobs workspace, the split view begins at `1280px`. The left column contains the page heading, search and filter controls, tabs, result counts and opportunity list. The selected detail reader begins alongside the heading in the right column, so the search controls do not consume its vertical space. The reader is sticky with a `1.5rem` top offset and height `calc(100dvh - 10rem)`; its body scrolls independently and its apply/save footer remains visible. Below this breakpoint, retain a single list with the detail drawer.

Below desktop navigation, use the existing modal navigation drawer. Detail content also uses a drawer on narrow screens. Flex wrapping, minimum-width zero and safe text wrapping preserve usability when facts or titles are long. Keep route-specific list/detail composition in the surface brief rather than imposing it on every screen.

## Elevation & Depth

The shared controls, opportunity cards and profile document are flat. Warm surfaces, subtle mixed separators and light blue selection fills convey grouping. Drawers use a translucent background-colored backdrop and native dialog layering. The workspace information popover uses border and stacking rather than a decorative shadow.

**The Flat Surface Rule.** Separate content with surface tone, spacing and fine borders rather than decorative shadows.

## Shapes

Controls have modest curves; opportunity cards are gently rounded, and drawers use the panel radius on their exposed edge. Chips use the smaller badge radius. Profile sidebar panels have their own slightly tighter radius. Profile document sections remain square and borderless internally except for top separators. Circular geometry is reserved for identity marks, progress indicators and timeline nodes. Preserve these contextual differences rather than turning every section into a pill or card.

## Components

### Buttons

Clear text actions with three levels of emphasis: primary uses electric blue and warm-white text, secondary uses a warm surface and a light border, ghost uses transparent fill with violet text. All share the control radius and semibold label weight. Default controls have a `2.75rem` minimum height; small controls use `2.5rem`. Primary hover darkens to royal blue; secondary and ghost hover use elevated fill. Disabled controls use half opacity and a blocked cursor. Buttons use a short color transition only when motion is allowed.

Global keyboard focus is a cobalt outline (`2px`, offset `4px`). Preserve native button semantics and a visible accessible name for icon-only actions.

### Chips

Non-interactive factual labels use elevated fill and violet text. Accent labels use a ten-percent primary tint and royal-blue text. Labels wrap within available space; they do not replace actionable filters.

### Cards / Containers

Opportunity cards use warm-white fill, a fine mixed line border and the card radius. Hover strengthens the border. Selection uses the primary border; compact split-view cards retain their warm-white fill, while comfortable cards use a five-percent primary tint. Comfortable cards group the organization mark and heading above a separated fact row; compact cards keep the logo/title/company grouping while wrapping facts and actions. Description snippets are clamped to preserve scanning. Full detail sections remain readable rather than adopting the snippet clamp.

### Inputs / Fields

Controls use the control radius, a lightly blended lavender border, warm-white surface fill and a minimum `2.75rem` height. Supporting labels use `0.875rem` navy text with medium weight. Hover strengthens the border; focus uses cobalt. Field errors combine danger-colored text and an invalid border state. Disabled inputs use an elevated fill and sixty-percent opacity. Keep labels and hint/error associations when composing fields.

### Navigation

The desktop sidebar pairs outline icons with sentence-case text. Active destinations use electric-blue fill, warm-white text, a semibold label and a trailing chevron. Inactive navigation uses violet; hover uses elevated fill and navy. Use `aria-current="page"` for the active destination. Segmented navigation uses a warm-white bordered track, ten-percent primary active fill and a `2.75rem` minimum hit area; its focus outline sits closer to the control (`1px` offset).

Mobile navigation opens in the existing native dialog drawer, preserving Escape handling and focus restoration. Public navigation retains the logo and essential links, with secondary desktop links hidden on smaller screens.

### Selected Detail Reader

The desktop reader uses the panel radius, warm-white surface and fine separator border. Keep its scrollable body separate from the non-shrinking action footer: source requirements and longer descriptions scroll while apply/save actions stay available. Align the reader with the start of the list column, including its heading and controls, rather than starting below the search interface. The same detail content opens in a drawer below the split-view breakpoint.

### Workspace Navigation and Search

Desktop navigation uses the warm surface; the selected route has electric-blue fill, warm-white text and a trailing chevron. Opportunity detail routes keep Jobs selected. The account area is a quieter bounded footer region; mobile retains the labeled navigation drawer. Jobs search groups the keyword field, Search and Filters inside one surface. Applied filters retain removal and clear actions. List tabs use a light selected tint, keeping the primary blue for actions and workspace location.

The compact job title wraps unbroken source tokens. Repeated skill chips are omitted when the same information is already in requirement chips. A full border identifies the selected card. Detail readers use `1rem` padding on mobile and `1.5rem` on wider screens; the match overview is a compact, secondary information strip. Match rings expose their complete score through a labeled image role.

Public entry groups the existing primary action with its introductory copy and presents the existing three-step guidance alongside it on desktop. Authentication uses a two-column introduction/form layout at desktop widths and a single form column on mobile. Forms use surface-colored inputs, navy labels and danger-colored validation errors.

### CV Document

The profile document is one warm-white bordered surface. Section headings and thin separators establish the CV structure. Experience entries use a fine vertical timeline and outlined circular nodes; completion, social links and profile insights remain separate surface panels in a sticky desktop sidebar. Section add actions use secondary buttons; contact facts wrap in modestly rounded labels instead of long pills. PDF management belongs to the dedicated Resumes page. Retain edit, loading, empty and failure states without filling missing personal information with sample facts.

### Resume Library

Use a warm-white table with filename and file icon leading, subdued metadata columns and a native row-action disclosure. Add/Replace opens an inline PDF picker. Keep private access and removal confirmation explicit. On mobile hide secondary columns and show the upload date alongside the filename. Display confirmed metadata and the actual supported count; do not invent slots, target titles or analysis status. Optional profile import lives in its own disclosure below the library.

### Motion and Icons

Use the existing outline SVG icon family for facts and navigation. Shared segmented links use color-only transitions (`150ms`) when motion is allowed; opportunity cards also restrict their transition to colors under the motion-safe condition. No new background animation is part of this system.

## Do's and Don'ts

### Do:
- Do use semantic color utilities for surfaces, text, actions, borders and focus.
- Do preserve the existing logo and the brand blue, navy and warm-white identity.
- Do keep titles, company names and source facts easy to scan, with long text allowed to wrap.
- Do retain visible focus, semantic controls and reduced-motion behavior.
- Do show missing information honestly and keep profile document sections distinct from editing controls.

### Don't:
- Don't introduce a dark theme or a different brand palette without explicit approval.
- Don't add decorative gradients, heavy shadows or unnecessary animation.
- Don't use pale or lavender blue as body text on light backgrounds.
- Don't fabricate opportunity facts, match scores or profile content to fill a design.

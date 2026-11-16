# Rounded opportunity catalogue

## Direction

The user requested a less angular, less rigid interface while preserving the InternCalling colors, using [AISafety training](https://aisafety.com/training) as a reference, especially for cards. The reference was inspected visually in a separate browser profile. Its useful patterns are generous card padding, rounded surfaces, capsule labels, visible descriptions and clear rows for practical information. The implementation adapts those patterns with original components and fictional internship content; it does not copy the site's source, branding, assets or program listings.

The nine palette primitives are unchanged. Card surfaces use a semantic blend of the existing surface and electric blue. Typography keeps the local Segoe UI stack, with normal-weight card titles and 16px descriptions in the comfortable catalogue density. There are no font downloads or new dependencies.

## Shape and layout

- Cards and standard controls: 24px radius; labels and tabs use capsule shapes.
- Larger panels and drawer corners: 32px radius.
- Comfortable cards: 24–32px padding, visible description, location, duration, compensation, workplace, illustrative deadline, skills, eligibility and match.
- Compact cards: 20–24px padding and shorter descriptions for the split-view list. Full details remain available in the detail panel.
- The sidebar floats in an inset rounded surface. Strong vertical dividers and the permanent header rule are removed. The existing scroll gradient and reduced-motion behavior are retained.

```text
Card view (default desktop)
  floating navigation    title / pill tabs / rounded filters
                         [opportunity]  [opportunity]
                         [opportunity]  [opportunity]
                         natural page scrolling

Select a card or choose Split view
  floating navigation    [compact list]  [rounded detail panel]
                          separate scrolling in each pane

Mobile
  menu / brand / demo
  title / pill tabs / search / Filters
  [single-column opportunity cards]
  details and filters open in shared modal drawers
```

Card view scrolls the entire main area naturally. Split view retains B2 list/detail support at 1024px and above. Selecting a catalogue card opens its details and focuses the detail region. Back to cards restores focus to the originating card, with a layout-control fallback if the card was removed. The view controls expose their selection through aria-pressed. Valid direct role links still open desktop details or the mobile drawer.

## Shared implementation

OpportunityCardContent owns the shared information hierarchy used by JobCard and the public home. Its heading slot receives a real native button in Jobs or a real internal Link on the public home. Saving remains a separate control above the full-card hit target. The comfortable/compact density is presentation-only.

JobSummary has optional description, deadlineLabel and deadlineText display fields. The demo fixtures provide a shorter illustrative deadline for cards; the full fictional-data notice remains in details. No API response, Supabase schema, eligibility calculation, matching calculation or persistence contract was changed.

After reviewing the first screenshots, card titles were softened to normal weight, catalogue descriptions increased to 16px, and deadline text shortened. A further review removed the independently scrolling catalogue region; only Split view retains separate panes. Profile, Settings, the component gallery and the public home inherit the shared rounded controls and surfaces.

## Verification — 4 November 2026

`npm run lint`, `npm run typecheck` and `npm run build` passed. The final browser run passed 72 main assertions and three additional assertions, 75 total. Checks include the default two-column catalogue, rounded card shape, visible descriptions/compensation, natural page scrolling, opening/closing Split view, focus restoration, filters, saved/applied state, direct links, mobile drawers, 320/390/1024/1440px layouts, 200% text sizing and reduced motion. No browser runtime errors or external/API requests occurred in the local main suite.

Screenshots of the reference and local desktop/mobile catalogue, public home, split pane, Profile and Settings were inspected. All listings and account-like interactions remain explicitly demonstrative and local. No environment/secret files, dependencies, backend logic, database resources or remote repositories were changed by this adjustment.

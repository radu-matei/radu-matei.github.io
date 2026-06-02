# Blog redesign — design

Date: 2026-05-22
Status: approved (validated interactively via mockups); implementation in progress.

## Context & goal

Radu is relaunching his blog and will share posts both internally and externally,
so the site needs to make a strong impression. Goal: a minimal, paper-inspired,
monochrome design with strong contrast — refined, fast, and credible. The existing
Hugo structure and the `hugo-xmin` theme (already a personal fork) are kept; this
is a refinement, not a rewrite.

References: rauchg.com and leerob.com — both minimal, monochrome, system-font
sans-serif.

## Aesthetic

- Minimal, monochrome, "reminiscent of papers, adapted for the web."
- No decorative color — contrast and weight carry hierarchy.
- Restraint: no top-nav chrome, no boxes, generous whitespace.

## Typography

- Body & headings: system sans —
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`.
  No web fonts: fast, and matches the references.
- Code: system mono —
  `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`.
- Base ~16–17px, line-height ~1.7.
- Headings near-black, weight 600, slight negative letter-spacing.
- Body text justified with automatic hyphenation — see Smart justify.

## Color

Light: background `#ffffff`; body text `#2b2b28`; headings `#131313`;
secondary/meta `~#a0a09a`; hairline rules `#ededeb`; inline-code bg `#f0f0ec`;
code-block bg `#f7f7f4`. Links are monochrome (body text color) with a
light-gray underline — no blue.

Dark (follows system `prefers-color-scheme`, no toggle button): background
`#181816`; body `#cfcfc8`; headings `#f0f0ea`; secondary `#75756d`;
code bg `#211f1d`. Softer than pure white on pure black.

## Layout

All pages: centered column ~648–680px; a shared masthead (site name linking to
`/`) at the top; a shared centered footer (About • Notes). No top nav.

- **Homepage:** masthead → bio → "Writing" (small uppercase label) list of recent
  post titles, no dates → "All writing →" → "Projects" → footer.
- **Article:** masthead → `<h1>` title → byline (Radu Matei · Month Year ·
  N min read) → justified body → footer.
- **About:** masthead → body with a circular, grayscale, transparent portrait
  floated to the side (text wraps the circle) → contact links → footer.
  The copy is a placeholder — Radu writes it later (see Deferred).
- **Archive** (`/blog`, `/notes`): masthead → posts grouped by year with quiet
  year labels → footer.
- **404:** minimal.

## Components

- Links: monochrome, underlined with a light underline color.
- Code blocks: calm, low-saturation Chroma theme (light + dark), soft background,
  copy-to-clipboard button.
- Blockquote: thin left rule, secondary color, italic.
- Portrait: `static/img/main/profile.png` — circular clip, `grayscale(100%)`,
  transparent (no fill behind it), floated. Scoped to the About page only;
  images inside posts keep their color.

## Smart justify

Body text is justified, CSS-only: `text-align: justify` + automatic hyphenation
(`hyphens: auto`) + `text-wrap: pretty`. `text-wrap: pretty` is the browser's
own improved line-breaking and reduces uneven inter-word spacing. Zero
JavaScript, no flash. On narrow screens the text falls back to left-aligned.

A full client-side Knuth–Plass pass was considered and declined: `pretext` is a
text-measurement toolkit, not a drop-in justifier, and hand-rolling the
algorithm conflicts with the minimal/fast goal.

## Refinements (all in scope)

- Social card metadata — Open Graph + X/Twitter tags.
- Auto-generated per-post OG images — Hugo `images.Text`, build-time.
- Favicon — SVG monogram.
- Polished, discoverable RSS feed.
- Heading anchor links — hover-reveal, via a heading render hook.
- Copy button on code blocks.
- Typographic polish — smart quotes/dashes (Goldmark typographer), figure
  captions via an image render hook.
- Reading time in the byline.

## Bug fixes

- Article title: `<h2>` → `<h1>`.
- Mobile breakpoint `@media (max-width: 0px)` → a real breakpoint (~640px).
- Dark-mode JS deduplicated (currently duplicated across two files).
- Syntax highlighting moved from the runtime highlight.js CDN to build-time
  Chroma — removes the CDN dependency and custom scripts.

## Implementation notes

- Theme `hugo-xmin` is edited in place (it is already a personal fork).
- Chroma: `[markup.highlight] noClasses = false`, themed with CSS.
- OG images: generated at build time from a Hugo template + `images.Text`;
  needs a TTF/OTF font available as a Hugo resource.
- Net JavaScript decreases sharply: highlight.js (CDN + language files + two
  custom scripts) is removed; only a small copy-button script is added.

## Out of scope / deferred

- No comments, no analytics, no client-side search.

## Addendum — 2026-05-22 (post-launch)

- The `notes` section was retired and replaced by a **Changelog**: a
  `content/changelog/` section of short, dated posts. Each entry is its own
  page (permalink + RSS feed); `/changelog/` renders the entries inline; the
  homepage shows the latest entry under a small "Changelog" label — same block
  shape as the Writing and Projects sections, but just one entry so the
  homepage stays sparse; the footer links the full log. The two former notes are the changelog's first entries, and
  the old `/notes/` URLs redirect (`/notes/` itself to `/changelog/`).

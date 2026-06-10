# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-only web app that turns Caroline Myss's archetype work into a three-stage
interactive self-reading. Runs entirely in the browser — no backend, no accounts, no
persistence (a refresh restarts the reading). Cards are text-only but the `Card`
component is art-ready (`Archetype.image`).

## Commands

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc -b && vite build (type-check + production bundle)
npm run extract  # regenerate src/data/archetypes.ts from gallery.pdf (needs python3 + pypdf)
npm test         # Playwright smoke test, both viewport projects

# single project / single test
npx playwright test --project=desktop
npx playwright test -g "full reading flow"
```

There is no separate lint step; `npm run build` (via `tsc`) is the type gate. `strict`,
`noUnusedLocals`, and `noUnusedParameters` are on, so unused imports/vars fail the build.

The Playwright config starts the dev server itself (`reuseExistingServer: true`), so
tests work whether or not a dev server is already running. The `mobile` project runs
Chromium at a 390×844 touch viewport (not WebKit) to avoid an extra browser download.

## Architecture

**Four-stage state machine.** `src/App.tsx` holds a single discriminated-union `Stage`
state and routes between stages; there is no router. The flow and the data that passes
between stages:

1. **Swipe** (`StageLayout` + `SwipeStack`) — the full shuffled deck of ~91 archetypes.
   Right = "this is me". Produces a kept pile (right) and a rejected pile (left).
2. **Shadow** (`SwipeStack` again, `stage: 'shadow'`) — a second pass over the *rejected*
   pile, framed as confronting reluctance/denial. Right = reclaim ("this is me too"). It
   has a Skip control ("I'm done looking") that finishes early with progress so far.
   Reclaimed cards merge into the kept pile. Skipped if the rejected pile is empty.
3. **Filter** (`FilterStage`) — only entered when the combined pile is >8. Each round sorts
   cards into Innate (keep) vs Adaptive (drop) and repeats on the survivors until ≤8.
   See convergence rules below.
4. **Roundtable** (`Roundtable`) — the final ≤8 cards, free-dragged around a table with a
   fixed "You" node; exported as PNG.

Routing (`route()` in App.tsx, applied after Stage 1 and again after Shadow): 0 kept →
`empty` screen; ≤8 kept → skip Filter and go straight to Roundtable; >8 kept → Filter.
Reclaimed shadow cards are **not** visually distinguished afterward — once merged they are
ordinary kept cards.

**One swipe primitive, reused.** `SwipeStack` is a generic binary-swipe component
(configurable `left`/`right` `SwipeSide`s) used by *both* Stage 1 and Stage 2. Because of
this, the two stages render identical-looking UI and both show an "N left" counter — do
not try to distinguish them by on-screen text (the Playwright test learned this the hard
way and drives stages by exact card counts instead). Gestures and the roundtable drag are
both powered by **framer-motion** (`drag` + `onDragEnd`); there is no separate
swipe/DnD library. `SwipeStack` keeps a `history` ref of decisions so the "Undo last card"
button can reverse the most recent swipe (pops the card off its pile, decrements the index,
replays it sliding back in) — this works for both stages for free.

**Filter convergence** (`FilterStage.tsx`, `TARGET = 8`): after each round, survivors
(= Innate pile) determine the next phase — `>8` → interstitial → another round; `===8` →
done; `<8` → `RescuePhase`, where the seeker can pull dropped cards back up to 8 (or
proceed with fewer). A round that keeps everything is flagged `noProgress` and nudges the
user to be stricter.

**Roundtable positioning** (`Roundtable.tsx`): the draggable surface is a rounded
**square** (`overflow-hidden`), not a circle — the concentric rings only *depict* a round
table. This is deliberate: a circular clip would cut off wide tokens and corner-dragged
tokens. Long archetype names wrap (`max-w-[130px]`) so they fit near the edges. Initial
token positions are percentages from `initialLayout()`, clamped to 22–78% so nothing
starts clipped. Drag is constrained to the table via `dragConstraints={tableRef}`. Export
captures **only** `tableRef` (`lib/exportImage.ts` → html-to-image `toPng`), so anything
rendered outside that node — the heading, the Start over / Export buttons — is excluded
from the image by construction.

**AI prompt export** ("Copy AI prompt" on the roundtable): because drag state lives in
framer-motion rather than React state, `readTable()` measures the live DOM boxes
(`[data-token-id]`, `[data-you]`) to compute each card's distance-from-You and allied
clusters (connected components of tokens whose edge-to-edge gap < 4% of table width —
edge gap, not center distance, so wide side-by-side tokens still count). `lib/buildPrompt.ts`
turns that plus the deck's light/shadow lines into a Jungian-analyst session prompt on the
clipboard. Cards reclaimed in the Shadow stage are flagged in the prompt (and only there):
App.tsx tracks `reclaimedIds` and passes them to `Roundtable` — they remain visually
indistinguishable in the UI.

## Data pipeline

`scripts/extract-archetypes.py` parses `gallery.pdf` (Myss's official Gallery of
Archetypes, kept in the repo) into `src/data/archetypes.ts` — a typed `Archetype[]` the
app imports at build time, so there is **no runtime PDF dependency**. The parser keys off
the PDF's layout: each archetype is one page whose first line is a lowercase title;
family-overview pages start with uppercase prose and are skipped, while their page ranges
(`FAMILY_RANGES`) assign each card a `family`.

The PDF only supplies each card's **id, name, and family**. The displayed copy — a
`light` and a `shadow` `Aspect` (`{ tag, line }`: a 1–3 word tag + one short sentence) —
is **hand-authored in `scripts/aspects.json`**, keyed by archetype id, and merged in by
the script (which warns on any id mismatch in either direction). So there are two source
files: edit `aspects.json` for wording, edit the `.py` for structure, then re-run
`npm run extract`. **`archetypes.ts` is generated — don't hand-edit the output.**

The data extraction needs a python with `pypdf` — this machine's is at
`/opt/anaconda3/bin/python3` (the default `python3` may be the Xcode one without pypdf).

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`; theme tokens live in the
`@theme` block of `src/index.css`). The aesthetic is **gilded tarot**: warm lamp-black
grounds (`ink`/`panel`), gold-leaf accents (`gold`/`gold-bright`/`gold-dim`), ivory text,
and a recurring sun/moon duality — gold always means "claimed/innate", silver-ash means
"set aside/learned". Reusable pieces live in `index.css` (`.tarot-frame` double hairline
with corner dots, `.gold-foil` text, `.btn-gold`/`.btn-ghost`, `.rise` entrance) and
`StageLayout.OrnamentRule`. Per-family accent colors (antiqued jewel tones) are defined in
two places that must stay in sync: the `--color-fam-*` tokens in `index.css` and the
`FAMILY_COLOR` map in `src/lib/family.ts` (the latter is what components actually read).
Fonts (Cinzel display caps, Cormorant Garamond card names, EB Garamond body) load from
Google Fonts in `index.html`.

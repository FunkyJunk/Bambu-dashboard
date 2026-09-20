# Working notes for Claude

## Replying

- **Always include the live link when anything is published or pushed.** Every
  time. Do not make the reader scroll back to find it:

  https://raw.githack.com/FunkyJunk/Bambu-dashboard/claude/sports-bar-nfl-display-dtfjrn/index.html

## What this is

An under-TV game strip for a sports bar: a static page for an ultra-wide panel
(reference 14 × 6 in, 2.33:1) that shows the game a television is on, and
advertises the venue's menu between looks. NFL, soccer and golf.

## Shape of the project

- `index.html` — the whole panel. No build step, no framework, no dependencies.
  Keep it that way: it runs on a stick PC bolted behind a television, and the
  maintenance budget is zero.
- `ads.json` — house advertising. A bar manager edits this, not code.
- `cache-proxy.mjs` — optional zero-dependency static server plus feed cache.
  Its `SPORTS` table must stay in step with the one in `index.html`.
- `panels.html` — six-TV preview.
- `.github/workflows/pages.yml` — manual-only until Pages is enabled.

## Rules that keep biting

- **Nothing may overflow.** Text is measured and scaled to fit, because the
  webfont can be blocked and the panel has no scrollbars. Sizes are in `cqh`
  (container-relative), which do **not** inherit from a parent's font-size — so
  scale a leaf, or size children in `em` off one wrapper and scale that.
- **Verify against the live feed, not assumptions.** ESPN's data is untidy:
  `down: -1` between plays, yard lines repeated across two fields, weather
  conditions under `conditionId`, near-black team colours, no "thru" for golf.
- **The score is the point.** Anything that covers it (ads, banners) is a cost
  to be justified and kept short.
- Golf's leaderboard and summary endpoints 404; only `.../golf/<tour>/scoreboard`
  works, so ranks and holes-played are derived locally.

## Standing caveats to keep repeating

- The ESPN endpoint is undocumented and unlicensed for commercial display.
- The Brew's Tavern logo is a photograph of a laminated menu, not artwork.
- Ad prices and copy came from that same photo and need a human check.

# NFL Rail

An under-TV game strip for a sports bar. It answers, from across the room and
without anyone asking a bartender: **what game is this, and where is it?**

Built for an ultra-wide panel mounted under a television — the reference size is
**14 in × 6 in (2.33 : 1)** — and it runs on anything from a 32:9 stretch bar
display to a laptop browser.


---

## What it shows

| Game state | On the strip |
|---|---|
| **Before kickoff** | Both teams, records, local kickoff time, a live countdown, and the line / over-under |
| **In progress** | Score, quarter, game clock, down & distance, ball spot, possession arrow, timeouts remaining, and a red-zone alert |
| **Final** | Final score, overtime flag, venue |

The bottom rail always crawls: last play, live win probability, venue, weather,
and every other score around the league.

When someone scores, the main row flips to a full-width team-coloured banner
(**TOUCHDOWN**, **FIELD GOAL**, **SAFETY**) for seven seconds while the rail
keeps running underneath.

---

## Quick start

It is a static page. Serve it over HTTP — **opening `index.html` as a `file://`
URL will not work**, because a null origin fails the data feed's CORS check.

```bash
python3 -m http.server 8080        # or: npx serve
# then open http://localhost:8080/
```

Prefer the bundled server, which also caches the feed (see below):

```bash
node cache-proxy.mjs --port 8080
# open http://localhost:8080/?feed=/feed
```

`panels.html` renders six panels side by side so you can see a whole bar's worth
at once before mounting anything.

---

## Telling a panel which game to show

**No API knows which game the television above the strip is tuned to.** That is
the one thing the panel cannot work out for itself, so you tell it. Four ways,
in descending order of how well they fit a real bar:

| Mode | Behaviour | Use when |
|---|---|---|
| `network` | Follows whatever the named broadcaster is carrying right now; falls back to that network's next kickoff, then its most recent final | **The default choice.** The TV is on a channel, not a game — set the channel once and the panel tracks it all day |
| `game` | Pinned to one matchup | A watch party or a season-ticket crowd |
| `auto` | Picks the best live game — close, late, red zone, overtime — and sticks with it unless something clearly better is on | A screen nobody manages |
| `rotate` | Cycles every live game on a 20-second dwell | An overflow or lobby screen |
| `demo` | A simulated KC–BUF game driven through the same render path | Showing this on a Tuesday morning when there is no football |

### URL parameters

Each panel is configured entirely by URL, so six kiosk windows need no shared state.

| Param | Example | Meaning |
|---|---|---|
| `mode` | `?mode=network` | One of the modes above |
| `net` | `?net=FOX` | Broadcaster to follow (implies `mode=network`) |
| `game` | `?game=401872937` | ESPN event id (implies `mode=game`) |
| `panel` | `?panel=3` | Labels the rail badge `TV 3` |
| `chrome` | `?chrome=0` | Hide the menu button — for a mounted panel |
| `tz` | `?tz=America/New_York` | Force the display timezone. Worth setting — a signage stick with a wrong system clock will otherwise print kickoffs in the wrong hour |
| `ar` | `?ar=32/9` | Panel aspect ratio (default `14/6`) |
| `fill` | `?fill=1` | Stretch to the viewport instead of letterboxing to `ar` |
| `feed` | `?feed=/feed` | Read from a local cache proxy instead of going straight upstream |
| `demo` | `?demo=1` | Simulated game |

A six-screen bar:

```
http://bar-pi.local:8080/?panel=1&net=FOX&feed=/feed&tz=America/New_York
http://bar-pi.local:8080/?panel=2&net=CBS&feed=/feed&tz=America/New_York
http://bar-pi.local:8080/?panel=3&net=NBC&feed=/feed&tz=America/New_York
http://bar-pi.local:8080/?panel=4&net=ESPN&feed=/feed&tz=America/New_York
http://bar-pi.local:8080/?panel=5&net=Prime%20Video&feed=/feed&tz=America/New_York
http://bar-pi.local:8080/?panel=6&mode=auto&feed=/feed&tz=America/New_York
```

### On-screen setup

Settings persist per-browser, so a panel survives a reboot without anyone
retyping a URL.

**Changing the game** — a menu button sits in the top-right corner of the
panel at 35% opacity. Tap it for today's games, live ones first with running
scores; tap a game to pin the panel to it. Two taps, no submenus.

The same sheet carries **Best game**, **Rotate all** and **Demo**, plus
fullscreen and a link to the full settings page.

For a screen nobody is meant to touch, `?chrome=0` removes the button
entirely.

**Keyboard**

| Key | Action |
|---|---|
| `M` | Open the game menu |
| `C` | Open the full setup page |
| `←` `→` | Step through games (live games first) |
| `F` | Fullscreen |
| `D` | Toggle demo mode |
| `R` | Refresh now |

On a phone, use landscape: the panel is a 2.33 : 1 strip and portrait
letterboxes it to a thin band.

---

## House advertising

`ads.json` drives a rotation of menu items. Edit that file — no code changes —
and set `"slides": []` to switch advertising off.

```json
{
  "brand":  { "name": "Brew's Tavern", "logo": "assets/brews-tavern-logo.png" },
  "promo":  { "headline": "Sunday Funday", "subhead": "Bites & Beers" },
  "adSeconds": 10,
  "gapSeconds": 10,
  "slides": [ { "price": "$9.95", "title": "Pretzel Bites Basket", "body": "…" } ]
}
```

The ad takes over the whole strip — big logo, item and price — and holds for
a different length of time depending on whether football is on:

| When | Hold | Setting |
|---|---|---|
| **A game is live** | 5 seconds | `liveAdSeconds` |
| **Before kickoff, at the final, or no game on** | 10 seconds | `adSeconds` |

`gapSeconds` is how long the game gets in between, 10 seconds by default. So
during play the cycle is ten seconds of football, five seconds of menu. Set
`gapSeconds` to `0` for continuous advertising.

Covering a live score is a real cost, and the shorter live hold is the only
thing limiting it. If it turns out to be too much on a busy Sunday, set
`"livePlacement": "rail"` and the ad moves to the bottom band during play
instead, leaving the score, clock, down &amp; distance and red-zone alert up the
whole time. Nothing else changes.

Scoring suppresses advertising: the touchdown banner always wins, and the
rotation resumes after it clears. Staff can pause the rotation from the game
menu, or `?ads=0` disables it for one panel.

### The logo

`assets/brews-tavern-logo.png` was recovered from a phone photograph of a
laminated menu: cropped to the bottle cap, white-balanced to remove the
laminate's colour cast, and masked to a transparent circle. It reads well at
panel size, but it is a photograph of a print, not artwork. **Replace it with
the real vector or high-resolution file before this goes on a screen** — point
`brand.logo` at the new file.

Body text in `ads.json` is trimmed for a six-inch strip rather than copied
verbatim from the printed menu. Check the wording against what the kitchen
actually serves before it goes live, and treat prices as needing the same
check — they change faster than signage does.

---

## The cache proxy

`cache-proxy.mjs` is optional, has no dependencies, and serves the static files
as well as a cached copy of the feed.

```bash
node cache-proxy.mjs --port 8080 --interval 10
```

Six panels polling upstream directly is twenty-four requests a minute leaving the
building, from one IP, for six identical payloads. Behind the proxy it is six
requests a minute total, and a brief upstream outage leaves every panel showing
the last good payload instead of going dark. `GET /health` reports cache age and
the last upstream error.

---

## Deploying on a stick PC

Chromium in kiosk mode on a Raspberry Pi or any cheap Android/x86 stick:

```bash
chromium-browser \
  --kiosk \
  --incognito \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  "http://bar-pi.local:8080/?panel=1&net=FOX&feed=/feed&tz=America/New_York"
```

Also worth doing: disable screen blanking and the screensaver, and set the
display's rotation and overscan for the physical panel.

The page is deliberately defensive about the things that break unattended
signage:

- **Blocked webfont.** The condensed face is loaded from Google Fonts but is
  never depended on. A locked-down network falls back through several system
  condensed faces, and every run of text that can overflow is measured and
  scaled to fit, so the layout holds at any fallback.
- **Feed outage.** Polling backs off on repeated failure, the last good data
  stays on screen, and a panel that has never loaded says so in words instead of
  showing a dark rectangle.
- **Broken logo.** A team mark that fails to load is hidden rather than leaving a
  broken-image glyph.
- **Idle cost.** Polling drops to 90 s when nothing is in progress, and text is
  only re-measured when the words actually change.

---

## Data

Everything comes from ESPN's public scoreboard endpoint:

```
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

No key, CORS-open, about a one-second cache. A single request carries score,
clock, down and distance, possession, timeouts, red-zone flag, last play, live
win probability, broadcast, venue, weather and betting lines — so one poll drives
the entire display.

Polling is 15 s while a game is live and 90 s otherwise, with jitter and
exponential backoff on failure.

### Feed quirks handled

ESPN's live data is less tidy than it looks, and these are all real cases from a
single Sunday's payload:

- `down: -1` between plays — must not render as "-1th & Goal".
- `downDistanceText` already contains the yard line ("4th & 7 at MIN 32") while
  `possessionText` repeats it, so joining them prints the spot twice.
- Some games omit the down-and-distance strings entirely and give only raw
  `down` / `distance` / `yardLine`.
- `weather.displayValue` is a precipitation number; the readable condition is in
  the oddly named `weather.conditionId`.
- `isRedZone` can stay set with no possession team, which would otherwise paint
  the rail red through a timeout.
- Several team primary colours are near-black (Chicago's `0b1c3a`), so colours
  are luminance-checked and swapped for the alternate where contrast fails.

---

## Before this goes on a wall

Two things need a human decision, not a code change:

1. **Licensing.** This uses an undocumented ESPN endpoint. It is public and
   unauthenticated, but that is not the same as licensed for commercial display
   in a venue. Running it on paying customers' screens is a question for Legal,
   not for this README. A licensed feed (SportRadar, Stats Perform, or the
   NFL's own) is the answer if this goes past a demo.
2. **Stability.** An undocumented endpoint carries no compatibility promise and
   can change shape without notice. The cache proxy limits the blast radius; a
   paid feed removes it.

This is a working demo, not a shipped product. Review it, break it, and push
back on it before it goes anywhere a customer can see.

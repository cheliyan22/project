# Reboot — Launch Kit

Prepared 2026-10-31, the day the referral loop went live.
Live site: https://reboot-planet-j2rhsjel2hj.qoder.website/
Beta page: https://reboot-planet-j2rhsjel2hj.qoder.website/beta/ (accepts `?ref=CODE`)

Everything below is true of the product as shipped today. Do not add numbers,
testimonials, or user counts that don't exist yet — the whole brand of this app
is honesty about failure; fake growth would be the same sin it mourns.

---

## The one line

> **Your dead project wasn't a failure. It just didn't have a city.**

## What Reboot actually is (use this, not more)

A 3D planet where abandoned projects get a second life. Dead apps, unshipped
games, misfired businesses — each becomes a building in a district:

- **01 The AI Winter** — too early for their time
- **02 Mobile Ghosts** — apps the world rejected
- **03 Unplayed Worlds** — games that never shipped
- **04 Market Misfires** — fatal timing & bad luck
- **05 The Learning Dead** — EdTech that never scaled
- **06 Lost Canvases** — creative visions abandoned

Real things to talk about:
- Fly across the planet; every district is a rendered city with a monumental 3D wordmark.
- Register a project, claim one, rebuild it as a placed building (buy → place, rotation, collision-checked).
- The community votes on which dead project gets revived next (ideas feed, upvotes, roadmap).
- "Share this view" captures your actual city and exports a 1200×630 branded card.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f814d2ed5a1b08cd225b2f4e88a311ef07088b537f101e594840cae827ebf315 -->

- Beta waitlist accepts private registration requests. Invite links and referral queue details are available only to signed-in Supabase accounts with a verified email matching the registration; public submissions return a uniform receipt.

<!-- /coderabbit-ai-generated:v1 -->

Not yet true — never promise it: launch discounts, credits-per-invite, public
beta dates, follower counts, "10,000 builders waiting."

---

## Channel playbooks

### Product Hunt
- **Title:** Reboot — a 3D city where your dead project lives on
- **Tagline:** Abandoned projects get a second life
- **Topics:** Developer Tools, 3D, side projects (pick 3)
- **First comment (maker):** tell a real story of one project you killed and
  rebuilt here. Paste a "Share this view" card of its district.
- **Gallery:** og-image.png, district captures, share cards, the buy→place flow.
- Launch only after a few dozen waitlist names exist — a live counter beats zero.

### Hacker News (Show HN)
- **Title:** Show HN: Reboot – a procedurally-lit 3D planet of failed startups
- Body: engineering, not marketing. Three.js + React, HDR pipeline with
  N8AO/ACES/SMAA, extruded type, Supabase RPCs locked down behind
  SECURITY DEFINER functions. Mention the placement bug story honestly:
  SQL three-valued logic (`id <> NULL`) silently disabled the overlap check
  on first inserts. HN loves a NULL-logic postmortem.
- Post Tue–Thu, ~7am PT. Reply to every comment yourself.

### Reddit
- r/threejs and r/webgl: these communities punish self-promo. Post as a
  **build write-up** ("I put ACES+N8AO+extruded type on a 12K grid world —
  here's what broke") and let the link ride in comments.
- r/startups / r/SideProject: the emotional hook works here. Ask "what's the
  project you killed that still keeps you up?" — answers are your seed content.

### X / Bluesky
- Ship-in-public thread: 6 districts, one image each + one tech bullet per tweet.
- The share card is the growth engine: every exported city image is 1200×630
  with the REBOOT brand bar — it previews perfectly because og:image is live.
- Attach your `/beta/?ref=CODE` link in the reply, not the post body
  (some feeds downrank external links in the first tweet).

### Communities (highest quality, lowest volume)
- Indie hackers, TinyApps Discords, global-game-jam post-mortem threads.
- Message shape: "I made a place to memorialize abandoned projects — yours
  can be building #1. No video to watch, just a link."

---

## The loop, spelled out

1. Post → reader clicks → lands on `/beta/?ref=YOURCODE`
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:76892935dc55aae212277b081e8fa4146a20302f105a31d3fe4129834f66f6b7 -->

2. They submit an email → receive a privacy-preserving receipt.
3. After signing in with a verified matching email, they can retrieve their own invite link and queue details. A join through that link credits the referrer with a 12-hour queue boost. Isolated Supabase email confirmation must be configured before this verified referral flow is advertised as available.

<!-- /coderabbit-ai-generated:v1 -->
4. Every registered name makes the counter on the beta page worth sharing

Referral codes are 8-hex uppercase, allocated server-side, never guessed or
reused (unique partial index). Attribution survives malformed input: bad
`?ref=` values degrade to "no referrer" instead of rejecting the signup.

## Assets

- `public/og-image.png` — orbital hub hero, also served at /og-image.png
- Share cards — in-app "Share view" button on the flight deck (any district)
- Regenerate hero anytime: `node og-image.capture.mjs` (needs `npm run build` + preview)

## Hard rules

- Never fabricate waitlist size, upvotes, or revival claims.
- Never buy traffic, bots, or "engagement."
- The 12h-boost mechanic is the only ranking lever; say exactly that.

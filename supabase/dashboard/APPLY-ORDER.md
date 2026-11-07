<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d8a725679952824b9ea8badd119c9f4a1c3023f17055540ca546386b845b5b4c -->

<!-- coderabbit-ai-generated-section:v1:c2079799024e1413d4989a2a99ad0d2ce0e94dc0059c1e418dd247768fe90416 -->

# Dashboard SQL apply order

Use only an isolated Supabase project. Do not apply these files to the separate production Reboot project from this task.

Prefer the migration runner: apply every file in `supabase/migrations/` in filename order. Dashboard files are byte-identical alternatives for specific migrations, not an additional second application. The local PGlite beta service has its own versioned bootstrap; it does not apply these legacy Supabase changes.

## Complete manual sequence

First apply all schema migrations through `20261026000000_reboot_planet_hardening.sql`. Then apply the following sequence exactly; dashboard numbering is not chronological:

1. `30-lock-public-writes.sql` — migration `20261028000000_lock_public_writes.sql`.
2. `50-feedback-roadmap.sql` — migration `20261028120000_feedback_roadmap.sql`.
3. `../migrations/20261030000000_beta_waitlist.sql`.
4. `../migrations/20261031000000_landing_signal_counts.sql`.
5. `../migrations/20261031130000_fix_placement_overlap_first_insert.sql`.
6. `../migrations/20261031160000_beta_waitlist_referrals.sql`.
7. `../migrations/20261101090000_badge_achievements.sql`.
8. `../migrations/20261107000000_experimental_beta.sql`.
9. `../migrations/20261107010000_repair_idea_achievement_statuses.sql`.
10. `35-repair-legacy-write-permissions.sql` — migration `20261107020000_legacy_write_permissions.sql`.
11. `55-feedback-waitlist-privacy.sql` — migration `20261107130000_feedback_waitlist_privacy.sql`.
12. `56-feedback-waitlist-verified-access.sql` — migration `20261107140000_feedback_waitlist_verified_access.sql`.
13. `36-verified-idea-signals.sql` — migration `20261107150000_verified_idea_signals.sql`.
14. `../migrations/20261107160000_beta_founders_and_outcomes.sql`.
15. `37-collision-safe-profile-signup.sql` — migration `20261107170000_collision_safe_profile_signup.sql`.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e9c83e27ce006d4d980ba713a531f9567811c59b53b37856e65c8c429cfc9e14 -->

16. `57-verified-referral-credit-and-handle-privacy.sql` — migration `20261107180000_verified_referral_credit_and_handle_privacy.sql`.
17. `38-atomic-founder-slots.sql` — migration `20261107190000_atomic_founder_slots.sql`. Serializes slot allocation and enforces unique slots 1–100.
18. `39-founder-achievement.sql` — migration `20261107200000_founder_achievement.sql`. Awards the original Legendary Founding Member badge and 1,000 XP when an authenticated member calls `award_achievements()`.

The founder repair preserves existing members, numbers and earned status. If historical slots are duplicated or outside 1–100, preflight stops the transaction before changing data or constraints. An operator must review and explicitly approve a membership-preserving reconciliation; this migration does not renumber or revoke awards automatically. Allocation concurrency is protected by a transaction advisory lock and unique/range constraints. PGlite tests cover database constraints, capacity and replay, not multi-connection scheduling.

<!-- /coderabbit-ai-generated:v1 -->

Do not stop at historical files 30, 35 or 50: their permissive counter/referral behavior is superseded by later repairs. No source migration and its dashboard copy should both be applied.

## Founder reward contract

The original founder reward promise is preserved. Eligibility comes from `founder_circle` membership for the authenticated caller, never a profile flag or client-supplied identity. The badge is awarded once and XP is recomputed from earned badges, so repeated calls do not inflate XP. Existing awards and successful-revival requirements are preserved. This migration does not perform a bulk award or alter historical membership.

## Project activity contract

The verified-signals repair replaces guest counter writes with authenticated, unique signals. Browsing remains public; support requires sign-in, views count once per account and revival signals derive from signed proposals. Clients, including owners, cannot supply totals. Historical unverified totals are archived privately while displayed totals rebuild from verified records.

## Signup and public-handle privacy

Automatic profiles still exist for each new account. An explicit provided username is retained exactly when available. Missing/blank handles or username collisions produce a nullable username instead of failing signup. New default handles never derive from email addresses.

The later historical cleanup is intentionally narrow: auth metadata must have no `username` key and the current profile username must exactly match the email local-part. Only these usernames and matching feedback handles are scrubbed. Explicitly provided matching names and uncertain/custom names are retained. The earlier collision repair itself rewrites no rows; the later privacy repair performs this declared, limited cleanup.

## Waitlist receipt, referral and rate-limit contracts

Public pre-registration remains available and returns the same accepted receipt for new addresses and retries. It does not reveal membership, invite codes, position or referral statistics. Accepted calls are limited globally to 60 per database minute using a transaction lock; requests above the ceiling fail with a retry message and create no registration. This protects storage without pretending a submitted email identifies an anonymous caller. During a burst, legitimate visitors may also need to retry.

Anonymous or unverified submissions earn **no referral credit**. Credit requires a signed-in, email-confirmed account calling the join RPC with its own matching email and an existing, non-self invite code. One account/registration can claim one referrer. Existing unverified attribution rows remain stored but do not automatically earn credit. After verification, the account can resubmit its own email and invitation to claim credit.

`my_beta_waitlist_referral()` takes no caller email argument. It resolves the verified Supabase identity via `auth.uid()` and returns only that account's details. Credit is counted only while the referred account remains verified and its email matches its registration. Queue boost is 12 hours per credited referral, capped at 10 referrals (120 hours); returned `referrals` reports the verified count and `boostHours` the capped benefit.

Email verification requires a configured isolated Supabase Auth/email service. This workspace does not provision email delivery or contact production. Local beta account sessions are not verified Supabase sessions. Public UI copy must describe verified referral claims and the boost cap, not promise rewards for arbitrary submitted addresses.


<!-- /coderabbit-ai-generated:v1 -->
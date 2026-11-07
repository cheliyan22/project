-- Achievements that are actually awarded.
--
-- The badge catalogue has existed since 20260706 but nothing ever wrote
-- public.user_badges, and since 20261028000000 revoked client table writes it is
-- impossible to award one from the browser. profiles.xp had the same problem:
-- every reader ordered by it and no writer ever set it.
--
-- This adds a SECURITY DEFINER function that derives achievements from data the
-- server already trusts (owned buildings, placements, published ideas) and writes
-- the badge rows plus the aggregate counters on profiles. Clients call it; clients
-- never decide who earned what.
--
-- Idempotent: re-running awards nothing new and only refreshes the counters.

insert into public.badges (slug, name, description, icon, rarity, xp_reward) values
  ('first_build',  'First Build',   'Owned the first building on the planet.', 'hammer',      'common', 50),
  ('city_planner', 'City Planner',  'Six buildings placed in My City.',        'layout-grid', 'rare',   150),
  ('nexus_owner',  'Nexus Owner',   'Bought and kept a Reboot Nexus.',         'landmark',    'epic',   400)
on conflict (slug) do nothing;

create or replace function public.award_achievements()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_earned jsonb := '[]'::jsonb;
  v_slug text;
  v_badges int := 0;
  v_xp int := 0;
  v_ideas int := 0;
  v_revivals int := 0;
begin
  if v_user is null then
    raise exception 'Sign in to record achievements';
  end if;

  -- Each candidate is a fact the server can verify for itself.
  for v_slug in
    select candidate.slug
    from (
      values
        ('first_build',   exists (select 1 from public.building_ownership o where o.user_id = v_user)),
        ('nexus_owner',   exists (select 1 from public.building_ownership o where o.user_id = v_user and o.definition_id = 'reboot-nexus')),
        ('city_planner',  (select count(*) from public.building_placements p where p.user_id = v_user) >= 6),
        ('first_blood',   exists (select 1 from public.ideas i where i.user_id = v_user)),
        ('revivalist',    exists (select 1 from public.ideas i where i.user_id = v_user and i.status = 'reviving')),
        ('serial_founder', (select count(*) from public.ideas i where i.user_id = v_user) >= 5)
    ) as candidate(slug, earned)
    join public.badges b on b.slug = candidate.slug
    where candidate.earned
  loop
    insert into public.user_badges (user_id, badge_id)
    select v_user, b.id from public.badges b where b.slug = v_slug
    on conflict (user_id, badge_id) do nothing;
    if found then
      v_earned := v_earned || to_jsonb(v_slug);
    end if;
  end loop;

  select count(*) into v_badges from public.user_badges ub where ub.user_id = v_user;
  select coalesce(sum(b.xp_reward), 0) into v_xp
    from public.user_badges ub
    join public.badges b on b.id = ub.badge_id
   where ub.user_id = v_user;
  select count(*) into v_ideas from public.ideas i where i.user_id = v_user;
  select count(*) into v_revivals from public.ideas i
    where i.user_id = v_user and i.status in ('reviving', 'alive');

  update public.profiles
     set badge_count = v_badges,
         xp = v_xp,
         level = greatest(1, 1 + (v_xp / 500)),
         ideas_submitted = v_ideas,
         revival_count = v_revivals
   where id = v_user;

  return jsonb_build_object('earned', v_earned, 'badges', v_badges, 'xp', v_xp);
end;
$$;

revoke all on function public.award_achievements() from public;
revoke all on function public.award_achievements() from anon;
grant execute on function public.award_achievements() to authenticated;

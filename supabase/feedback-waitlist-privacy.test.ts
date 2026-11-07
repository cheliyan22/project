import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const AUTHOR = 'aaaaaaaa-0000-4000-8000-000000000001'
const VOTER = 'aaaaaaaa-0000-4000-8000-000000000002'
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000003'
const REQUEST = 'bbbbbbbb-0000-4000-8000-000000000001'
const migration = '20261107130000_feedback_waitlist_privacy.sql'
const sql = (name: string) => readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8')
async function client<T>(role: 'anon' | 'authenticated', uid: string | null, query: string, params: unknown[] = []) {
  await db.query("select set_config('test.uid',$1,false)", [uid ?? ''])
  await db.exec(`set role ${role}`)
  try { return await db.query<T>(query, params) }
  finally { await db.exec('reset role'); await db.exec("select set_config('test.uid','',false)") }
}
beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table public.profiles(id uuid primary key,username text);
    create table public.ideas(id uuid primary key);
    create table public.planet_admins(user_id uuid primary key);
    create function public.is_planet_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$select exists(select 1 from public.planet_admins where user_id=auth.uid())$$;
    insert into auth.users values('${AUTHOR}','private-email@example.test',now()),('${VOTER}','voter@example.test',null),('${ADMIN}','admin@example.test',now());
    insert into public.profiles values('${AUTHOR}',null),('${VOTER}','Public Voter'),('${ADMIN}','Public Admin');
    insert into public.planet_admins values('${ADMIN}');
  `)
  for (const name of ['20261028120000_feedback_roadmap.sql','20261030000000_beta_waitlist.sql','20261031160000_beta_waitlist_referrals.sql']) await db.exec(await sql(name))
  // This malicious insert succeeds on the historical migration. The repair
  // must reconcile its false total and erase the inferred private email handle.
  await client('authenticated', AUTHOR, `insert into public.feature_requests(id,title,vote_count) values('${REQUEST}','Historical suggestion',999)`)
  await db.exec("insert into public.beta_waitlist(email,invite_code,source) values('existing@example.test','ABCD1234','original')")
  await db.exec(await sql(migration))
  await db.exec(await sql('20261107140000_feedback_waitlist_verified_access.sql'))
}, 60000)
afterAll(async () => { await db.close() })

describe('additive board and waitlist privacy repair', () => {
  it('keeps dashboard deployment copies identical to the secure migrations', async () => {
    expect(await readFile(new URL('./dashboard/55-feedback-waitlist-privacy.sql', import.meta.url),'utf8')).toBe(await sql(migration))
    expect(await readFile(new URL('./dashboard/56-feedback-waitlist-verified-access.sql', import.meta.url),'utf8')).toBe(await sql('20261107140000_feedback_waitlist_verified_access.sql'))
  })
  it('keeps creation time immutable for authors while preserving admin corrections', async () => {
    const previous = (await db.query<{created_at:string}>(`select created_at::text from public.feature_requests where id=$1`,[REQUEST])).rows[0].created_at
    await expect(client('authenticated', AUTHOR, `update public.feature_requests set created_at='2099-01-01' where id=$1`,[REQUEST])).rejects.toThrow(/creation timestamp/)
    expect((await db.query<{created_at:string}>(`select created_at::text from public.feature_requests where id=$1`,[REQUEST])).rows[0].created_at).toBe(previous)
    await client('authenticated', ADMIN, `update public.feature_requests set created_at='2026-01-01' where id=$1`,[REQUEST])
    expect((await db.query<{created_year:number}>(`select extract(year from created_at)::int as created_year from public.feature_requests where id=$1`,[REQUEST])).rows[0].created_year).toBe(2026)
  })
  it('allows only the verified session owner to read referral details', async () => {
    await client('anon',null,"select public.join_beta_waitlist('private-email@example.test')")
    await expect(client('anon',null,'select public.my_beta_waitlist_referral()')).rejects.toThrow()
    await expect(client('authenticated',VOTER,'select public.my_beta_waitlist_referral()')).rejects.toThrow(/verified email/)
    const result=(await client<{stats:{inviteCode:string;position:number;referrals:number}}>('authenticated',AUTHOR,'select public.my_beta_waitlist_referral() stats')).rows[0].stats
    expect(result.inviteCode).toMatch(/^[0-9A-F]{8}$/)
    expect(result.position).toBeGreaterThan(0)
    expect(result.referrals).toBe(0)
    expect((await client<{stats:null}>('authenticated',ADMIN,'select public.my_beta_waitlist_referral() stats')).rows[0].stats).toBeNull()
    await client('anon',null,'select public.join_beta_waitlist_referral($1,$2)', ['verified-friend@example.test',result.inviteCode])
    const after=(await client<{stats:{referrals:number;position:number}}>('authenticated',AUTHOR,'select public.my_beta_waitlist_referral() stats')).rows[0].stats
    expect(after.referrals).toBe(1)
    expect(after.position).toBeLessThanOrEqual(result.position)
    await expect(client('authenticated',AUTHOR,"select public.my_beta_waitlist_referral('existing@example.test')")).rejects.toThrow()
  })
  it('removes inferred email handles and reconciles forged historical totals', async () => {
    const row = (await db.query<{author_handle:string;vote_count:number}>(`select author_handle,vote_count from public.feature_requests where id='${REQUEST}'`)).rows[0]
    expect(row).toEqual({author_handle:'builder',vote_count:0})
  })
  it('resets all administrative insert fields and stamps real public authorship', async () => {
    const result = await client<{status:string;admin_note:string;duplicate_of:string|null;vote_count:number;author_handle:string;author_id:string;fresh:boolean}>('authenticated', VOTER,
      `insert into public.feature_requests(title,status,admin_note,duplicate_of,vote_count,author_id,author_handle,created_at,status_at)
       values('Forged privileged values','shipped','Pretend admin reply',$1,100,$2,'Spoof','2000-01-01','2000-01-01')
       returning status,admin_note,duplicate_of,vote_count,author_handle,author_id,created_at > now()-interval '1 minute' and status_at > now()-interval '1 minute' as fresh`, [REQUEST,ADMIN])
    expect(result.rows[0]).toEqual({status:'reviewing',admin_note:'',duplicate_of:null,vote_count:0,author_handle:'Public Voter',author_id:VOTER,fresh:true})
  })
  it('keeps legitimate author edits and admin decisions while rejecting author status changes', async () => {
    await client('authenticated', AUTHOR, `update public.feature_requests set body='Improved wording' where id=$1`,[REQUEST])
    await expect(client('authenticated', AUTHOR, `update public.feature_requests set status='shipped' where id=$1`,[REQUEST])).rejects.toThrow(/admin/)
    await client('authenticated', ADMIN, `update public.feature_requests set status='planned',admin_note='Approved plan' where id=$1`,[REQUEST])
    expect((await db.query<{status:string}>(`select status from public.feature_requests where id=$1`,[REQUEST])).rows[0].status).toBe('planned')
  })
  it('composes vote deltas, rejects repeat votes and rolls totals back with a transaction', async () => {
    for (const uid of [AUTHOR,VOTER]) await client('authenticated',uid,`insert into public.feature_votes(request_id,user_id) values($1,$2)`,[REQUEST,uid])
    await expect(client('authenticated',VOTER,`insert into public.feature_votes(request_id,user_id) values($1,$2)`,[REQUEST,VOTER])).rejects.toThrow()
    expect((await db.query<{vote_count:number}>(`select vote_count from public.feature_requests where id=$1`,[REQUEST])).rows[0].vote_count).toBe(2)
    await db.exec('begin')
    await client('authenticated',AUTHOR,`delete from public.feature_votes where request_id=$1`,[REQUEST])
    await db.exec('rollback')
    expect((await db.query<{vote_count:number}>(`select vote_count from public.feature_requests where id=$1`,[REQUEST])).rows[0].vote_count).toBe(2)
    await client('authenticated',AUTHOR,`delete from public.feature_votes where request_id=$1`,[REQUEST])
    expect((await db.query<{vote_count:number}>(`select vote_count from public.feature_requests where id=$1`,[REQUEST])).rows[0].vote_count).toBe(1)
    // PGlite serializes connections. Verify the installed function uses locked
    // row deltas; it cannot exercise multi-connection snapshot interleavings.
    const body=(await db.query<{prosrc:string}>("select prosrc from pg_proc where proname='feature_vote_tally'")).rows[0].prosrc
    expect(body).toContain('vote_count = vote_count + 1')
    expect(body).toContain('vote_count = vote_count - 1')
    expect(body).not.toContain('count(*)')
  })
  it('returns identical receipts for new/existing emails without codes or membership', async () => {
    const join=async(email:string)=>(await client<{result:unknown}>('anon',null,'select public.join_beta_waitlist_referral($1,$2,$3) result',[email,'ABCD1234','privacy-test'])).rows[0].result
    expect(await join('new@example.test')).toEqual({status:'accepted'})
    expect(await join('existing@example.test')).toEqual({status:'accepted'})
    expect(await join('NEW@example.test ')).toEqual({status:'accepted'})
    expect((await db.query<{source:string}>("select source from public.beta_waitlist where email='existing@example.test'")).rows[0].source).toBe('original')
    expect((await db.query<{n:number}>("select count(*)::int n from public.beta_waitlist where email='new@example.test'")).rows[0].n).toBe(1)
    expect((await db.query<{referrer_code:string}>("select referrer_code from public.beta_waitlist where email='new@example.test'")).rows[0].referrer_code).toBe('ABCD1234')
  })
  it('also closes legacy boolean enumeration and denies direct waitlist reads', async () => {
    for(const email of ['other@example.test','existing@example.test'])expect((await client<{receipt:boolean}>('anon',null,'select public.join_beta_waitlist($1) receipt',[email])).rows[0].receipt).toBe(true)
    await expect(client('anon',null,'select * from public.beta_waitlist')).rejects.toThrow()
    await expect(client('authenticated',AUTHOR,'select * from public.beta_waitlist')).rejects.toThrow()
    await expect(client('anon',null,"select public.join_beta_waitlist('bad email')")).rejects.toThrow(/valid email/)
  })
  it('replays without losing stored registration attribution or votes', async () => {
    await db.exec(await sql(migration))
    expect((await db.query<{invite_code:string}>("select invite_code from public.beta_waitlist where email='existing@example.test'")).rows[0].invite_code).toBe('ABCD1234')
    expect((await db.query<{vote_count:number}>(`select vote_count from public.feature_requests where id=$1`,[REQUEST])).rows[0].vote_count).toBe(1)
  })
})

import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
const db=new PGlite();
const migration='20261107170000_collision_safe_profile_signup.sql';
const sql=(name:string)=>readFile(new URL(`./migrations/${name}`,import.meta.url),'utf8');
async function signup(email:string,username?:string){const rows=await db.query<{id:string}>('INSERT INTO auth.users(email,raw_user_meta_data) VALUES($1,$2) RETURNING id',[email,JSON.stringify(username===undefined?{}:{username})]);return rows.rows[0].id;}
async function profile(id:string){return (await db.query<{id:string;username:string|null;bio:string;xp:number}>('SELECT id,username,bio,xp FROM public.profiles WHERE id=$1',[id])).rows[0];}
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb NOT NULL DEFAULT '{}');CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULL::uuid$$;CREATE TABLE public.ideas(id uuid PRIMARY KEY);`);
 await db.exec(await sql('20260706142422_add_profiles_auth.sql'));
},30000);
afterAll(()=>db.close());
it('demonstrates the historical collision and repairs it without rewriting profiles',async()=>{
 const first=await signup('same-local@one.example.invalid');
 expect((await profile(first)).username).toBe('same-local');
 await expect(signup('same-local@two.example.invalid')).rejects.toThrow(/unique constraint/);
 const before=(await db.query('SELECT * FROM public.profiles ORDER BY id')).rows;
 await db.exec(await sql(migration));
 expect((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows).toEqual(before);
 const recovered=await signup('same-local@two.example.invalid');
 expect((await profile(recovered)).username).toBeNull();
});
it('allows two new same-local-part emails with no public email-derived usernames',async()=>{
 const a=await signup('private-handle@alpha.example.invalid'),b=await signup('private-handle@beta.example.invalid');
 expect((await profile(a)).username).toBeNull();expect((await profile(b)).username).toBeNull();
});
it('retains an available explicit username and falls back on duplicate or blank handles',async()=>{
 const a=await signup('person-one@example.invalid',' Chosen Founder '),b=await signup('person-two@example.invalid',' Chosen Founder '),c=await signup('person-three@example.invalid','   ');
 expect((await profile(a)).username).toBe(' Chosen Founder ');expect((await profile(b)).username).toBeNull();expect((await profile(c)).username).toBeNull();
 expect((await db.query('SELECT count(*)::int n FROM auth.users')).rows[0]).toEqual((await db.query('SELECT count(*)::int n FROM profiles')).rows[0]);
});
it('preserves an existing profile id when the creation handler is replayed',async()=>{
 const id=await signup('replay@example.invalid','Preserved name');
 await db.query('UPDATE profiles SET bio=$1,xp=42 WHERE id=$2',['Preserved story',id]);
 const before=await profile(id);
 // Invoke the same handler with an existing NEW.id through a test-only trigger.
 await db.exec('CREATE TRIGGER test_replay_profile AFTER UPDATE OF raw_user_meta_data ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()');
 await db.query('UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2',[JSON.stringify({username:'Replacement'}),id]);
 expect(await profile(id)).toEqual(before);
 await db.exec('DROP TRIGGER test_replay_profile ON auth.users');
});
it('reapplies without changing rows and keeps the dashboard copy exact',async()=>{
 const before=(await db.query('SELECT * FROM public.profiles ORDER BY id')).rows;
 await db.exec(await sql(migration));
 expect((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows).toEqual(before);
 expect(await readFile(new URL('./dashboard/37-collision-safe-profile-signup.sql',import.meta.url),'utf8')).toBe(await sql(migration));
});

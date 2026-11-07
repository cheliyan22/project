import { supabase } from './supabase';

export interface BetaRegistration {
  status: 'accepted';
}

/** Attribution carried by invite links (?ref=CODE) and campaign links (utm_source).
 *  Anything malformed is dropped here so a typo never blocks a signup. */
export function readSignupAttribution(): { referrerCode: string | null; source: string | null } {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') ?? '';
  const source = (params.get('utm_source') ?? '').trim().toLowerCase();
  return {
    referrerCode: /^[0-9a-f]{8}$/i.test(ref) ? ref.toUpperCase() : null,
    source: /^[a-z0-9._-]{1,64}$/.test(source) ? source : null,
  };
}

/** Save only a normalized email through the database-owned waitlist function.
 *  The browser never receives table access or other people's registrations. */
export async function joinBetaWaitlist(
  email: string,
  attribution = readSignupAttribution(),
): Promise<BetaRegistration> {
  const prospectEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc('join_beta_waitlist_referral', {
    prospect_email: prospectEmail,
    referrer_code: attribution.referrerCode,
    signup_source: attribution.source,
  });

  if (error || !data) throw new Error('Beta registration could not be confirmed.');
  if (data.status !== 'accepted') throw new Error('Registration service needs the privacy update.');
  return { status: 'accepted' };
}

/* Mirrors the database's shape check (non-space, one @, dotted domain) so a
 * typo is caught before a round trip and can be named precisely. The database
 * stays the authority; this only removes a pointless failure. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Enter the email you want beta access on.';
  if (value.length > 254) return 'That email address is too long.';
  if (!EMAIL_SHAPE.test(value)) return 'That email address is missing something — check the @ and the domain.';
  return null;
}

export function inviteLinkFor(code: string): string {
  // Trailing slash: Qoder Sites serves the SPA shell at /beta/; bare /beta 404s at the edge.
  return `${window.location.origin}/beta/?ref=${code}`;
}

export interface VerifiedBetaReferral {
  inviteCode: string;
  position: number;
  referrals: number;
}

/** No email parameter: the database resolves the caller's verified auth identity. */
export async function getMyBetaReferral(): Promise<VerifiedBetaReferral | null> {
  const { data, error } = await supabase.rpc('my_beta_waitlist_referral');
  if (error) throw new Error('Sign in with a verified email to view your referral details.');
  if (data === null) return null;
  if (!/^[0-9A-F]{8}$/.test(data.inviteCode) || !Number.isSafeInteger(data.position)
    || data.position < 1 || !Number.isSafeInteger(data.referrals) || data.referrals < 0) {
    throw new Error('Referral details could not be loaded.');
  }
  return data as VerifiedBetaReferral;
}

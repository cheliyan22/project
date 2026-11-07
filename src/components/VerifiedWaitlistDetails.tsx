import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { getMyBetaReferral, inviteLinkFor, type VerifiedBetaReferral } from '@/lib/beta-waitlist';

/** The public receipt and private account lookup are deliberately separate. */
export function VerifiedWaitlistDetails() {
  const { user } = useAuth();
  const [result, setResult] = useState<{owner:string;details:VerifiedBetaReferral} | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const verified = !!user?.email_confirmed_at;
  const details = verified && result?.owner === user?.id ? result.details : null;
  const load = async () => {
    if (!user || !verified) return;
    setBusy(true);setMessage('');setResult(null);
    try {
      const next = await getMyBetaReferral();
      if (next) setResult({owner:user.id,details:next});
      else setMessage('No registration is associated with your verified account email.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load your referral details.'); }
    finally { setBusy(false); }
  };
  return <section className="bsf-verified" aria-label="Verified account referral details">
    <p>Referral credit requires a verified account claim. Each verified referral adds 12 hours of priority, capped at 120 hours.</p>
    <p>Referral details are available only to a signed-in account with a verified email matching its registration.</p>
    {verified && <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Loading…':'View my verified referral details'}</button>}
    {details && <div><p>Your verified account is #{details.position.toLocaleString()} in line · {details.referrals} referrals.</p><p>Your invite link:</p><a href={inviteLinkFor(details.inviteCode)}>{inviteLinkFor(details.inviteCode)}</a></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}

import { VerifiedWaitlistDetails } from './VerifiedWaitlistDetails';
import { useId, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  joinBetaWaitlist,
  validateEmail,
  type BetaRegistration,
} from '@/lib/beta-waitlist';
import './BetaSignupForm.css';

interface BetaSignupFormProps {
  /** Where the form is being shown, recorded with the registration. */
  source?: string;
  /** Rendered inside the first-run intro, which uses its own type scale. */
  tone?: 'intro' | 'plain';
  onSaved?: (registration: BetaRegistration) => void;
}

type Phase = 'idle' | 'submitting' | 'saved';

export function BetaSignupForm({ source = 'landing', tone = 'plain', onSaved }: BetaSignupFormProps) {
  const inputId = useId();
  const statusId = useId();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BetaRegistration | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phase === 'submitting') return;

    const invalid = validateEmail(email);
    if (invalid) {
      setError(null);
      setFieldError(invalid);
      return;
    }

    setPhase('submitting');
    setError(null);
    setFieldError(null);
    try {
      const result = await joinBetaWaitlist(email, {
        referrerCode: null,
        source,
      });
      setResult(result);
      setPhase('saved');
      onSaved?.(result);
    } catch (cause) {
      setPhase('idle');
      // The database rejects addresses the browser accepts; say which part failed
      // instead of collapsing every cause into one sentence.
      const text = cause instanceof Error ? cause.message : '';
      setError(
        /valid email/i.test(text)
          ? 'That email address was rejected. Check it and try again.'
          : 'We could not confirm the registration. Retrying the same email is safe.',
      );
    }
  };

  if (phase === 'saved' && result) {
    return (
      <section className={`bsf bsf--${tone} is-saved`} aria-live="polite">
        <p className="bsf-eyebrow">
          <Check size={12} aria-hidden /> REQUEST RECEIVED
        </p>
        <p className="bsf-saved-line">Thanks for your interest in Reboot.</p>
        <p className="bsf-note">For privacy, this form does not reveal whether an email is already registered, queue positions, or invite details.</p>
        <VerifiedWaitlistDetails />
      </section>
    );
  }

  return (
    <form className={`bsf bsf--${tone}`} onSubmit={submit} noValidate>
      <label className="bsf-eyebrow" htmlFor={inputId}>BETA PRE-REGISTRATION</label>
      <div className="bsf-row">
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder="builder@example.com"
          value={email}
          disabled={phase === 'submitting'}
          aria-invalid={!!fieldError}
          aria-describedby={statusId}
          onChange={(event) => {
            setEmail(event.target.value);
            if (fieldError) setFieldError(null);
            if (error) setError(null);
          }}
        />
        <button type="submit" disabled={phase === 'submitting' || !email.trim()}>
          {phase === 'submitting'
            ? <><Loader2 size={13} className="bsf-spin" aria-hidden /> SAVING</>
            : <>SAVE MY SPOT <ArrowRight size={13} aria-hidden /></>}
        </button>
      </div>
      <p id={statusId} className="bsf-status" role={fieldError || error ? 'alert' : 'status'}>
        {fieldError ?? error ?? 'Email only. No payment, no card, no spam.'}
      </p>
    </form>
  );
}

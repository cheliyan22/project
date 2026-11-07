import { useState } from 'react';
import { X } from 'lucide-react';
import { AuthForm } from '../components/Intro';
import { GATE_COPY, type AccountReason } from '../lib/auth-gate';

const MONO = '"JetBrains Mono", "Space Mono", ui-monospace, monospace';

/**
 * Account panel for a signed-out visitor who reached for a write action.
 * Their form stays mounted behind this panel, so the text they typed survives
 * and submitting again after signing in succeeds. No button silently dies.
 */
export default function AccountGate({ reason, onClose, onSuccess }: {
  reason: AccountReason;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const copy = GATE_COPY[reason];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,2,8,0.86)', backdropFilter: 'blur(18px)' }} />
      <div
        style={{ position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.18em', color: 'rgba(0,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 }}>
              RESTRICTED::ARCHIVE WRITE
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)', fontFamily: MONO, margin: '0 0 8px' }}>
              {copy.title}
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.65, color: 'rgba(255,255,255,0.5)', fontFamily: MONO, margin: 0 }}>
              {copy.body}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close account panel"
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: 6, display: 'flex', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        <AuthForm
          mode={mode}
          onSuccess={onSuccess}
          onGuest={onClose}
          onToggle={() => setMode(m => (m === 'signin' ? 'signup' : 'signin'))}
          guestLabel="not now — keep browsing"
        />
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { DependencyInstaller } from '../components/installer/DependencyInstaller';

/**
 * Props for the DependencySetupPage full-page wrapper.
 */
export interface DependencySetupPageProps {
  installMode: 'SERVER' | 'DESKTOP' | 'CLIENT';
  onSetupComplete: () => void;
}

/** Map install mode to a friendly subtitle. */
const MODE_LABEL: Record<DependencySetupPageProps['installMode'], string> = {
  SERVER: 'Server Mode',
  DESKTOP: 'Desktop Mode',
  CLIENT: 'Client Mode',
};

/**
 * DependencySetupPage
 *
 * Full-page wrapper for the dependency installation flow.
 * - CLIENT mode: no local setup required; calls onSetupComplete immediately.
 * - SERVER / DESKTOP mode: renders the DependencyInstaller orchestrator.
 */
export default function DependencySetupPage({ installMode, onSetupComplete }: DependencySetupPageProps) {
  // CLIENT mode: skip instantly
  const completedRef = useRef(false);
  useEffect(() => {
    if (installMode === 'CLIENT' && !completedRef.current) {
      completedRef.current = true;
      onSetupComplete();
    }
  }, [installMode, onSetupComplete]);

  // Derive the app version from the desktop API if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const version: string = (window as any).__APP_VERSION__ ?? '—';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
            color: '#fff',
          }}
        >
          🛡
        </div>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.3px',
            }}
          >
            InsuredHub Setup
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#64748b',
              marginTop: 2,
            }}
          >
            Setting up required components for{' '}
            <strong style={{ color: '#334155' }}>{MODE_LABEL[installMode]}</strong>
          </p>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 16px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 620 }}>
          {installMode === 'CLIENT' ? (
            /* CLIENT: minimal placeholder while the useEffect fires */
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '40px 32px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔌</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#0f172a' }}>
                No Additional Setup Needed
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                Client mode connects to an existing InsuredHub server.
                <br />
                No local database installation is required.
              </p>
            </div>
          ) : (
            /* SERVER / DESKTOP: full installer */
            <DependencyInstaller
              installMode={installMode}
              onComplete={onSetupComplete}
              onError={(err) => {
                // Surface to parent — in practice you may want to show a
                // top-level toast or navigate to a retry screen.
                console.error('[DependencySetupPage] installation error:', err);
              }}
            />
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        style={{
          padding: '12px 32px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#94a3b8',
          background: '#fff',
        }}
      >
        <span>InsuredHub Enterprise CRM</span>
        <span>v{version} &nbsp;·&nbsp; {MODE_LABEL[installMode]}</span>
      </footer>
    </div>
  );
}

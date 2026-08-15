import { useEffect, useState } from 'react';

interface Props {
  onRetry: () => void;
  onChangeRole?: () => void;
}

/**
 * Employee PC discovery UI.
 * Connect button uses invoke('server:connect-manual') — always works, returns errors.
 */
export default function DiscoveryScreen({ onRetry, onChangeRole }: Props) {
  const [message, setMessage] = useState('Searching for Admin PC on this Wi‑Fi…');
  const [stage, setStage] = useState('discovering');
  const [error, setError] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const offStatus = window.desktop.onServerDiscoveryStatus?.((data) => {
      setMessage(data.message);
      setStage(data.stage);
      if (data.stage === 'connected' || data.stage === 'employee-opening') {
        setConnecting(true);
        setShowManual(false);
        setError('');
      } else if (data.stage === 'manual' || data.stage === 'error') {
        setShowManual(true);
        setConnecting(false);
      } else if (data.stage === 'connecting') {
        setConnecting(true);
      } else if (data.stage === 'discovering') {
        setConnecting(false);
      }
    });
    const offError = window.desktop.onAppError?.((data) => {
      setError(data.message);
      setShowManual(true);
      setConnecting(false);
    });
    return () => {
      offStatus?.();
      offError?.();
    };
  }, []);

  const submitManual = async () => {
    const addr = manualIp.trim();
    if (!addr || connecting) return;
    setConnecting(true);
    setError('');
    setMessage(`Connecting to ${addr}…`);
    try {
      const result = await window.desktop.connectManual?.(addr);
      if (!result?.success) {
        setError(result?.message || 'Could not connect');
        setMessage(result?.message || 'Connection failed');
        setConnecting(false);
        setShowManual(true);
        return;
      }
      setMessage('Opening Admin CRM…');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessage(msg);
      setConnecting(false);
      setShowManual(true);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="logo">
          <h1>{connecting ? 'Connecting…' : 'Find Admin PC'}</h1>
          <p>Employee PC — same Wi‑Fi as Admin</p>
        </div>

        <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: 16 }}>{message}</p>

        {(stage === 'discovering' || stage === 'connecting') && !error && connecting === false && (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 12 }}>
            Keep InsureCRM open on the Admin PC. This PC registers automatically — no license key needed.
            Log in with the user ID and password your Admin created.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {showManual && (
          <div style={{ marginTop: 12 }}>
            <label htmlFor="admin-ip">Admin PC address</label>
            <input
              id="admin-ip"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              placeholder="192.168.1.110:18765"
              disabled={connecting}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitManual();
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => void submitManual()}
              disabled={connecting || !manualIp.trim()}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8 }}
              disabled={connecting}
              onClick={() => {
                setError('');
                setConnecting(false);
                setMessage('Searching for Admin PC on this Wi‑Fi…');
                onRetry();
              }}
            >
              Search Wi‑Fi again
            </button>
          </div>
        )}

        {onChangeRole && (
          <button
            type="button"
            className="btn"
            style={{ marginTop: 16 }}
            disabled={connecting}
            onClick={onChangeRole}
          >
            Not an Employee PC — choose role again
          </button>
        )}
      </div>
    </div>
  );
}

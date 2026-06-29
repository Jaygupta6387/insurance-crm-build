import { useState } from 'react';

interface Props {
  onActivated: () => void;
}

export default function ActivationScreen({ onActivated }: Props) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatKey = (v: string) => {
    const clean = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 16);
    return clean.match(/.{1,4}/g)?.join('-') || clean;
  };

  const handleActivate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      await window.desktop.activateLicense(key.replace(/-/g, ''));
      onActivated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Activation failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="logo">
          <h1>InsureCRM Desktop</h1>
          <p>Enter your license key to activate</p>
        </div>
        <label htmlFor="license">License Key</label>
        <input
          id="license"
          value={key}
          onChange={(e) => setKey(formatKey(e.target.value))}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          disabled={loading}
        />
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-primary" onClick={handleActivate} disabled={loading || key.length < 19}>
          {loading ? 'Activating…' : 'Activate License'}
        </button>
      </div>
    </div>
  );
}

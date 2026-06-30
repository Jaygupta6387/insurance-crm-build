import { useState } from 'react';

export default function TransferForm() {
  const [reason, setReason] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please enter a reason (at least 5 characters)');
      return;
    }
    if (!deviceName.trim()) {
      setError('Please enter a device name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await window.desktop.requestTransfer({ reason, new_device_name: deviceName });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="app-shell">
        <div className="card">
          <div className="logo"><h1>Transfer Requested</h1><p>Awaiting Super Admin approval</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="card">
        <div className="logo">
          <h1>Request License Transfer</h1>
          <p>Move your license to a new device</p>
        </div>
        <label htmlFor="device">New Device Name</label>
        <input id="device" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Office PC — Windows" />
        <label htmlFor="reason" style={{ marginTop: 16 }}>Reason</label>
        <textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hardware upgrade, laptop replacement… (min 5 characters)" />
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  );
}

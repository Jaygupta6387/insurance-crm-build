export default function LockScreen() {
  return (
    <div className="app-shell">
      <div className="card">
        <div className="lock-icon">🔒</div>
        <div className="logo">
          <h1>License Inactive</h1>
          <p>Your subscription has expired, been suspended, or moved to another device.</p>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 16 }}>
          Contact your administrator or request a hardware transfer.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 20 }}
          onClick={() => window.location.hash = '#transfer'}
        >
          Request Transfer
        </button>
      </div>
    </div>
  );
}

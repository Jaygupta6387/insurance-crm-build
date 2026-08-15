interface Props {
  onChosen: (mode: 'SERVER' | 'CLIENT') => void;
}

/**
 * First-run screen: Admin PC (hosts CRM + Postgres + WiFi discovery)
 * or Employee PC (no Postgres — auto-finds Admin on the same WiFi).
 */
export default function RoleSelectPage({ onChosen }: Props) {
  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="logo">
          <h1>InsureCRM</h1>
          <p>How will this computer be used?</p>
        </div>

        <button
          type="button"
          className="btn btn-primary role-btn"
          onClick={() => onChosen('SERVER')}
        >
          <strong>Admin PC (Server)</strong>
          <span>
            Installs PostgreSQL, backend, and CRM. Enter the company license key
            here. Employees on the same Wi‑Fi find this PC automatically.
          </span>
        </button>

        <button
          type="button"
          className="btn role-btn role-btn-secondary"
          onClick={() => onChosen('CLIENT')}
          style={{ marginTop: 12 }}
        >
          <strong>Employee PC</strong>
          <span>
            No database or license key. Connects to the Admin PC over Wi‑Fi,
            registers this device automatically, then opens the company login.
          </span>
        </button>
      </div>
    </div>
  );
}

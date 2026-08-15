import { useCallback, useEffect, useState } from 'react';
import SplashScreen from '../components/SplashScreen';

export default function CrmLauncher() {
  const [message, setMessage] = useState('Starting local CRM server…');
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const store = await window.desktop.getStore();
        if (store.companyName?.trim()) setCompanyName(store.companyName.trim());
      } catch {
        // ignore
      }
    })();
  }, []);

  const launch = useCallback(async () => {
    setError('');
    setRetrying(true);
    setMessage('Starting local CRM server…');
    try {
      const { url } = await window.desktop.openCrm();
      setMessage(`Opening ${url}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not start CRM';
      setError(msg);
      setMessage('Could not start the CRM server');
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    void launch();
  }, [launch]);

  return (
    <SplashScreen companyName={companyName} message={error ? message : message || 'Preparing…'}>
      {error ? (
        <div className="setup-error-box">
          <p className="error-title">CRM server did not start</p>
          <pre className="error-detail">{error}</pre>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
            Node.js does not need to be installed separately — the app bundles it. If this keeps
            failing, try &quot;Reset database &amp; retry&quot; from setup or reinstall the latest
            version.
          </p>
          <div className="setup-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={retrying}
              onClick={() => void launch()}
            >
              {retrying ? 'Starting…' : 'Retry'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={retrying}
              onClick={() => {
                if (
                  !window.confirm(
                    'Remove local database and license so you can activate a different company?'
                  )
                ) {
                  return;
                }
                void window.desktop.resetForNewLicense?.();
              }}
            >
              Switch license / reset data
            </button>
          </div>
        </div>
      ) : null}
    </SplashScreen>
  );
}

import { useCallback, useEffect, useState } from 'react';

const STEPS = [
  'Installing PostgreSQL',
  'Creating Database',
  'Creating Tables',
  'Creating Admin User',
  'Connecting CRM',
];

interface Props {
  onComplete: (crmUrl: string) => void;
}

export default function SetupWizard({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [message, setMessage] = useState('Preparing…');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const runSetup = useCallback(async (resetFirst = false) => {
    setError('');
    setRunning(true);
    setProgress(0);
    setCurrentStep(0);
    setMessage(resetFirst ? 'Resetting local database…' : 'Preparing…');

    try {
      if (resetFirst) {
        await window.desktop.resetPostgresData();
      }
      const { crmUrl } = await window.desktop.runSetup();
      onComplete(crmUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Setup failed';
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [onComplete]);

  useEffect(() => {
    const unsub = window.desktop.onSetupProgress((data) => {
      if (typeof data.progress === 'number') setProgress(data.progress);
      if (typeof data.step === 'number') setCurrentStep((data.step as number) - 1);
      if (data.message) setMessage(String(data.message));
      if (data.label) setMessage(String(data.label));
    });

    runSetup(false);

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="logo">
          <h1>Setting Up InsureCRM</h1>
          <p>First-time setup — this may take a few minutes. Please keep the app open.</p>
        </div>

        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-label">{progress}% — {message}</p>
        </div>

        <ul className="step-list">
          {STEPS.map((label, i) => (
            <li key={label} className={i < currentStep ? 'done' : i === currentStep ? 'active' : ''}>
              <span className="dot" />
              {label}
            </li>
          ))}
        </ul>

        {error && (
          <div className="setup-error-box">
            <p className="error-title">Setup could not finish</p>
            <pre className="error-detail">{error}</pre>
            <div className="setup-actions">
              <button type="button" className="btn btn-primary" disabled={running} onClick={() => runSetup(false)}>
                Retry setup
              </button>
              <button type="button" className="btn btn-secondary" disabled={running} onClick={() => runSetup(true)}>
                Reset database &amp; retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

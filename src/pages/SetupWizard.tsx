import { useEffect, useState } from 'react';

const STEPS = [
  'Installing PostgreSQL',
  'Creating Database',
  'Creating Tables',
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

  useEffect(() => {
    const unsub = window.desktop.onSetupProgress((data) => {
      if (typeof data.progress === 'number') setProgress(data.progress);
      if (typeof data.step === 'number') setCurrentStep((data.step as number) - 1);
      if (data.message) setMessage(String(data.message));
      if (data.label) setMessage(String(data.label));
    });

    window.desktop.runSetup()
      .then(({ crmUrl }) => onComplete(crmUrl))
      .catch((err: Error) => setError(err.message || 'Setup failed'));

    return unsub;
  }, [onComplete]);

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="logo">
          <h1>Setting Up InsureCRM</h1>
          <p>First-time setup — this may take a few minutes</p>
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

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

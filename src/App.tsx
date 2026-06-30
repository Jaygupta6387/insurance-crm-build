import { useEffect, useState } from 'react';
import ActivationScreen from './pages/ActivationScreen';
import SetupWizard from './pages/SetupWizard';
import LockScreen from './pages/LockScreen';
import TransferForm from './pages/TransferForm';
import CrmLauncher from './pages/CrmLauncher';
import UpdateBanner from './components/UpdateBanner';

type AppView = 'loading' | 'activation' | 'setup' | 'crm' | 'locked' | 'transfer';

export default function App() {
  const [view, setView] = useState<AppView>('loading');

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#transfer') setView('transfer');
    };
    window.addEventListener('hashchange', onHash);
    onHash();

    window.desktop.getStore().then((store) => {
      if (!store.hasLicense) setView('activation');
      else if (!store.setupComplete) setView('setup');
      else setView('crm');
    });

    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    return window.desktop.onAppState((state) => {
      if (state === 'activation') setView('activation');
      else if (state === 'setup') setView('setup');
      else if (state === 'locked') setView('locked');
      else if (state === 'crm') setView('crm');
    });
  }, []);

  const content = (() => {
    if (view === 'loading') {
      return (
        <div className="app-shell">
          <p style={{ color: '#64748b' }}>Loading InsureCRM…</p>
        </div>
      );
    }
    if (view === 'activation') {
      return <ActivationScreen onActivated={() => setView('setup')} />;
    }
    if (view === 'setup') {
      return <SetupWizard onComplete={() => setView('crm')} />;
    }
    if (view === 'locked') {
      return <LockScreen />;
    }
    if (view === 'transfer') {
      return <TransferForm />;
    }
    return <CrmLauncher />;
  })();

  return (
    <>
      {content}
      <UpdateBanner />
    </>
  );
}

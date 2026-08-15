import { useEffect, useState } from 'react';
import ActivationScreen from './pages/ActivationScreen';
import SetupWizard from './pages/SetupWizard';
import LockScreen from './pages/LockScreen';
import TransferForm from './pages/TransferForm';
import CrmLauncher from './pages/CrmLauncher';
import RoleSelectPage from './pages/RoleSelectPage';
import DiscoveryScreen from './pages/DiscoveryScreen';
import UpdateBanner from './components/UpdateBanner';
import SplashScreen from './components/SplashScreen';

type AppView =
  | 'loading'
  | 'role-select'
  | 'activation'
  | 'setup'
  | 'crm'
  | 'locked'
  | 'transfer'
  | 'discovering'
  | 'server-error'
  | 'employee-opening';

export default function App() {
  const [view, setView] = useState<AppView>('loading');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#transfer') setView('transfer');
    };
    window.addEventListener('hashchange', onHash);
    onHash();

    const offMode = window.desktop.onInstallMode?.((info) => {
      setIsClient(Boolean(info?.isClient));
    });

    return () => {
      window.removeEventListener('hashchange', onHash);
      offMode?.();
    };
  }, []);

  useEffect(() => {
    return window.desktop.onAppState((state) => {
      if (state === 'role-select') {
        setIsClient(false);
        setView('role-select');
      } else if (state === 'activation') setView('activation');
      else if (state === 'setup') setView('setup');
      else if (state === 'locked') setView('locked');
      else if (state === 'employee-opening') setView('employee-opening');
      else if (state === 'crm' || state === 'ready') {
        if (isClient) setView('employee-opening');
        else setView('crm');
      } else if (state === 'discovering' || state === 'server-connecting') {
        setIsClient(true);
        setView('discovering');
      } else if (state === 'server-error') setView('server-error');
      else if (state === 'loading') setView('loading');
    });
  }, [isClient]);

  const chooseRole = async (mode: 'SERVER' | 'CLIENT') => {
    await window.desktop.setInstallMode?.(mode);
    setIsClient(mode === 'CLIENT');
    setView(mode === 'CLIENT' ? 'discovering' : 'loading');
    await window.desktop.continueAfterRoleSelect?.();
  };

  const resetToRoleSelect = async () => {
    setIsClient(false);
    setView('loading');
    await window.desktop.resetToRoleSelect?.();
    setView('role-select');
  };

  const content = (() => {
    if (view === 'loading' || view === 'employee-opening') {
      return (
        <SplashScreen
          message={
            view === 'employee-opening'
              ? 'Connecting to Admin CRM…'
              : 'Preparing Insured Hub…'
          }
        />
      );
    }
    if (view === 'role-select') {
      return <RoleSelectPage onChosen={(mode) => void chooseRole(mode)} />;
    }
    if (view === 'discovering' || view === 'server-error') {
      return (
        <DiscoveryScreen
          onRetry={() => {
            setView('discovering');
            void window.desktop.retryServerDiscovery?.();
          }}
          onChangeRole={() => void resetToRoleSelect()}
        />
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
    if (isClient) {
      return (
        <div className="app-shell">
          <p style={{ color: '#64748b' }}>Opening Admin CRM…</p>
        </div>
      );
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

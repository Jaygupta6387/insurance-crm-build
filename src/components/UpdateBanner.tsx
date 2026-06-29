import { useEffect, useState } from 'react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdatePayload {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  message?: string;
}

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdatePayload | null>(null);

  useEffect(() => {
    return window.desktop.onUpdateStatus((payload) => {
      if (payload.status === 'idle') {
        setUpdate(null);
        return;
      }
      setUpdate(payload);
    });
  }, []);

  if (!update || update.status === 'idle') return null;

  const handleClick = () => {
    if (update.status === 'ready') {
      window.desktop.installUpdate();
    }
  };

  let message = '';
  if (update.status === 'available') {
    message = `Update v${update.version} available — downloading…`;
  } else if (update.status === 'downloading') {
    message = `Downloading update v${update.version}… ${update.percent ?? 0}%`;
  } else if (update.status === 'ready') {
    message = `Update v${update.version} ready — click here to restart and update`;
  } else if (update.status === 'error') {
    message = 'Update check failed. Will retry later.';
  }

  if (!message) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={update.status !== 'ready'}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        left: 16,
        maxWidth: 480,
        marginLeft: 'auto',
        padding: '12px 16px',
        borderRadius: 10,
        border: '1px solid #334155',
        background: update.status === 'ready' ? '#1d4ed8' : '#1e293b',
        color: '#f8fafc',
        fontSize: 14,
        fontWeight: 500,
        cursor: update.status === 'ready' ? 'pointer' : 'default',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        zIndex: 9999,
        textAlign: 'left',
      }}
    >
      {message}
    </button>
  );
}

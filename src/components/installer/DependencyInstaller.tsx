import { useCallback, useEffect, useRef, useState } from 'react';
import { DownloadProgress } from './DownloadProgress';
import { InstallationStep, type StepStatus } from './InstallationStep';

// ─── types ───────────────────────────────────────────────────────────────────

interface StepDef {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  detail?: string;
  error?: string;
  duration?: number;
  /** timestamp when step became 'running', used for elapsed timing */
  _startedAt?: number;
}

interface DownloadProgressState {
  filename: string;
  percentage: number;
  speedKBps: number;
  etaSeconds: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

interface InstallationState {
  phase: 'detecting' | 'downloading' | 'installing' | 'configuring' | 'complete' | 'error';
  currentStep: number;
  steps: StepDef[];
  downloadProgress?: DownloadProgressState;
  error?: string;
  logs: string[];
}

/**
 * Props for the main dependency installation orchestrator component.
 */
export interface DependencyInstallerProps {
  onComplete: () => void;
  onError: (error: string) => void;
  installMode: 'SERVER' | 'DESKTOP' | 'CLIENT';
}

// ─── IPC type extension ───────────────────────────────────────────────────────
// The dependency IPC channels are additions beyond the base DesktopApi.
// They must also be registered in preload.ts and electron/ipc/dependency-ipc-handlers.ts

interface DependencyDesktopApi {
  /** Invoke dependency:ensure-postgres to start the installation flow. */
  ensurePostgres: (options?: { mode: string }) => Promise<{ success: boolean; error?: string }>;
  /** Cancel an in-progress download. */
  cancelDependency: () => Promise<void>;
  /** Retry after an error. */
  retryDependency: () => Promise<void>;
  /** Subscribe to step update events. Returns unsubscribe. */
  onDependencyStepUpdate: (
    cb: (data: { stepId: string; status: StepStatus; detail?: string; error?: string }) => void
  ) => () => void;
  /** Subscribe to download progress events. Returns unsubscribe. */
  onDependencyDownloadProgress: (cb: (data: DownloadProgressState) => void) => () => void;
  /** Subscribe to log line events. Returns unsubscribe. */
  onDependencyLog: (cb: (line: string) => void) => () => void;
}

/** Cast window.desktop to include the dependency extension. */
function desktopDep(): DependencyDesktopApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).desktop as DependencyDesktopApi;
}

// ─── initial step definitions ─────────────────────────────────────────────────

function buildInitialSteps(mode: 'SERVER' | 'DESKTOP' | 'CLIENT'): StepDef[] {
  const base: StepDef[] = [
    {
      id: 'detect',
      title: 'Detecting Dependencies',
      description: 'Checking what is already installed',
      status: 'pending',
    },
    {
      id: 'download',
      title: 'Downloading PostgreSQL',
      description: 'Fetching installer from download.insuredhub.com',
      status: 'pending',
    },
    {
      id: 'verify',
      title: 'Verifying Download',
      description: 'SHA-256 checksum verification',
      status: 'pending',
    },
    {
      id: 'install',
      title: 'Installing PostgreSQL',
      description: 'Running silent installer',
      status: 'pending',
    },
    {
      id: 'configure',
      title: 'Configuring Database',
      description: 'Initialising cluster and starting service',
      status: 'pending',
    },
    {
      id: 'create-user',
      title: 'Creating Database User',
      description: 'Creating insurecrm application user',
      status: 'pending',
    },
    {
      id: 'migrate',
      title: 'Running Migrations',
      description: 'Applying Prisma schema migrations',
      status: 'pending',
    },
    {
      id: 'seed',
      title: 'Seeding Initial Data',
      description: 'Populating reference data',
      status: 'pending',
    },
    {
      id: 'verify-conn',
      title: 'Verifying Connection',
      description: 'Final database connectivity test',
      status: 'pending',
    },
  ];

  // CLIENT mode: skip DB installation steps
  if (mode === 'CLIENT') {
    return base.map((s) =>
      ['download', 'verify', 'install', 'configure', 'create-user', 'migrate', 'seed'].includes(s.id)
        ? { ...s, status: 'skipped' as StepStatus }
        : s
    );
  }

  return base;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function overallPercent(steps: StepDef[], download?: DownloadProgressState): number {
  const total = steps.filter((s) => s.status !== 'skipped').length;
  if (total === 0) return 0;
  const done = steps.filter((s) => s.status === 'complete').length;
  const dlBonus =
    steps.find((s) => s.id === 'download')?.status === 'running' && download
      ? download.percentage / 100 / total
      : 0;
  return Math.round(((done / total) + dlBonus) * 100);
}

// ─── keyframes ────────────────────────────────────────────────────────────────

let kfInjected = false;
function ensureKeyframes() {
  if (kfInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes di-spin  { to { transform: rotate(360deg); } }
    @keyframes di-slide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
  `;
  document.head.appendChild(s);
  kfInjected = true;
}

// ─── component ───────────────────────────────────────────────────────────────

/**
 * DependencyInstaller
 *
 * Main orchestration UI for the multi-step dependency installation flow.
 * Listens to IPC events from the main process and drives a step-by-step
 * visual display. Supports cancel (during download) and retry (on error).
 */
export function DependencyInstaller({ onComplete, onError, installMode }: DependencyInstallerProps) {
  const kfOnce = useRef(false);
  if (!kfOnce.current) {
    ensureKeyframes();
    kfOnce.current = true;
  }

  const [state, setState] = useState<InstallationState>({
    phase: 'detecting',
    currentStep: 0,
    steps: buildInitialSteps(installMode),
    logs: [],
  });
  const [logsOpen, setLogsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Auto-scroll logs
  useEffect(() => {
    if (logsOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.logs, logsOpen]);

  // ── IPC subscriptions ──────────────────────────────────────────────────────
  useEffect(() => {
    const api = desktopDep();

    const unsubStep = api.onDependencyStepUpdate(({ stepId, status, detail, error }) => {
      setState((prev) => {
        const steps = prev.steps.map((s) => {
          if (s.id !== stepId) return s;
          const now = Date.now();
          const duration =
            status === 'complete' && s._startedAt ? now - s._startedAt : s.duration;
          return {
            ...s,
            status,
            detail,
            error,
            duration,
            _startedAt: status === 'running' ? now : s._startedAt,
          };
        });

        const currentStep = steps.findIndex((s) => s.status === 'running');
        const phase: InstallationState['phase'] =
          steps.every((s) => s.status === 'complete' || s.status === 'skipped')
            ? 'complete'
            : status === 'error'
            ? 'error'
            : prev.phase;

        return {
          ...prev,
          steps,
          currentStep: currentStep >= 0 ? currentStep : prev.currentStep,
          phase,
          error: status === 'error' ? error : prev.error,
        };
      });
    });

    const unsubDl = api.onDependencyDownloadProgress((data) => {
      setState((prev) => ({
        ...prev,
        phase: data.status === 'complete' ? prev.phase : 'downloading',
        downloadProgress: data as DownloadProgressState,
      }));
    });

    const unsubLog = api.onDependencyLog((line) => {
      setState((prev) => ({
        ...prev,
        logs: [...prev.logs.slice(-499), line], // keep last 500 lines
      }));
    });

    return () => {
      unsubStep();
      unsubDl();
      unsubLog();
    };
  }, []);

  // ── Trigger installation ───────────────────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const api = desktopDep();
    api
      .ensurePostgres({ mode: installMode })
      .then((res) => {
        if (res.success) {
          setState((prev) => ({ ...prev, phase: 'complete' }));
          onComplete();
        } else {
          const msg = res.error ?? 'Installation failed';
          setState((prev) => ({ ...prev, phase: 'error', error: msg }));
          onError(msg);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unexpected error';
        setState((prev) => ({ ...prev, phase: 'error', error: msg }));
        onError(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, []);

  // ── Watch for completion ───────────────────────────────────────────────────
  useEffect(() => {
    if (state.phase === 'complete') {
      // Small delay so user can see the final "all green" state
      const t = setTimeout(() => onComplete(), 800);
      return () => clearTimeout(t);
    }
  }, [state.phase, onComplete]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    try {
      await desktopDep().cancelDependency();
    } catch {
      // ignore
    }
  }, []);

  const handleRetry = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      phase: 'detecting',
      error: undefined,
      steps: buildInitialSteps(installMode),
      downloadProgress: undefined,
    }));
    startedRef.current = false;

    try {
      await desktopDep().retryDependency();
    } catch {
      // ignore; ensurePostgres useEffect will re-run via startedRef reset
    }
  }, [installMode]);

  // ── computed ──────────────────────────────────────────────────────────────
  const pct = overallPercent(state.steps, state.downloadProgress);
  const isDownloading =
    state.phase === 'downloading' ||
    state.steps.find((s) => s.id === 'download')?.status === 'running';

  const phaseLabel: Record<InstallationState['phase'], string> = {
    detecting: 'Detecting dependencies…',
    downloading: 'Downloading…',
    installing: 'Installing…',
    configuring: 'Configuring…',
    complete: 'Complete!',
    error: 'Error',
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Overall progress bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
            {phaseLabel[state.phase]}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>{pct}%</span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 9999,
            background: '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 9999,
              background:
                state.phase === 'complete'
                  ? '#16a34a'
                  : state.phase === 'error'
                  ? '#dc2626'
                  : '#3b82f6',
              transition: 'width 0.5s ease, background 0.3s',
            }}
          />
        </div>
      </div>

      {/* Download progress sub-panel */}
      {state.downloadProgress && state.steps.find((s) => s.id === 'download')?.status === 'running' && (
        <div style={{ animation: 'di-slide 0.2s ease-out both' }}>
          <DownloadProgress
            {...state.downloadProgress}
            onCancel={isDownloading ? handleCancel : undefined}
          />
        </div>
      )}

      {/* Step list */}
      <div
        style={{
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '4px 16px' }}>
          {state.steps.map((s, i) => (
            <InstallationStep
              key={s.id}
              step={i + 1}
              title={s.title}
              description={s.description}
              status={s.status}
              detail={s.detail}
              error={s.error}
              duration={s.duration}
            />
          ))}
        </div>
      </div>

      {/* Global error banner */}
      {state.phase === 'error' && state.error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>⚠️ {state.error}</span>
          <button
            type="button"
            onClick={() => void handleRetry()}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Log panel (collapsible) */}
      <div
        style={{
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          fontSize: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setLogsOpen((v) => !v)}
          style={{
            width: '100%',
            padding: '8px 14px',
            background: '#f8fafc',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#64748b',
            fontWeight: 600,
          }}
        >
          <span>📋 Installation Log ({state.logs.length} lines)</span>
          <span style={{ transform: logsOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>▼</span>
        </button>

        {logsOpen && (
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              background: '#0f172a',
              padding: '10px 14px',
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: 1.6,
              color: '#94a3b8',
            }}
          >
            {state.logs.length === 0 ? (
              <span style={{ color: '#475569' }}>No log output yet…</span>
            ) : (
              state.logs.map((line, i) => (
                <div key={i} style={{ animation: 'di-slide 0.1s ease-out both' }}>
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

export default DependencyInstaller;

import { useEffect, useRef } from 'react';

// ─── types ───────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped';

/**
 * Props for a single installation step row.
 */
export interface InstallationStepProps {
  /** 1-based step number shown in the circle. */
  step: number;
  /** Primary label, e.g. "Downloading PostgreSQL". */
  title: string;
  /** Optional secondary detail line under the title. */
  description?: string;
  status: StepStatus;
  /** Live progress detail, e.g. "45% complete". */
  detail?: string;
  /** Error message shown when status === 'error'. */
  error?: string;
  /** Elapsed milliseconds shown for complete steps. */
  duration?: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Format milliseconds to a human-readable duration like "2.3s" or "1m 5s". */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0).padStart(2, '0');
  return `${m}m ${rem}s`;
}

// ─── keyframe injection ───────────────────────────────────────────────────────

let injected = false;
function ensureKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes is-spin  { to { transform: rotate(360deg); } }
    @keyframes is-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    @keyframes is-pop   { 0%{transform:scale(.6);opacity:0} 80%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
  `;
  document.head.appendChild(style);
  injected = true;
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface CircleProps {
  step: number;
  status: StepStatus;
}

/** Step number / icon circle on the left. */
function StepCircle({ step, status }: CircleProps) {
  const base: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'background 0.2s, border-color 0.2s',
  };

  if (status === 'pending') {
    return (
      <div style={{ ...base, background: '#f1f5f9', color: '#94a3b8', border: '2px solid #e2e8f0' }}>
        {step}
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div
        style={{
          ...base,
          background: '#eff6ff',
          border: '2px solid #3b82f6',
          color: '#3b82f6',
          animation: 'is-pulse 1.2s ease-in-out infinite',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            border: '2px solid #3b82f6',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'is-spin 0.7s linear infinite',
          }}
        />
      </div>
    );
  }

  if (status === 'complete') {
    return (
      <div
        style={{
          ...base,
          background: '#16a34a',
          color: '#fff',
          border: '2px solid #16a34a',
          animation: 'is-pop 0.25s ease-out both',
        }}
      >
        ✓
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ ...base, background: '#dc2626', color: '#fff', border: '2px solid #dc2626' }}>
        ✕
      </div>
    );
  }

  // skipped
  return (
    <div
      style={{
        ...base,
        background: '#f1f5f9',
        color: '#cbd5e1',
        border: '2px solid #e2e8f0',
        textDecoration: 'line-through',
      }}
    >
      {step}
    </div>
  );
}

interface BadgeProps {
  status: StepStatus;
  duration?: number;
}

/** Right-side status pill / badge. */
function StatusBadge({ status, duration }: BadgeProps) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 10px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  if (status === 'pending') {
    return <span style={{ ...base, background: '#f1f5f9', color: '#94a3b8' }}>Pending</span>;
  }
  if (status === 'running') {
    return (
      <span style={{ ...base, background: '#eff6ff', color: '#3b82f6', animation: 'is-pulse 1.5s ease-in-out infinite' }}>
        Running…
      </span>
    );
  }
  if (status === 'complete') {
    return (
      <span style={{ ...base, background: '#f0fdf4', color: '#16a34a' }}>
        ✓{duration !== undefined ? ` ${formatDuration(duration)}` : ' Done'}
      </span>
    );
  }
  if (status === 'error') {
    return <span style={{ ...base, background: '#fef2f2', color: '#dc2626' }}>Failed</span>;
  }
  // skipped
  return <span style={{ ...base, background: '#f8fafc', color: '#cbd5e1' }}>Skipped</span>;
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * InstallationStep
 *
 * A single row in the dependency installation flow. Displays a numbered
 * circle, title, optional description/detail, and a right-aligned status badge.
 * Running steps pulse in blue; complete steps animate in with a green pop.
 */
export function InstallationStep({
  step,
  title,
  description,
  status,
  detail,
  error,
  duration,
}: InstallationStepProps) {
  const once = useRef(false);
  if (!once.current) {
    ensureKeyframes();
    once.current = true;
  }

  const isActive = status === 'running' || status === 'error';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid #f1f5f9',
        opacity: status === 'skipped' ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Left: circle */}
      <StepCircle step={step} status={status} />

      {/* Center: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: isActive ? 700 : 600,
            fontSize: 14,
            color: status === 'error' ? '#dc2626' : status === 'skipped' ? '#94a3b8' : '#1e293b',
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>

        {description && !detail && (
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{description}</div>
        )}

        {detail && status === 'running' && (
          <div
            style={{
              fontSize: 12,
              color: '#3b82f6',
              marginTop: 2,
              animation: 'is-pulse 1.5s ease-in-out infinite',
            }}
          >
            {detail}
          </div>
        )}

        {error && status === 'error' && (
          <div
            style={{
              marginTop: 6,
              padding: '6px 10px',
              borderRadius: 6,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Right: badge */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <StatusBadge status={status} duration={duration} />
      </div>
    </div>
  );
}

export default InstallationStep;

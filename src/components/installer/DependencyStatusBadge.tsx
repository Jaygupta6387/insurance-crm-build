import { useRef } from 'react';

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * Props for the small dependency status indicator badge.
 */
export interface DependencyStatusBadgeProps {
  status: 'installed' | 'not-installed' | 'downloading' | 'installing' | 'error' | 'checking';
  name: string;
  version?: string;
  size?: 'sm' | 'md';
}

// ─── keyframe injection ───────────────────────────────────────────────────────

let injected = false;
function ensureKeyframes() {
  if (injected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dsb-spin  { to { transform: rotate(360deg); } }
    @keyframes dsb-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
  `;
  document.head.appendChild(style);
  injected = true;
}

// ─── config map ──────────────────────────────────────────────────────────────

const CONFIG: Record<
  DependencyStatusBadgeProps['status'],
  {
    dotColor: string;
    background: string;
    color: string;
    border: string;
    label: (name: string, version?: string) => string;
    spin?: boolean;
    blink?: boolean;
  }
> = {
  installed: {
    dotColor: '#16a34a',
    background: '#f0fdf4',
    color: '#15803d',
    border: '1px solid #bbf7d0',
    label: (name, version) => `${name}${version ? ` ${version}` : ''} ✓`,
  },
  'not-installed': {
    dotColor: '#94a3b8',
    background: '#f8fafc',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    label: (name) => `${name} (not installed)`,
  },
  downloading: {
    dotColor: '#3b82f6',
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    label: () => 'Downloading…',
    spin: true,
  },
  installing: {
    dotColor: '#f59e0b',
    background: '#fffbeb',
    color: '#b45309',
    border: '1px solid #fde68a',
    label: () => 'Installing…',
    spin: true,
  },
  error: {
    dotColor: '#dc2626',
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    label: () => 'Error',
  },
  checking: {
    dotColor: '#6366f1',
    background: '#eef2ff',
    color: '#4338ca',
    border: '1px solid #c7d2fe',
    label: () => 'Checking…',
    blink: true,
  },
};

// ─── component ───────────────────────────────────────────────────────────────

/**
 * DependencyStatusBadge
 *
 * A compact inline badge showing the install/availability status of a
 * single dependency (e.g. PostgreSQL). Supports animated states for
 * downloading, installing, and checking.
 */
export function DependencyStatusBadge({
  status,
  name,
  version,
  size = 'md',
}: DependencyStatusBadgeProps) {
  const once = useRef(false);
  if (!once.current) {
    ensureKeyframes();
    once.current = true;
  }

  const cfg = CONFIG[status];
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? 5 : 6,
        padding: isSmall ? '2px 8px' : '4px 12px',
        borderRadius: 9999,
        fontSize: isSmall ? 11 : 12,
        fontWeight: 600,
        background: cfg.background,
        color: cfg.color,
        border: cfg.border,
        lineHeight: 1.4,
        userSelect: 'none',
      }}
    >
      {/* Dot / Spinner */}
      {cfg.spin ? (
        <span
          style={{
            display: 'inline-block',
            width: isSmall ? 10 : 12,
            height: isSmall ? 10 : 12,
            border: `2px solid ${cfg.dotColor}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'dsb-spin 0.7s linear infinite',
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          style={{
            display: 'inline-block',
            width: isSmall ? 7 : 8,
            height: isSmall ? 7 : 8,
            borderRadius: '50%',
            background: cfg.dotColor,
            flexShrink: 0,
            animation: cfg.blink ? 'dsb-blink 1.2s ease-in-out infinite' : undefined,
          }}
        />
      )}

      {/* Label */}
      {cfg.label(name, version)}
    </span>
  );
}

export default DependencyStatusBadge;

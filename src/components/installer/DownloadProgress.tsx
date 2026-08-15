import { useEffect, useRef } from 'react';

/**
 * Props for an individual file download progress display.
 */
export interface DownloadProgressProps {
  filename: string;
  /** 0–100 */
  percentage: number;
  speedKBps: number;
  etaSeconds: number;
  bytesDownloaded: number;
  totalBytes: number;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'error' | 'cancelled';
  error?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Format raw bytes into a human-readable string (e.g. "234 MB"). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format seconds into "Xm Ys" or "Xs" remaining string. */
function formatEta(seconds: number): string {
  if (seconds <= 0) return '…';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Format KB/s to human-readable speed string. */
function formatSpeed(kbps: number): string {
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  return `${(kbps / 1024).toFixed(2)} MB/s`;
}

// ─── styles ─────────────────────────────────────────────────────────────────

const S = {
  wrapper: {
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: '#fff',
    padding: '16px 18px',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  } as React.CSSProperties,

  icon: {
    fontSize: 18,
    flexShrink: 0,
  } as React.CSSProperties,

  filename: {
    fontWeight: 600,
    fontSize: 14,
    color: '#1e293b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  } as React.CSSProperties,

  track: {
    height: 8,
    borderRadius: 9999,
    background: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 8,
  } as React.CSSProperties,

  fill: (pct: number, color: string): React.CSSProperties => ({
    height: '100%',
    width: `${Math.min(100, Math.max(0, pct))}%`,
    borderRadius: 9999,
    background: color,
    transition: 'width 0.4s ease',
  }),

  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#64748b',
    gap: 8,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  sizeText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  } as React.CSSProperties,

  errorBox: {
    marginTop: 10,
    padding: '8px 12px',
    borderRadius: 6,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  } as React.CSSProperties,

  btn: {
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  } as React.CSSProperties,

  retryBtn: {
    background: '#dc2626',
    color: '#fff',
  } as React.CSSProperties,

  cancelBtn: {
    background: 'transparent',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    padding: '3px 10px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  } as React.CSSProperties,

  spinnerWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#3b82f6',
    fontSize: 12,
  } as React.CSSProperties,

  successRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#16a34a',
    fontWeight: 600,
    fontSize: 13,
    marginTop: 4,
  } as React.CSSProperties,
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

/** Inline CSS spinner (no external deps). */
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'dp-spin 0.7s linear infinite',
      }}
    />
  );
}

// Inject the keyframe once into the document head
let keyframeInjected = false;
function ensureKeyframe() {
  if (keyframeInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dp-spin { to { transform: rotate(360deg); } }
    @keyframes dp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  `;
  document.head.appendChild(style);
  keyframeInjected = true;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * DownloadProgress
 *
 * Displays a single file's download progress with an animated progress bar,
 * speed/ETA readout, and status-specific UI states (verifying, complete, error).
 */
export function DownloadProgress({
  filename,
  percentage,
  speedKBps,
  etaSeconds,
  bytesDownloaded,
  totalBytes,
  status,
  error,
  onRetry,
  onCancel,
}: DownloadProgressProps) {
  const injectedRef = useRef(false);
  if (!injectedRef.current) {
    ensureKeyframe();
    injectedRef.current = true;
  }

  const barColor =
    status === 'complete'
      ? '#16a34a'
      : status === 'error'
      ? '#dc2626'
      : status === 'cancelled'
      ? '#94a3b8'
      : '#3b82f6';

  const fileIcon =
    status === 'complete'
      ? '✅'
      : status === 'error'
      ? '❌'
      : status === 'verifying'
      ? '🔍'
      : status === 'cancelled'
      ? '⛔'
      : '📥';

  return (
    <div style={S.wrapper}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.icon}>{fileIcon}</span>
        <span style={S.filename} title={filename}>{filename}</span>
        {status === 'downloading' && onCancel && (
          <button style={S.cancelBtn} onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={S.track}>
        <div style={S.fill(status === 'verifying' ? 100 : percentage, barColor)} />
      </div>

      {/* Status rows */}
      {status === 'downloading' && (
        <>
          <div style={S.statusRow}>
            <span>
              Downloading… <strong>{percentage.toFixed(1)}%</strong>
              {speedKBps > 0 && <> &bull; {formatSpeed(speedKBps)}</>}
              {etaSeconds > 0 && <> &bull; ~{formatEta(etaSeconds)} remaining</>}
            </span>
          </div>
          <div style={S.sizeText}>
            {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)}
          </div>
        </>
      )}

      {status === 'verifying' && (
        <div style={S.spinnerWrapper}>
          <Spinner size={13} />
          <span>Verifying checksum…</span>
        </div>
      )}

      {status === 'complete' && (
        <div style={S.successRow}>
          <span>✓</span>
          <span>Verified ✓</span>
          <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>
            {formatBytes(totalBytes)}
          </span>
        </div>
      )}

      {status === 'pending' && (
        <div style={{ ...S.statusRow, color: '#94a3b8' }}>
          <span>Waiting…</span>
          {totalBytes > 0 && <span>{formatBytes(totalBytes)}</span>}
        </div>
      )}

      {status === 'cancelled' && (
        <div style={{ ...S.statusRow, color: '#94a3b8' }}>
          <span>Cancelled</span>
        </div>
      )}

      {status === 'error' && (
        <div style={S.errorBox}>
          <span style={{ flex: 1 }}>⚠️ {error ?? 'Download failed'}</span>
          {onRetry && (
            <button
              style={{ ...S.btn, ...S.retryBtn }}
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default DownloadProgress;

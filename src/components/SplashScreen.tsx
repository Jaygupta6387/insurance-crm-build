import { useEffect, useState, type ReactNode } from 'react';

export interface SplashScreenProps {
  /** Status line under the loader (e.g. starting server…) */
  message?: string;
  /** Override company name; otherwise loaded from secure store */
  companyName?: string | null;
  /** Optional error / action area below the splash */
  children?: ReactNode;
}

/**
 * Full-viewport startup splash used before CRM login.
 * Brand layout: company name → Insured Hub → powered by InsureCRM + loader.
 */
export default function SplashScreen({
  message = 'Starting…',
  companyName: companyNameProp,
  children,
}: SplashScreenProps) {
  const [companyName, setCompanyName] = useState(companyNameProp?.trim() || '');

  useEffect(() => {
    if (companyNameProp?.trim()) {
      setCompanyName(companyNameProp.trim());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const store = await window.desktop.getStore();
        if (!cancelled && store.companyName?.trim()) {
          setCompanyName(store.companyName.trim());
        }
      } catch {
        // keep empty — product branding still shows
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyNameProp]);

  return (
    <div className="splash">
      <div className="splash-bg" aria-hidden="true">
        <div className="splash-orb splash-orb-a" />
        <div className="splash-orb splash-orb-b" />
        <div className="splash-orb splash-orb-c" />
        <div className="splash-grid" />
      </div>

      <div className="splash-content">
        <div className="splash-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <path
              d="M24 4L40 12v12c0 11-7 18-16 20C15 42 8 35 8 24V12L24 4Z"
              fill="currentColor"
              opacity="0.18"
            />
            <path
              d="M24 8L36 14.5v9.5c0 8.2-5.2 13.5-12 15.2C17.2 37.5 12 32.2 12 24V14.5L24 8Z"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
            />
            <path
              d="M18 24.5l4 4 8-9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {companyName ? (
          <p className="splash-company">{companyName}</p>
        ) : (
          <p className="splash-company splash-company-placeholder">Your workspace</p>
        )}

        <h1 className="splash-product">Insured Hub</h1>
        <p className="splash-powered">
          powered by <span>InsureCRM</span>
        </p>

        <div className="splash-loader" role="status" aria-label="Loading">
          <div className="splash-ring">
            <svg className="splash-ring-svg" viewBox="0 0 72 72">
              <circle className="splash-ring-track" cx="36" cy="36" r="30" />
              <circle className="splash-ring-spin" cx="36" cy="36" r="30" />
            </svg>
            <div className="splash-ring-core" />
          </div>
        </div>

        <p className="splash-status">{message}</p>

        {children ? <div className="splash-extra">{children}</div> : null}
      </div>
    </div>
  );
}

// "Do this in the FC27 web app" notes: what the user has to open there for FC Solver to see their data.
// One look everywhere, so the step stands out instead of reading like a footnote.
import type { ReactNode } from 'react';
import { AppWindow } from '@phosphor-icons/react';

export function WebAppHint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`webapp-hint ${className}`.trim()} role="note">
      <AppWindow weight="bold" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

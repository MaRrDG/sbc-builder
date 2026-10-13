// Around the lazy screens: a chunk that fails to load (an old tab after a deploy, a dropped connection)
// shows a short note with a reload button instead of a blank page.
import { Component, type ReactNode } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

function LoadFailed() {
  const { t } = useI18n();
  return (
    <div className="onboarding">
      <p className="signin-error" role="alert">
        <WarningCircle weight="bold" aria-hidden="true" /> {t('boot.loadFailed')}
      </p>
      <div className="signin-row">
        <button type="button" className="ghost wide" onClick={() => window.location.reload()}>
          {t('boot.reload')}
        </button>
      </div>
    </div>
  );
}

export class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <LoadFailed /> : this.props.children;
  }
}

import type { Route } from '../route';
import { useI18n } from '../i18n';
import './daily.css';

export default function Daily(_: { signedIn: boolean; authReady: boolean; practice: boolean; navigate: (r: Route) => void }) {
  const { t } = useI18n();
  return <main className="dg"><h1>{t('daily.name')}</h1></main>;
}

// Admin panel shell: Overview · Users · EA accounts · Codes · Daily, shown as sub-items under "Admin" in the app sidebar
// (see App.tsx); the page and its filters live in the URL.
import { ADMIN_TABS, type Route } from '../../route';
import { useI18n } from '../../i18n';
import { Overview } from './Overview';
import { UsersTable } from './UsersTable';
import { UserDetail } from './UserDetail';
import { AccountsTable } from './AccountsTable';
import { CodesTable } from './CodesTable';
import { DailyAdmin } from './DailyAdmin';

type AdminR = Extract<Route, { view: 'admin' }>;
export interface AdminProps { route: AdminR; navigate: (r: Route, replace?: boolean) => void }

export function AdminLayout({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const active = route.page === 'user' ? 'users' : route.page;
  const titleKey = ADMIN_TABS.find((tab) => tab.page === active)?.key ?? 'admin.tab.overview';
  return (
    <section className="adm">
      <header className="adm-head">
        <h1>{t(titleKey)}</h1>
      </header>
      {route.page === 'overview' && <Overview route={route} navigate={navigate} />}
      {route.page === 'users' && <UsersTable route={route} navigate={navigate} />}
      {route.page === 'user' && <UserDetail key={route.userId ?? ''} route={route} navigate={navigate} />}
      {route.page === 'codes' && <CodesTable />}
      {route.page === 'accounts' && <AccountsTable route={route} navigate={navigate} />}
      {route.page === 'daily' && <DailyAdmin route={route} navigate={navigate} />}
    </section>
  );
}

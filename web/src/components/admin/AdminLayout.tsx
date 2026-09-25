// Admin panel shell: tabs Overview · Users · EA accounts; the page and its filters live in the URL.
import { adminRoute, routePath, type AdminPage, type Route } from '../../route';
import { useI18n } from '../../i18n';
import { Overview } from './Overview';
import { UsersTable } from './UsersTable';
import { UserDetail } from './UserDetail';
import { AccountsTable } from './AccountsTable';

type AdminR = Extract<Route, { view: 'admin' }>;
export interface AdminProps { route: AdminR; navigate: (r: Route, replace?: boolean) => void }

const TABS: { page: Exclude<AdminPage, 'user'>; key: string }[] = [
  { page: 'overview', key: 'admin.tab.overview' },
  { page: 'users', key: 'admin.tab.users' },
  { page: 'accounts', key: 'admin.tab.accounts' },
];

export function AdminLayout({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const active = route.page === 'user' ? 'users' : route.page;
  return (
    <section className="adm">
      <header className="adm-head">
        <h1>{t('admin.title')}</h1>
        <nav className="adm-tabs" aria-label={t('admin.tabs')}>
          {TABS.map((tab) => {
            const r = adminRoute(tab.page);
            return (
              <a
                key={tab.page}
                href={routePath(r)}
                aria-current={active === tab.page ? 'page' : undefined}
                onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(r); }}
              >
                {t(tab.key)}
              </a>
            );
          })}
        </nav>
      </header>
      {route.page === 'overview' && <Overview route={route} navigate={navigate} />}
      {route.page === 'users' && <UsersTable route={route} navigate={navigate} />}
      {route.page === 'user' && <UserDetail key={route.userId ?? ''} route={route} navigate={navigate} />}
      {route.page === 'accounts' && <AccountsTable route={route} navigate={navigate} />}
    </section>
  );
}

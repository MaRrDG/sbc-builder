// Codes: promo (admin-made) and gift (user-owned) codes, create form, per-code redemption list.
import { useState, type FormEvent } from 'react';
import { api, type AdminCodeRow } from '../../api';
import { useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { DataTable, type Column } from './DataTable';
import { useLoad } from './useLoad';

type Kind = 'promo' | 'gift';

function Uses({ code }: { code: string }) {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api.adminCode(code), [code]);
  if (error) return <p className="signin-error" role="alert">{error}</p>;
  if (!data) return <p className="muted">…</p>;
  if (data.uses.length === 0) return <p className="muted">{t('admin.codes.noUses')}</p>;
  return (
    <ul className="adm-uses">
      {data.uses.map((u) => (
        <li key={u.userId}>
          {u.email || u.userId} · {u.status === 'granted' ? t('admin.codes.granted') : t('admin.codes.pending')} · {new Date(u.at).toLocaleDateString()}
        </li>
      ))}
    </ul>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [days, setDays] = useState('30');
  const [lifetime, setLifetime] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.adminCreateCode({
        ...(code.trim() ? { code: code.trim().toUpperCase() } : {}),
        days: lifetime ? null : Number(days),
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        note: note.trim(),
      });
      setCode(''); setMaxUses(''); setExpires(''); setNote('');
      onDone();
    } catch (x) {
      setErr(errorText(x, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="adm-card adm-codes-new">
      <summary>{t('admin.codes.new')}</summary>
      <form className="adm-codes-form" onSubmit={(e) => void submit(e)}>
        <label>{t('admin.codes.codeOptional')}
          <input value={code} maxLength={20} pattern="[A-Za-z0-9]{4,20}" onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>{t('admin.codes.days')}
          <input type="number" min={1} max={3650} required={!lifetime} disabled={lifetime} value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={lifetime} onChange={(e) => setLifetime(e.target.checked)} /> {t('admin.codes.lifetime')}
        </label>
        <label>{t('admin.codes.maxUses')}
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <label>{t('admin.codes.expires')}
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <label>{t('admin.codes.note')}
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="solve-sm" disabled={busy}>{t('admin.codes.create')}</button>
        {err && <p className="signin-error" role="alert">{err}</p>}
      </form>
    </details>
  );
}

export function CodesTable() {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('promo');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const { data, error, reload } = useLoad(() => api.adminCodes(kind, page), [kind, page]);

  const pick = (k: Kind) => { setKind(k); setPage(1); setOpen(null); };
  const toggle = async (c: AdminCodeRow) => {
    setRowErr(null);
    try {
      await api.adminSetCodeDisabled(c.code, !c.disabled);
      await reload();
    } catch (x) {
      setRowErr(errorText(x, t));
    }
  };

  const columns: Column<AdminCodeRow>[] = [
    { key: 'code', label: t('admin.codes.code'), render: (c) => <code>{c.code}</code> },
    { key: 'days', label: t('admin.codes.days'), num: true, render: (c) => (c.days === null ? `∞ ${t('admin.codes.lifetime')}` : c.days) },
    { key: 'uses', label: t('admin.codes.uses'), num: true, render: (c) => `${c.uses} / ${c.maxUses ?? '∞'}` },
    { key: 'expires', label: t('admin.codes.expires'), hideSm: true, render: (c) => (c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—') },
    ...(kind === 'gift' ? [{ key: 'owner', label: t('admin.codes.owner'), hideSm: true, render: (c: AdminCodeRow) => c.ownerEmail ?? '—' }] : []),
    { key: 'note', label: t('admin.codes.note'), hideSm: true, render: (c) => c.note || '—' },
    { key: 'state', label: t('admin.codes.state'), render: (c) => (c.disabled ? t('admin.codes.disabled') : t('admin.codes.active')) },
    {
      key: 'actions', label: '', render: (c) => (
        <>
          <button type="button" className="ghost" onClick={() => void toggle(c)}>{c.disabled ? t('admin.codes.enable') : t('admin.codes.disable')}</button>
          <button type="button" className="ghost" aria-expanded={open === c.code} onClick={() => setOpen(open === c.code ? null : c.code)}>{t('admin.codes.usedBy')}</button>
        </>
      ),
    },
  ];

  return (
    <>
      {kind === 'promo' && <CreateForm onDone={() => void reload()} />}
      <div className="adm-toolbar">
        <div className="adm-range" role="group" aria-label={t('admin.codes.kindSwitch')}>
          {(['promo', 'gift'] as const).map((k) => (
            <button key={k} type="button" className="ghost" aria-pressed={kind === k} onClick={() => pick(k)}>{t(`admin.codes.${k}`)}</button>
          ))}
        </div>
      </div>
      {(error || rowErr) && <p className="signin-error" role="alert">{error ?? rowErr}</p>}
      <DataTable
        caption={t('admin.tab.codes')}
        columns={columns}
        rows={data?.rows ?? null}
        rowKey={(c) => c.code}
        page={data?.page ?? 1}
        total={data?.total ?? 0}
        pageSize={data?.pageSize ?? 25}
        onPage={setPage}
        empty={t('admin.codes.empty')}
        loading={!data}
      />
      {open && (
        <section className="adm-card" key={open}>
          <h2>{t('admin.codes.usedBy')} <code>{open}</code></h2>
          <Uses code={open} />
        </section>
      )}
    </>
  );
}

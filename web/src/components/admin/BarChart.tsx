// Daily bar chart, stacked series, hand-written SVG. Values are also in a visually hidden table.
import { useI18n } from '../../i18n';
import { shortDay } from './format';

type Tone = 'go' | 'ink' | 'muted' | 'bad';
interface Props { title: string; days: string[]; series: { label: string; values: number[]; tone: Tone }[] }

const W = 600;
const H = 180;
const PAD = { l: 28, r: 6, t: 10, b: 22 };

export function BarChart({ title, days, series }: Props) {
  const { t, lang } = useI18n();
  const totals = days.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const max = Math.max(1, ...totals);
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / days.length;
  const y = (v: number) => PAD.t + ih - (v / niceMax) * ih;
  const every = days.length > 10 ? Math.ceil(days.length / 6) : 1;
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <figure className="adm-chart">
      <figcaption>
        <span>{title}</span>
        <b>{sum}</b>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('admin.chart.aria', { title, total: sum })} preserveAspectRatio="none">
        {[0, niceMax / 2, niceMax].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="adm-grid" />
            <text x={PAD.l - 6} y={y(v) + 4} className="adm-axis" textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          let acc = 0;
          return (
            <g key={d}>
              <title>{`${shortDay(d, lang)}: ${series.map((s) => `${s.label} ${s.values[i]}`).join(', ')}`}</title>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} className="adm-hit" />
              {series.map((s) => {
                const v = s.values[i];
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                return v ? <rect key={s.label} x={PAD.l + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={Math.max(h, 1)} rx={2} className={`adm-bar ${s.tone}`} /> : null;
              })}
              {i % every === 0 && <text x={PAD.l + i * bw + bw / 2} y={H - 6} className="adm-axis" textAnchor="middle">{shortDay(d, lang)}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <ul className="adm-legend">
          {series.map((s) => (
            <li key={s.label}><i className={`adm-swatch ${s.tone}`} aria-hidden="true" />{s.label}</li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">{t('admin.chart.day')}</th>{series.map((s) => <th key={s.label} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>{days.map((d, i) => <tr key={d}><th scope="row">{d}</th>{series.map((s) => <td key={s.label}>{s.values[i]}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

// Server HTML for the public SBC pages: what crawlers read inside #root before the app takes over.
// Plain, escaped, inline-styled like the index.html fallback. EA text stays as sent.
import type { SbcListItem, SbcSetView } from './view.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const date = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const LINK = 'style="color: #c8f53c"';
const WRAP = 'style="max-width: 720px; margin: 48px auto; padding: 0 16px; color: #f3f1ea; font-family: system-ui, sans-serif; line-height: 1.5"';

const howTo = (name: string) =>
  `Pick ${name} in FC Solver and press Solve: the SBC solver builds the cheapest squad that meets every requirement from the players you already own, SBC storage included, and checks chemistry the way the game does. You then build it in the web app yourself. FC Solver never buys, sells or submits anything.`;

export function setHead(v: SbcSetView) {
  const reqs = v.challenges.flatMap((c) => c.requirements).slice(0, 3).join(', ');
  return {
    title: `${v.name} SBC · cheapest solution from your club · FC Solver`,
    description: `${v.name} SBC for EA FC 27: ${v.challenges.length} challenge${v.challenges.length === 1 ? '' : 's'}${reqs ? ` (${reqs})` : ''}. Our SBC solver builds the cheapest squad from your own club.`.slice(0, 300),
  };
}

export const hubHead = () => ({
  title: 'All EA FC 27 SBCs · requirements and cheapest solutions · FC Solver',
  description: 'Every live EA FC 27 Squad Building Challenge with its requirements and rewards. The FC Solver SBC builder finds the cheapest squad for each one from your own club.',
});

export function setBody(v: SbcSetView): string {
  const meta = [
    v.expired ? 'Expired' : v.endTime ? `Ends ${date(v.endTime)}` : null,
    v.repeatability === 'unlimited' ? 'Repeatable' : v.repeatability === 'refresh' ? `Repeatable${v.repeats ? ` ${v.repeats}×` : ''}${v.refreshHours ? ` every ${v.refreshHours} h` : ''}` : 'One time',
  ].filter(Boolean).join(' · ');
  const list = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<main ${WRAP}>
<nav aria-label="Breadcrumb"><a href="/" ${LINK}>FC Solver</a> › <a href="/sbcs" ${LINK}>SBCs</a></nav>
<h1>${esc(v.name)} SBC</h1>
<p>${esc(v.description)}</p>
<p>${esc(meta)}</p>
${v.rewards.length ? `<h2>Rewards</h2>${list(v.rewards)}` : ''}
${v.stats ? `<p>Solved by ${v.stats.solvers} FC Solver players · ${v.stats.foundPct}% found a squad</p>` : ''}
<h2>Challenges</h2>
${v.challenges.map((c) => `<section><h3>${esc(c.name)}</h3>${c.formation ? `<p>Formation: ${esc(c.formation)}</p>` : ''}${list(c.requirements)}${c.rewards.length ? `<p>Reward: ${esc(c.rewards.join(', '))}</p>` : ''}</section>`).join('\n')}
<h2>How do I complete ${esc(v.name)} cheaply?</h2>
<p>${esc(howTo(v.name))}</p>
<p><a href="/signin" ${LINK}>Solve it with your own club</a></p>
</main>`;
}

export function hubBody(items: SbcListItem[]): string {
  const row = (x: SbcListItem) => `<li><a href="${esc(x.path)}" ${LINK}>${esc(x.name)}</a>${x.expired ? ' · Expired' : x.endTime ? ` · ends ${date(x.endTime)}` : ''}</li>`;
  const active = items.filter((x) => !x.expired);
  const old = items.filter((x) => x.expired);
  return `<main ${WRAP}>
<h1>All EA FC 27 SBCs</h1>
<p>Requirements and rewards of every Squad Building Challenge. FC Solver is an SBC solver and SBC builder: it finds the cheapest squad for each one from the players you already own.</p>
<h2>Live SBCs</h2><ul>${active.map(row).join('')}</ul>
${old.length ? `<h2>Expired SBCs</h2><ul>${old.map(row).join('')}</ul>` : ''}
</main>`;
}

export function setJsonLd(v: SbcSetView, base: string): string {
  return ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'FC Solver', item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: 'SBCs', item: `${base}/sbcs` },
        { '@type': 'ListItem', position: 3, name: `${v.name} SBC`, item: `${base}${v.path}` },
      ] },
      { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `How do I complete ${v.name} cheaply?`, acceptedAnswer: { '@type': 'Answer', text: howTo(v.name) } }] },
    ],
  });
}

export const hubJsonLd = (base: string) =>
  ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'FC Solver', item: `${base}/` },
    { '@type': 'ListItem', position: 2, name: 'SBCs', item: `${base}/sbcs` },
  ] });

// npm run i18n:check — every t('key') in the site exists, plurals are complete, no dead keys,
// and each translation uses the same {params} as English.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../web/src/locales/en.ts';
import { ro } from '../web/src/locales/ro.ts';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) ? [join(dir, f)] : []));
const src = files('web/src').filter((f) => !f.includes('/locales/')).map((f) => readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')).join('\n'); // comments are not code

const problems: string[] = [];
const enKeys = new Set(Object.keys(en));
const base = (k: string) => k.replace(/_(one|few|other)$/, '');
const bases = new Set([...enKeys].map(base));

// keys used in code: t('x'), t(`x${i}y`) (template: checked by prefix), plus string keys stored in tables
const used = new Set<string>();
for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
for (const m of src.matchAll(/'((?:club|exclude|err|guide|set|opt|player)\.[\w.]+)'/g)) used.add(m[1]);
const templated = [...src.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)].map((m) => m[1]);
for (const k of used) if (!bases.has(k)) problems.push(`used but missing in en: ${k}`);
for (const k of bases)
  if (!used.has(k) && !templated.some((p) => k.startsWith(p)) && !k.startsWith('err.')) problems.push(`unused key: ${k}`);

for (const k of enKeys) if (k.endsWith('_other') && !enKeys.has(k.replace('_other', '_one'))) problems.push(`plural without _one: ${k}`);
for (const k of enKeys) if (k.endsWith('_other') && !(k.replace('_other', '_few') in ro)) problems.push(`ro plural without _few: ${k}`);

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const [k, v] of Object.entries(ro)) {
  const ref = (en as Record<string, string>)[k] ?? (en as Record<string, string>)[k.replace('_few', '_other')];
  if (ref === undefined) problems.push(`ro has unknown key: ${k}`);
  else if (params(ref).replace('count', '') !== params(v).replace('count', '') && !k.endsWith('_one'))
    problems.push(`params differ for ${k}: en {${params(ref)}} ro {${params(v)}}`);
}

if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log(`i18n ok: ${bases.size} messages, ${used.size} used directly, en + ro complete`);

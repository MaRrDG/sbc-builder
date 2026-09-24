// Trusted accounts: their brick report wins over the vote. Usage:
//   npm run db:trust                        list
//   npm run db:trust <personaId> [note]     add / update
//   npm run db:trust -- --remove <personaId>
import { closeDb, db, initDb } from '../server/db/index.js';
import { trustedAccounts } from '../server/db/schema.js';
import { setTrusted } from '../server/db/sbcs.js';

const args = process.argv.slice(2);
const remove = args[0] === '--remove';
const id = Number(remove ? args[1] : args[0]);
await initDb();
if (args.length && !Number.isInteger(id)) {
  console.error('usage: npm run db:trust [<personaId> [note]] | npm run db:trust -- --remove <personaId>');
  process.exitCode = 1;
} else if (remove) {
  await setTrusted(id, false);
  console.log(`removed ${id}`);
} else if (args.length) {
  const note = args.slice(1).join(' ');
  await setTrusted(id, true, note);
  console.log(`trusted ${id}`);
}
for (const t of await db.select().from(trustedAccounts)) console.log(`${t.personaId}\t${t.note}`);
console.log('(the server picks this up within 10 minutes; the admin screen applies it at once)');
await closeDb();

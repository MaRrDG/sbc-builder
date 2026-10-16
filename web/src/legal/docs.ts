// Terms, privacy policy and cookie policy, in every site language. Long legal text lives here as
// whole documents instead of t() keys; docs.test.ts keeps the languages in step.
// Change UPDATED whenever a document's meaning changes.
import type { Lang } from '../i18n';
import { CONTACT, LEGAL_DOCS, type LegalDoc } from './titles';
export { CONTACT, LEGAL_DOCS, type LegalDoc };
const PADDLE_TERMS = 'paddle.com/legal/checkout-buyer-terms';

export const OPERATOR = 'Mario Dragut';
export const UPDATED = '2026-10-13';

export interface Section {
  id: string;
  h: string;
  p: string[]; // paragraphs; a line starting with "- " is a list item
}
export interface Doc {
  title: string;
  intro: string;
  sections: Section[];
}

const en: Record<LegalDoc, Doc> = {
  terms: {
    title: 'Terms of use',
    intro: `These terms apply to FC Solver, the website and its Chrome extension, run by ${OPERATOR} (Romania, "we"). By creating an account or using FC Solver you accept them.`,
    sections: [
      {
        id: 'service',
        h: 'What FC Solver does',
        p: [
          'FC Solver reads your EA SPORTS FC 27 Ultimate Team club and the list of Squad Building Challenges (SBCs) through its browser extension, while you have the EA FC web app open, and suggests the cheapest squad from the players you own that completes an SBC.',
          'FC Solver is read-only toward EA: it never buys, sells, moves, submits or changes anything in your EA account. You build and submit every squad yourself in the EA web app.',
        ],
      },
      {
        id: 'ea',
        h: 'Not affiliated with EA',
        p: [
          'FC Solver is an independent fan project. It is not affiliated with, endorsed, sponsored or approved by Electronic Arts Inc. EA SPORTS, EA SPORTS FC, Ultimate Team and the related names, card art and logos belong to Electronic Arts and their licensors; player names and likenesses belong to their respective owners.',
          'Your use of EA services is governed by EA\'s own terms. Tools that work alongside the EA web app may conflict with them, and EA alone decides what it allows. FC Solver keeps its requests to EA few and read-only, but we cannot promise EA will never restrict an account. You use FC Solver at your own risk.',
        ],
      },
      {
        id: 'account',
        h: 'Your account',
        p: [
          'You sign in with an email code or Google. You must be at least 16 years old and allowed by EA to use the EA account you link.',
          'Link only EA accounts that are yours. Keep your sign-in and the extension on your own devices; the extension holds a key that gives access to your FC Solver data.',
        ],
      },
      {
        id: 'use',
        h: 'Fair use',
        p: [
          'Do not misuse FC Solver: no attempts to break its security, to reach other people\'s data, to overload it, to scrape it in bulk, or to use it to automate actions in EA services. We may suspend or remove accounts that do.',
        ],
      },
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily is a free guessing game at /daily. Players come from FC Solver\'s own database, built from the EA FC data the FC Solver extension sees while people use it; it can be incomplete or out of date (a very recent transfer can show the old club for a while).',
          'Signed in, consecutive daily wins earn invite points: +1 at 7 wins in a row, +1 at 14, +2 at 30, then again every 30 wins. Practice games and games played while signed out earn nothing. Points are the same as invite points: they have no cash value, cannot be transferred, are granted at our discretion and can be withdrawn on abuse or cheating (for example automated guessing or several accounts).',
        ],
      },
      {
        id: 'accuracy',
        h: 'No guarantees',
        p: [
          'We port the game\'s rules carefully, but squads, ratings, chemistry and requirement checks can be wrong or out of date, for example after a game update or when EA changes an SBC. Always check the squad in the EA web app before you submit it.',
          'FC Solver is provided "as is", without warranties of any kind, and may change, be unavailable or stop at any time.',
        ],
      },
      {
        id: 'liability',
        h: 'Liability',
        p: [
          'As far as the law allows, we are not liable for lost items, coins, packs, rewards, account restrictions or any indirect damage that results from using FC Solver or from a suggested squad. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer.',
        ],
      },
      {
        id: 'paid',
        h: 'Plans',
        p: [
          'FC Solver has a Free plan and a Premium plan. Free includes a weekly number of solves (shown in the app next to the Solve button and in Settings); only a solve that finds a squad counts, and the week starts with your first counted solve and resets 7 days later. Premium removes the limit and adds global solver settings. We may grant or end Premium, and change the Free limit, with notice in the app. Boosting the FC Solver Discord server with a connected Discord account gives Premium while you are boosting and for 12 hours after the boost ends; if you disconnect Discord, it ends at once, even within those 12 hours. It does not use up Premium days from codes or points.',
          `Premium can also be bought as a subscription, monthly or yearly, at the prices shown on the website and at checkout (VAT included). Our order process is run by our online reseller Paddle.com, which is the Merchant of Record for all our orders: you buy from Paddle, which charges you, sends the receipt and handles VAT, cancellations and refunds, under its buyer terms (${PADDLE_TERMS}). The subscription renews automatically at the end of each period until you cancel it in Settings (Manage subscription); after cancelling, Premium stays until the paid period ends. Refunds follow our refund policy. Premium from a subscription is switched on when Paddle confirms the payment to us.`,
          'Lifetime Premium (a Founding 50 spot, Premium for life from an invite while those spots last, or a lifetime code) lasts as long as FC Solver runs and your FC Solver account exists. It belongs to that account: it cannot be transferred, sold or exchanged for money, and it ends when the account is deleted.',
        ],
      },
      {
        id: 'end',
        h: 'Ending and changes',
        p: [
          'You can stop using FC Solver at any time and delete your account yourself in Settings → Your data. The deletion happens 7 days later; until then you can sign in and cancel it. An active subscription stops renewing when you ask, and is cancelled for good on the deletion day; there is no automatic refund, but you can ask for one under the refund policy. Premium of any kind, invite points and the unused gift codes you own end with the account. What we delete and what we keep is explained in the privacy policy.',
          'We may update these terms; the date below changes when we do, and important changes are announced on the website.',
        ],
      },
      {
        id: 'law',
        h: 'Law and contact',
        p: [
          `These terms are governed by Romanian law; as a consumer in the EU you also keep the protection of the law of your country. Questions: ${CONTACT}.`,
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    intro: `This policy explains which personal data FC Solver processes and why. The controller is ${OPERATOR}, Romania, reachable at ${CONTACT}.`,
    sections: [
      {
        id: 'data',
        h: 'What we process',
        p: [
          `- Account: your email address, language and plan, the sign-in method (email code or Google; with Google, your Google account email and profile basics), an internal user id, and when you signed up and were last active.`,
          `- Onboarding survey, only if you answer it: where you heard about FC Solver and how long you have played FUT.`,
          `- EA data, read by the extension from the EA web app you have open: your EA persona id and name, club name, the players in your club, Unassigned and SBC storage, your active squad, the SBC list and your progress, the evolutions you train, and the locked slots of SBCs you open. We also keep a history of the SBCs and objectives completed on each EA account, to show your progress. We do not receive your EA password. Your EA session id is used once to confirm the account is yours and is not stored (extensions older than 0.7 still keep it on the server until they are updated).`,
          `- Use of the service: how many requests we made to EA for your account each day, sync times and errors, the extension version, and the solver settings you send with each solve. An event history of your account (solves, syncs, EA errors) is kept for 180 days, for support and to spot abuse.`,
          `- Technical data: IP address and browser details in server and security logs, and to limit abuse.`,
          `- In your browser only: solver settings, saved squads, language and similar preferences (see the cookie policy).`,
          `- FC Solver Daily, when you play signed in: the day, your guesses and whether you won, to keep your stats and streak. Signed out, the game keeps its state only in your browser.`,
          `- FC Solver Daily leaderboard, only if you choose to appear: your username, wins, games played and streak are public on /daily. You can hide yourself or change the username in Settings at any time. Signed-out games are counted only as anonymous totals.`,
          `- Emails: whether you want evolution training emails and the Daily streak reminder (both Premium), and on which days a reminder was sent.`,
          `- Invites: your invite code, who joined with it, the codes you own (including gift codes) or redeemed, your invite points and their history, and whether you hold a Founding 50 spot.`,
          `- Discord, only if you connect it in Linked accounts: your Discord account id and username (from Clerk's Discord connection), the roles our bot gives you on the FC Solver server, and, to grant Premium for boosting our server, your boost status and dates. The /sbc and /stats commands of our Discord bot answer publicly in the channel where you use them, so the club players and stats they show are visible to everyone on that server.`,
          `- Payments, only if you subscribe: your Paddle customer and subscription ids, the plan, its status and renewal dates, and the amounts and currency of payments and refunds. Your card details, billing name, address and the email used at checkout are handled by Paddle and never reach us.`,
        ],
      },
      {
        id: 'why',
        h: 'Why, and on which legal basis',
        p: [
          `- Performance of our agreement with you (GDPR art. 6(1)(b)): your account and sign-in, syncing your club and SBCs, solving, the Daily, Premium and subscriptions (including evolution training emails, part of Premium; switch them off any time in Settings or with the link in each email), invites and points.`,
          `- Our legitimate interests (art. 6(1)(f)): keeping FC Solver secure and working (logs, rate limits, the daily cap on EA requests, fixing errors), the event history and abuse checks, backups, and understanding in aggregate how the website is used.`,
          `- Your consent (art. 6(1)(a)), which you can withdraw at any time: the Daily streak reminder email, appearing on the Daily leaderboard and connecting Discord, which you switch off in Settings or Linked accounts, and the optional onboarding survey, whose answers we remove if you write to us or delete your account. Withdrawing does not affect what was done before.`,
          `- SBC data is shared in a limited way: the SBC list, challenges and the locked-slot layouts accounts report are stored once for everyone, so every user gets correct layouts. Reports are tied to an EA persona id, never shown to other users.`,
        ],
      },
      {
        id: 'who',
        h: 'Who else processes it',
        p: [
          `- Clerk, Inc. (USA): sign-in and user accounts.`,
          `- Google: only if you sign in with Google.`,
          `- Cloudflare, Inc.: network, DNS and protection against attacks; traffic passes through its servers. Its Turnstile check tells people from bots when you sign in.`,
          `- OpenWebTrack (self-hosted by us in the EU): cookieless website statistics, looked at in aggregate (pages viewed, referrer, country, device type, and which features are used, such as solving an SBC or finishing the Daily). No cookies, no personal data in the events and no cross-site tracking.`,
          `- Paddle.com Market Ltd (UK) and its group: our reseller (Merchant of Record) for subscriptions; it processes your name, email, country, billing address and payment details as an independent controller under its own privacy policy, and tells us only what is listed above under Payments.`,
          `- Resend (USA): sends our emails (sign-in emails aside, which come from Clerk): evolution training emails, the Daily streak reminder and account notices such as a deletion confirmation.`,
          `- Discord Inc. (USA): only if you connect Discord or join our server: the account link, our bot, server roles and the boost that gives Premium.`,
          `- Electronic Arts: your browser loads player card images straight from EA's content servers, so EA sees your IP address, as it does when you use the EA web app.`,
          `- Our server and database, operated by us.`,
          `Transfers to the USA rely on the EU-US Data Privacy Framework where the company is certified, and on Standard Contractual Clauses otherwise. We do not sell personal data and do not use it for advertising.`,
        ],
      },
      {
        id: 'keep',
        h: 'How long we keep it',
        p: [
          `Account and EA data: while your account exists; club and SBC data are overwritten at each sync. EA request counters: a few days. The event history of your account: 180 days. Server logs are kept for a limited time and then rotated out. Backups of the database expire within 14 days.`,
          `When you delete your account (Settings → Your data), nothing happens for 7 days: sign in and press Cancel deletion to keep it. Then we delete your Clerk sign-in account, our database records about you, and the cached data and history of your EA accounts. An EA account's data stays only while another FC Solver account currently uses that EA account. A subscription that is still active is cancelled that day. After deleting, remove the FC Solver extension from Chrome: otherwise it will start sending your EA data again, as a new account. What remains:`,
          `- Paddle keeps invoices and payment records as long as tax law requires (it is the Merchant of Record).`,
          `- Paddle may still send us final notices about the cancelled subscription after the deletion; we keep them for up to 180 days with only the Paddle subscription number.`,
          `- Backups that still contain your data expire within 14 days.`,
          `- Our event history keeps its entries without your user id, and without the EA account id once that EA account's data is deleted, until they are pruned at 180 days.`,
          `- Against abuse, we keep a record that an EA account already earned a Founding 50 spot or invite points, so the same EA account cannot earn them again. It holds nothing about you beyond the EA account number. For the same reason, if other FC Solver accounts were linked to the same EA account, their links stay (they count toward its limit of 3 FC Solver accounts); your own link is deleted.`,
          `- The shared SBC data described above, which does not point to you.`,
        ],
      },
      {
        id: 'rights',
        h: 'Your rights',
        p: [
          `In Settings → Your data you can download a copy of your data (a JSON file) and delete your account yourself. You can also unlink an EA account, turn off emails, leave the Daily leaderboard and disconnect Discord in the app.`,
          `You can also ask for access to your data, a copy of it, correction, deletion, restriction, or object to processing based on legitimate interests, by writing to ${CONTACT}. You also have the right to complain to the Romanian data protection authority (ANSPDCP, dataprotection.ro) or the one in your country.`,
        ],
      },
      {
        id: 'kids',
        h: 'Children',
        p: ['FC Solver is not meant for anyone under 16, and we do not knowingly process their data.'],
      },
      {
        id: 'changes',
        h: 'Changes',
        p: ['When this policy changes, the date below changes too; important changes are announced on the website.'],
      },
    ],
  },
  cookies: {
    title: 'Cookie policy',
    intro: 'FC Solver uses only what it needs to work. There are no advertising or tracking cookies, and statistics are collected without cookies, so there is no consent banner.',
    sections: [
      {
        id: 'needed',
        h: 'Strictly necessary cookies',
        p: [
          '- Clerk (sign-in), for example __session, __client_uat and __client: keep you signed in. Set on our domain and on Clerk\'s sign-in domain; they last as long as your session or until you sign out.',
          '- Cloudflare, for example __cf_bm or cf_clearance: tell people from bots and protect the website. They last up to 30 minutes, or longer after a security check.',
          '- Paddle checkout: only when you open the payment form on the upgrade screen, Paddle\'s checkout frame (buy.paddle.com) sets its own strictly necessary cookies to run the payment securely and prevent fraud.',
        ],
      },
      {
        id: 'local',
        h: 'Storage in your browser',
        p: [
          'The website saves some things in your browser\'s local storage, never sent to anyone else: your language, solver settings (global and per SBC), players kept out of an SBC, the last squads found, and which notices you closed. You can clear them at any time from your browser settings.',
          'The extension keeps its access key and status in the extension\'s own storage in Chrome.',
        ],
      },
      {
        id: 'stats',
        h: 'Statistics',
        p: [
          'We count visits with OpenWebTrack in cookieless mode, so no cookie is set. To tell one visit from another, it keeps a random id in this tab\'s session storage, deleted when you close the tab; it is not linked to your account. Besides pages, it counts which features are used (for example a sign-in, a sync, a solved SBC, a finished Daily and its number of tries), never your email, name, EA account or usernames. Results are only looked at in aggregate. Admins are not counted.',
        ],
      },
      {
        id: 'control',
        h: 'Your choices',
        p: [
          'You can block or delete cookies in your browser; if you block the necessary ones, signing in will not work. Questions: ' + CONTACT + '.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Refund policy',
    intro: 'Premium subscriptions are sold by our reseller Paddle.com, the Merchant of Record for all our orders. This policy says when you get your money back.',
    sections: [
      {
        id: 'window',
        h: '14 days, no questions asked',
        p: [
          'If you are not happy with Premium, ask for a refund within 14 days of a payment and you get the full amount of that payment back. This applies to the first payment and to every renewal, monthly or yearly.',
          'After 14 days a payment is not refunded, including the unused part of a period; you can still cancel so the subscription does not renew.',
        ],
      },
      {
        id: 'how',
        h: 'How to ask',
        p: [
          `Use the link in your Paddle receipt email, or go to paddle.net and find your order with the email you paid with. You can also write to us at ${CONTACT} and we will ask Paddle to refund you. Refunds go back to the card or account you paid with; your bank may take a few days to show it.`,
        ],
      },
      {
        id: 'cancel',
        h: 'Cancelling',
        p: [
          'Cancel anytime in Settings → Manage subscription (Paddle\'s customer portal). Premium stays until the end of the period you paid for and the subscription does not renew. A refund also ends Premium from that payment.',
        ],
      },
      {
        id: 'law',
        h: 'Your legal rights',
        p: [
          'This policy adds to your rights as a consumer and does not limit them. Where a law gives you a right to cancel or to a refund, for example the EU right of withdrawal, Paddle applies it as described in its buyer terms (paddle.com/legal/checkout-buyer-terms).',
        ],
      },
    ],
  },
};

const ro: Record<LegalDoc, Doc> = {
  terms: {
    title: 'Termeni de utilizare',
    intro: `Acești termeni se aplică FC Solver, site-ului și extensiei sale pentru Chrome, administrate de ${OPERATOR} (România, „noi”). Creând un cont sau folosind FC Solver, îi accepți.`,
    sections: [
      {
        id: 'service',
        h: 'Ce face FC Solver',
        p: [
          'FC Solver citește clubul tău din EA SPORTS FC 27 Ultimate Team și lista de Squad Building Challenges (SBC-uri) prin extensia de browser, cât timp ai web app-ul EA FC deschis, și îți propune cea mai ieftină echipă din jucătorii pe care îi ai care completează un SBC.',
          'FC Solver doar citește de la EA: nu cumpără, nu vinde, nu mută, nu trimite și nu modifică nimic în contul tău EA. Fiecare echipă o construiești și o trimiți tu, în web app-ul EA.',
        ],
      },
      {
        id: 'ea',
        h: 'Nu suntem afiliați cu EA',
        p: [
          'FC Solver este un proiect independent, făcut de fani. Nu este afiliat, susținut, sponsorizat sau aprobat de Electronic Arts Inc. EA SPORTS, EA SPORTS FC, Ultimate Team și denumirile, grafica de carduri și logo-urile asociate aparțin Electronic Arts și licențiatorilor săi; numele și imaginile jucătorilor aparțin deținătorilor lor.',
          'Folosirea serviciilor EA este guvernată de termenii EA. Instrumentele care funcționează alături de web app-ul EA pot intra în conflict cu aceștia, iar doar EA decide ce permite. FC Solver face puține cereri către EA și doar de citire, dar nu putem garanta că EA nu va restricționa vreodată un cont. Folosești FC Solver pe propriul risc.',
        ],
      },
      {
        id: 'account',
        h: 'Contul tău',
        p: [
          'Te autentifici cu un cod primit pe email sau cu Google. Trebuie să ai cel puțin 16 ani și să ai dreptul, conform EA, să folosești contul EA pe care îl conectezi.',
          'Conectează doar conturi EA care îți aparțin. Păstrează autentificarea și extensia pe dispozitivele tale; extensia are o cheie care dă acces la datele tale din FC Solver.',
        ],
      },
      {
        id: 'use',
        h: 'Utilizare corectă',
        p: [
          'Nu folosi FC Solver abuziv: fără încercări de a-i ocoli securitatea, de a ajunge la datele altora, de a-l supraîncărca, de a-l copia automat în masă sau de a-l folosi pentru a automatiza acțiuni în serviciile EA. Putem suspenda sau șterge conturile care fac asta.',
        ],
      },
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily este un joc gratuit de ghicit, la /daily. Jucătorii vin din baza de date proprie FC Solver, construită din datele EA FC pe care le vede extensia FC Solver când este folosită; poate fi incompletă sau neactualizată (un transfer foarte recent poate arăta o vreme clubul vechi).',
          'Autentificat, victoriile zilnice la rând aduc puncte de invitație: +1 la 7 victorii la rând, +1 la 14, +2 la 30, apoi din nou la fiecare 30 de victorii. Jocurile de antrenament și cele jucate neautentificat nu aduc nimic. Punctele sunt aceleași ca punctele de invitație: nu au valoare în bani, nu se pot transfera, sunt acordate la discreția noastră și pot fi retrase în caz de abuz sau trișare (de exemplu ghicit automatizat sau mai multe conturi).',
        ],
      },
      {
        id: 'accuracy',
        h: 'Fără garanții',
        p: [
          'Reproducem cu grijă regulile jocului, dar echipele, rating-urile, chimia și verificarea cerințelor pot fi greșite sau depășite, de exemplu după un update al jocului sau când EA schimbă un SBC. Verifică mereu echipa în web app-ul EA înainte să o trimiți.',
          'FC Solver este oferit „ca atare”, fără garanții de niciun fel, și se poate schimba, poate fi indisponibil sau se poate opri oricând.',
        ],
      },
      {
        id: 'liability',
        h: 'Răspundere',
        p: [
          'În limita permisă de lege, nu răspundem pentru iteme, monede, pachete, recompense pierdute, restricții ale contului sau orice daune indirecte rezultate din folosirea FC Solver sau dintr-o echipă propusă. Nimic din acești termeni nu limitează răspunderea care nu poate fi limitată prin lege și nici drepturile tale de consumator.',
        ],
      },
      {
        id: 'paid',
        h: 'Planuri',
        p: [
          'FC Solver are un plan Free și un plan Premium. Free include un număr săptămânal de rezolvări (afișat în aplicație lângă butonul Rezolvă și în Setări); contează doar o rezolvare care găsește o echipă, iar săptămâna începe la prima rezolvare numărată și se resetează după 7 zile. Premium elimină limita și adaugă setări globale pentru solver. Putem acorda sau încheia Premium și putem schimba limita Free, cu anunț în aplicație. Un boost pe serverul de Discord FC Solver, cu contul de Discord conectat, oferă Premium cât timp dai boost și încă 12 ore după ce boost-ul se termină; dacă deconectezi Discord, se încheie imediat, chiar și în aceste 12 ore. Nu consumă zilele Premium din coduri sau puncte.',
          `Premium se poate cumpăra și ca abonament, lunar sau anual, la prețurile afișate pe site și la plată (TVA inclus). Comenzile sunt procesate de revânzătorul nostru online Paddle.com, care este Merchant of Record pentru toate comenzile noastre: cumperi de la Paddle, care te taxează, îți trimite chitanța și se ocupă de TVA, anulări și rambursări, conform termenilor săi pentru cumpărători (${PADDLE_TERMS}). Abonamentul se reînnoiește automat la finalul fiecărei perioade până îl anulezi din Setări (Gestionează abonamentul); după anulare, Premium rămâne activ până se termină perioada plătită. Rambursările urmează politica noastră de rambursare. Premium din abonament se activează când Paddle ne confirmă plata.`,
          'Premium pe viață (un loc în Founding 50, Premium pe viață primit printr-o invitație cât timp mai sunt astfel de locuri sau un cod pe viață) durează cât timp funcționează FC Solver și cât timp există contul tău FC Solver. Ține de acel cont: nu poate fi transferat, vândut sau preschimbat în bani și se încheie odată cu ștergerea contului.',
        ],
      },
      {
        id: 'end',
        h: 'Încetare și modificări',
        p: [
          'Poți renunța oricând la FC Solver și îți poți șterge singur contul din Setări → Datele tale. Ștergerea are loc după 7 zile; până atunci te poți autentifica și o poți anula. Un abonament activ nu se mai reînnoiește din momentul cererii și este anulat definitiv în ziua ștergerii; nu există rambursare automată, dar poți cere una conform politicii de rambursare. Orice fel de Premium, punctele de invitație și codurile cadou nefolosite pe care le deții se încheie odată cu contul. Ce ștergem și ce păstrăm găsești în politica de confidențialitate.',
          'Putem actualiza acești termeni; data de mai jos se schimbă atunci, iar modificările importante sunt anunțate pe site.',
        ],
      },
      {
        id: 'law',
        h: 'Legea aplicabilă și contact',
        p: [
          `Acești termeni sunt guvernați de legea română; ca și consumator din UE păstrezi și protecția legii din țara ta. Întrebări: ${CONTACT}.`,
        ],
      },
    ],
  },
  privacy: {
    title: 'Politica de confidențialitate',
    intro: `Această politică explică ce date personale prelucrează FC Solver și de ce. Operatorul este ${OPERATOR}, România, la adresa ${CONTACT}.`,
    sections: [
      {
        id: 'data',
        h: 'Ce date prelucrăm',
        p: [
          `- Contul: adresa de email, limba și planul, metoda de autentificare (cod pe email sau Google; cu Google, emailul și datele de bază ale contului Google), un identificator intern și momentul înscrierii și al ultimei activități.`,
          `- Chestionarul de bun venit, doar dacă îl completezi: de unde ai aflat de FC Solver și de cât timp joci FUT.`,
          `- Date EA, citite de extensie din web app-ul EA deschis de tine: id-ul și numele personei EA, numele clubului, jucătorii din club, din Unassigned și din SBC storage, echipa activă, lista de SBC-uri și progresul tău, evoluțiile pe care le antrenezi, precum și sloturile blocate ale SBC-urilor pe care le deschizi. Păstrăm și un istoric al SBC-urilor și obiectivelor completate pe fiecare cont EA, ca să-ți arătăm progresul. Nu primim parola EA. Id-ul sesiunii EA este folosit o singură dată pentru a confirma că contul e al tău și nu este păstrat (extensiile mai vechi de 0.7 îl mai păstrează pe server până sunt actualizate).`,
          `- Folosirea serviciului: câte cereri am făcut către EA pentru contul tău în fiecare zi, momentele și erorile sincronizărilor, versiunea extensiei și setările solverului trimise la fiecare rezolvare. Un istoric al evenimentelor din contul tău (rezolvări, sincronizări, erori EA) se păstrează 180 de zile, pentru suport și pentru a depista abuzurile.`,
          `- Date tehnice: adresa IP și detalii despre browser în jurnalele serverului și de securitate, și pentru limitarea abuzurilor.`,
          `- Doar în browserul tău: setările solverului, echipele salvate, limba și preferințe similare (vezi politica de cookie-uri).`,
          `- FC Solver Daily, când joci autentificat: ziua, încercările tale și dacă ai câștigat, pentru statistici și serie. Neautentificat, jocul își păstrează starea doar în browserul tău.`,
          `- Clasamentul FC Solver Daily, doar dacă alegi să apari: username-ul, victoriile, jocurile și seria ta sunt publice pe /daily. Te poți ascunde sau poți schimba username-ul oricând din Setări. Jocurile fără cont sunt numărate doar ca totaluri anonime.`,
          `- Emailuri: dacă vrei emailurile despre antrenarea evoluțiilor și reamintirea pentru seria din Daily (ambele Premium) și în ce zile ți-a fost trimisă o reamintire.`,
          `- Invitații: codul tău de invitație, cine s-a înscris cu el, codurile pe care le deții (inclusiv codurile cadou) sau pe care le-ai folosit, punctele de invitație și istoricul lor, precum și dacă ai un loc în Founding 50.`,
          `- Discord, doar dacă îl conectezi în Conturi conectate: id-ul și username-ul contului tău Discord (din conexiunea Discord a Clerk), rolurile pe care ți le dă botul nostru pe serverul FC Solver și, pentru a acorda Premium pentru boost pe serverul nostru, starea și datele boost-ului. Comenzile /sbc și /stats ale botului nostru de Discord răspund public în canalul în care le folosești, deci jucătorii și statisticile clubului afișate sunt vizibile tuturor de pe acel server.`,
          `- Plăți, doar dacă te abonezi: id-ul tău de client și de abonament Paddle, planul, starea lui și datele de reînnoire, plus sumele și moneda plăților și rambursărilor. Datele cardului, numele și adresa de facturare și emailul folosit la plată sunt gestionate de Paddle și nu ajung niciodată la noi.`,
        ],
      },
      {
        id: 'why',
        h: 'De ce și pe ce temei legal',
        p: [
          `- Executarea acordului cu tine (art. 6 alin. (1) lit. b) GDPR): contul și autentificarea, sincronizarea clubului și a SBC-urilor, rezolvarea, jocul Daily, Premium și abonamentele (inclusiv emailurile despre antrenarea evoluțiilor, parte din Premium; le poți opri oricând din Setări sau cu linkul din fiecare email), invitațiile și punctele.`,
          `- Interesul nostru legitim (art. 6 alin. (1) lit. f)): securitatea și buna funcționare a FC Solver (jurnale, limite de cereri, plafonul zilnic de cereri către EA, remedierea erorilor), istoricul evenimentelor și verificările anti-abuz, copiile de siguranță și înțelegerea agregată a felului în care e folosit site-ul.`,
          `- Consimțământul tău (art. 6 alin. (1) lit. a)), pe care îl poți retrage oricând: emailul de reamintire pentru seria din Daily, apariția în clasamentul Daily și conectarea contului Discord, pe care le poți opri din Setări sau din Conturi conectate, precum și chestionarul opțional de bun venit, ale cărui răspunsuri le ștergem dacă ne scrii sau dacă îți ștergi contul. Retragerea nu afectează ce s-a făcut înainte.`,
          `- Datele despre SBC-uri sunt partajate limitat: lista de SBC-uri, challenge-urile și sloturile blocate raportate de conturi sunt stocate o singură dată pentru toți, ca fiecare utilizator să primească aranjamente corecte. Rapoartele sunt legate de id-ul personei EA și nu sunt arătate altor utilizatori.`,
        ],
      },
      {
        id: 'who',
        h: 'Cine mai prelucrează datele',
        p: [
          `- Clerk, Inc. (SUA): autentificare și conturi de utilizator.`,
          `- Google: doar dacă te autentifici cu Google.`,
          `- Cloudflare, Inc.: rețea, DNS și protecție împotriva atacurilor; traficul trece prin serverele sale. Verificarea Turnstile deosebește oamenii de boți când te autentifici.`,
          `- OpenWebTrack (găzduit de noi, în UE): statistici despre site fără cookie-uri, analizate doar agregat (pagini vizitate, sursa vizitei, țara, tipul dispozitivului și ce funcții sunt folosite, de exemplu rezolvarea unui SBC sau terminarea jocului Daily). Fără cookie-uri, fără date personale în evenimente și fără urmărire între site-uri.`,
          `- Paddle.com Market Ltd (Regatul Unit) și grupul său: revânzătorul nostru (Merchant of Record) pentru abonamente; prelucrează numele, emailul, țara, adresa de facturare și datele de plată ca operator independent, conform propriei politici de confidențialitate, și ne transmite doar ce e listat mai sus la Plăți.`,
          `- Resend (SUA): trimite emailurile noastre (în afară de cele de autentificare, care vin de la Clerk): emailurile despre evoluții, reamintirea pentru Daily și notificările despre cont, cum ar fi confirmarea ștergerii.`,
          `- Discord Inc. (SUA): doar dacă îți conectezi contul Discord sau intri pe serverul nostru: conexiunea contului, botul nostru, rolurile de pe server și boost-ul care oferă Premium.`,
          `- Electronic Arts: browserul tău încarcă imaginile cardurilor direct de pe serverele de conținut EA, așa că EA îți vede adresa IP, la fel ca atunci când folosești web app-ul EA.`,
          `- Serverul și baza noastră de date, administrate de noi.`,
          `Transferurile în SUA se bazează pe EU-US Data Privacy Framework, acolo unde compania este certificată, iar altfel pe clauze contractuale standard. Nu vindem date personale și nu le folosim pentru publicitate.`,
        ],
      },
      {
        id: 'keep',
        h: 'Cât timp le păstrăm',
        p: [
          `Datele contului și datele EA: cât timp există contul; datele despre club și SBC-uri sunt suprascrise la fiecare sincronizare. Contoarele de cereri EA: câteva zile. Istoricul evenimentelor din cont: 180 de zile. Jurnalele serverului sunt păstrate un timp limitat, apoi șterse prin rotație. Copiile de siguranță ale bazei de date expiră în cel mult 14 zile.`,
          `Când îți ștergi contul (Setări → Datele tale), timp de 7 zile nu se întâmplă nimic: autentifică-te și apasă Anulează ștergerea ca să-l păstrezi. Apoi ștergem contul tău de autentificare Clerk, înregistrările despre tine din baza noastră de date, precum și datele salvate și istoricul conturilor tale EA. Datele unui cont EA rămân doar cât timp un alt cont FC Solver folosește în prezent acel cont EA. Un abonament încă activ este anulat în aceeași zi. După ștergere, scoate extensia FC Solver din Chrome: altfel va începe din nou să trimită datele tale EA, ca un cont nou. Ce rămâne:`,
          `- Paddle păstrează facturile și evidența plăților cât cere legea fiscală (este Merchant of Record).`,
          `- Paddle ne poate trimite și după ștergere ultimele notificări despre abonamentul anulat; le păstrăm cel mult 180 de zile, doar cu numărul abonamentului Paddle.`,
          `- Copiile de siguranță care încă îți conțin datele expiră în cel mult 14 zile.`,
          `- Istoricul nostru de evenimente își păstrează intrările fără id-ul tău de utilizator, iar după ștergerea datelor contului EA și fără id-ul acelui cont, până sunt șterse la 180 de zile.`,
          `- Împotriva abuzurilor, păstrăm evidența faptului că un cont EA a obținut deja un loc în Founding 50 sau puncte de invitație, ca același cont EA să nu le mai poată obține din nou. Evidența nu conține nimic despre tine în afară de numărul contului EA. Din același motiv, dacă alte conturi FC Solver au fost legate de același cont EA, legăturile lor rămân (se numără la limita de 3 conturi FC Solver a acelui cont EA); legătura ta se șterge.`,
          `- Datele partajate despre SBC-uri descrise mai sus, care nu trimit la tine.`,
        ],
      },
      {
        id: 'rights',
        h: 'Drepturile tale',
        p: [
          `Din Setări → Datele tale îți poți descărca o copie a datelor (un fișier JSON) și îți poți șterge singur contul. Tot din aplicație poți deconecta un cont EA, poți opri emailurile, poți ieși din clasamentul Daily și poți deconecta Discord.`,
          `Poți cere și acces la datele tale, o copie a lor, rectificarea, ștergerea, restricționarea prelucrării sau te poți opune prelucrării bazate pe interes legitim, scriind la ${CONTACT}. Ai și dreptul să depui o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP, dataprotection.ro) sau la autoritatea din țara ta.`,
        ],
      },
      {
        id: 'kids',
        h: 'Copii',
        p: ['FC Solver nu este destinat persoanelor sub 16 ani și nu prelucrăm cu bună știință datele lor.'],
      },
      {
        id: 'changes',
        h: 'Modificări',
        p: ['Când această politică se schimbă, se schimbă și data de mai jos; modificările importante sunt anunțate pe site.'],
      },
    ],
  },
  cookies: {
    title: 'Politica de cookie-uri',
    intro: 'FC Solver folosește doar ce îi trebuie ca să funcționeze. Nu există cookie-uri de publicitate sau de urmărire, iar statisticile sunt colectate fără cookie-uri, deci nu există banner de consimțământ.',
    sections: [
      {
        id: 'needed',
        h: 'Cookie-uri strict necesare',
        p: [
          '- Clerk (autentificare), de exemplu __session, __client_uat și __client: te țin autentificat. Sunt setate pe domeniul nostru și pe domeniul de autentificare Clerk; durează cât sesiunea ta sau până te deconectezi.',
          '- Cloudflare, de exemplu __cf_bm sau cf_clearance: deosebesc oamenii de boți și protejează site-ul. Durează până la 30 de minute sau mai mult după o verificare de securitate.',
          '- Plata Paddle: doar când deschizi formularul de plată de pe ecranul de upgrade, fereastra de plată Paddle (buy.paddle.com) își setează propriile cookie-uri strict necesare, ca plata să meargă în siguranță și să prevină frauda.',
        ],
      },
      {
        id: 'local',
        h: 'Stocare în browserul tău',
        p: [
          'Site-ul salvează câteva lucruri în stocarea locală a browserului, pe care nu le trimite nimănui: limba, setările solverului (globale și per SBC), jucătorii scoși dintr-un SBC, ultimele echipe găsite și notificările pe care le-ai închis. Le poți șterge oricând din setările browserului.',
          'Extensia își păstrează cheia de acces și starea în stocarea proprie a extensiei, în Chrome.',
        ],
      },
      {
        id: 'stats',
        h: 'Statistici',
        p: [
          'Numărăm vizitele cu OpenWebTrack în modul fără cookie-uri, deci nu se pune niciun cookie. Ca să deosebească o vizită de alta, păstrează un id aleator în stocarea de sesiune a tabului, șters când închizi tabul; nu este legat de contul tău. Pe lângă pagini, numără ce funcții sunt folosite (de exemplu o autentificare, un sync, un SBC rezolvat, un joc Daily terminat și numărul de încercări), niciodată emailul, numele, contul EA sau username-urile. Rezultatele sunt analizate doar agregat. Administratorii nu sunt numărați.',
        ],
      },
      {
        id: 'control',
        h: 'Opțiunile tale',
        p: [
          'Poți bloca sau șterge cookie-urile din browser; dacă le blochezi pe cele necesare, autentificarea nu va funcționa. Întrebări: ' + CONTACT + '.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Politica de rambursare',
    intro: 'Abonamentele Premium sunt vândute de revânzătorul nostru Paddle.com, Merchant of Record pentru toate comenzile noastre. Politica aceasta spune când îți primești banii înapoi.',
    sections: [
      {
        id: 'window',
        h: '14 zile, fără întrebări',
        p: [
          'Dacă nu ești mulțumit de Premium, cere rambursarea în cel mult 14 zile de la o plată și primești înapoi toată suma acelei plăți. Se aplică primei plăți și fiecărei reînnoiri, lunare sau anuale.',
          'După 14 zile plata nu se mai rambursează, nici partea nefolosită dintr-o perioadă; poți totuși anula, ca abonamentul să nu se mai reînnoiască.',
        ],
      },
      {
        id: 'how',
        h: 'Cum ceri',
        p: [
          `Folosește linkul din emailul cu chitanța Paddle sau intră pe paddle.net și caută comanda după emailul cu care ai plătit. Ne poți scrie și nouă la ${CONTACT}, iar noi îi cerem lui Paddle rambursarea. Banii se întorc pe cardul sau în contul cu care ai plătit; banca poate avea nevoie de câteva zile ca să-i afișeze.`,
        ],
      },
      {
        id: 'cancel',
        h: 'Anularea',
        p: [
          'Anulezi oricând din Setări → Gestionează abonamentul (portalul de client Paddle). Premium rămâne până la finalul perioadei plătite, iar abonamentul nu se mai reînnoiește. O rambursare încheie și Premium-ul din acea plată.',
        ],
      },
      {
        id: 'law',
        h: 'Drepturile tale legale',
        p: [
          'Politica aceasta se adaugă drepturilor tale de consumator și nu le limitează. Când legea îți dă dreptul de a renunța sau la o rambursare, de exemplu dreptul de retragere din UE, Paddle îl aplică așa cum scrie în termenii săi pentru cumpărători (paddle.com/legal/checkout-buyer-terms).',
        ],
      },
    ],
  },
};

const it: Record<LegalDoc, Doc> = {
  terms: {
    title: "Termini d'uso",
    intro: `Questi termini si applicano a FC Solver, al sito e alla sua estensione per Chrome, gestiti da ${OPERATOR} (Romania, «noi»). Creando un account o usando FC Solver li accetti.`,
    sections: [
      {
        id: 'service',
        h: 'Cosa fa FC Solver',
        p: [
          "FC Solver legge il tuo club di EA SPORTS FC 27 Ultimate Team e l'elenco delle Squad Building Challenges (SBC) tramite la sua estensione per browser, mentre hai aperta la web app di EA FC, e ti propone la rosa più economica, tra i giocatori che possiedi, che completa una SBC.",
          'FC Solver si limita a leggere da EA: non compra, non vende, non sposta, non invia e non modifica nulla nel tuo account EA. Ogni rosa la costruisci e la invii tu, nella web app di EA.',
        ],
      },
      {
        id: 'ea',
        h: 'Non affiliato a EA',
        p: [
          'FC Solver è un progetto indipendente di un appassionato. Non è affiliato, approvato, sponsorizzato o autorizzato da Electronic Arts Inc. EA SPORTS, EA SPORTS FC, Ultimate Team e i nomi, le immagini delle carte e i loghi correlati appartengono a Electronic Arts e ai suoi licenzianti; i nomi e le immagini dei giocatori appartengono ai rispettivi titolari.',
          "L'uso dei servizi EA è regolato dai termini di EA. Gli strumenti che funzionano insieme alla web app di EA possono entrare in conflitto con essi, e solo EA decide cosa consentire. FC Solver fa a EA poche richieste, di sola lettura, ma non possiamo garantire che EA non limiterà mai un account. Usi FC Solver a tuo rischio.",
        ],
      },
      {
        id: 'account',
        h: 'Il tuo account',
        p: [
          "Accedi con un codice via email o con Google. Devi avere almeno 16 anni ed essere autorizzato da EA a usare l'account EA che colleghi.",
          "Collega solo account EA che sono tuoi. Tieni l'accesso e l'estensione sui tuoi dispositivi; l'estensione conserva una chiave che dà accesso ai tuoi dati su FC Solver.",
        ],
      },
      {
        id: 'use',
        h: 'Uso corretto',
        p: [
          'Non fare un uso improprio di FC Solver: niente tentativi di violarne la sicurezza, di accedere ai dati di altre persone, di sovraccaricarlo, di estrarne dati in massa o di usarlo per automatizzare azioni nei servizi EA. Possiamo sospendere o rimuovere gli account che lo fanno.',
        ],
      },
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily è un gioco gratuito di indovinelli su /daily. I giocatori vengono dal database di FC Solver, costruito con i dati EA FC che vede l\'estensione FC Solver mentre viene usata; può essere incompleto o non aggiornato (un trasferimento molto recente può mostrare per un po\' il vecchio club).',
          'Con l\'accesso, le vittorie giornaliere di fila danno punti invito: +1 a 7 vittorie di fila, +1 a 14, +2 a 30, poi di nuovo ogni 30 vittorie. Le partite di allenamento e quelle giocate senza accesso non danno nulla. I punti sono gli stessi punti invito: non hanno valore in denaro, non sono trasferibili, sono concessi a nostra discrezione e possono essere ritirati in caso di abuso o imbrogli (per esempio tentativi automatizzati o più account).',
        ],
      },
      {
        id: 'accuracy',
        h: 'Nessuna garanzia',
        p: [
          "Riproduciamo con cura le regole del gioco, ma rose, valutazioni, intesa e verifiche dei requisiti possono essere sbagliate o non aggiornate, per esempio dopo un aggiornamento del gioco o quando EA modifica una SBC. Controlla sempre la rosa nella web app di EA prima di inviarla.",
          "FC Solver è fornito «così com'è», senza garanzie di alcun tipo, e può cambiare, non essere disponibile o chiudere in qualsiasi momento.",
        ],
      },
      {
        id: 'liability',
        h: 'Responsabilità',
        p: [
          "Nei limiti consentiti dalla legge, non siamo responsabili per oggetti, crediti, pacchetti o ricompense persi, limitazioni dell'account o qualsiasi danno indiretto derivante dall'uso di FC Solver o da una rosa suggerita. Nulla in questi termini limita la responsabilità che la legge non consente di limitare, né i tuoi diritti di consumatore.",
        ],
      },
      {
        id: 'paid',
        h: 'Piani',
        p: [
          "FC Solver ha un piano Free e un piano Premium. Il piano Free include un numero settimanale di risoluzioni (indicato nell'app accanto al pulsante Risolvi e nelle Impostazioni); conta solo una risoluzione che trova una rosa, e la settimana inizia con la tua prima risoluzione conteggiata e si azzera 7 giorni dopo. Premium elimina il limite e aggiunge le impostazioni globali del solver. Possiamo concedere o terminare Premium, e modificare il limite del piano Free, con un avviso nell'app. Un boost al server Discord di FC Solver, con l'account Discord collegato, dà Premium finché stai boostando e per 12 ore dopo la fine del boost; se scolleghi Discord, termina subito, anche entro queste 12 ore. Non consuma i giorni Premium da codici o punti.",
          `Premium si può acquistare anche come abbonamento, mensile o annuale, ai prezzi indicati sul sito e al momento del pagamento (IVA inclusa). Il processo d'ordine è gestito dal nostro rivenditore online Paddle.com, che è il Merchant of Record per tutti i nostri ordini: acquisti da Paddle, che ti addebita l'importo, invia la ricevuta e gestisce IVA, disdette e rimborsi, secondo i suoi termini per gli acquirenti (${PADDLE_TERMS}). L'abbonamento si rinnova automaticamente alla fine di ogni periodo finché non lo disdici dalle Impostazioni (Gestisci abbonamento); dopo la disdetta, Premium resta attivo fino alla fine del periodo pagato. I rimborsi seguono la nostra politica di rimborso. Il Premium dell'abbonamento si attiva quando Paddle ci conferma il pagamento.`,
          "Il Premium a vita (un posto tra i Founding 50, il Premium a vita ricevuto con un invito finché quei posti sono disponibili, o un codice a vita) dura finché FC Solver è attivo e il tuo account FC Solver esiste. È legato a quell'account: non si può trasferire, vendere né convertire in denaro, e termina quando l'account viene eliminato.",
        ],
      },
      {
        id: 'end',
        h: 'Cessazione e modifiche',
        p: [
          "Puoi smettere di usare FC Solver in qualsiasi momento ed eliminare tu stesso il tuo account da Impostazioni → I tuoi dati. L'eliminazione avviene dopo 7 giorni; fino ad allora puoi accedere e annullarla. Un abbonamento attivo smette di rinnovarsi appena lo chiedi e viene disdetto definitivamente il giorno dell'eliminazione; non c'è un rimborso automatico, ma puoi chiederne uno secondo la politica di rimborso. Il Premium di qualsiasi tipo, i punti invito e i codici regalo non usati che possiedi terminano insieme all'account. Cosa eliminiamo e cosa conserviamo è spiegato nell'informativa sulla privacy.",
          'Possiamo aggiornare questi termini; quando lo facciamo cambia la data qui sotto, e le modifiche importanti vengono annunciate sul sito.',
        ],
      },
      {
        id: 'law',
        h: 'Legge applicabile e contatti',
        p: [
          `Questi termini sono regolati dalla legge romena; come consumatore nell'UE mantieni anche la tutela della legge del tuo Paese. Domande: ${CONTACT}.`,
        ],
      },
    ],
  },
  privacy: {
    title: 'Informativa sulla privacy',
    intro: `Questa informativa spiega quali dati personali tratta FC Solver e perché. Il titolare del trattamento è ${OPERATOR}, Romania, contattabile all'indirizzo ${CONTACT}.`,
    sections: [
      {
        id: 'data',
        h: 'Cosa trattiamo',
        p: [
          `- Account: il tuo indirizzo email, la lingua e il piano, il metodo di accesso (codice via email o Google; con Google, l'email del tuo account Google e i dati di base del profilo), un id utente interno, la data di registrazione e dell'ultima attività.`,
          `- Questionario di benvenuto, solo se rispondi: dove hai sentito parlare di FC Solver e da quanto tempo giochi a FUT.`,
          `- Dati EA, letti dall'estensione dalla web app di EA che hai aperta: id e nome della tua persona EA, nome del club, i giocatori del tuo club, gli oggetti non assegnati e il deposito SBC, la tua rosa attiva, l'elenco delle SBC e i tuoi progressi, le evoluzioni che alleni e gli slot bloccati delle SBC che apri. Conserviamo anche una cronologia delle SBC e degli obiettivi completati su ogni account EA, per mostrarti i progressi. Non riceviamo la tua password EA. L'id della tua sessione EA viene usato una sola volta per confermare che l'account è tuo e non viene conservato (le estensioni precedenti alla 0.7 lo conservano ancora sul server finché non vengono aggiornate).`,
          `- Uso del servizio: quante richieste abbiamo fatto a EA per il tuo account ogni giorno, orari ed errori delle sincronizzazioni, la versione dell'estensione e le impostazioni del solver che invii con ogni risoluzione. Una cronologia degli eventi del tuo account (risoluzioni, sincronizzazioni, errori EA) viene conservata per 180 giorni, per l'assistenza e per individuare gli abusi.`,
          `- Dati tecnici: indirizzo IP e dettagli del browser nei log del server e di sicurezza, e per limitare gli abusi.`,
          `- Solo nel tuo browser: impostazioni del solver, rose salvate, lingua e preferenze simili (vedi la cookie policy).`,
          `- FC Solver Daily, quando giochi con l'accesso: il giorno, i tuoi tentativi e se hai vinto, per statistiche e serie. Senza accesso, il gioco conserva lo stato solo nel tuo browser.`,
          `- Classifica di FC Solver Daily, solo se scegli di comparire: il tuo username, le vittorie, le partite giocate e la serie sono pubblici su /daily. Puoi nasconderti o cambiare username in qualsiasi momento nelle Impostazioni. Le partite senza accesso sono contate solo come totali anonimi.`,
          `- Email: se vuoi ricevere le email sull'allenamento delle evoluzioni e il promemoria per la serie del Daily (entrambi Premium), e in quali giorni ti è stato inviato un promemoria.`,
          `- Inviti: il tuo codice invito, chi si è iscritto con quel codice, i codici che possiedi (compresi i codici regalo) o che hai riscattato, i tuoi punti invito e la loro cronologia, e se hai un posto tra i Founding 50.`,
          `- Discord, solo se lo colleghi in Account collegati: l'id e lo username del tuo account Discord (dalla connessione Discord di Clerk), i ruoli che il nostro bot ti assegna sul server di FC Solver e, per concedere Premium per il boost del nostro server, lo stato e le date del boost. I comandi /sbc e /stats del nostro bot Discord rispondono pubblicamente nel canale in cui li usi, quindi i giocatori e le statistiche del club mostrati sono visibili a tutti su quel server.`,
          `- Pagamenti, solo se ti abboni: i tuoi id cliente e abbonamento Paddle, il piano, il suo stato e le date di rinnovo, e importi e valuta di pagamenti e rimborsi. I dati della carta, nome e indirizzo di fatturazione e l'email usata al pagamento sono gestiti da Paddle e non arrivano mai a noi.`,
        ],
      },
      {
        id: 'why',
        h: 'Perché, e su quale base giuridica',
        p: [
          `- Esecuzione del contratto con te (art. 6, par. 1, lett. b) GDPR): il tuo account e l'accesso, la sincronizzazione del club e delle SBC, la risoluzione, il Daily, Premium e gli abbonamenti (comprese le email sull'allenamento delle evoluzioni, parte di Premium; puoi disattivarle in qualsiasi momento nelle Impostazioni o con il link in ogni email), gli inviti e i punti.`,
          `- Il nostro legittimo interesse (art. 6, par. 1, lett. f)): mantenere FC Solver sicuro e funzionante (log, limiti di richieste, il tetto giornaliero di richieste a EA, correzione di errori), la cronologia degli eventi e i controlli contro gli abusi, i backup, e capire in forma aggregata come viene usato il sito.`,
          `- Il tuo consenso (art. 6, par. 1, lett. a)), che puoi revocare in qualsiasi momento: l'email di promemoria per la serie del Daily, la presenza nella classifica del Daily e il collegamento di Discord, che puoi disattivare nelle Impostazioni o in Account collegati, e il questionario di benvenuto facoltativo, le cui risposte eliminiamo se ci scrivi o se elimini l'account. La revoca non pregiudica la liceità del trattamento precedente.`,
          `- I dati delle SBC sono condivisi in modo limitato: l'elenco delle SBC, le sfide e le disposizioni degli slot bloccati segnalate dagli account vengono salvate una sola volta per tutti, così ogni utente riceve disposizioni corrette. Le segnalazioni sono legate a un id persona EA e non vengono mai mostrate ad altri utenti.`,
        ],
      },
      {
        id: 'who',
        h: 'Chi altro li tratta',
        p: [
          `- Clerk, Inc. (USA): accesso e account utente.`,
          `- Google: solo se accedi con Google.`,
          `- Cloudflare, Inc.: rete, DNS e protezione dagli attacchi; il traffico passa attraverso i suoi server. Il suo controllo Turnstile distingue le persone dai bot quando accedi.`,
          `- OpenWebTrack (ospitato da noi nell'UE): statistiche del sito senza cookie, esaminate solo in forma aggregata (pagine visitate, provenienza, Paese, tipo di dispositivo e quali funzioni vengono usate, ad esempio risolvere una SBC o finire il Daily). Nessun cookie, nessun dato personale negli eventi e nessun tracciamento tra siti.`,
          `- Paddle.com Market Ltd (Regno Unito) e il suo gruppo: il nostro rivenditore (Merchant of Record) per gli abbonamenti; tratta nome, email, Paese, indirizzo di fatturazione e dati di pagamento come titolare autonomo secondo la propria informativa, e ci comunica solo quanto indicato sopra alla voce Pagamenti.`,
          `- Resend (USA): invia le nostre email (tranne quelle di accesso, che arrivano da Clerk): le email sulle evoluzioni, il promemoria del Daily e gli avvisi sull'account, come la conferma dell'eliminazione.`,
          `- Discord Inc. (USA): solo se colleghi Discord o entri nel nostro server: il collegamento dell'account, il nostro bot, i ruoli sul server e il boost che dà Premium.`,
          `- Electronic Arts: il tuo browser carica le immagini delle carte direttamente dai server di contenuti di EA, quindi EA vede il tuo indirizzo IP, come quando usi la web app di EA.`,
          `- Il nostro server e il nostro database, gestiti da noi.`,
          `I trasferimenti verso gli USA si basano sul Data Privacy Framework UE-USA quando l'azienda è certificata, altrimenti sulle Clausole contrattuali standard. Non vendiamo dati personali e non li usiamo per la pubblicità.`,
        ],
      },
      {
        id: 'keep',
        h: 'Per quanto tempo li conserviamo',
        p: [
          `Dati dell'account e dati EA: finché il tuo account esiste; i dati del club e delle SBC vengono sovrascritti a ogni sincronizzazione. Contatori delle richieste a EA: pochi giorni. La cronologia degli eventi del tuo account: 180 giorni. I log del server vengono conservati per un periodo limitato e poi eliminati a rotazione. I backup del database scadono entro 14 giorni.`,
          `Quando elimini il tuo account (Impostazioni → I tuoi dati), per 7 giorni non succede nulla: accedi e premi Annulla eliminazione per tenerlo. Poi eliminiamo il tuo account di accesso su Clerk, i nostri record su di te nel database, e i dati salvati e la cronologia dei tuoi account EA. I dati di un account EA restano solo finché un altro account FC Solver usa attualmente quell'account EA. Un abbonamento ancora attivo viene disdetto quel giorno. Dopo l'eliminazione, rimuovi l'estensione FC Solver da Chrome: altrimenti ricomincerà a inviare i tuoi dati EA, come un nuovo account. Cosa resta:`,
          `- Paddle conserva fatture e registrazioni dei pagamenti per il tempo richiesto dalla legge fiscale (è il Merchant of Record).`,
          `- Paddle può inviarci anche dopo l'eliminazione le ultime notifiche sull'abbonamento disdetto; le conserviamo fino a 180 giorni, solo con il numero dell'abbonamento Paddle.`,
          `- I backup che contengono ancora i tuoi dati scadono entro 14 giorni.`,
          `- La nostra cronologia degli eventi mantiene le voci senza il tuo id utente, e senza l'id dell'account EA una volta eliminati i dati di quell'account EA, finché non vengono cancellate dopo 180 giorni.`,
          `- Contro gli abusi, conserviamo l'informazione che un account EA ha già ottenuto un posto tra i Founding 50 o punti invito, così lo stesso account EA non può ottenerli di nuovo. Non contiene nulla su di te oltre al numero dell'account EA. Per lo stesso motivo, se altri account FC Solver sono stati collegati allo stesso account EA, i loro collegamenti restano (contano per il limite di 3 account FC Solver di quell'account EA); il tuo collegamento viene eliminato.`,
          `- I dati SBC condivisi descritti sopra, che non rimandano a te.`,
        ],
      },
      {
        id: 'rights',
        h: 'I tuoi diritti',
        p: [
          `In Impostazioni → I tuoi dati puoi scaricare una copia dei tuoi dati (un file JSON) ed eliminare tu stesso il tuo account. Dall'app puoi anche scollegare un account EA, disattivare le email, uscire dalla classifica del Daily e scollegare Discord.`,
          `Puoi anche chiedere l'accesso ai tuoi dati, una loro copia, la rettifica, la cancellazione, la limitazione, oppure opporti al trattamento basato sul legittimo interesse, scrivendo a ${CONTACT}. Hai anche il diritto di presentare reclamo all'autorità romena per la protezione dei dati (ANSPDCP, dataprotection.ro) o a quella del tuo Paese, come il Garante per la protezione dei dati personali in Italia.`,
        ],
      },
      {
        id: 'kids',
        h: 'Minori',
        p: ['FC Solver non è destinato a chi ha meno di 16 anni, e non trattiamo consapevolmente i loro dati.'],
      },
      {
        id: 'changes',
        h: 'Modifiche',
        p: ['Quando questa informativa cambia, cambia anche la data qui sotto; le modifiche importanti vengono annunciate sul sito.'],
      },
    ],
  },
  cookies: {
    title: 'Cookie policy',
    intro: 'FC Solver usa solo ciò che gli serve per funzionare. Non ci sono cookie pubblicitari o di tracciamento, e le statistiche vengono raccolte senza cookie, quindi non c\'è alcun banner per il consenso.',
    sections: [
      {
        id: 'needed',
        h: 'Cookie strettamente necessari',
        p: [
          "- Clerk (accesso), per esempio __session, __client_uat e __client: ti mantengono connesso. Vengono impostati sul nostro dominio e sul dominio di accesso di Clerk; durano quanto la tua sessione o finché non esci.",
          '- Cloudflare, per esempio __cf_bm o cf_clearance: distinguono le persone dai bot e proteggono il sito. Durano fino a 30 minuti, o di più dopo un controllo di sicurezza.',
          '- Pagamento Paddle: solo quando apri il modulo di pagamento nella schermata di upgrade, il riquadro di pagamento di Paddle (buy.paddle.com) imposta i propri cookie strettamente necessari per far funzionare il pagamento in sicurezza e prevenire le frodi.',
        ],
      },
      {
        id: 'local',
        h: 'Archiviazione nel tuo browser',
        p: [
          "Il sito salva alcune informazioni nella memoria locale del tuo browser, mai inviate ad altri: la lingua, le impostazioni del solver (globali e per SBC), i giocatori esclusi da una SBC, le ultime rose trovate e quali avvisi hai chiuso. Puoi cancellarle in qualsiasi momento dalle impostazioni del browser.",
          "L'estensione conserva la sua chiave di accesso e il suo stato nella memoria propria dell'estensione in Chrome.",
        ],
      },
      {
        id: 'stats',
        h: 'Statistiche',
        p: [
          'Contiamo le visite con OpenWebTrack in modalità senza cookie, quindi non viene impostato alcun cookie. Per distinguere una visita dall\'altra conserva un identificativo casuale nella memoria di sessione della scheda, cancellato quando chiudi la scheda; non è collegato al tuo account. Oltre alle pagine, conta quali funzioni vengono usate (ad esempio un accesso, una sincronizzazione, una SBC risolta, un Daily finito e il numero di tentativi), mai la tua email, il nome, l\'account EA o gli username. I risultati vengono esaminati solo in forma aggregata. Gli amministratori non vengono contati.',
        ],
      },
      {
        id: 'control',
        h: 'Le tue scelte',
        p: [
          "Puoi bloccare o eliminare i cookie dal tuo browser; se blocchi quelli necessari, l'accesso non funzionerà. Domande: " + CONTACT + '.',
        ],
      },
    ],
  },
  refunds: {
    title: 'Politica di rimborso',
    intro: 'Gli abbonamenti Premium sono venduti dal nostro rivenditore Paddle.com, Merchant of Record per tutti i nostri ordini. Questa politica spiega quando ricevi indietro i tuoi soldi.',
    sections: [
      {
        id: 'window',
        h: '14 giorni, senza domande',
        p: [
          "Se Premium non ti soddisfa, chiedi il rimborso entro 14 giorni da un pagamento e ricevi indietro l'intero importo di quel pagamento. Vale per il primo pagamento e per ogni rinnovo, mensile o annuale.",
          'Dopo 14 giorni un pagamento non viene rimborsato, nemmeno per la parte non usata di un periodo; puoi comunque disdire perché l’abbonamento non si rinnovi.',
        ],
      },
      {
        id: 'how',
        h: 'Come chiederlo',
        p: [
          `Usa il link nell'email con la ricevuta di Paddle, oppure vai su paddle.net e trova l'ordine con l'email con cui hai pagato. Puoi anche scriverci a ${CONTACT} e chiederemo noi a Paddle di rimborsarti. Il rimborso torna sulla carta o sul conto con cui hai pagato; la banca può impiegare qualche giorno a mostrarlo.`,
        ],
      },
      {
        id: 'cancel',
        h: 'Disdetta',
        p: [
          "Disdici quando vuoi da Impostazioni → Gestisci abbonamento (il portale clienti di Paddle). Premium resta attivo fino alla fine del periodo pagato e l'abbonamento non si rinnova. Un rimborso chiude anche il Premium di quel pagamento.",
        ],
      },
      {
        id: 'law',
        h: 'I tuoi diritti di legge',
        p: [
          "Questa politica si aggiunge ai tuoi diritti di consumatore e non li limita. Quando la legge ti dà un diritto di recesso o di rimborso, per esempio il diritto di recesso UE, Paddle lo applica come descritto nei suoi termini per gli acquirenti (paddle.com/legal/checkout-buyer-terms).",
        ],
      },
    ],
  },
};

export const LEGAL: Record<Lang, Record<LegalDoc, Doc>> = { en, ro, it };

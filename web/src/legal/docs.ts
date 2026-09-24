// Terms, privacy policy and cookie policy, in both site languages. Long legal text lives here as
// whole documents instead of t() keys; docs.test.ts keeps the two languages in step.
// Change UPDATED whenever a document's meaning changes.
import type { Lang } from '../i18n';

export type LegalDoc = 'terms' | 'privacy' | 'cookies';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'cookies'];

export const OPERATOR = 'Mario Dragut';
export const CONTACT = 'dragutmariotheodor1@gmail.com';
export const UPDATED = '2026-09-24';

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
          'FC Solver has a Free plan and a Premium plan. Free includes a weekly number of solves (shown in the app next to the Solve button and in Settings); only a solve that finds a squad counts, and the week starts with your first counted solve and resets 7 days later. Premium removes the limit and adds global solver settings. We may grant or end Premium, and change the Free limit, with notice in the app.',
          'Prices shown on the website for Premium are indicative; paid plans are not on sale yet. When they are, their price, billing and cancellation terms will be shown before you pay, and these terms will be updated.',
        ],
      },
      {
        id: 'end',
        h: 'Ending and changes',
        p: [
          'You can stop using FC Solver at any time and ask us to delete your account (see the privacy policy). We may update these terms; the date below changes when we do, and important changes are announced on the website.',
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
          '- Account: your email address, the sign-in method (email code or Google; with Google, your Google account email and profile basics), an internal user id, and when you signed up and were last active.',
          '- EA data, read by the extension from the EA web app you have open: your EA persona id and name, club name, the players in your club, Unassigned and SBC storage, your active squad, the SBC list and your progress, and the locked slots of SBCs you open. We do not receive your EA password. Your EA session id is used once to confirm the account is yours and is not stored (extensions older than 0.7 still keep it on the server until they are updated).',
          '- Use of the service: how many requests we made to EA for your account each day, sync times and errors, the extension version, and the solver settings you send with each solve.',
          '- Technical data: IP address and browser details in server and security logs, and to limit abuse.',
          '- In your browser only: solver settings, saved squads, language and similar preferences (see the cookie policy).',
        ],
      },
      {
        id: 'why',
        h: 'Why, and on which legal basis',
        p: [
          '- To provide FC Solver (sign-in, syncing your club and SBCs, solving): performance of our agreement with you (GDPR art. 6(1)(b)).',
          '- To keep it secure and working (logs, rate limits, fixing errors), and to understand in aggregate how the website is used: our legitimate interests (art. 6(1)(f)).',
          '- SBC data is shared in a limited way: the SBC list, challenges and the locked-slot layouts accounts report are stored once for everyone, so every user gets correct layouts. Reports are tied to an EA persona id, never shown to other users.',
        ],
      },
      {
        id: 'who',
        h: 'Who else processes it',
        p: [
          '- Clerk, Inc. (USA): sign-in and user accounts. Transfers to the USA rely on the EU-US Data Privacy Framework and Standard Contractual Clauses.',
          '- Google: only if you sign in with Google.',
          '- Cloudflare, Inc.: network, DNS and protection against attacks; traffic passes through its servers.',
          '- OpenWebTrack (hosted in the EU): cookieless, aggregated website statistics (pages viewed, referrer, country, device type). No cookies and no cross-site tracking.',
          '- Our server and database, operated by us.',
          'We do not sell personal data and do not use it for advertising.',
        ],
      },
      {
        id: 'keep',
        h: 'How long we keep it',
        p: [
          'Account and EA data: while your account exists; club and SBC data are overwritten at each sync. EA request counters: a few days. Server logs are kept for a limited time and then rotated out. After you ask us to delete your account we remove your data within 30 days, except the shared SBC data described above, which no longer points to you once the persona is removed.',
        ],
      },
      {
        id: 'rights',
        h: 'Your rights',
        p: [
          `You can ask for access to your data, a copy of it, correction, deletion, restriction, or object to processing based on legitimate interests, by writing to ${CONTACT}. You can unlink an EA account yourself in Settings. You also have the right to complain to the Romanian data protection authority (ANSPDCP, dataprotection.ro) or the one in your country.`,
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
          'We count visits with OpenWebTrack in cookieless mode: no cookie or identifier is stored on your device, and results are only looked at in aggregate.',
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
          'FC Solver are un plan Free și un plan Premium. Free include un număr săptămânal de rezolvări (afișat în aplicație lângă butonul Rezolvă și în Setări); contează doar o rezolvare care găsește o echipă, iar săptămâna începe la prima rezolvare numărată și se resetează după 7 zile. Premium elimină limita și adaugă setări globale pentru solver. Putem acorda sau încheia Premium și putem schimba limita Free, cu anunț în aplicație.',
          'Prețurile afișate pe site pentru Premium sunt orientative; planurile plătite nu sunt încă de vânzare. Când vor fi, prețul, facturarea și condițiile de anulare îți vor fi arătate înainte de plată, iar acești termeni vor fi actualizați.',
        ],
      },
      {
        id: 'end',
        h: 'Încetare și modificări',
        p: [
          'Poți renunța oricând la FC Solver și ne poți cere să îți ștergem contul (vezi politica de confidențialitate). Putem actualiza acești termeni; data de mai jos se schimbă atunci, iar modificările importante sunt anunțate pe site.',
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
          '- Contul: adresa de email, metoda de autentificare (cod pe email sau Google; cu Google, emailul și datele de bază ale contului Google), un identificator intern și momentul înscrierii și al ultimei activități.',
          '- Date EA, citite de extensie din web app-ul EA deschis de tine: id-ul și numele personei EA, numele clubului, jucătorii din club, din Unassigned și din SBC storage, echipa activă, lista de SBC-uri și progresul tău, precum și sloturile blocate ale SBC-urilor pe care le deschizi. Nu primim parola EA. Id-ul sesiunii EA este folosit o singură dată pentru a confirma că contul e al tău și nu este păstrat (extensiile mai vechi de 0.7 îl mai păstrează pe server până sunt actualizate).',
          '- Folosirea serviciului: câte cereri am făcut către EA pentru contul tău în fiecare zi, momentele și erorile sincronizărilor, versiunea extensiei și setările solverului trimise la fiecare rezolvare.',
          '- Date tehnice: adresa IP și detalii despre browser în jurnalele serverului și de securitate, și pentru limitarea abuzurilor.',
          '- Doar în browserul tău: setările solverului, echipele salvate, limba și preferințe similare (vezi politica de cookie-uri).',
        ],
      },
      {
        id: 'why',
        h: 'De ce și pe ce temei legal',
        p: [
          '- Pentru a furniza FC Solver (autentificare, sincronizarea clubului și a SBC-urilor, rezolvare): executarea acordului cu tine (art. 6 alin. (1) lit. b) GDPR).',
          '- Pentru securitate și funcționare (jurnale, limite de cereri, remedierea erorilor) și pentru a înțelege agregat cum e folosit site-ul: interesul nostru legitim (art. 6 alin. (1) lit. f)).',
          '- Datele despre SBC-uri sunt partajate limitat: lista de SBC-uri, challenge-urile și sloturile blocate raportate de conturi sunt stocate o singură dată pentru toți, ca fiecare utilizator să primească aranjamente corecte. Rapoartele sunt legate de id-ul personei EA și nu sunt arătate altor utilizatori.',
        ],
      },
      {
        id: 'who',
        h: 'Cine mai prelucrează datele',
        p: [
          '- Clerk, Inc. (SUA): autentificare și conturi de utilizator. Transferurile în SUA se bazează pe EU-US Data Privacy Framework și pe clauze contractuale standard.',
          '- Google: doar dacă te autentifici cu Google.',
          '- Cloudflare, Inc.: rețea, DNS și protecție împotriva atacurilor; traficul trece prin serverele sale.',
          '- OpenWebTrack (găzduit în UE): statistici agregate despre site, fără cookie-uri (pagini vizitate, sursa vizitei, țara, tipul dispozitivului). Fără cookie-uri și fără urmărire între site-uri.',
          '- Serverul și baza noastră de date, administrate de noi.',
          'Nu vindem date personale și nu le folosim pentru publicitate.',
        ],
      },
      {
        id: 'keep',
        h: 'Cât timp le păstrăm',
        p: [
          'Datele contului și datele EA: cât timp există contul; datele despre club și SBC-uri sunt suprascrise la fiecare sincronizare. Contoarele de cereri EA: câteva zile. Jurnalele serverului sunt păstrate un timp limitat, apoi șterse prin rotație. După ce ne ceri ștergerea contului, îți ștergem datele în cel mult 30 de zile, cu excepția datelor partajate despre SBC-uri descrise mai sus, care nu mai trimit la tine după ce persona e ștearsă.',
        ],
      },
      {
        id: 'rights',
        h: 'Drepturile tale',
        p: [
          `Poți cere acces la datele tale, o copie a lor, rectificarea, ștergerea, restricționarea prelucrării sau te poți opune prelucrării bazate pe interes legitim, scriind la ${CONTACT}. Poți deconecta singur un cont EA din Setări. Ai și dreptul să depui o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP, dataprotection.ro) sau la autoritatea din țara ta.`,
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
          'Numărăm vizitele cu OpenWebTrack în modul fără cookie-uri: pe dispozitivul tău nu se salvează niciun cookie sau identificator, iar rezultatele sunt analizate doar agregat.',
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
};

export const LEGAL: Record<Lang, Record<LegalDoc, Doc>> = { en, ro };

// Terms, privacy policy and cookie policy, in every site language. Long legal text lives here as
// whole documents instead of t() keys; docs.test.ts keeps the languages in step.
// Change UPDATED whenever a document's meaning changes.
import type { Lang } from '../i18n';

export type LegalDoc = 'terms' | 'privacy' | 'cookies';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'cookies'];

export const OPERATOR = 'Mario Dragut';
export const CONTACT = 'dragutmariotheodor1@gmail.com';
export const UPDATED = '2026-10-09';

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
          'FC Solver has a Free plan and a Premium plan. Free includes a weekly number of solves (shown in the app next to the Solve button and in Settings); only a solve that finds a squad counts, and the week starts with your first counted solve and resets 7 days later. Premium removes the limit and adds global solver settings. We may grant or end Premium, and change the Free limit, with notice in the app. Boosting the FC Solver Discord server with a connected Discord account gives Premium while the boost lasts and for 12 hours after it ends; it ends when the boost ends or Discord is disconnected, and it does not use up Premium days from codes or points.',
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
          '- FC Solver Daily, when you play signed in: the day, your guesses and whether you won, to keep your stats and streak. Signed out, the game keeps its state only in your browser.',
          '- FC Solver Daily leaderboard, only if you choose to appear: your username, wins, games played and streak are public on /daily. You can hide yourself or change the username in Settings at any time. Signed-out games are counted only as anonymous totals.',
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
          'FC Solver are un plan Free și un plan Premium. Free include un număr săptămânal de rezolvări (afișat în aplicație lângă butonul Rezolvă și în Setări); contează doar o rezolvare care găsește o echipă, iar săptămâna începe la prima rezolvare numărată și se resetează după 7 zile. Premium elimină limita și adaugă setări globale pentru solver. Putem acorda sau încheia Premium și putem schimba limita Free, cu anunț în aplicație. Un boost pe serverul de Discord FC Solver, cu contul de Discord conectat, oferă Premium cât timp durează boost-ul și încă 12 ore după ce se termină; se încheie când se termină boost-ul sau când Discord e deconectat și nu consumă zilele Premium din coduri sau puncte.',
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
          '- FC Solver Daily, când joci autentificat: ziua, încercările tale și dacă ai câștigat, pentru statistici și serie. Neautentificat, jocul își păstrează starea doar în browserul tău.',
          '- Clasamentul FC Solver Daily, doar dacă alegi să apari: username-ul, victoriile, jocurile și seria ta sunt publice pe /daily. Te poți ascunde sau poți schimba username-ul oricând din Setări. Jocurile fără cont sunt numărate doar ca totaluri anonime.',
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
          "FC Solver ha un piano Free e un piano Premium. Il piano Free include un numero settimanale di risoluzioni (indicato nell'app accanto al pulsante Risolvi e nelle Impostazioni); conta solo una risoluzione che trova una rosa, e la settimana inizia con la tua prima risoluzione conteggiata e si azzera 7 giorni dopo. Premium elimina il limite e aggiunge le impostazioni globali del solver. Possiamo concedere o terminare Premium, e modificare il limite del piano Free, con un avviso nell'app. Un boost al server Discord di FC Solver, con l'account Discord collegato, dà Premium finché dura il boost e per 12 ore dopo la sua fine; termina quando finisce il boost o quando Discord viene scollegato e non consuma i giorni Premium da codici o punti.",
          'I prezzi indicati sul sito per Premium sono indicativi; i piani a pagamento non sono ancora in vendita. Quando lo saranno, prezzo, fatturazione e condizioni di disdetta verranno mostrati prima del pagamento, e questi termini verranno aggiornati.',
        ],
      },
      {
        id: 'end',
        h: 'Cessazione e modifiche',
        p: [
          "Puoi smettere di usare FC Solver in qualsiasi momento e chiederci di eliminare il tuo account (vedi l'informativa sulla privacy). Possiamo aggiornare questi termini; quando lo facciamo cambia la data qui sotto, e le modifiche importanti vengono annunciate sul sito.",
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
          "- Account: il tuo indirizzo email, il metodo di accesso (codice via email o Google; con Google, l'email del tuo account Google e i dati di base del profilo), un id utente interno, la data di registrazione e dell'ultima attività.",
          "- Dati EA, letti dall'estensione dalla web app di EA che hai aperta: id e nome della tua persona EA, nome del club, i giocatori del tuo club, gli oggetti non assegnati e il deposito SBC, la tua rosa attiva, l'elenco delle SBC e i tuoi progressi, e gli slot bloccati delle SBC che apri. Non riceviamo la tua password EA. L'id della tua sessione EA viene usato una sola volta per confermare che l'account è tuo e non viene conservato (le estensioni precedenti alla 0.7 lo conservano ancora sul server finché non vengono aggiornate).",
          '- Uso del servizio: quante richieste abbiamo fatto a EA per il tuo account ogni giorno, orari ed errori delle sincronizzazioni, la versione dell\'estensione e le impostazioni del solver che invii con ogni risoluzione.',
          '- Dati tecnici: indirizzo IP e dettagli del browser nei log del server e di sicurezza, e per limitare gli abusi.',
          "- Solo nel tuo browser: impostazioni del solver, rose salvate, lingua e preferenze simili (vedi la cookie policy).",
          '- FC Solver Daily, quando giochi con l\'accesso: il giorno, i tuoi tentativi e se hai vinto, per statistiche e serie. Senza accesso, il gioco conserva lo stato solo nel tuo browser.',
          '- Classifica di FC Solver Daily, solo se scegli di comparire: il tuo username, le vittorie, le partite giocate e la serie sono pubblici su /daily. Puoi nasconderti o cambiare username in qualsiasi momento nelle Impostazioni. Le partite senza accesso sono contate solo come totali anonimi.',
        ],
      },
      {
        id: 'why',
        h: 'Perché, e su quale base giuridica',
        p: [
          "- Per fornire FC Solver (accesso, sincronizzazione del club e delle SBC, risoluzione): esecuzione del contratto con te (art. 6, par. 1, lett. b) GDPR).",
          '- Per mantenerlo sicuro e funzionante (log, limiti di richieste, correzione di errori) e per capire in forma aggregata come viene usato il sito: il nostro legittimo interesse (art. 6, par. 1, lett. f)).',
          "- I dati delle SBC sono condivisi in modo limitato: l'elenco delle SBC, le sfide e le disposizioni degli slot bloccati segnalate dagli account vengono salvate una sola volta per tutti, così ogni utente riceve disposizioni corrette. Le segnalazioni sono legate a un id persona EA e non vengono mai mostrate ad altri utenti.",
        ],
      },
      {
        id: 'who',
        h: 'Chi altro li tratta',
        p: [
          '- Clerk, Inc. (USA): accesso e account utente. I trasferimenti verso gli USA si basano sul Data Privacy Framework UE-USA e sulle Clausole contrattuali standard.',
          '- Google: solo se accedi con Google.',
          '- Cloudflare, Inc.: rete, DNS e protezione dagli attacchi; il traffico passa attraverso i suoi server.',
          '- OpenWebTrack (ospitato nell\'UE): statistiche del sito aggregate e senza cookie (pagine visitate, provenienza, Paese, tipo di dispositivo). Nessun cookie e nessun tracciamento tra siti.',
          '- Il nostro server e il nostro database, gestiti da noi.',
          'Non vendiamo dati personali e non li usiamo per la pubblicità.',
        ],
      },
      {
        id: 'keep',
        h: 'Per quanto tempo li conserviamo',
        p: [
          "Dati dell'account e dati EA: finché il tuo account esiste; i dati del club e delle SBC vengono sovrascritti a ogni sincronizzazione. Contatori delle richieste a EA: pochi giorni. I log del server vengono conservati per un periodo limitato e poi eliminati a rotazione. Dopo che ci chiedi di eliminare il tuo account, rimuoviamo i tuoi dati entro 30 giorni, tranne i dati SBC condivisi descritti sopra, che non rimandano più a te una volta rimossa la persona.",
        ],
      },
      {
        id: 'rights',
        h: 'I tuoi diritti',
        p: [
          `Puoi chiedere l'accesso ai tuoi dati, una loro copia, la rettifica, la cancellazione, la limitazione, oppure opporti al trattamento basato sul legittimo interesse, scrivendo a ${CONTACT}. Puoi scollegare tu stesso un account EA dalle Impostazioni. Hai anche il diritto di presentare reclamo all'autorità romena per la protezione dei dati (ANSPDCP, dataprotection.ro) o a quella del tuo Paese, come il Garante per la protezione dei dati personali in Italia.`,
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
          'Contiamo le visite con OpenWebTrack in modalità senza cookie: sul tuo dispositivo non viene salvato alcun cookie o identificativo, e i risultati vengono esaminati solo in forma aggregata.',
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
};

export const LEGAL: Record<Lang, Record<LegalDoc, Doc>> = { en, ro, it };

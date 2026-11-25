# Audit: platforma față de fluxul CV → job → CV adaptat

**Data:** 25 noiembrie 2026

**Bază:** codul local din `develop`, inclusiv integrarea existentă pentru CV, profil, recomandări și tailoring. Modificările recente de interfață sunt în PR-uri separate.

**Metodă:** urmărirea fluxului în frontend, API, parser, matching, export și teste; fără acces la datele sau configurația producției.
**Scală presupusă:** beta pentru mai mulți studenți și un catalog de oportunități actualizat periodic. Pragul real de trafic nu este stabilit aici.

## Scopul produsului

La crearea contului, studentul încarcă CV-ul standard. Platforma citește documentul, propune experiență, proiecte, certificări, limbi, publicații și competențe, iar studentul corectează și confirmă datele. Jobs afișează oportunități ordonate după potrivirea cu profilul rezultat. Pentru un post ales, platforma pregătește un CV relevant pentru cerințele lui, pe care studentul îl verifică, îl descarcă și îl folosește la aplicare.

## Verdict rapid

**Aproximativ 3/5 ca produs funcțional față de acest scop** — apreciere calitativă a fluxului, nu procent măsurat. Există infrastructura principală și un flux real pentru fiecare etapă, dar experiența cap-coadă încă nu realizează promisiunea de „încarc CV-ul, primesc cele mai potrivite joburi și un CV adaptat automat”. Cele mai mari diferențe sunt acoperirea extracției, folosirea incompletă a profilului în ranking și lipsa rescrierii CV-ului în funcție de post. Calitatea pe CV-uri și anunțuri reale, precum și funcționarea mediului găzduit, nu au fost demonstrate de această analiză.

| Etapă | Stadiu în cod | Față de scop |
| --- | --- | --- |
| Cont și CV standard | Onboarding oferă încărcare PDF, dar permite completare manuală fără CV. Fișierul rămâne privat și poate fi înlocuit sau șters din Resumes. | **Parțial:** CV-ul nu este obligatoriu. Eliminarea importului din Resumes este în PR #111, încă separat de `develop`. |
| Scanare și profil | API extrage text, folosește opțional un model local și revine la reguli; propune șase colecții plus câmpuri și skills. Utilizatorul poate edita și confirma. | **Parțial:** rezultatele depind de structura și textul documentului; nu există OCR pentru PDF-uri scanate. |
| Joburi recomandate | API sortează oportunitățile active după scor și exclude incompatibilitățile confirmate; Jobs folosește endpointul recomandat. | **Parțial:** scorul folosește skills, tehnologii din proiecte, roluri, studii, preferințe, locație și recență, dar nu evaluează direct toate colecțiile CV-ului. |
| CV pentru un job | Jobs deschide fluxul real de creare draft, revizuire, aprobare și export PDF privat. | **Parțial:** draftul selectează și ordonează fragmente din profil; API precizează că nu face rescriere AI. Studentul trebuie să aprobe conținutul. |
| Aplicare | Există linkul către site-ul oficial și urmărirea aplicației. | **Parțial:** CV-ul descărcat nu este trimis automat angajatorului; aplicarea se face în afara platformei. |

## Ce funcționează deja

1. **Încărcare și revizuire la onboarding.** `QuickOnboarding` încarcă PDF-ul, pornește analiza, precompletează formularul și prezintă intrările din CV pentru editare/confirmare. Există și completare manuală. Sursa: `apps/web/src/components/onboarding/quick-onboarding.tsx`, `apps/web/src/app/onboarding/page.tsx`.
2. **Extragere protejată și persistență.** API limitează documentele la 5 MiB, 30 de pagini PDF și 40.000 de caractere, izolează parserul, verifică sursa și versiunea profilului și salvează doar schimbările confirmate. Sursa: `apps/api/src/opportunity_api/ai/documents.py`, `apps/api/src/opportunity_api/api/resume.py`.
3. **Profil structurat.** Există servicii reale pentru experiență, proiecte, certificări, premii, limbi și publicații. Sursa: `apps/web/src/lib/profile-services.ts`, `apps/api/src/opportunity_api/api/workspace.py`.
4. **Recomandări explicabile.** Endpointul `/opportunities/recommended` calculează scorul înainte de paginare; Jobs îl afișează în lista Recommended. Scorul poate fi calculat fără model AI. Sursa: `apps/api/src/opportunity_api/api/opportunities.py`, `apps/api/src/opportunity_api/matching/engine.py`, `apps/web/src/app/(workspace)/jobs/page.tsx`.
5. **Exportul unui CV aprobat.** Sunt implementate contextul postului, draftul, editarea, aprobarea și exportul PDF al conținutului acceptat; interfața Jobs este conectată la acestea. Sursa: `apps/api/src/opportunity_api/api/tailoring.py`, `apps/api/src/opportunity_api/workspace/tailoring.py`, `apps/web/src/components/jobs/tailoring-entry-point.tsx`.

## Must fix pentru promisiunea produsului

1. **Alinierea onboardingului la regula „CV-ul este punctul de plecare”.** Astăzi butonul de încărcare este opțional și utilizatorul poate ajunge în Jobs doar cu formularul. Dacă produsul cere CV la înscriere, trebuie stabilit explicit dacă fără CV se blochează progresul sau se permite un mod manual limitat. Implementarea trebuie să păstreze o cale pentru CV-uri care nu pot fi citite. *Fără asta:* conturi fără date CV pot primi recomandări slabe, deși experiența promite recomandări bazate pe CV. Sursa: `apps/web/src/components/onboarding/quick-onboarding.tsx`, `apps/web/src/app/auth/actions.ts`.
2. **Măsurarea și îmbunătățirea extracției pe CV-uri reprezentative.** Colecțiile sunt propuse prin reguli care caută secțiuni și formate recunoscute; modelul opțional este folosit pentru unele fapte și poate cădea pe reguli. PDF-urile scanate ca imagine nu au OCR. Trebuie un set de CV-uri anonimizate cu rezultate așteptate, măsurate pe fiecare secțiune, plus mesaje clare când textul nu poate fi extras. *Fără asta:* experiențe, proiecte sau certificări pot lipsi din profil și din recomandări. Sursa: `apps/api/src/opportunity_api/ai/sections.py`, `apps/api/src/opportunity_api/ai/extract.py`, `apps/api/src/opportunity_api/ai/documents.py`.
3. **Folosirea profilului complet în matching.** Recomandările citesc competențele salvate, tehnologiile proiectelor și rolurile experienței, dar nu folosesc direct certificatele, limbile, publicațiile sau descrierile complete ale experienței. Trebuie stabilite criterii verificabile pentru fiecare tip de oportunitate și apoi extinse intrările de matching și explicațiile scorului. *Fără asta:* două profiluri cu diferențe importante în aceste secțiuni pot primi același scor. Sursa: `apps/api/src/opportunity_api/api/opportunities.py` (`_profile_evidence`, `_to_matching_profile`), `apps/api/src/opportunity_api/matching/scoring.py`.
4. **CV adaptat real la cerințele postului.** Generarea curentă ordonează fragmente existente și indică lipsuri prin comparație de text cu skill-urile postului; avertismentul API spune explicit că nu există rescriere AI. Trebuie un draft care selectează dovezile relevante pentru cerințele postului și propune formulări fidele sursei, fără competențe inventate, urmat de verificarea și aprobarea studentului. *Fără asta:* PDF-ul exportat este personalizat ca selecție, dar nu este CV-ul pliat pe post descris în scop. Sursa: `apps/api/src/opportunity_api/api/tailoring.py`, `apps/api/src/opportunity_api/workspace/tailoring.py`.

## Should fix înainte de beta

5. **Calibrarea scorului pe rezultate reale.** Motorul are scor explicabil și teste sintetice, însă acest audit nu a găsit dovada că ordinea recomandărilor reflectă preferințele reale ale studenților pentru un catalog reprezentativ. Definiți un set evaluat de oameni, măsurați calitatea topului și reglați ponderile fără a promite că scorul prezice angajarea. Sursa: `apps/api/src/opportunity_api/matching/engine.py`, `docs/benchmarks/semantic-matching.md`.
6. **Calitatea catalogului și prospețimea anunțurilor.** Rankingul bun nu ajută dacă anunțurile sunt expirate, duplicate, puține sau au skill-uri structurate incomplete. Verificați sursele reale, acoperirea internshipurilor și joburilor, linkurile oficiale și actualizarea periodică; auditul local nu confirmă starea datelor găzduite. Sursa: `services/ingestion/`, `docs/catalog-audit.md`, `apps/api/src/opportunity_api/api/opportunities.py`.
7. **Fluxul complet verificat cu conturi și documente reale de test.** Testele acoperă multe componente și scenarii de integrare, dar trebuie verificat în mediul țintă: cont nou → PDF de test → corectare → profil salvat → ranking schimbat → draft → PDF aprobat → link de aplicare. Includeți două conturi pentru izolarea datelor, desktop și mobil, plus încercări de documente greu de citit. Documentul de integrare existent declară configurația găzduită încă neverificată. Sursa: `apps/web/tests/e2e/core-flow.spec.ts`, `docs/audits/2026-11-23-fullstack-integration.md`.

## Ordinea recomandată

1. **Specificație de produs scurtă:** CV obligatoriu sau opțional; ce se întâmplă cu un CV necitibil; ce înseamnă „potrivire mare”; cine validează varianta finală a CV-ului. Aceasta deblochează criterii de acceptare clare.
2. **Extragere și profil:** set de CV-uri anonimizate, măsurare per secțiune, corecții parser/model, flux sigur de revizuire și persistență.
3. **Matching:** folosiți faptele relevante din toate secțiunile, îmbunătățiți datele structurate ale joburilor și validați ordinea topului pe exemple evaluate de oameni.
4. **Tailoring:** selecție și reformulare fundamentată în profil și cerințele postului, revizuire obligatorie, export care corespunde exact textului aprobat.
5. **Test cap-coadă în mediul găzduit:** două conturi, CV-uri de test, oportunități reale verificate, desktop/mobil, configurare și monitorizare.

## Limite ale auditului

Am urmărit codul relevant și testele/documentele asociate. Nu am rulat suita completă, nu am încărcat CV-uri reale, nu am inspectat baza de date ori configurația găzduită și nu am măsurat calitatea recomandărilor pe utilizatori reali. Verdictul descrie **capacitatea din cod**, nu dovada că produsul este deja pregătit pentru producție. Documentele istorice din `docs/` au fost folosite doar ca context; când diferă de codul actual, constatarea de mai sus urmează codul.

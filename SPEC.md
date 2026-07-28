# Spec: extension Chrome « LinkedIn Slop Filter »

## 1. Objectif

Extension Chrome (Manifest V3) qui score chaque publication du fil LinkedIn et masque celles qui dépassent un seuil de « slop » (contenu creux au style généré). Tout se passe côté client. Aucune donnée ne sort du navigateur. L'extension se limite à lire le fil et à modifier l'affichage.

## 2. Décisions techniques (fermes)

- TypeScript strict, aucun framework UI, aucune dépendance runtime.
- Build: esbuild via un script `build.mjs` (bundles IIFE vers `dist/`). Pas de webpack, pas de Vite, pas de CRXJS.
- Tests: vitest, sur le moteur de scoring uniquement (fonctions pures, sans DOM).
- Réglages dans `chrome.storage.sync`; compteur de session en mémoire.
- Pas de service worker en v1. Deux composants: content script et popup.
- DevDependencies: `typescript`, `esbuild`, `vitest`. Rien d'autre.
- Scripts npm: `build`, `watch`, `test`, `typecheck`.

Manifest de référence (ne pas enrichir):

```json
{
  "manifest_version": 3,
  "name": "LinkedIn Slop Filter",
  "version": "0.1.0",
  "permissions": ["storage"],
  "content_scripts": [{
    "matches": ["https://www.linkedin.com/*"],
    "js": ["dist/content.js"],
    "css": ["static/content.css"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "static/popup.html" }
}
```

## 3. Structure du repo

```
manifest.json
package.json
tsconfig.json
build.mjs
static/
  popup.html        # référence dist/popup.js
  content.css
src/
  engine/
    signals.ts      # chaque heuristique = { id, label, weight, detect(text): number }
    score.ts        # scorePost(text): { score, reasons }
  selectors.ts      # TOUS les sélecteurs DOM LinkedIn, centralisés ici
  content.ts        # observer, scoring, masquage
  popup.ts
  storage.ts        # lecture/écriture typée des réglages
tests/
  score.test.ts
```

Réglages:

```ts
type Settings = { enabled: boolean; threshold: number; allowedAuthors: string[] };
// défauts: { enabled: true, threshold: 50, allowedAuthors: [] }
```

## 4. Fonctionnement du content script

Pipeline:

1. `MutationObserver` sur `document.body` (subtree), traitement par lots avec un debounce de 150ms. Le fil est une SPA à défilement infini; l'observer couvre aussi les navigations internes.
2. À chaque lot: sélectionner les posts via `SELECTORS.post`, extraire le texte via `SELECTORS.postText`, appeler `scorePost`.
3. Recyclage: LinkedIn virtualise le fil et réutilise les nodes. Maintenir un `WeakMap<Element, string>` node → `data-id`. Si le `data-id` d'un node déjà traité change, le retraiter au complet (démasquer puis rescorer).
4. Si `enabled` et `score >= threshold`: masquer. Le texte tronqué par « …voir plus » est scoré tel quel, sans le déplier.

Masquage:

- Poser l'attribut `data-slop-hidden` sur le node racine du post et injecter un `div.slop-placeholder` comme premier enfant.
- CSS dans `content.css`: `[data-slop-hidden] > *:not(.slop-placeholder) { display: none; }`. Ne jamais retirer un node du DOM (stabilité du défilement).
- Contenu du placeholder: `Masqué · score 78 · accroche dramatique, liste à emojis, hashtags` plus un bouton « Afficher ». Le clic retire l'attribut et marque le node pour qu'il ne soit pas remasqué.
- Les raisons affichées sont les `label` des signaux déclenchés (3 max, triés par poids décroissant).
- Tout le code DOM échoue en silence (post sans texte: ignorer) et journalise en `console.debug` avec le préfixe `[slop-filter]`.

Popup:

- Interrupteur activé/désactivé.
- Curseur « Sensibilité » de 0 à 100 (défaut 50). Valeur = seuil de masquage.
- Compteur « X publications masquées sur cet onglet », obtenu par message `GET_STATS` envoyé au content script de l'onglet actif.
- Application en direct: le content script écoute `chrome.storage.onChanged` et réévalue tous les posts déjà traités (démasquer si le seuil monte, remasquer s'il descend ou si on réactive).

## 5. Moteur de scoring

`scorePost(text: string): { score: number; reasons: SignalId[] }`

- Somme des points des signaux déclenchés, plafonnée à 100.
- Texte de moins de 30 mots: score final multiplié par 0,5 (trop court pour juger).
- Tous les motifs sont bilingues FR/EN et insensibles à la casse. Les regex ci-dessous sont indicatives: ajuste-les pour faire passer les fixtures de la section 6, sans toucher aux poids.

| id | détection | points |
|---|---|---|
| `hookOpener` | 1re ligne commençant par `unpopular opinion`, `hot take`, `stop scrolling`, `big news`, `personal news`, `i'm humbled/thrilled/excited/proud`, `je suis fier/fière/ravi(e)/honoré(e)` | 18 |
| `letThatSinkIn` | `let that sink in`, `read that again`, `relis ça`, `relisez cette phrase`, `laisse ça infuser` | 20 |
| `notXButY` | pivot contrastif entre deux phrases: `/it'?s not (about )?[^.!?\n]{2,80}[.!?]\s*it'?s/i` et `/ce n'?est pas [^.!?\n]{2,80}[.!?]\s*c'?est/i` | 12 par occurrence, plafond 24 |
| `oneWordDrama` | paragraphe d'un seul mot conclusif: `Wrong.` `Boom.` `Faux.` `Voilà.` `Exactement.` | 10 |
| `emojiBullets` | au moins 3 lignes commençant par un emoji (🚀 ✨ 💡 🔥 ✅ 👉 📈 💪 🎯 ⚡ ♻️ 🔑) | 15 |
| `emojiHeaders` | ligne courte (< 40 caractères) commençant par un emoji et finissant par `:` | 10 |
| `shortParagraphStorm` | au moins 6 paragraphes ET longueur médiane des paragraphes < 60 caractères | 15 |
| `emDashDensity` | plus de 1,5 tiret (— ou –) par 100 mots | 10 |
| `hashtagSpam` | au moins 5 hashtags | 8 |
| `buzzwords` | `delve`, `game-changer`, `leverage`, `unlock`, `elevate`, `seamless`, `superpower`, `in today's fast-paced`, `the future of`, `révolutionner`, `à l'ère de`, `incontournable`, `changer la donne` | 3 par occurrence, plafond 15 |
| `engagementBait` | `agree?`, `thoughts?`, `comment below`, `repost if`, `♻️`, `follow me for`, `qu'en pensez-vous`, `partagez si`, `suivez-moi pour`, `👇` | 12 par occurrence, plafond 24 |
| `ruleOfThree` | triade en fin de phrase: `/\b\w+, \w+,? (and|et) \w+[.!]/i` | 6 |

Ne renomme jamais les ids: ils sont exposés dans `reasons` et pourraient finir dans les réglages.

## 6. Fixtures et critères d'acceptation

Ces 6 textes vont textuellement dans `tests/score.test.ts`. Ajoute aussi un test minimal par signal (plus court texte qui le déclenche). Assertions:

| fixture | assertion |
|---|---|
| `slop-en-motivation` | score ≥ 65 |
| `slop-fr-parcours` | score ≥ 65 |
| `slop-en-humblebrag` | 30 ≤ score < 50 (cas limite: reste visible au seuil par défaut, c'est voulu) |
| `legit-en-technique` | score ≤ 20 |
| `legit-fr-recrutement` | score ≤ 20 |
| `legit-fr-opinion` | score ≤ 20 |

`slop-en-motivation`:

```
I got rejected 47 times.

Let that sink in.

Most people would quit.

I didn't.

Here's what 47 rejections taught me about resilience:

🚀 Growth isn't linear
✨ Every no is a redirection
💡 Your network is your net worth

It's not about failure. It's about feedback.

Agree? ♻️ Repost if this resonates.

#motivation #growth #mindset #hustle #leadership
```

`slop-fr-parcours`:

```
On m'a dit que c'était impossible.

Relis ça.

En 2020, je n'avais rien. Aujourd'hui, une équipe de 12.

Voici ce que j'ai appris :

🔥 La constance bat le talent
🎯 Le réseau, c'est tout
💪 Échouer, c'est apprendre

Ce n'est pas une question de chance. C'est une question de discipline.

Qu'en pensez-vous ? 👇

#entrepreneuriat #mindset #succès #croissance #leadership
```

`slop-en-humblebrag`:

```
I'm humbled and thrilled to announce that I've been named to this year's 30 Under 30 list. This journey taught me three things: grit, gratitude, and growth. In today's fast-paced world, staying grounded is a game-changer. Thank you to everyone who believed in me along the way. #blessed #30under30 #grateful #journey #growth
```

`legit-en-technique`:

```
We migrated our API gateway from Express to Fastify last sprint and p99 latency went from 180ms to 95ms. Most of the gain came from schema-based serialization rather than the router itself. Happy to share the benchmark setup if anyone wants to reproduce it.
```

`legit-fr-recrutement`:

```
On cherche un dev backend senior pour notre équipe de Québec. Stack Node, TypeScript et Postgres, poste hybride avec deux jours au bureau. Écris-moi en privé si tu veux en savoir plus sur l'équipe ou le produit.
```

`legit-fr-opinion`:

```
J'ai lu le rapport de la BDC sur l'adoption de l'IA dans les PME québécoises. Le chiffre qui m'a surpris: seulement 12% des entreprises de moins de 50 employés s'en servent régulièrement. L'écart avec les grandes entreprises se creuse d'année en année. Je me demande si le frein principal est le coût ou la formation.
```

## 7. Sélecteurs DOM (fragiles par nature)

`src/selectors.ts` exporte un objet unique:

```ts
export const SELECTORS = {
  post: 'div[data-id^="urn:li:activity"], div.feed-shared-update-v2',
  postText: '.update-components-text, .feed-shared-inline-show-more-text',
  authorName: '.update-components-actor__title', // phase 4 seulement
};
```

- Ces sélecteurs datent de mi-2026. Considère-les comme périmables, pas comme fiables.
- Tu n'as pas accès à LinkedIn: n'essaie pas d'ouvrir le site ni de vérifier les sélecteurs toi-même. La validation se fait par la QA manuelle (section 9). Si un sélecteur est cassé, je collerai le HTML d'un post réel dans la conversation; tu adapteras alors `selectors.ts` et rien d'autre.

## 8. Phases (arrête-toi après chacune)

**Phase 0, squelette.** Repo npm, tsconfig strict, `build.mjs`, manifest, `popup.html` minimal, `content.ts` qui journalise `[slop-filter] loaded`. AC: `npm run build` produit `dist/` et l'extension se charge en mode développeur sans erreur.

**Phase 1, moteur.** `signals.ts`, `score.ts`, tests des fixtures et des signaux. AC: `npm test` et `npm run typecheck` verts.

**Phase 2, content script.** Observer, extraction, masquage avec placeholder, gestion du recyclage. AC: typecheck vert, QA manuelle points 1 à 4.

**Phase 3, popup.** Interrupteur, curseur, compteur, application en direct via `storage.onChanged`. AC: QA points 5 à 7.

**Phase 4, finition.** Bouton « Toujours afficher cet auteur » sur le placeholder (alimente `allowedAuthors`), raisons lisibles en français, revue de perf (aucun scoring hors debounce, aucune fuite de listeners). AC: QA complète.

**Phase 5, plus tard (ne pas coder en v1).** Classification des scores entre 35 et 65 par la Prompt API de Chrome (Gemini Nano on-device), derrière un drapeau désactivé par défaut.

## 9. QA manuelle (faite par moi, pas par toi)

1. `chrome://extensions`, mode développeur, « Charger l'extension non empaquetée », pointer la racine du repo. Aucune erreur au chargement.
2. Ouvrir le fil LinkedIn et vérifier `[slop-filter] loaded` dans la console.
3. Défiler 2 minutes: des posts se masquent, chaque placeholder affiche score et raisons, « Afficher » révèle le post et il reste visible.
4. Défiler loin puis remonter: chaque placeholder correspond bien au post qu'il couvre (test du recyclage des nodes).
5. Popup: désactiver fait tout réapparaître, réactiver remasque.
6. Baisser le seuil à 20: davantage de posts masqués, sans recharger la page.
7. Le compteur du popup correspond au nombre de placeholders créés dans l'onglet.

## 10. Interdits

- Aucun appel réseau, aucune télémétrie, aucun code distant, aucune dépendance runtime.
- Aucune automatisation d'actions LinkedIn (like, follow, publication, défilement). Lecture et affichage seulement.
- Ne jamais retirer un node du fil ni modifier autre chose que l'affichage.
- Pas de framework, pas de service worker en v1, pas de fichier de config superflu (lint et CI viendront plus tard si besoin).
- Ne pas renommer les ids de signaux ni les clés de `Settings`.

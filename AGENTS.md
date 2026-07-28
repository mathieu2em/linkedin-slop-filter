# AGENTS.md

Extension Chrome qui masque le slop du fil LinkedIn. Le spec fait loi: [SPEC.md](SPEC.md).
Ses decisions techniques et ses interdits sont fermes.

**Ce repo est public.** Tout ce qui est committe est lisible par n'importe qui, pour
toujours, meme apres suppression: un commit pousse reste accessible par son SHA.

## Regles de confidentialite (non negociables)

1. **Zero secret dans le repo.** Aucune clef API, token, mot de passe, cookie de
   session, certificat, clef privee. Le produit n'a besoin d'aucun secret: le spec
   interdit tout appel reseau, donc une clef dans ce repo n'a aucune raison d'exister.
   Si tu crois en avoir besoin, c'est que tu t'ecartes du spec.

2. **Aucune donnee privee de tiers.** Le fil LinkedIn est rempli de vraies personnes.
   Ne committe jamais:
   - du HTML brut copie du fil (contient noms, URN, URLs de profil, photos);
   - une URN reelle (`urn:li:activity:71234...`) ou une URL de profil (`linkedin.com/in/...`);
   - une capture d'ecran du fil, ou une image encodee en base64;
   - un fichier `.har` ou un export DevTools: ca contient les cookies de session
     **et** le contenu complet des pages.

   Debug de selecteurs: le HTML reel colle dans la conversation reste dans la
   conversation. Il ne va ni dans une fixture, ni dans un fichier de scratch, ni
   dans un message de commit. Seul `src/selectors.ts` change, avec des selecteurs
   generiques et aucun identifiant.

3. **Fixtures de test = texte invente.** `tests/` ne contient que les 6 fixtures du
   spec section 6 et des chaines synthetiques. Jamais un vrai post, meme anonymise:
   un post reel reste retrouvable par recherche textuelle.

4. **Identite git.** Ce repo utilise l'adresse noreply GitHub, pas une adresse
   professionnelle ou personnelle. Deja configure localement:
   `git config user.email "35858630+mathieu2em@users.noreply.github.com"`

5. **Rien ne sort du navigateur.** Corollaire du spec section 10: pas de `fetch`,
   `XMLHttpRequest`, `WebSocket`, `sendBeacon`, ni de balise pointant vers un
   domaine externe. Pas de telemetrie, meme anonyme. Pas de CDN. Aucune
   dependance runtime. `chrome.storage.sync` synchronise via le compte Google de
   l'utilisateur et ne contient que `Settings`: jamais de contenu de post.

6. **Le hook pre-commit n'est pas une garantie.** C'est un filet, pas une preuve.
   La regle est de ne pas ecrire la donnee en premier lieu.

## Les trois filets

| couche | ce qu'elle attrape | limite |
|---|---|---|
| `.gitignore` | `.env`, clefs, `.har`, `screenshots/`, `scratch/` | rien si le fichier est ajoute a la main avec `-f` |
| `.githooks/pre-commit` | tokens connus, secrets en dur, cookies LinkedIn, URN et profils reels, courriels, images base64 | local seulement, et `--no-verify` le contourne |
| GitHub secret scanning + push protection | tokens de fournisseurs connus, au push | ne connait rien a la donnee privee |

Activation du hook apres un clone (une seule fois, obligatoire):

```
git config core.hooksPath .githooks
```

## Si une fuite arrive quand meme

Ne te contente pas d'un commit qui retire la ligne: le contenu reste dans
l'historique. Dans l'ordre: **1)** revoque la clef immediatement, avant toute
manipulation de git, c'est la seule etape qui compte vraiment; **2)** purge
l'historique (`git filter-repo`) et force push; **3)** considere que la donnee
est compromise de toute facon.

## Rappels de build

- npm, pas yarn. Scripts: `build`, `watch`, `test`, `typecheck`.
- `dist/` est gitignore: `npm install && npm run build` avant de charger l'extension.
- Charger: `chrome://extensions` > mode developpeur > charger non empaquetee > racine du repo.

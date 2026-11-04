# CLAUDE.md — « Ma bergerie » : contexte, règles métier et passation

Tu prends la suite de ce projet. Ce document contient TOUT ce qu'il faut savoir : le contexte, les règles métier validées sur le terrain (chaque point a coûté un aller-retour avec l'utilisateur — ne les régresse pas), le modèle de données exact, et des tests de non-régression avec des chiffres attendus.

## 0. L'attente (la vision)

Un **outil du quotidien à la bergerie**, pas un gadget :

- Le plan reflète la bergerie **telle qu'elle est** (35 × 22 m, aires, tapis, barrières).
- **Un seul geste par jour** : Vincent adapte ses lots physiques (agnelage progressif : lots créés, barrières déplacées, effectifs rectifiés) et l'appli dit aussitôt **quoi régler aux trémies** (g/place par tapis et par plage — et confirmation que rien n'a bougé s'il n'a rien changé) et **ce que mange chaque brebis en moyenne** (kg versés ÷ têtes = g/j).
- **La physique avant tout** : la trémie verse en une fois au milieu du tapis — ne jamais suggérer l'impossible. Le calcul suit la réalité, jamais l'inverse.
- **Fiable, hors ligne, sans perte** : à la bergerie il n'y a pas toujours de réseau ; données locales et exportables. Un chiffre faux = du concentré mal dosé — l'exactitude prime (contrôle par lot systématique).
- **Sobre et lisible d'un coup d'œil** (mains pas propres, souvent pressé) : gros chiffres, français, zéro fioriture. Une appli d'éleveur, pas de bureau.
- La refonte en vraie app garde **le modèle métier et les données actuelles, intouchables**, en plus fluide et rapide à ouvrir.

## 1. Le projet en bref

Appli de Vincent Vaysset, **éleveur ovin laitier bio** : plan numérique de sa bergerie (35 m × 22 m) pour gérer ses **lots de brebis, barrières, rations et réglages de trémies** (distributeurs de concentré le long des auges). Aujourd'hui : single-page app HTML/CSS/JS vanilla, **zéro dépendance**, un seul fichier, publiée sur GitHub Pages : https://vincentvaysset.github.io/Bergerie/ — dépôt `VincentVaysset/Bergerie`, branche `main`, à la racine (anciennement `Conges/bergerie/`). Objectif : en faire une vraie app.

**Règles absolues :**
- Vincent parle français, veut des réponses et une UI **concises et sobres** : aucun emoji dans l'interface (icônes SVG fines uniquement), libellés sérieux, « pas la patte IA ».
- **Ne JAMAIS toucher aux dépôts `Ovilog` et `Logisol`** (autres applis de Vincent). Tout ce projet vit dans le dépôt `VincentVaysset/Bergerie`.
- Données 100 % locales (aucun serveur, aucune donnée envoyée). Offline-first obligatoire : la bergerie n'a pas toujours de réseau.

## 2. Ce que fait l'appli aujourd'hui (v8, 03/11/2026)

- **Plan SVG zoom/pan** (pinch à 2 doigts, glisser = déplacer la vue, appui long sur une aire = créer une barrière, glisser une barrière = la déplacer, toucher un morceau d'aire = l'attribuer à un lot). Règle graduée le long des tapis, places numérotées depuis la gauche tous les 10.
- **Onglets** : « Bergerie » (accueil : aliments, export/import, tout-effacer), un onglet par lot (fiche : effectif, morceaux, places, rations), « Lot » (création), « Trémies » (doses à régler par tapis/plage/aliment + contrôle par lot).
- **Panneau repliable** (« Détails / Masquer ») sous le plan ; replié par défaut si largeur < 920 px, dépliage auto à la sélection ; ≥ 920 px le panneau passe en colonne droite (430 px).
- **PWA installable** : `manifest.webmanifest`, `sw.js` (cache-first assets, network-first navigation, cache `bergerie-v7`), `icon.svg`. Fonctionne hors ligne.
- **Export/import** de sauvegarde JSON (fichier `bergerie-AAAA-MM-JJ.json`), dans l'onglet Bergerie.
- Sauvegarde automatique localStorage, clé **`bergerie_lots_v5`** (+ migration auto depuis `bergerie_lots_v3` : v4 était en kg/place, v5 en kg/brebis). Alerte si le navigateur refuse d'écrire.

Fichiers : `index.html` (~53 Ko, tout-en-un), `README.md`, `manifest.webmanifest`, `sw.js`, `icon.svg`. Dernier commit : `466077f`.

## 2 bis. Refonte v9 (04/11/2026) — architecture

- `modele.js` : toute la logique métier, pure (fonctions `M.xxx(state, …)`), sans DOM. `index.html` n'en garde que des enveloppes du même nom (`lotStats(id)` → `M.lotStats(state,id)`), donc l'UI n'a pas changé.
- `stockage.js` : localStorage `bergerie_lots_v5` (inchangé, relu à chaque écriture) + miroir IndexedDB (`bergerie`/`etats` : `courant`, `jour:AAAA-MM-JJ` ×7, `avant:<ISO>|<motif>` ×5). Secours auto si localStorage vide/abîmé. `navigator.storage.persist()`.
- `sw.js` : cache `bergerie-v9`, scripts versionnés `?v=9` (**incrémenter partout à chaque version** : index.html, sw.js FICHIERS et CACHE), page réseau d'abord avec repli cache après 3 s.
- Tests : `npm test` → `tests/modele.test.js` (Node), `tests/non-regression.js` (§6 dans Chromium), `tests/stockage-horsligne.js` (secours, copies, hors ligne). Tout doit passer avant de publier.

## 3. Géométrie de la bergerie (validée sur le terrain — ne pas modifier)

- 35 m × 22 m, **3 places par mètre**.
- **4 aires qui font toute la longueur (35 m)** ; seuls les tapis sont plus courts :
  - **3 tapis doubles** : **92 places par côté** (~30,67 m), alignés à gauche → 654 places au total (3×92×2 + 102).
  - **1 tapis simple** : **102 places** (34 m), le long de l'aire 4, côté couloir.
- Bandes verticales : Aire 1 / Tapis 1 / Aire 2 / Tapis 2 / Aire 3 / Tapis 3 / Aire 4 / Tapis simple / couloir.
- **Tapis double t est entre l'aire t et l'aire t+1** : côté A = aire t, côté B = aire t+1. Un lot sur l'aire 1 mange sur le tapis 1 uniquement ; sur l'aire 2 ou 3 il mange sur **2 tapis** ; sur l'aire 4 sur le tapis 3 + le tapis simple.
- Une position sur tapis double = 1 place de chaque côté (2 rangées face à face).
- Une aire est découpée en morceaux par des **barrières** (position k entière, 0–92) ; chaque morceau est attribué à un lot.

## 4. Le modèle métier — LE cœur du projet

### 4.1 Les trois ancres de saisie (par lot ET par aliment, exclusives)

C'est le fruit de 5 itérations avec Vincent. Chaque aliment de chaque lot est ancré de L'UNE de ces deux façons :

| Ancre | Stockage | Signifie | Quand Vincent l'utilise |
|---|---|---|---|
| **g/place (la trémie)** | `lot.pp[fid]` en kg/place | la dose versée par place, **CONSTANTE** | **pendant l'agnelage** : « je donnais 500 g à tout le monde, je ne touche pas les quantités par place aux trémies » |
| **g/brebis** | `lot.r[fid]` en kg/brebis | la ration moyenne par tête | rations standard |
| kg du lot | dérivé (`b×r` ou `P×pp`) | le total à peser | jamais ancre, toujours résultat ou saisie convertie |

Le toggle **« Je saisis en : [kg] [g/brebis] [g/place] »** (`state.pref` ∈ `kg|per|place`, mémorisé) ne fait que changer l'ordre/présentation des champs. **Éditer un champ re-ancrage l'aliment** correspondant (saisir kg ou g/brebis supprime `pp[fid]` ; saisir g/place supprime `r[fid]`). Le badge par aliment distingue « **réglée : 500 g/place** » (ancré place, verrouillé) de « ≈ X g/place » (dérivé, bougera si les places changent).

### 4.2 Formules (P = nombre de places du lot, b = effectif, calculés par `lotStats`)

```
perPlace(lot, fid) = pp                     si ancré place (indépendant de b et P !)
                  = b × r / P              sinon
kg du lot          = P × pp                 si ancré place
                  = b × r                  sinon
g/brebis (ancré place) = pp × P / b         (b>0 ; résultat, jamais stocké)
```

`lotStats(id).P` : aire 1 → n places (tapis 1) ; aire 2 ou 3 → 2n (deux tapis) ; aire 4 → n + ts (tapis 3 + tapis simple, `ts` = proportion du tapis simple couverte par le morceau).

### 4.3 Règles gravées (validées une par une par Vincent)

1. **La trémie verse en une fois au milieu du tapis double.** Impossible d'avoir des rations différentes entre les 2 rangées, impossible de séparer la part de 2 lots face à face. Donc sur l'onglet Trémies :
   - même lot des 2 côtés → badge « **2 × [sa part par place]** » ;
   - 2 lots face à face (plage « ration commune ») → badge « **2 × [(partA + partB) / 2]** » — ne JAMAIS afficher « lotA 179 + lotB 265 g » (essayé, rejeté) ;
   - tapis simple → dose simple par place.
2. **Changer l'effectif d'un lot ne change NI les kg à verser NI les doses par place** : la ration par brebis suit (`setB` re-scale les r-ancrés pour garder les kg, ignore les pp-ancrés). Garde-fou `anchorTk` : si l'effectif passe par 0 (champ vidé en tapant) puis revient, on retrouve les kg d'avant.
3. **« En moyenne le lot mange la ration par brebis »** — les animaux circulent, seule la moyenne compte. C'est LE modèle validé.
4. **Contrôle par lot** (bas de l'onglet Trémies) : « X kg sur ses N places ÷ B têtes = G g/j ». C'est le critère de confiance de Vincent, avec une coche. À conserver absolument et à rendre toujours exact.
5. Arrondis : la somme des arrondis peut différer de 1 g de l'arrondi de la somme (ex. « 2 × 430 » affiché pour 859 g/place). **Accepté, ne pas « corriger »** ; Vincent l'a validé.
6. Cas limite : 2 lots d'ID différents portant le même nom face à face → « ration commune » sans « 2 × » (la dose reste juste, l'affichage change).
7. « Appliquer ces rations à tous les lots » copie `r` **et** `pp` (dans leur mode respectif).

## 5. Schéma de données exact (localStorage `bergerie_lots_v5`)

```json
{
  "nextLot": 2, "nextFeed": 2, "pref": "place",
  "feeds": [{ "id": 0, "name": "Céréales" }, { "id": 1, "name": "Alib maïs 22" }],
  "lots": [
    { "id": 0, "b": 200, "name": "Brebis",   "r": { "0": 0.8, "1": 0.5 }, "pp": { "0": 0.5 } },
    { "id": 1, "b": 80,  "name": "Antenaises", "r": { "0": 0.9, "1": 0.7 }, "pp": {} }
  ],
  "airs": [
    { "barriers": [],         "lots": [0] },
    { "barriers": [],         "lots": [0] },
    { "barriers": [],         "lots": [0] },
    { "barriers": [65],       "lots": [1, 0] }
  ]
}
```
- `r` en **kg/brebis**, `pp` en **kg/place** ; pour un fid donné, **un seul des deux existe** (l'autre est supprimé).
- `airs[i].lots[j]` = id du lot du morceau j ; `barriers` = positions k triées (bornes 0 et 92 implicites).
- Export JSON : enveloppe `{app, v, date, state}` (l'import accepte aussi l'état brut), validation lots/feeds/airs×4 à l'import, `l.pp = l.pp || {}` à la normalisation.
- Migration v3 (ancienne clé, `rt` en kg/place) : `r = P × rt / b`.

## 6. Tests de non-régression (scénario complet avec chiffres attendus)

Config test : lots et airs comme au §5, aires 1-3 entières pour Brebis, aire 4 coupée à 65 (Antenaises 0-64, Brebis 65-91) → **P(Brebis) = 524 places, P(Antenaises) = 130**.

1. **Mode g/place** : saisir 500 g/place sur les 2 aliments du lot Brebis → badge « réglée : 500 g/place », total 524 kg, **2620 g/brebis/j**. Déplacer la barrière 65 → 40 (P passe à 574) : la dose par place ne bouge PAS, g/brebis = **2870 g/j**. Effectif 200 → 220 : dose intacte, **2609 g/j**, contrôle « 574 kg sur ses 574 places ÷ 220 têtes ».
2. **Mode g/brebis/kg** : Brebis 200 têtes, Céréales 800 g + maïs 500 g = 260 kg → effectif 180 : **260 kg stables**, Céréales **889 g/brebis**, « ≈ 305 g/place » inchangé.
3. **Tapis 3 partagé** (Brebis + Antenaises face à face) : plage mixte affiche « ration commune » et « **2 × (partA+partB)/2** » ; plage Brebis seule des 2 côtés : « 2 × sa part ».
4. **Contrôle par lot** : chaque lot → kg versés ÷ têtes = somme de ses rations g/j, à 1 g près. Lot à 0 tête absent du bloc.
5. Export → import → l'état est identique (y compris `pp`, `pref`, barrières, noms).

Ces scénarios ont été exécutés en harness DOM simulé sur la version actuelle : les chiffres ci-dessus sont exacts.

## 7. Pour en faire une vraie app

- **Porte la logique métier (§4) avant tout** ; écris les tests du §6 en premier, puis réimplémente. Le formel de `index.html` (fonctions `lotStats`, `perPlace`, `feedVal`, `setB`, `dblRanges`, `tsRanges`) est la référence actuelle — il est court et lisible.
- **Migration des données** : au premier lancement, lire `bergerie_lots_v5` du localStorage (ou passer par l'export JSON existant, format §5). Vincent NE DOIT PAS perdre ses lots en changeant d'app.
- Offline-first, PWA ou app native — il a déjà un raccourci installé sur son téléphone et compte l'utiliser à la bergerie sans réseau.
- Multi-appareils : export/import manuel aujourd'hui ; pas de sync cloud (limite assumée, une sauvegarde cloud simple pourrait être proposée).
- UI : garder le plan interactif comme écran principal, la sobriété actuelle, le français, zéro emoji.
- Le README.md du dossier décrit l'usage courant.

## 9. Migration vers le dépôt dédié — faite le 04/11/2026

Le projet a quitté `Conges/bergerie/` pour ce dépôt (contenu à la racine), publié sur https://vincentvaysset.github.io/Bergerie/. localStorage est lié au domaine `vincentvaysset.github.io` : les données (clé `bergerie_lots_v5`) ont suivi sans transfert. Vincent a confirmé le 04/11/2026 (raccourci réinstallé) : `Conges/bergerie/` ne contient plus qu'une page de redirection vers ici et un service worker qui se désinstalle. Attention : l'adresse respecte la majuscule (`/Bergerie/`).

## 8. Histoire des versions (ce qui a été essayé et rejeté)

- v6.1 : « 300 g/brebis → 357 g/place, pas possible » → c'était une question de places > brebis, pas un bug.
- v6.3 : afficher chaque aliment par place, pas juste le total → validé.
- v6.4 : séparer les rations par côté du tapis → **physiquement impossible**, rejeté.
- v7 : afficher les parts par lot sur une plage commune (« Brebis 179 + Agnelles 222 ») → demandé puis **rejeté** (« on peut pas séparer la ration ! ») → v7.1 : « 2 × moitié ».
- v7.2 : kg en premier → « des fois je travaille dans un sens, des fois dans l'autre » → v7.3 : toggle modulable.
- v7.4 : kg constants quand l'effectif bouge → presque : v8 : **l'ancre vraie est le g/place de la trémie**, mode « g/place » verrouillé.

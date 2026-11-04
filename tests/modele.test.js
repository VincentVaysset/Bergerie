/* Tests du modèle métier (Node, sans navigateur). Lancer : node tests/modele.test.js */
'use strict';
const assert = require('assert');
const M = require('../modele.js');
const FIX5 = require('./fixture-v5.json');
const v5 = () => JSON.parse(JSON.stringify(FIX5));
const g = x => Math.round(x * 1000);
const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= (e == null ? 1e-9 : e), (msg || '') + ' ' + a + ' ≠ ' + b);
let n = 0;
function t(nom, fn) { fn(); n++; console.log('  ok   ' + nom); }
/* état v6 de test : géométrie du fixture, rations voulues 800+500 (Brebis) et 900+700 (Antenaises) */
function v6() {
  const s = M.defaultState();
  s.feeds = [{ id: 0, name: 'Céréales' }, { id: 1, name: 'Alib maïs 22' }]; s.nextFeed = 2;
  s.lots = [{ id: 0, b: 200, name: 'Brebis', obj: { 0: 0.8, 1: 0.5 } }, { id: 1, b: 80, name: 'Antenaises', obj: { 0: 0.9, 1: 0.7 } }]; s.nextLot = 2;
  s.airs = JSON.parse(JSON.stringify(FIX5.airs));
  return s;
}
const kgRecu = (s, id) => { const r = M.recu(s)[id]; return Object.values(r.kg).reduce((a, b) => a + b, 0); };
const kgVerse = s => { let k = 0; M.plan(s).forEach((pt, t) => pt.forEach(r => Object.values(r.d).forEach(d => k += d * (r.k2 - r.k1)))); return k; };

console.log('Géométrie');
t('654 places, P(Brebis) 524, P(Antenaises) 130', () => {
  const s = v6();
  assert.strictEqual(M.lotStats(s, 0).P, 524); assert.strictEqual(M.lotStats(s, 1).P, 130);
  assert.strictEqual(M.lotStats(M.defaultState(), 0).P, 654);
});
t('places comptées par le calcul physique = places du lot', () => {
  const s = v6(), r = M.recu(s);
  assert.strictEqual(r[0].places, 524); assert.strictEqual(r[1].places, 130);
});

console.log('Ancienne version v8 (chiffres validés, base de la reprise des données)');
t('g/place : 500 → 524 kg, 2620 ; barrière 40 → 2870 ; 220 têtes → 2609', () => {
  const s = v5(), l = s.lots[0];
  M.v8.setPP(l, 0, 0.5); M.v8.setPP(l, 1, 0.5);
  assert.strictEqual(g(M.v8.sumRations(s, l)), 2620);
  s.airs[3].barriers[0] = 40; assert.strictEqual(g(M.v8.sumRations(s, l)), 2870);
  M.v8.setB(s, l, 220); assert.strictEqual(g(M.v8.sumRations(s, l)), 2609);
});
t('g/brebis : 260 kg stables à 180 têtes, 889 g, 305 g/place', () => {
  const s = v5(), l = s.lots[0]; l.pp = {};
  assert.strictEqual(g(M.v8.perPlace(s, l, 0)), 305);
  M.v8.setB(s, l, 180); assert.strictEqual(g(M.v8.feedVal(s, l, 0)), 889); assert.strictEqual(g(M.v8.perPlace(s, l, 0)), 305);
});
t('contrôle v8 : 1810 et 1600 g/j sur le fixture', () => {
  assert.deepStrictEqual(M.v8.controle(v5()).map(c => c.g), [1810, 1600]);
});

console.log('Reprise des données v5');
t('ration voulue = ration de l’ancienne appli ; trémies figées sur ses doses', () => {
  const o = v5(), s = M.versV6(o);
  assert.strictEqual(s.v, 6); assert.ok(s.fige && s.fige.repris);
  assert.strictEqual(g(M.voulueTot(s, s.lots[0])), 1810); assert.strictEqual(g(M.voulueTot(s, s.lots[1])), 1600);
  for (let tp = 0; tp < 4; tp++) {
    const anc = tp < 3 ? M.v8.dblRanges(o, tp) : M.v8.tsRanges(o);
    anc.forEach(r => { for (let k = r.k1; k < r.k2; k++) Object.keys(r.doses).forEach(f => near(M.doseAt(s.fige.tapis[tp], k)[f], r.doses[f])); });
  }
  assert.deepStrictEqual(s.airs, o.airs); assert.deepStrictEqual(s.feeds, o.feeds);
  assert.deepStrictEqual(s.lots.map(l => [l.id, l.name, l.b]), o.lots.map(l => [l.id, l.name, l.b]));
});
t('les données v5 d’origine ne sont pas modifiées', () => {
  const o = v5(), avant = JSON.stringify(o); M.versV6(o); assert.strictEqual(JSON.stringify(o), avant);
});
t('ancienne clé v3 (rt en kg/place) reprise aussi', () => {
  const o = v5(); o.lots.forEach(l => { delete l.r; delete l.pp; }); o.lots[0].rt = { 0: 0.4 };
  const s = M.versV6(o); near(M.voulue(s.lots[0], 0), 524 * 0.4 / 200);
});

console.log('1. Rations voulues → trémies (à régler)');
t('lot seul sur ses tapis : reçoit exactement sa ration voulue', () => {
  const s = v6(); s.airs[3] = { barriers: [], lots: [0] }; s.lots[1].b = 0;
  assert.strictEqual(M.bilan(s, s.lots[0]).niveau, 'ok'); near(M.bilan(s, s.lots[0]).recu, 1.3);
});
t('part par place = b × ration / P (305 g pour 800 g, 200 têtes, 524 places)', () => {
  const s = v6(); assert.strictEqual(g(M.part(s, s.lots[0], 0)), 305);
});
t('plage partagée : une seule dose = somme des 2 parts (« 2 × moyenne »)', () => {
  const s = v6(), pl = M.plages(s)[2];
  assert.deepStrictEqual(pl.map(r => [r.k1, r.k2, r.a, r.b]), [[0, 65, 0, 1], [65, 92, 0, 0]]);
  s.feeds.forEach(f => {
    near(pl[0].d[f.id], M.part(s, s.lots[0], f.id) + M.part(s, s.lots[1], f.id));
    near(pl[1].d[f.id], 2 * M.part(s, s.lots[0], f.id));
  });
});
t('tout ce qui est versé est mangé : Σ reçu = Σ versé = Σ b × ration voulue', () => {
  const s = v6();
  near(kgRecu(s, 0) + kgRecu(s, 1), kgVerse(s)); near(kgVerse(s), 200 * 1.3 + 80 * 1.6);
});
t('plage partagée : chaque rangée reçoit la moitié → Brebis +, Antenaises −', () => {
  const s = v6(), b0 = M.bilan(s, s.lots[0]), b1 = M.bilan(s, s.lots[1]);
  /* attendu calculé à la main : 65 positions partagées sur le tapis 3 */
  const pB = [0, 1].map(f => M.part(s, s.lots[0], f)), pA = [0, 1].map(f => M.part(s, s.lots[1], f));
  const delta = [0, 1].reduce((a, f) => a + 65 * ((pB[f] + pA[f]) / 2 - pB[f]), 0);
  near(b0.kg, 260 + delta, 1e-9); near(b1.kg, 128 - delta, 1e-9);
  assert.strictEqual(b0.sens, '+'); assert.strictEqual(b1.sens, '-');
});
t('à régler : changer l’effectif garde la ration voulue, les doses suivent', () => {
  const s = v6(); s.airs[3] = { barriers: [], lots: [0] };
  M.setEffectif(s.lots[0], 180);
  near(M.bilan(s, s.lots[0]).recu, 1.3); assert.strictEqual(g(M.part(s, s.lots[0], 0)), g(180 * 0.8 / 654));
});

console.log('2. Trémies figées → ration reçue');
t('agnelage : 500 g/place partout → 2620 ; barrière 65→40 → 2870 ; 220 têtes → 2609', () => {
  const s = v6(); M.figer(s); M.doseUnique(s, 0, 0.5); M.doseUnique(s, 1, 0.5);
  assert.strictEqual(g(M.bilan(s, s.lots[0]).recu), 2620);
  s.airs[3].barriers[0] = 40;
  assert.strictEqual(M.lotStats(s, 0).P, 574); assert.strictEqual(g(M.bilan(s, s.lots[0]).recu), 2870);
  M.setEffectif(s.lots[0], 220); assert.strictEqual(g(M.bilan(s, s.lots[0]).recu), 2609);
  const b = M.bilan(s, s.lots[0]); assert.strictEqual(b.places, 574); near(b.kg, 574);
  const d = M.plages(s)[0][0]; near(d.d[0], 1); /* tapis double : 2 × 500 g = 1000 g par position */
});
t('effectif 200 → 180 : kg versés stables, la ration par brebis suit (260 kg ÷ 180)', () => {
  const s = v6(); s.airs[3] = { barriers: [], lots: [0] }; s.lots[1].b = 0; M.figer(s);
  near(kgRecu(s, 0), 260);
  M.setEffectif(s.lots[0], 180);
  near(kgRecu(s, 0), 260); assert.strictEqual(g(M.bilan(s, s.lots[0]).aliments[0].recu), 889);
  assert.strictEqual(M.bilan(s, s.lots[0]).niveau, 'attention'); assert.strictEqual(M.bilan(s, s.lots[0]).sens, '+'); /* +11 % */
});
t('barrière déplacée : chaque place garde sa dose, rien de versé en plus', () => {
  const s = v6(); M.figer(s); const avant = JSON.stringify(M.plan(s)), tot = kgVerse(s);
  s.airs[3].barriers[0] = 40;
  assert.strictEqual(JSON.stringify(M.plan(s)), avant); near(kgRecu(s, 0) + kgRecu(s, 1), tot);
});
t('plages : repère les doses qui diffèrent du calcul d’après les rations', () => {
  const s = v6(); M.figer(s);
  assert.ok(M.plages(s).every(pt => pt.every(r => !r.ecartCalcul)));
  s.airs[3].barriers[0] = 40;
  assert.ok(M.plages(s).some(pt => pt.some(r => r.ecartCalcul)));
});
t('corriger une dose sur une plage figée', () => {
  const s = v6(); M.figer(s); M.setDosePlage(s, 0, 10, 20, 0, 1.2);
  near(M.doseAt(s.fige.tapis[0], 9)[0], 2 * M.part(s, s.lots[0], 0)); near(M.doseAt(s.fige.tapis[0], 10)[0], 1.2); near(M.doseAt(s.fige.tapis[0], 20)[0], M.doseAt(s.fige.tapis[0], 9)[0]);
  assert.strictEqual(s.fige.tapis[0].length, 3);
});
t('recalculer (libérer) : de nouveau d’après les rations voulues', () => {
  const s = v6(); M.figer(s); M.doseUnique(s, 0, 0.5); M.liberer(s);
  assert.strictEqual(s.fige, null); near(M.plages(s)[0][0].d[0], 2 * M.part(s, s.lots[0], 0));
});

console.log('3. Repère (écart à la ration voulue)');
t('vert < 5 %, orange < 15 %, rouge au-delà ; 0 tête = vide', () => {
  const s = v6(); s.airs[3] = { barriers: [], lots: [0] }; M.figer(s);
  const l = s.lots[0];
  M.setEffectif(l, 196); assert.strictEqual(M.bilan(s, l).niveau, 'ok');          /* +2 % */
  M.setEffectif(l, 185); assert.strictEqual(M.bilan(s, l).niveau, 'attention');   /* +8 % */
  M.setEffectif(l, 170); assert.strictEqual(M.bilan(s, l).niveau, 'hors');        /* +18 % */
  M.setEffectif(l, 0); assert.strictEqual(M.bilan(s, l).niveau, 'vide');
});
t('un aliment très à côté suffit à alerter', () => {
  const s = v6(); s.airs[3] = { barriers: [], lots: [0] }; M.figer(s);
  M.doseUnique(s, 0, 0.8 * 200 / 654 * 1.3);   /* céréales +30 % */
  M.doseUnique(s, 1, 0.5 * 200 / 654 * 0.52);  /* maïs −48 % : total presque juste */
  const b = M.bilan(s, s.lots[0]); assert.ok(Math.abs(b.pct) < 5, b.pct); assert.strictEqual(b.niveau, 'hors');
});
t('contrôle : kg ÷ têtes = ration reçue', () => {
  const s = v6(); M.bilans(s).forEach(b => near(b.kg / b.b, b.recu));
});

t('la cause est l’aliment qui fait alerter ; option « seul le total compte »', () => {
  const s = M.versV6(v5());
  const b = M.bilan(s, s.lots[0]);
  assert.strictEqual(b.niveau, 'attention'); assert.strictEqual(b.cause.fid, 1); near(b.cause.pct, 7.8, 0.05);
  s.tol.parAliment = false;
  assert.strictEqual(M.bilan(s, s.lots[0]).niveau, 'ok'); assert.strictEqual(M.bilan(s, s.lots[0]).cause, null);
});
t('marges réglables : 10 / 20 %', () => {
  const s = M.versV6(v5()); s.tol.vert = 10; s.tol.orange = 20;
  assert.deepStrictEqual(M.bilans(s).map(b => b.niveau), ['ok', 'attention']);  /* Antenaises : maïs −13,9 % */
});
t('anciennes données sans l’option : alerte par aliment active', () => {
  const s = M.normalize({ v: 6, lots: [], feeds: [], airs: [{}, {}, {}, {}], tol: { vert: 5, orange: 15 } });
  assert.strictEqual(s.tol.parAliment, true);
});

console.log('Pesée de réglage');
t('410 g/j par position, 2 repas, 10 positions → 2,05 kg ; 102,5 g par place et par repas', () => {
  const s = v6();
  near(M.pesee(s, 0.41), 2.05); near(M.parPlaceRepas(s, 0, 0.41), 0.1025); near(M.depuisPesee(s, 2.05), 0.41);
  near(M.parPlaceRepas(s, 3, 0.41), 0.205);   /* tapis simple : une seule rangée */
  s.distrib = { repas: 3, pesee: 5 }; near(M.pesee(s, 0.6), 1); near(M.depuisPesee(s, 1), 0.6);
});
t('anciennes données : 2 repas et pesée sur 10 positions par défaut', () => {
  const s = M.versV6(v5()); assert.deepStrictEqual(s.distrib, { repas: 2, pesee: 10 });
});

console.log('Plan paramétrable');
/* bergerie « du pote » : tapis simple en haut (mange depuis l'aire du dessous), 5 aires de longueurs différentes,
   4 tapis doubles dont un décalé, 3 places/m */
function geoPote() {
  return { plm: 3, bandes: [
    { id: 's0', type: 'simple', nom: 'Tapis haut', c0: 0, len: 90, h: 0.7, cote: 'bas' },
    { id: 'A', type: 'aire', nom: 'Aire A', c0: 0, len: 120, h: 4 },
    { id: 'd1', type: 'double', nom: 'Double 1', c0: 0, len: 100, h: 0.7 },
    { id: 'B', type: 'aire', nom: 'Aire B', c0: 0, len: 120, h: 4 },
    { id: 'd2', type: 'double', nom: 'Double 2', c0: 0, len: 90, h: 0.7 },
    { id: 'C', type: 'aire', nom: 'Aire C', c0: 0, len: 90, h: 4 },
    { id: 'd3', type: 'double', nom: 'Double 3', c0: 15, len: 60, h: 0.7 },
    { id: 'D', type: 'aire', nom: 'Aire D', c0: 9, len: 75, h: 4 },
    { id: 'd4', type: 'double', nom: 'Double 4', c0: 9, len: 75, h: 0.7 },
    { id: 'E', type: 'aire', nom: 'Aire E', c0: 9, len: 75, h: 4 }
  ] };
}
function etatPote() {
  const s = M.defaultState(); M.setGeo(s, geoPote());
  s.feeds = [{ id: 0, name: 'Céréales' }]; s.nextFeed = 1;
  s.lots = [{ id: 0, b: 300, name: 'Laitières', obj: { 0: 0.8 } }, { id: 1, b: 60, name: 'Agnelles', obj: { 0: 0.6 } }]; s.nextLot = 2;
  s.airs.forEach(a => { a.lots = [0]; });
  s.airs[4] = { barriers: [40], lots: [1, 0] };   /* aire E : Agnelles à gauche (col 9 à 40) */
  return s;
}
t('ta bergerie par défaut : aucune erreur de plan, 654 places, 35 × 22 m', () => {
  const g = M.geoInfo(M.geoDefaut());
  assert.deepStrictEqual(M.verifGeo(M.geoDefaut()), []); near(g.L, 35); near(g.W, 22);
  assert.strictEqual(g.tapis.length, 4); assert.strictEqual(g.aires.length, 4);
});
t('plan du pote : places comptées tapis par tapis', () => {
  const s = etatPote();
  assert.deepStrictEqual(M.verifGeo(s.geo), []);
  /* Laitières : 90 (haut) + 2×100 + 2×90 + 2×60 + 75 (d4 côté D) + d4 côté E de 40 à 84 = 44 */
  assert.strictEqual(M.lotStats(s, 0).P, 90 + 200 + 180 + 120 + 75 + 44);
  assert.strictEqual(M.lotStats(s, 1).P, 31);
  const r = M.recu(s); assert.strictEqual(r[0].places, 709); assert.strictEqual(r[1].places, 31);
});
t('plan du pote : tout est versé et mangé, lot seul = ration voulue exacte', () => {
  const s = etatPote(); let v = 0;
  M.plan(s).forEach(pt => pt.forEach(r => v += r.d[0] * (r.k2 - r.k1)));
  const r = M.recu(s); near(r[0].kg[0] + r[1].kg[0], v); near(v, 300 * 0.8 + 60 * 0.6);
  /* Agnelles face aux Laitières sur le double 4 : chaque place reçoit la moyenne des 2 parts */
  const pA = 60 * 0.6 / 31, pL = 300 * 0.8 / 709;
  near(M.bilan(s, s.lots[1]).recu, (pA + pL) / 2 * 31 / 60, 1e-9);
});
t('plan du pote : tapis décalé, plage partagée, position hors aire', () => {
  const s = etatPote();
  const pl = M.plages(s); assert.strictEqual(pl.length, 5);
  assert.deepStrictEqual(pl[3].map(r => [r.k1, r.k2]), [[0, 60]]);            /* double 3 : 60 places, commence à 5 m */
  assert.strictEqual(M.lotAt(s, 3, 5), null);                                   /* aire D commence à la colonne 9 */
  assert.deepStrictEqual(pl[4].map(r => [r.k1, r.k2, r.a, r.b]), [[0, 31, 0, 1], [31, 75, 0, 0]]);
});
t('plan du pote : figer puis bouger la barrière, chaque place garde sa dose', () => {
  const s = etatPote(); M.figer(s); let v = 0;
  M.plan(s).forEach(pt => pt.forEach(r => v += r.d[0] * (r.k2 - r.k1)));
  const pA = 60 * 0.6 / 31, pL = 300 * 0.8 / 709;
  s.airs[4].barriers[0] = 60; const r = M.recu(s); near(r[0].kg[0] + r[1].kg[0], v);
  /* Agnelles : 31 places à la dose partagée + 20 places gagnées à la dose « Laitières des 2 côtés » */
  near(M.bilan(s, s.lots[1]).kg, 31 * (pA + pL) / 2 + 20 * pL, 1e-9);
});
t('vérification du plan : erreurs claires', () => {
  const g = geoPote(); g.bandes.splice(1, 1);   /* plus d'aire au-dessus du double 1 */
  assert.ok(M.verifGeo(g).some(e => /entre deux aires/.test(e)));
  const g2 = geoPote(); g2.bandes[6].len = 90; assert.ok(M.verifGeo(g2).some(e => /dépasse de Aire D/.test(e)));
  const g3 = geoPote(); g3.bandes[0].cote = 'haut'; assert.ok(M.verifGeo(g3).some(e => /toucher une aire/.test(e)));
  assert.ok(M.verifGeo({ plm: 3, bandes: [] }).length >= 2);
});
t('changer le plan : aires repérées par leur nom interne, barrières hors aire retirées, trémies à régler', () => {
  const s = v6(); M.figer(s);
  const g = M.geoDefaut(); g.bandes.splice(0, 2);        /* on retire l'aire 1 et le tapis 1 */
  g.bandes[0].len = 60;                                   /* aire 2 raccourcie à 20 m : trop court pour son tapis */
  assert.ok(M.setGeo(s, g).length > 0, 'refusé : tapis 2 dépasse');
  g.bandes[0].len = 105;
  const g4 = JSON.parse(JSON.stringify(g)); g4.bandes[4].len = 60;   /* aire 4 raccourcie à 20 m */
  g4.bandes[5].len = 60; g4.bandes[3].len = 60;                       /* tapis simple et tapis 3 aussi */
  assert.deepStrictEqual(M.setGeo(s, g4), []);
  assert.strictEqual(s.airs.length, 3); assert.strictEqual(s.fige, null);
  assert.deepStrictEqual(s.airs[2], { barriers: [], lots: [1] });   /* barrière 65 hors de l'aire : retirée ; il reste la partie gauche, aux Antenaises */
});
t('changer les places par mètre : barrières au même endroit en mètres', () => {
  const s = v6(), g = M.geoDefaut(); g.plm = 2;
  g.bandes.forEach(b => { if (b.len != null) { b.len = Math.round(b.len * 2 / 3); b.c0 = Math.round(b.c0 * 2 / 3); } });
  assert.deepStrictEqual(M.setGeo(s, g), []);
  assert.deepStrictEqual(s.airs[3].barriers, [43]);   /* 65 / 3 m = 21,67 m → 43 places à 2 par mètre */
});
t('import d’un plan invalide refusé', () => {
  const s = etatPote(); s.airs.pop(); assert.strictEqual(M.importJson(JSON.stringify(s)).ok, false);
});

console.log('4. Opérations, import / export');
t('appliquer à tous copie la ration voulue', () => {
  const s = v6(); M.applyToAll(s, s.lots[0]); assert.deepStrictEqual(s.lots[1].obj, s.lots[0].obj);
  s.lots[1].obj[0] = 9; assert.strictEqual(s.lots[0].obj[0], 0.8);
});
t('saisie en kg du lot', () => { const l = { b: 200, obj: {} }; M.setVoulueKg(l, 0, 160); near(l.obj[0], 0.8); });
t('supprimer / ajouter un aliment met à jour rations et trémies figées', () => {
  const s = v6(); M.figer(s); M.deleteFeed(s, 0);
  assert.strictEqual(s.lots[0].obj[0], undefined); assert.ok(s.fige.tapis.every(pt => pt.every(r => !(0 in r.d))));
  const id = M.addFeed(s, 'Foin'); assert.ok(s.fige.tapis.every(pt => pt.every(r => r.d[id] === 0)));
});
t('export → import identique (enveloppe et brut)', () => {
  const s = v6(); M.figer(s, new Date('2026-11-04T07:00:00Z'));
  const a = M.importJson(M.exportJson(s)), b = M.importJson(JSON.stringify(s));
  assert.ok(a.ok && b.ok); assert.deepStrictEqual(a.state, s); assert.deepStrictEqual(b.state, s);
});
t('import d’une ancienne sauvegarde v5 (fichier exporté par l’ancienne appli)', () => {
  const r = M.importJson(JSON.stringify({ app: 'bergerie-lots', v: 5, date: '2026-11-03', state: v5() }));
  assert.ok(r.ok); assert.strictEqual(r.state.v, 6); assert.strictEqual(r.state.lots[0].name, 'Brebis');
});
t('import refuse un fichier étranger', () => {
  assert.strictEqual(M.importJson('{"x":1}').ok, false); assert.strictEqual(M.importJson('pas du json').ok, false);
  const s = v6(); s.airs.pop(); assert.strictEqual(M.importJson(JSON.stringify(s)).ok, false);
});

console.log('\n' + n + ' ok');

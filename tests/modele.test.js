/* Tests du modèle métier seul (Node, sans navigateur) — CLAUDE.md §4 et §6.
   Lancer : node tests/modele.test.js */
'use strict';
const assert = require('assert');
const M = require('../modele.js');
const FIX = require('./fixture-v5.json');
const neuf = () => JSON.parse(JSON.stringify(FIX));
const g = x => Math.round(x * 1000);
let n = 0;
function t(nom, fn) { fn(); n++; console.log('  ok   ' + nom); }
const kgLot = (s, l) => s.feeds.reduce((a, f) => a + M.perPlace(s, l, f.id) * M.lotStats(s, l.id).P, 0);

console.log('Géométrie');
t('654 places au total, 524 / 130', () => {
  const s = neuf();
  assert.strictEqual(M.lotStats(s, 0).P, 524); assert.strictEqual(M.lotStats(s, 1).P, 130);
  const tout = M.defaultState(); assert.strictEqual(M.lotStats(tout, 0).P, 654);
});

console.log('1. Mode g/place');
t('500 g/place → 524 kg, 2620 ; barrière 40 → 2870 ; 220 têtes → 2609', () => {
  const s = neuf(), l = s.lots[0];
  M.setPP(l, 0, 0.5); M.setPP(l, 1, 0.5);
  assert.deepStrictEqual(l.r, {}); assert.ok(Math.abs(kgLot(s, l) - 524) < 1e-9);
  assert.strictEqual(g(M.sumRations(s, l)), 2620);
  s.airs[3].barriers[0] = 40;
  assert.strictEqual(M.lotStats(s, 0).P, 574); assert.strictEqual(g(M.perPlace(s, l, 0)), 500);
  assert.strictEqual(g(M.sumRations(s, l)), 2870);
  M.setB(s, l, 220, {});
  assert.strictEqual(g(M.perPlace(s, l, 1)), 500); assert.strictEqual(g(M.sumRations(s, l)), 2609);
  const c = M.controle(s).find(x => x.id === 0);
  assert.strictEqual(c.pl, 574); assert.ok(Math.abs(c.kg - 574) < 1e-9); assert.strictEqual(c.g, 2609);
});
t('saisir g/brebis ré-ancre (pp supprimé)', () => {
  const s = neuf(), l = s.lots[0];
  M.setFeedVal(l, 0, 0.7); assert.strictEqual(l.pp[0], undefined); assert.strictEqual(l.r[0], 0.7);
});

console.log('2. Mode g/brebis');
t('260 kg stables à 180 têtes, 889 g, 305 g/place ; via 0 → kg retrouvés', () => {
  const s = neuf(), l = s.lots[0]; l.pp = {}; const mem = {};
  assert.ok(Math.abs(kgLot(s, l) - 260) < 1e-9); assert.strictEqual(g(M.perPlace(s, l, 0)), 305);
  M.setB(s, l, 180, mem);
  assert.ok(Math.abs(kgLot(s, l) - 260) < 1e-9); assert.strictEqual(g(M.feedVal(s, l, 0)), 889); assert.strictEqual(g(M.perPlace(s, l, 0)), 305);
  M.setB(s, l, 0, mem); M.setB(s, l, 150, mem);
  assert.ok(Math.abs(kgLot(s, l) - 260) < 1e-9);
});
t('effectif modifié : les pp-ancrés ne bougent pas', () => {
  const s = neuf(), l = s.lots[0];
  M.setB(s, l, 300, {}); assert.strictEqual(l.pp[0], 0.5);
});

console.log('3. Tapis 3 partagé');
t('plage mixte = somme des 2 parts, plage seule = 2 × sa part', () => {
  const s = neuf(), rs = M.dblRanges(s, 2), B = s.lots[0], A = s.lots[1];
  assert.deepStrictEqual(rs.map(r => [r.k1, r.k2, r.a, r.b]), [[0, 65, 0, 1], [65, 92, 0, 0]]);
  s.feeds.forEach(f => {
    assert.ok(Math.abs(rs[0].doses[f.id] - (M.perPlace(s, B, f.id) + M.perPlace(s, A, f.id))) < 1e-12);
    assert.ok(Math.abs(rs[1].doses[f.id] - 2 * M.perPlace(s, B, f.id)) < 1e-12);
  });
});

console.log('4. Contrôle par lot');
t('kg ÷ têtes = ration (±1 g), lots à 0 tête absents', () => {
  const s = neuf();
  s.lots.push({ id: 2, b: 0, name: 'Vides', r: { 0: 1 }, pp: {} }); s.airs[0] = { barriers: [10], lots: [2, 0] };
  const c = M.controle(s);
  assert.deepStrictEqual(c.map(x => x.id), [0, 1]);
  c.forEach(x => {
    const l = M.lotById(s, x.id);
    assert.strictEqual(x.pl, M.lotStats(s, x.id).P);
    assert.ok(Math.abs(x.g - g(M.sumRations(s, l))) <= 1);
  });
});
t('somme des kg contrôlés = somme versée sur les 4 tapis', () => {
  const s = neuf();
  let verse = 0; for (let k = 0; k < 4; k++) M.ranges(s, k).forEach(r => verse += (r.k2 - r.k1) * r.tot);
  const ctrl = M.controle(s).reduce((a, x) => a + x.kg, 0);
  assert.ok(Math.abs(verse - ctrl) < 1e-9);
});

console.log('5. Import / export / migration');
t('export → import identique (enveloppe et brut)', () => {
  const s = neuf();
  const a = M.importJson(M.exportJson(s)), b = M.importJson(JSON.stringify(s));
  assert.ok(a.ok && b.ok); assert.deepStrictEqual(a.state, s); assert.deepStrictEqual(b.state, s);
});
t('import refuse un fichier étranger', () => {
  assert.strictEqual(M.importJson('{"x":1}').ok, false); assert.strictEqual(M.importJson('pas du json').ok, false);
  const s = neuf(); s.airs.pop(); assert.strictEqual(M.importJson(JSON.stringify(s)).ok, false);
});
t('import complète pp / r / b manquants et les compteurs', () => {
  const s = neuf(); delete s.lots[1].pp; delete s.lots[1].b; s.nextLot = 0;
  const r = M.importJson(JSON.stringify(s));
  assert.deepStrictEqual(r.state.lots[1].pp, {}); assert.strictEqual(r.state.lots[1].b, 0); assert.strictEqual(r.state.nextLot, 2);
});
t('migration v3 : r = P × rt / b', () => {
  const s = neuf(); s.lots.forEach(l => { delete l.r; delete l.pp; }); s.lots[0].rt = { 0: 0.4 };
  M.migrateV3(s);
  assert.ok(Math.abs(s.lots[0].r[0] - 524 * 0.4 / 200) < 1e-12); assert.strictEqual(s.lots[0].rt, undefined);
});

console.log('Opérations');
t('appliquer à tous copie r ET pp', () => {
  const s = neuf(); M.applyToAll(s, s.lots[0]);
  assert.deepStrictEqual(s.lots[1].r, s.lots[0].r); assert.deepStrictEqual(s.lots[1].pp, { 0: 0.5 });
  s.lots[1].pp[0] = 9; assert.strictEqual(s.lots[0].pp[0], 0.5);
});
t('supprimer un aliment efface r ET pp', () => {
  const s = neuf(); M.deleteFeed(s, 0);
  assert.deepStrictEqual(s.feeds.map(f => f.id), [1]); assert.strictEqual(s.lots[0].pp[0], undefined); assert.strictEqual(s.lots[0].r[0], undefined);
});

console.log('\n' + n + ' ok');

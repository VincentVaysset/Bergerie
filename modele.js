/* Ma bergerie — modèle métier (calculs purs, sans affichage).
   Référence : index.html v8 (lotStats, perPlace, feedVal, setB, dblRanges, tsRanges).
   Toutes les fonctions prennent l'état `s` en premier argument et ne touchent pas au DOM.
   Unités stockées : r en kg/brebis, pp en kg/place ; un seul des deux par aliment. */
(function (root) {
  'use strict';

  /* ---- géométrie (validée sur le terrain — ne pas modifier) ---- */
  var PL_M = 3, DBL_PL = 92, TS_PL = 102;
  var DBL_X0 = 0, DBL_LEN = DBL_PL / PL_M;   /* doubles : 0 → 30,67 m */
  var TS_LEN = TS_PL / PL_M;                 /* simple : 0 → 34 m */
  var KEY = 'bergerie_lots_v5', KEYOLD = 'bergerie_lots_v3';

  function xOfK(k) { return DBL_X0 + DBL_LEN * k / DBL_PL; }
  function cumT(k) { return Math.round(TS_PL * xOfK(k) / TS_LEN); }
  function ksOf(s, i) { return [0].concat(s.airs[i].barriers, [DBL_PL]); }
  function tsOf(k1, k2, isLast) { return (isLast ? TS_PL : cumT(k2)) - cumT(k1); }

  function segsOf(s, i) {
    var ks = ksOf(s, i), o = [];
    for (var j = 0; j < ks.length - 1; j++) {
      var k1 = ks[j], k2 = ks[j + 1], isLast = j === ks.length - 2, ts = (i === 3) ? tsOf(k1, k2, isLast) : 0;
      var n = k2 - k1;
      o.push({ j: j, k1: k1, k2: k2, isLast: isLast, lot: s.airs[i].lots[j], ts: ts,
        pl: i === 0 ? n : (i === 1 || i === 2 ? 2 * n : n + ts) });
    }
    return o;
  }

  function lotById(s, id) { for (var x = 0; x < s.lots.length; x++) if (s.lots[x].id === id) return s.lots[x]; return null; }

  /* places du lot : aire 1 → tapis 1 ; aires 2-3 → 2 tapis ; aire 4 → tapis 3 + tapis simple */
  function lotStats(s, id) {
    var t = [0, 0, 0, 0], segs = [];
    for (var i = 0; i < 4; i++) segsOf(s, i).forEach(function (sg) {
      if (sg.lot !== id) return;
      var n = sg.k2 - sg.k1;
      if (i === 0) t[0] += n; else if (i === 1) { t[0] += n; t[1] += n; } else if (i === 2) { t[1] += n; t[2] += n; } else { t[2] += n; t[3] += sg.ts; }
      segs.push({ air: i + 1, k1: sg.k1, k2: sg.k2, pl: sg.pl });
    });
    return { t: t, P: t[0] + t[1] + t[2] + t[3], segs: segs };
  }

  /* ---- ancres ---- */
  function ppVal(l, fid) { return (l && l.pp && l.pp[fid] != null) ? l.pp[fid] : null; }
  /* kg par brebis — dérivé de l'ancre par place si présente */
  function feedVal(s, l, fid) {
    var pv = ppVal(l, fid);
    if (pv != null) { var st = lotStats(s, l.id); return (l.b > 0 && st.P > 0) ? pv * st.P / l.b : 0; }
    return (l && l.r && l.r[fid]) || 0;
  }
  function setFeedVal(l, fid, v) { l.r = l.r || {}; l.r[fid] = v; l.pp = l.pp || {}; delete l.pp[fid]; }
  function setPP(l, fid, v) { l.pp = l.pp || {}; l.pp[fid] = v; l.r = l.r || {}; delete l.r[fid]; }

  /* l'effectif varie : kg à verser et doses par place restent, la ration par brebis suit.
     `mem` garde les derniers kg connus par lot (effectif passé par 0 → on les retrouve). */
  var memDefaut = {};
  function setB(s, l, nb, mem) {
    mem = mem || memDefaut;
    nb = Math.max(0, Math.round(nb) || 0);
    var ob = l.b || 0;
    function rOnly(f) { return ppVal(l, f.id) == null; }
    if (ob > 0) { mem[l.id] = {}; s.feeds.forEach(function (f) { if (!rOnly(f)) return; mem[l.id][f.id] = ob * feedVal(s, l, f.id); }); }
    if (nb > 0 && ob <= 0 && mem[l.id]) { s.feeds.forEach(function (f) { if (!rOnly(f)) return; if (mem[l.id][f.id] != null) setFeedVal(l, f.id, mem[l.id][f.id] / nb); }); }
    if (nb > 0 && ob > 0) { s.feeds.forEach(function (f) { if (!rOnly(f)) return; setFeedVal(l, f.id, ob * feedVal(s, l, f.id) / nb); }); }
    l.b = nb;
    return nb;
  }

  function sumRations(s, l) { var t = 0; if (!l) return 0; s.feeds.forEach(function (f) { t += feedVal(s, l, f.id); }); return t; }
  function lotTot(s, l, fid) { return (l.b || 0) * feedVal(s, l, fid); }
  /* kg par place : l'ancre si réglée (indépendante de b et P), sinon b × r / P */
  function perPlace(s, l, fid) {
    var pv = ppVal(l, fid); if (pv != null) return pv;
    if (!l || !(l.b > 0)) return 0;
    var st = lotStats(s, l.id); if (st.P <= 0) return 0;
    return l.b * ((l.r && l.r[fid]) || 0) / st.P;
  }

  /* ---- trémies ---- */
  function lotAt(s, i, k) {
    var ks = ksOf(s, i), ls = s.airs[i].lots;
    for (var j = 0; j < ks.length - 1; j++) if (k >= ks[j] && k < ks[j + 1]) return ls[j];
    return ls[ls.length - 1];
  }
  /* tapis double t entre aires t et t+1 : bornes = union des barrières.
     doses[fid] = somme des parts des 2 côtés (la trémie verse une seule fois au milieu). */
  function dblRanges(s, t) {
    var bs = s.airs[t].barriers.concat(s.airs[t + 1].barriers).filter(function (k) { return k > 0 && k < DBL_PL; });
    bs = bs.filter(function (v, ix) { return bs.indexOf(v) === ix; }).sort(function (a, b) { return a - b; });
    var ks = [0].concat(bs, [DBL_PL]), out = [];
    for (var j = 0; j < ks.length - 1; j++) {
      var k1 = ks[j], k2 = ks[j + 1]; if (k2 <= k1) continue;
      var la = lotAt(s, t, k1), lb = lotAt(s, t + 1, k1), doses = {}, tot = 0;
      s.feeds.forEach(function (f) { var d = perPlace(s, lotById(s, la), f.id) + perPlace(s, lotById(s, lb), f.id); doses[f.id] = d; tot += d; });
      out.push({ k1: k1, k2: k2, a: la, b: lb, doses: doses, tot: tot });
    }
    return out;
  }
  function tsRanges(s) {
    var out = [];
    segsOf(s, 3).forEach(function (sg) {
      var c1 = cumT(sg.k1), c2 = sg.isLast ? TS_PL : cumT(sg.k2);
      if (c2 <= c1) return;
      var doses = {}, tot = 0;
      s.feeds.forEach(function (f) { var d = perPlace(s, lotById(s, sg.lot), f.id); doses[f.id] = d; tot += d; });
      out.push({ k1: c1, k2: c2, a: sg.lot, b: null, doses: doses, tot: tot });
    });
    return out;
  }
  function ranges(s, t) { return t < 3 ? dblRanges(s, t) : tsRanges(s); }

  /* Contrôle par lot : kg réellement versés sur ses places ÷ têtes. Lots à 0 tête exclus. */
  function controle(s) {
    var out = [];
    s.lots.forEach(function (l) {
      if (!(l.b > 0)) return;
      var kg = 0, pl = 0;
      for (var t = 0; t < 4; t++) ranges(s, t).forEach(function (r) {
        var n = r.k2 - r.k1, sides = (r.a === l.id ? 1 : 0) + ((r.b != null && r.b === l.id) ? 1 : 0);
        if (!sides) return;
        s.feeds.forEach(function (f) { kg += n * sides * perPlace(s, l, f.id); });
        pl += n * sides;
      });
      if (pl <= 0) return;
      out.push({ id: l.id, kg: kg, pl: pl, b: l.b, g: Math.round(kg / l.b * 1000) });
    });
    return out;
  }

  /* ---- opérations sur l'état ---- */
  function defaultState() {
    return { nextLot: 1, nextFeed: 1,
      feeds: [{ id: 0, name: 'Aliment' }],
      lots: [{ id: 0, b: 0, r: {}, pp: {}, name: null }],
      airs: [0, 1, 2, 3].map(function () { return { barriers: [], lots: [0] }; }) };
  }
  /* « Appliquer ces rations à tous les lots » : copie r ET pp */
  function applyToAll(s, l) {
    s.lots.forEach(function (x) { if (x.id !== l.id) { x.r = JSON.parse(JSON.stringify(l.r || {})); x.pp = JSON.parse(JSON.stringify(l.pp || {})); } });
  }
  function deleteFeed(s, id) {
    s.feeds = s.feeds.filter(function (x) { return x.id !== id; });
    s.lots.forEach(function (l) { if (l.r) delete l.r[id]; if (l.pp) delete l.pp[id]; });
  }

  /* ---- validation / import / migration ---- */
  function isState(o) { return !!(o && Array.isArray(o.lots) && Array.isArray(o.feeds) && Array.isArray(o.airs) && o.airs.length === 4); }
  /* complète les champs manquants sans rien perdre */
  function normalize(s) {
    var mL = 0, mF = 0;
    s.lots.forEach(function (l) { mL = Math.max(mL, (l.id || 0) + 1); });
    s.feeds.forEach(function (f) { mF = Math.max(mF, (f.id || 0) + 1); });
    s.nextLot = Math.max(s.nextLot || 0, mL);
    s.nextFeed = Math.max(s.nextFeed || 0, mF);
    s.lots.forEach(function (l) { l.b = l.b || 0; l.r = l.r || {}; l.pp = l.pp || {}; });
    return s;
  }
  /* accepte l'enveloppe d'export {app, v, date, state} ou l'état brut */
  function importJson(text) {
    try {
      var o = JSON.parse(text);
      var s = (o && o.state && o.state.lots && o.state.airs && o.state.feeds) ? o.state : ((o && o.lots && o.airs && o.feeds) ? o : null);
      if (!isState(s)) return { ok: false, msg: 'Sauvegarde non reconnue.' };
      normalize(s);
      return { ok: true, msg: 'Import : ' + s.lots.length + ' lot(s), ' + s.feeds.length + ' aliment(s).', state: s };
    } catch (e) { return { ok: false, msg: 'Fichier illisible.' }; }
  }
  function exportJson(s, date) { return JSON.stringify({ app: 'bergerie-lots', v: 5, date: (date || new Date()).toISOString(), state: s }); }
  /* ancienne clé v3/v4 : rt en kg/place → r en kg/brebis (r = P × rt / b) */
  function migrateV3(o) {
    o.lots.forEach(function (l) {
      var nr = {}, P = lotStats(o, l.id).P;
      for (var fid in (l.rt || {})) { var v = +l.rt[fid] || 0; nr[fid] = (l.b > 0 && P > 0) ? P * v / l.b : v; }
      l.r = nr; delete l.rt;
    });
    return o;
  }

  var M = {
    PL_M: PL_M, DBL_PL: DBL_PL, TS_PL: TS_PL, DBL_X0: DBL_X0, DBL_LEN: DBL_LEN, TS_LEN: TS_LEN, KEY: KEY, KEYOLD: KEYOLD,
    xOfK: xOfK, cumT: cumT, ksOf: ksOf, tsOf: tsOf, segsOf: segsOf, lotById: lotById, lotStats: lotStats,
    ppVal: ppVal, feedVal: feedVal, setFeedVal: setFeedVal, setPP: setPP, setB: setB,
    sumRations: sumRations, lotTot: lotTot, perPlace: perPlace,
    lotAt: lotAt, dblRanges: dblRanges, tsRanges: tsRanges, ranges: ranges, controle: controle,
    defaultState: defaultState, applyToAll: applyToAll, deleteFeed: deleteFeed,
    isState: isState, normalize: normalize, importJson: importJson, exportJson: exportJson, migrateV3: migrateV3
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.Bergerie = M;
})(this);

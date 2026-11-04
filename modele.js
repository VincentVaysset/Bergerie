/* Ma bergerie — modèle métier (calculs purs, sans affichage).
   Toutes les fonctions prennent l'état `s` en premier argument et ne touchent pas au DOM.

   Deux sens de travail :
   1. À RÉGLER  (s.fige = null) : Vincent donne la ration voulue par lot (lot.obj, kg/brebis/j).
      Chaque lot a sa part par place = b × obj / P ; une plage de tapis double reçoit la somme des
      parts des 2 côtés (versée en une fois au milieu → « 2 × moyenne »).
   2. FIGÉES    (s.fige = {date, tapis}) : les doses réglées aux trémies sont mémorisées PAR POSITION
      le long de chaque tapis. Barrières et effectifs bougent, les trémies non : chaque lot reçoit
      ce qui est versé devant ses places (confirmé par Vincent le 04/11/2026). Sur un tapis double
      chaque rangée reçoit la moitié de la dose versée à la position.
      Le contrôle compare ce qui est reçu à la ration voulue.

   Unités : obj en kg/brebis/j ; doses d'un plan en kg par position (tapis double : pour les 2 rangées,
   tapis simple : pour la place). Affichage en g. */
(function (root) {
  'use strict';

  /* ---- géométrie ----
     Une bergerie = des bandes parallèles, de haut en bas : aires, tapis doubles, tapis simples, couloirs.
     Unité de longueur : la colonne = une place (1 / plm mètre), comptée depuis le bord gauche du bâtiment.
     Aire     : {type:'aire', c0, len, h}            — de la colonne c0 à c0+len ; barrières en colonnes absolues.
     Double   : {type:'double', c0, len, h}          — len places par côté ; côté A = aire au-dessus, B = aire en dessous.
     Simple   : {type:'simple', c0, len, h, cote}    — une rangée ; mange depuis l'aire 'haut' (au-dessus) ou 'bas'.
     Couloir  : {type:'couloir', h}                  — dessin seulement.
     Par défaut : la bergerie de Vincent (validée sur le terrain, ne pas modifier). */
  var PL_M = 3, DBL_PL = 92, TS_PL = 102;
  var DBL_X0 = 0, DBL_LEN = DBL_PL / PL_M;   /* ancienne géométrie fixe (v8), sert à reprendre les données */
  var TS_LEN = TS_PL / PL_M;
  var KEY = 'bergerie_v6', KEY5 = 'bergerie_lots_v5', KEYOLD = 'bergerie_lots_v3';

  function geoDefaut() {
    return { plm: 3, bandes: [
      { id: 'a1', type: 'aire', nom: 'Aire 1', c0: 0, len: 105, h: 4.3 },
      { id: 't1', type: 'double', nom: 'Tapis double 1', c0: 0, len: 92, h: 0.7 },
      { id: 'a2', type: 'aire', nom: 'Aire 2', c0: 0, len: 105, h: 4.3 },
      { id: 't2', type: 'double', nom: 'Tapis double 2', c0: 0, len: 92, h: 0.7 },
      { id: 'a3', type: 'aire', nom: 'Aire 3', c0: 0, len: 105, h: 4.3 },
      { id: 't3', type: 'double', nom: 'Tapis double 3', c0: 0, len: 92, h: 0.7 },
      { id: 'a4', type: 'aire', nom: 'Aire 4', c0: 0, len: 105, h: 4.3 },
      { id: 'ts', type: 'simple', nom: 'Tapis simple', c0: 0, len: 102, h: 0.7, cote: 'haut' },
      { id: 'co', type: 'couloir', nom: 'Couloir d’alimentation', h: 2 }
    ] };
  }
  /* géométrie dépliée : aires[] et tapis[] (index = ordre de haut en bas), positions y, dimensions */
  var cacheG = { k: null, v: null };
  function geoInfo(geo) {
    var k = JSON.stringify(geo);
    if (cacheG.k === k) return cacheG.v;
    var aires = [], tapis = [], y = 0, bi = {};
    geo.bandes.forEach(function (b, ix) {
      var x = { id: b.id, ix: ix, type: b.type, nom: b.nom, y: y, h: b.h };
      if (b.type === 'aire') { x.c0 = b.c0; x.len = b.len; x.i = aires.length; aires.push(x); }
      else if (b.type === 'double' || b.type === 'simple') { x.c0 = b.c0; x.len = b.len; x.double = b.type === 'double'; x.cote = b.cote || 'haut'; x.t = tapis.length; tapis.push(x); }
      bi[ix] = x; y += b.h;
    });
    /* chaque tapis : aire(s) qui le bordent */
    tapis.forEach(function (tp) {
      var up = bi[tp.ix - 1], dn = bi[tp.ix + 1];
      up = up && up.type === 'aire' ? up.i : null; dn = dn && dn.type === 'aire' ? dn.i : null;
      if (tp.double) { tp.A = up; tp.B = dn; } else { tp.A = tp.cote === 'bas' ? dn : up; tp.B = null; }
    });
    var L = 0;
    geo.bandes.forEach(function (b) { if (b.len != null) L = Math.max(L, (b.c0 + b.len) / geo.plm); });
    /* emprise du bâtiment, bande par bande (en mètres) : une aire = sa longueur ; un tapis = les aires qu'il dessert ;
       un couloir = sa longueur si elle est donnée, sinon celle des bandes voisines. Sert à dessiner les murs. */
    var ext = geo.bandes.map(function (b) { return b.type === 'aire' || (b.type === 'couloir' && b.len != null) ? [b.c0 / geo.plm, (b.c0 + b.len) / geo.plm] : null; });
    tapis.forEach(function (tp) {
      var e = null;
      [tp.A, tp.B].concat(tp.double ? [] : [null]).forEach(function (ai) { if (ai == null) return; var x = ext[aires[ai].ix]; e = e ? [Math.min(e[0], x[0]), Math.max(e[1], x[1])] : x.slice(); });
      ext[tp.ix] = e || [tp.c0 / geo.plm, (tp.c0 + tp.len) / geo.plm];
    });
    geo.bandes.forEach(function (b, ix) {
      if (ext[ix]) return;
      var e = null;
      [ix - 1, ix + 1].forEach(function (j) { var x = ext[j]; if (x) e = e ? [Math.min(e[0], x[0]), Math.max(e[1], x[1])] : x.slice(); });
      ext[ix] = e || [0, L];
    });
    var v = { plm: geo.plm, aires: aires, tapis: tapis, W: y, L: L, emprise: ext };
    cacheG = { k: k, v: v };
    return v;
  }
  function G(s) { return geoInfo((s && s.geo) || geoDefaut()); }
  function nbTapis(s) { return G(s).tapis.length; }
  function nbPos(s, t) { return G(s).tapis[t].len; }
  function estDouble(s, t) { return G(s).tapis[t].double; }
  function plm(s) { return G(s).plm; }

  /* défauts de cohérence de la géométrie : [] si tout va bien */
  function verifGeo(geo) {
    var e = [];
    if (!geo || !Array.isArray(geo.bandes)) return ['Plan illisible.'];
    if (!(geo.plm >= 1 && geo.plm <= 10)) e.push('Places par mètre : entre 1 et 10.');
    var g = geoInfo(geo);
    if (!g.aires.length) e.push('Il faut au moins une aire.');
    if (!g.tapis.length) e.push('Il faut au moins un tapis.');
    geo.bandes.forEach(function (b) {
      if (!(b.h > 0)) e.push((b.nom || b.type) + ' : largeur à saisir.');
      if (b.len != null && !(b.len >= 1)) e.push((b.nom || b.type) + ' : longueur à saisir.');
      if (b.c0 != null && !(b.c0 >= 0)) e.push((b.nom || b.type) + ' : début à 0 m ou plus.');
    });
    g.tapis.forEach(function (tp) {
      var nm = tp.nom || 'Tapis';
      if (tp.double && (tp.A == null || tp.B == null)) e.push(nm + ' : un tapis double doit être entre deux aires.');
      if (!tp.double && tp.A == null) e.push(nm + ' : il doit toucher une aire du côté choisi.');
      [tp.A, tp.B].forEach(function (ai) {
        if (ai == null) return;
        var a = g.aires[ai];
        if (tp.c0 < a.c0 || tp.c0 + tp.len > a.c0 + a.len) e.push(nm + ' : il dépasse de ' + (a.nom || 'son aire') + '.');
      });
    });
    return e;
  }

  function xOfK(k) { return k / PL_M; }                 /* v8 : colonne → mètres (3 places/m) */
  function cumT(k) { return Math.round(TS_PL * xOfK(k) / TS_LEN); }
  function ksOf(s, i) { var a = G(s).aires[i]; return [a.c0].concat(s.airs[i].barriers, [a.c0 + a.len]); }
  function recouvre(a1, a2, b1, b2) { return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)); }

  /* morceaux de l'aire i : {j, k1, k2, isLast, lot, pl (places à table)} */
  function segsOf(s, i) {
    var g = G(s), ks = ksOf(s, i), o = [];
    for (var j = 0; j < ks.length - 1; j++) {
      var k1 = ks[j], k2 = ks[j + 1], pl = 0;
      g.tapis.forEach(function (tp) {
        var n = (tp.A === i ? 1 : 0) + (tp.B === i ? 1 : 0);
        if (n) pl += n * recouvre(k1, k2, tp.c0, tp.c0 + tp.len);
      });
      o.push({ j: j, k1: k1, k2: k2, isLast: j === ks.length - 2, lot: s.airs[i].lots[j], pl: pl });
    }
    return o;
  }
  function lotById(s, id) { for (var x = 0; x < s.lots.length; x++) if (s.lots[x].id === id) return s.lots[x]; return null; }

  /* places du lot : t[tapis] = places à table sur chaque tapis, P = total */
  function lotStats(s, id) {
    var g = G(s), t = g.tapis.map(function () { return 0; }), segs = [];
    g.aires.forEach(function (a, i) {
      segsOf(s, i).forEach(function (sg) {
        if (sg.lot !== id) return;
        g.tapis.forEach(function (tp, ti) {
          var n = (tp.A === i ? 1 : 0) + (tp.B === i ? 1 : 0);
          if (n) t[ti] += n * recouvre(sg.k1, sg.k2, tp.c0, tp.c0 + tp.len);
        });
        segs.push({ air: i + 1, k1: sg.k1, k2: sg.k2, pl: sg.pl });
      });
    });
    return { t: t, P: t.reduce(function (a, b) { return a + b; }, 0), segs: segs };
  }
  /* lot de l'aire i à la colonne k (null hors de l'aire) */
  function lotAt(s, i, k) {
    var ks = ksOf(s, i), ls = s.airs[i].lots;
    if (k < ks[0] || k >= ks[ks.length - 1]) return null;
    for (var j = 0; j < ks.length - 1; j++) if (k >= ks[j] && k < ks[j + 1]) return ls[j];
    return null;
  }
  /* lots des côtés à la position k (locale) du tapis t ; b = null pour un tapis simple */
  function cotes(s, t, k) {
    var tp = G(s).tapis[t], col = tp.c0 + k;
    return { a: tp.A == null ? null : lotAt(s, tp.A, col), b: tp.double ? lotAt(s, tp.B, col) : null };
  }

  /* ---- 1. rations voulues → plan des trémies ---- */
  function voulue(l, fid) { return (l && l.obj && l.obj[fid]) || 0; }              /* kg/brebis/j */
  function voulueTot(s, l) { var t = 0; s.feeds.forEach(function (f) { t += voulue(l, f.id); }); return t; }
  /* part voulue par place (une rangée) : b × obj / P */
  function part(s, l, fid) {
    if (!l || !(l.b > 0)) return 0;
    var P = lotStats(s, l.id).P; if (P <= 0) return 0;
    return l.b * voulue(l, fid) / P;
  }
  /* bornes d'un tapis : union des barrières des aires qui le bordent */
  function bornes(s, t) {
    var tp = G(s).tapis[t], bs = [];
    [tp.A, tp.B].forEach(function (ai) { if (ai != null) s.airs[ai].barriers.forEach(function (k) { bs.push(k - tp.c0); }); });
    bs = bs.filter(function (k) { return k > 0 && k < tp.len; });
    return bs.filter(function (v, ix) { return bs.indexOf(v) === ix; }).sort(function (a, b) { return a - b; });
  }
  /* plan calculé : [tapis][plage] = {k1, k2, d:{fid: kg par position}} */
  function planVoulu(s) {
    var out = [];
    for (var t = 0; t < nbTapis(s); t++) {
      var ks = [0].concat(bornes(s, t), [nbPos(s, t)]), rs = [];
      for (var j = 0; j < ks.length - 1; j++) {
        var k1 = ks[j], k2 = ks[j + 1]; if (k2 <= k1) continue;
        var c = cotes(s, t, k1), la = lotById(s, c.a), lb = c.b == null ? null : lotById(s, c.b), d = {};
        s.feeds.forEach(function (f) { d[f.id] = part(s, la, f.id) + (lb ? part(s, lb, f.id) : 0); });
        rs.push({ k1: k1, k2: k2, d: d });
      }
      out.push(fusion(rs));
    }
    return out;
  }
  function memesDoses(a, b) {
    var ks = Object.keys(a).concat(Object.keys(b));
    for (var i = 0; i < ks.length; i++) if (Math.abs((a[ks[i]] || 0) - (b[ks[i]] || 0)) > 1e-12) return false;
    return true;
  }
  /* fusionne les plages voisines de même dose */
  function fusion(rs) {
    var o = [];
    rs.forEach(function (r) {
      var p = o[o.length - 1];
      if (p && p.k2 === r.k1 && memesDoses(p.d, r.d)) p.k2 = r.k2;
      else o.push({ k1: r.k1, k2: r.k2, d: JSON.parse(JSON.stringify(r.d)) });
    });
    return o;
  }
  function plan(s) { return s.fige ? s.fige.tapis : planVoulu(s); }
  function doseAt(pt, k) { for (var j = 0; j < pt.length; j++) if (k >= pt[j].k1 && k < pt[j].k2) return pt[j].d; return {}; }

  /* plages à afficher aux trémies : le plan, redécoupé là où les lots changent.
     a, b = lots face à face ; d = dose par position ;
     ecartCalcul = (trémies figées) la dose diffère de ce que donneraient les rations voulues aujourd'hui. */
  function plages(s) {
    var p = plan(s), pv = s.fige ? planVoulu(s) : p, out = [];
    for (var t = 0; t < nbTapis(s); t++) {
      var cut = bornes(s, t).concat(p[t].map(function (r) { return r.k1; }));
      var ks = [0].concat(cut.filter(function (v, ix) { return v > 0 && v < nbPos(s, t) && cut.indexOf(v) === ix; }).sort(function (a, b) { return a - b; }), [nbPos(s, t)]), rs = [];
      for (var j = 0; j < ks.length - 1; j++) {
        var k1 = ks[j], k2 = ks[j + 1]; if (k2 <= k1) continue;
        var c = cotes(s, t, k1), d = doseAt(p[t], k1);
        var last = rs[rs.length - 1];
        if (last && last.a === c.a && last.b === c.b && memesDoses(last.d, d)) { last.k2 = k2; continue; }
        rs.push({ k1: k1, k2: k2, a: c.a, b: c.b, d: d });
      }
      rs.forEach(function (r) { r.ecartCalcul = !memesDoses(r.d, doseAt(pv[t], r.k1)); });
      out.push(rs);
    }
    return out;
  }

  /* ---- 2. plan → ce que reçoit chaque lot (la physique) ---- */
  /* {lotId: {kg:{fid}, places}} ; tapis double : chaque rangée reçoit la moitié de la dose versée */
  function recu(s) {
    var p = plan(s), o = {};
    s.lots.forEach(function (l) { o[l.id] = { kg: {}, places: 0 }; s.feeds.forEach(function (f) { o[l.id].kg[f.id] = 0; }); });
    function ajoute(id, d, fr) {
      var x = o[id]; if (!x) return;
      x.places++;
      s.feeds.forEach(function (f) { x.kg[f.id] += (d[f.id] || 0) * fr; });
    }
    for (var t = 0; t < nbTapis(s); t++) for (var k = 0; k < nbPos(s, t); k++) {
      var c = cotes(s, t, k), d = doseAt(p[t], k);
      if (estDouble(s, t)) { ajoute(c.a, d, 0.5); ajoute(c.b, d, 0.5); } else ajoute(c.a, d, 1);
    }
    return o;
  }

  /* bilan d'un lot : reçu vs voulu. niveau : ok | attention | hors | vide ; sens : + (trop) / - (pas assez) */
  function bilan(s, l, rc) {
    rc = rc || recu(s);
    var x = rc[l.id] || { kg: {}, places: 0 }, kg = 0, parAliment = {};
    s.feeds.forEach(function (f) {
      var k = x.kg[f.id] || 0; kg += k;
      parAliment[f.id] = { recu: l.b > 0 ? k / l.b : 0, voulu: voulue(l, f.id), kg: k };
    });
    var vou = voulueTot(s, l), rec = l.b > 0 ? kg / l.b : 0;
    var tol = s.tol || { vert: 5, orange: 15 }, pct = null, niv;
    if (!(l.b > 0) || x.places === 0) niv = 'vide';
    else if (vou <= 0) { niv = rec > 0 ? 'hors' : 'vide'; }
    else {
      pct = (rec - vou) / vou * 100;
      var a = Math.abs(pct);
      niv = a < tol.vert ? 'ok' : (a < tol.orange ? 'attention' : 'hors');
    }
    /* option (par défaut oui) : un aliment très à côté suffit à alerter, même si le total tombe juste.
       cause = l'aliment qui fait monter l'alerte au-dessus de ce que donne le total. */
    var ordre = { vide: 0, ok: 1, attention: 2, hors: 3 }, cause = null;
    if (tol.parAliment !== false && (niv === 'ok' || niv === 'attention')) s.feeds.forEach(function (f) {
      var pa = parAliment[f.id]; if (!(pa.voulu > 0)) return;
      var e = (pa.recu - pa.voulu) / pa.voulu * 100, a = Math.abs(e);
      var n = a >= tol.orange ? 'hors' : (a >= tol.vert ? 'attention' : 'ok');
      if (ordre[n] > ordre[niv] || (cause && n === niv && a > Math.abs(cause.pct))) { niv = n; cause = { fid: f.id, pct: e }; }
    });
    return { id: l.id, b: l.b || 0, places: x.places, kg: kg, recu: rec, voulu: vou, pct: pct, niveau: niv, cause: cause,
      sens: pct == null ? '' : (pct > 0 ? '+' : (pct < 0 ? '-' : '')), aliments: parAliment };
  }
  function bilans(s) { var rc = recu(s); return s.lots.map(function (l) { return bilan(s, l, rc); }); }

  /* ---- distribution : repas par jour et pesée de réglage ----
     d = dose du jour par position (tapis double : pour les 2 rangées ; tapis simple : pour la place).
     Pesée : ce qui tombe sur N positions en UN repas = N × d / repas (Vincent pèse sur 10 positions).
     Par place et par repas : tapis double d / 2 / repas, tapis simple d / repas. */
  function repas(s) { return (s.distrib && s.distrib.repas > 0) ? s.distrib.repas : 2; }
  function nPesee(s) { return (s.distrib && s.distrib.pesee > 0) ? s.distrib.pesee : 10; }
  function pesee(s, d) { return nPesee(s) * d / repas(s); }
  function depuisPesee(s, kg) { return kg * repas(s) / nPesee(s); }
  function parPlaceRepas(s, t, d) { return d / (estDouble(s, t) ? 2 : 1) / repas(s); }

  /* ---- opérations ---- */
  function setEffectif(l, nb) { l.b = Math.max(0, Math.round(nb) || 0); return l.b; }
  function setVoulue(l, fid, kg) { l.obj = l.obj || {}; l.obj[fid] = Math.max(0, kg || 0); }
  /* saisie en kg du lot : ration voulue = kg ÷ têtes */
  function setVoulueKg(l, fid, kgLot) { if (l.b > 0) setVoulue(l, fid, kgLot / l.b); }
  function applyToAll(s, l) { s.lots.forEach(function (x) { if (x.id !== l.id) x.obj = JSON.parse(JSON.stringify(l.obj || {})); }); }
  /* figer : les doses calculées deviennent les réglages des trémies */
  function figer(s, date) { s.fige = { date: (date || new Date()).toISOString(), tapis: planVoulu(s) }; return s.fige; }
  function liberer(s) { s.fige = null; }
  /* corriger une dose figée sur une plage [k1, k2) du tapis t (kg par position) */
  function setDosePlage(s, t, k1, k2, fid, kg) {
    if (!s.fige) figer(s);
    var rs = [], pt = s.fige.tapis[t];
    pt.forEach(function (r) {
      [[r.k1, Math.min(r.k2, k1)], [Math.max(r.k1, k1), Math.min(r.k2, k2)], [Math.max(r.k1, k2), r.k2]].forEach(function (iv, ix) {
        if (iv[1] <= iv[0]) return;
        var d = JSON.parse(JSON.stringify(r.d)); if (ix === 1) d[fid] = Math.max(0, kg);
        rs.push({ k1: iv[0], k2: iv[1], d: d });
      });
    });
    s.fige.tapis[t] = fusion(rs);
  }
  /* même dose partout pour un aliment (kg par place et par rangée) — « 500 g à tout le monde » */
  function doseUnique(s, fid, kgPlace) {
    if (!s.fige) figer(s);
    for (var t = 0; t < nbTapis(s); t++) { s.fige.tapis[t].forEach(function (r) { r.d[fid] = (estDouble(s, t) ? 2 : 1) * Math.max(0, kgPlace); }); s.fige.tapis[t] = fusion(s.fige.tapis[t]); }
  }
  function deleteFeed(s, id) {
    s.feeds = s.feeds.filter(function (x) { return x.id !== id; });
    s.lots.forEach(function (l) { if (l.obj) delete l.obj[id]; });
    if (s.fige) s.fige.tapis.forEach(function (pt, t) { pt.forEach(function (r) { delete r.d[id]; }); s.fige.tapis[t] = fusion(pt); });
  }
  function addFeed(s, name) {
    var id = s.nextFeed++; s.feeds.push({ id: id, name: name });
    if (s.fige) s.fige.tapis.forEach(function (pt) { pt.forEach(function (r) { r.d[id] = 0; }); });
    return id;
  }
  function defaultState() {
    return { v: 6, nextLot: 1, nextFeed: 1, pref: 'per', tol: { vert: 5, orange: 15, parAliment: true }, distrib: { repas: 2, pesee: 10 }, fige: null,
      feeds: [{ id: 0, name: 'Aliment' }],
      lots: [{ id: 0, b: 0, obj: {}, name: null }],
      geo: geoDefaut(),
      airs: [0, 1, 2, 3].map(function () { return { barriers: [], lots: [0] }; }) };
  }
  /* changer le plan de la bergerie : les aires gardent leurs lots et barrières (repérées par leur id),
     les barrières hors de l'aire sont retirées ; trémies figées → à régler de nouveau (le plan a changé). */
  function setGeo(s, geo) {
    var e = verifGeo(geo); if (e.length) return e;
    var old = G(s), nw = geoInfo(geo), def = s.lots.length ? s.lots[0].id : 0, airs = [];
    nw.aires.forEach(function (a) {
      var oi = -1; old.aires.forEach(function (o, ix) { if (o.id === a.id) oi = ix; });
      var src = oi >= 0 ? s.airs[oi] : { barriers: [], lots: [def] };
      var bs = [], ls = [src.lots[0]];
      var f = nw.plm / old.plm;   /* places par mètre changées : la barrière reste au même endroit en mètres */
      src.barriers.forEach(function (k0, p) { var k = Math.round(k0 * f); if (k > a.c0 && k < a.c0 + a.len && bs.indexOf(k) < 0) { bs.push(k); ls.push(src.lots[p + 1]); } });
      airs.push({ barriers: bs, lots: ls });
    });
    s.geo = JSON.parse(JSON.stringify(geo)); s.airs = airs;
    if (s.fige) s.fige = null;
    return [];
  }

  /* ---- ancienne version (v8, données bergerie_lots_v5) : sert à reprendre les données ---- */
  var v8 = (function () {
    function ppVal(l, fid) { return (l && l.pp && l.pp[fid] != null) ? l.pp[fid] : null; }
    function feedVal(s, l, fid) {
      var pv = ppVal(l, fid);
      if (pv != null) { var st = lotStats(s, l.id); return (l.b > 0 && st.P > 0) ? pv * st.P / l.b : 0; }
      return (l && l.r && l.r[fid]) || 0;
    }
    function perPlace(s, l, fid) {
      var pv = ppVal(l, fid); if (pv != null) return pv;
      if (!l || !(l.b > 0)) return 0;
      var st = lotStats(s, l.id); if (st.P <= 0) return 0;
      return l.b * ((l.r && l.r[fid]) || 0) / st.P;
    }
    function setFeedVal(l, fid, v) { l.r = l.r || {}; l.r[fid] = v; l.pp = l.pp || {}; delete l.pp[fid]; }
    function setPP(l, fid, v) { l.pp = l.pp || {}; l.pp[fid] = v; l.r = l.r || {}; delete l.r[fid]; }
    function setB(s, l, nb, mem) {
      mem = mem || {};
      nb = Math.max(0, Math.round(nb) || 0);
      var ob = l.b || 0;
      function rOnly(f) { return ppVal(l, f.id) == null; }
      if (ob > 0) { mem[l.id] = {}; s.feeds.forEach(function (f) { if (!rOnly(f)) return; mem[l.id][f.id] = ob * feedVal(s, l, f.id); }); }
      if (nb > 0 && ob <= 0 && mem[l.id]) { s.feeds.forEach(function (f) { if (!rOnly(f)) return; if (mem[l.id][f.id] != null) setFeedVal(l, f.id, mem[l.id][f.id] / nb); }); }
      if (nb > 0 && ob > 0) { s.feeds.forEach(function (f) { if (!rOnly(f)) return; setFeedVal(l, f.id, ob * feedVal(s, l, f.id) / nb); }); }
      l.b = nb; return nb;
    }
    function sumRations(s, l) { var t = 0; s.feeds.forEach(function (f) { t += feedVal(s, l, f.id); }); return t; }
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
    function controle(s) {
      var out = [];
      s.lots.forEach(function (l) {
        if (!(l.b > 0)) return;
        var kg = 0, pl = 0;
        for (var t = 0; t < 4; t++) (t < 3 ? dblRanges(s, t) : tsRanges(s)).forEach(function (r) {
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
    /* ancienne clé v3 : rt en kg/place → r en kg/brebis */
    function migrateV3(o) {
      o.lots.forEach(function (l) {
        var nr = {}, P = lotStats(o, l.id).P;
        for (var fid in (l.rt || {})) { var v = +l.rt[fid] || 0; nr[fid] = (l.b > 0 && P > 0) ? P * v / l.b : v; }
        l.r = nr; delete l.rt;
      });
      return o;
    }
    return { ppVal: ppVal, feedVal: feedVal, perPlace: perPlace, setFeedVal: setFeedVal, setPP: setPP, setB: setB,
      sumRations: sumRations, dblRanges: dblRanges, tsRanges: tsRanges, controle: controle, migrateV3: migrateV3 };
  })();

  /* v5 → v6 : la ration voulue = la ration par brebis de l'ancienne appli ;
     les trémies sont figées sur les doses que l'ancienne appli affichait (ce qui est réglé aujourd'hui). */
  function migrateV5(o, date) {
    var s = JSON.parse(JSON.stringify(o));
    s.lots.forEach(function (l) { l.b = l.b || 0; l.r = l.r || {}; l.pp = l.pp || {}; });
    var tapis = [];
    for (var t = 0; t < 4; t++) tapis.push(fusion((t < 3 ? v8.dblRanges(s, t) : v8.tsRanges(s)).map(function (r) { return { k1: r.k1, k2: r.k2, d: r.doses }; })));
    var lots = s.lots.map(function (l) {
      var obj = {}; s.feeds.forEach(function (f) { obj[f.id] = v8.feedVal(s, l, f.id); });
      return { id: l.id, name: l.name == null ? null : l.name, b: l.b, obj: obj };
    });
    var n = { v: 6, nextLot: s.nextLot, nextFeed: s.nextFeed, pref: s.pref === 'kg' ? 'kg' : 'per', tol: { vert: 5, orange: 15, parAliment: true },
      feeds: s.feeds, lots: lots, airs: s.airs,
      fige: { date: (date || new Date()).toISOString(), tapis: tapis, repris: true } };
    return normalize(n);
  }

  /* ---- validation / import / export ---- */
  function formeOk(o) {
    if (!(o && Array.isArray(o.lots) && Array.isArray(o.feeds) && Array.isArray(o.airs))) return false;
    if (o.geo) return verifGeo(o.geo).length === 0 && o.airs.length === geoInfo(o.geo).aires.length;
    return o.airs.length === 4;
  }
  function isState(o) { return formeOk(o) && o.v === 6; }
  function normalize(s) {
    var mL = 0, mF = 0;
    s.v = 6;
    s.lots.forEach(function (l) { mL = Math.max(mL, (l.id || 0) + 1); l.b = l.b || 0; l.obj = l.obj || {}; if (l.name === undefined) l.name = null; });
    s.feeds.forEach(function (f) { mF = Math.max(mF, (f.id || 0) + 1); });
    s.nextLot = Math.max(s.nextLot || 0, mL);
    s.nextFeed = Math.max(s.nextFeed || 0, mF);
    s.pref = s.pref === 'kg' ? 'kg' : 'per';
    s.tol = s.tol || { vert: 5, orange: 15 };
    if (s.tol.parAliment === undefined) s.tol.parAliment = true;
    s.distrib = s.distrib || { repas: 2, pesee: 10 };
    s.geo = s.geo || geoDefaut();
    if (s.fige === undefined) s.fige = null;
    return s;
  }
  /* n'importe quelle donnée connue → état v6 (ou null) : enveloppe d'export, v6, v5, v3 */
  function versV6(o, date) {
    if (o && o.state && formeOk(o.state)) o = o.state;
    if (!formeOk(o)) return null;
    if (o.v === 6) return normalize(JSON.parse(JSON.stringify(o)));
    var c = JSON.parse(JSON.stringify(o));
    if (c.lots.some(function (l) { return l.rt; })) v8.migrateV3(c);
    return migrateV5(c, date);
  }
  function importJson(text) {
    try {
      var o = JSON.parse(text), s = versV6(o);
      if (!s) return { ok: false, msg: 'Sauvegarde non reconnue.' };
      return { ok: true, msg: 'Import : ' + s.lots.length + ' lot(s), ' + s.feeds.length + ' aliment(s).', state: s };
    } catch (e) { return { ok: false, msg: 'Fichier illisible.' }; }
  }
  function exportJson(s, date) { return JSON.stringify({ app: 'bergerie-lots', v: 6, date: (date || new Date()).toISOString(), state: s }); }

  var M = {
    PL_M: PL_M, DBL_PL: DBL_PL, TS_PL: TS_PL,
    geoDefaut: geoDefaut, geoInfo: geoInfo, G: G, nbTapis: nbTapis, nbPos: nbPos, estDouble: estDouble, plm: plm, verifGeo: verifGeo, setGeo: setGeo,
    KEY: KEY, KEY5: KEY5, KEYOLD: KEYOLD,
    xOfK: xOfK, cumT: cumT, ksOf: ksOf, segsOf: segsOf, lotById: lotById, lotStats: lotStats,
    lotAt: lotAt, cotes: cotes,
    voulue: voulue, voulueTot: voulueTot, part: part, bornes: bornes, planVoulu: planVoulu, plan: plan, doseAt: doseAt,
    plages: plages, recu: recu, bilan: bilan, bilans: bilans,
    setEffectif: setEffectif, setVoulue: setVoulue, setVoulueKg: setVoulueKg, applyToAll: applyToAll,
    repas: repas, nPesee: nPesee, pesee: pesee, depuisPesee: depuisPesee, parPlaceRepas: parPlaceRepas,
    figer: figer, liberer: liberer, setDosePlage: setDosePlage, doseUnique: doseUnique,
    deleteFeed: deleteFeed, addFeed: addFeed, defaultState: defaultState,
    v8: v8, migrateV5: migrateV5, formeOk: formeOk, isState: isState, normalize: normalize, versV6: versV6,
    importJson: importJson, exportJson: exportJson
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.Bergerie = M;
})(this);

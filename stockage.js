/* Ma bergerie — stockage local sans perte.
   1. localStorage (clé bergerie_lots_v5, inchangée) : source principale, lecture synchrone au démarrage,
      chaque écriture est relue pour vérification.
   2. IndexedDB (base « bergerie ») : miroir de l'état courant + une copie par jour (7 derniers jours)
      + une copie avant chaque remise à zéro / import. Sert de secours si localStorage est vidé ou abîmé.
   3. navigator.storage.persist() : demande au navigateur de ne pas effacer les données.
   Rien ne quitte l'appareil. */
(function (root) {
  'use strict';
  var M = root.Bergerie;
  var DB = 'bergerie', STORE = 'etats', JOURS = 7;
  var dbp = null, timer = null, enAttente = null;

  function ouvrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('IndexedDB absent'));
      var rq = root.indexedDB.open(DB, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out;
        out = fn(st);
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function idbGet(k) { return tx('readonly', function (st) { return st.get(k); }); }
  function idbPut(k, v) { return tx('readwrite', function (st) { st.put(v, k); }); }
  function idbKeys() { return tx('readonly', function (st) { return st.getAllKeys(); }); }
  function idbDel(k) { return tx('readwrite', function (st) { st.delete(k); }); }

  function jour(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ---- lecture au démarrage (synchrone) ---- */
  function charger() {
    try { var s = JSON.parse(root.localStorage.getItem(M.KEY)); if (M.isState(s)) return { state: s, source: 'v5' }; } catch (e) {}
    try {
      var o = JSON.parse(root.localStorage.getItem(M.KEYOLD));
      if (M.isState(o)) return { state: M.migrateV3(o), source: 'v3' };
    } catch (e) {}
    return { state: null, source: null };
  }

  /* ---- écriture ---- */
  var ko = false;
  function ecrireLocal(txt) {
    try { root.localStorage.setItem(M.KEY, txt); ko = root.localStorage.getItem(M.KEY) !== txt; }
    catch (e) { ko = true; }
    return !ko;
  }
  /* miroir IndexedDB différé (regroupe les frappes rapides) */
  function miroir(txt) {
    var d = jour();
    return idbPut('courant', txt)
      .then(function () { return idbPut('jour:' + d, txt); })
      .then(nettoyer)
      .catch(function () {});
  }
  function nettoyer() {
    return idbKeys().then(function (ks) {
      var js = ks.filter(function (k) { return /^jour:/.test(k); }).sort();
      var av = ks.filter(function (k) { return /^avant:/.test(k); }).sort();
      var p = [];
      js.slice(0, Math.max(0, js.length - JOURS)).forEach(function (k) { p.push(idbDel(k)); });
      av.slice(0, Math.max(0, av.length - 5)).forEach(function (k) { p.push(idbDel(k)); });
      return Promise.all(p);
    });
  }
  function enregistrer(s) {
    var txt = JSON.stringify(s), ok = ecrireLocal(txt);
    enAttente = txt;
    if (timer) clearTimeout(timer);
    timer = setTimeout(vider, 400);
    return ok;
  }
  function vider() {
    if (timer) { clearTimeout(timer); timer = null; }
    var txt = enAttente; enAttente = null;
    return txt ? miroir(txt) : Promise.resolve();
  }
  /* copie de sécurité nommée, avant une action qui écrase tout */
  function copieAvant(s, motif) {
    return idbPut('avant:' + new Date().toISOString() + '|' + motif, JSON.stringify(s)).then(nettoyer).catch(function () {});
  }

  /* ---- secours : si localStorage est vide ou abîmé, reprendre le miroir ---- */
  function secours() {
    return idbGet('courant').then(function (txt) {
      if (!txt) return null;
      var s = JSON.parse(txt);
      return M.isState(s) ? M.normalize(s) : null;
    }).catch(function () { return null; });
  }

  /* liste des copies : [{cle, libelle, lots, date}] — la plus récente d'abord */
  function copies() {
    return idbKeys().then(function (ks) {
      /* la copie du jour = l'état en cours : on ne la propose pas */
      ks = ks.filter(function (k) { return k !== 'courant' && k !== 'jour:' + jour(); });
      return Promise.all(ks.map(function (k) { return idbGet(k).then(function (txt) { return { cle: k, txt: txt }; }); }));
    }).then(function (xs) {
      return xs.map(function (x) {
        var s = null; try { s = JSON.parse(x.txt); } catch (e) {}
        var m = /^jour:(.*)$/.exec(x.cle), a = /^avant:([^|]+)\|(.*)$/.exec(x.cle);
        var tri = m ? m[1] + 'T23:59' : (a ? a[1] : '');
        var dt = a ? new Date(a[1]) : null;
        var lib = m ? 'Fin de journée du ' + m[1].split('-').reverse().join('/')
          : (a ? 'Avant ' + a[2].replace(/-/g, ' ') + ' (' + jour(dt).split('-').reverse().join('/') + ' ' + ('0' + dt.getHours()).slice(-2) + 'h' + ('0' + dt.getMinutes()).slice(-2) + ')' : x.cle);
        return { cle: x.cle, libelle: lib, tri: tri, lots: s && s.lots ? s.lots.length : 0, ok: M.isState(s) };
      }).filter(function (c) { return c.ok; }).sort(function (a, b) { return a.tri < b.tri ? 1 : -1; });
    }).catch(function () { return []; });
  }
  function lireCopie(cle) {
    return idbGet(cle).then(function (txt) { var s = JSON.parse(txt); return M.isState(s) ? M.normalize(s) : null; }).catch(function () { return null; });
  }

  function persister() {
    try { if (root.navigator && navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; }); } catch (e) {}
    return Promise.resolve(false);
  }

  /* écrit le miroir avant que l'appli passe en arrière-plan */
  if (root.addEventListener) {
    root.addEventListener('pagehide', function () { vider(); });
    if (root.document) root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'hidden') vider(); });
  }

  root.Stockage = {
    charger: charger, enregistrer: enregistrer, vider: vider, copieAvant: copieAvant,
    secours: secours, copies: copies, lireCopie: lireCopie, persister: persister,
    estKo: function () { return ko; }
  };
})(this);

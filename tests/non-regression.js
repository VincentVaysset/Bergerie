/* Tests de non-régression « Ma bergerie » (CLAUDE.md §6).
   Exécutés dans un vrai navigateur sur index.html, données injectées dans localStorage
   (clé bergerie_lots_v5) exactement comme sur le téléphone de Vincent.
   Lancer : node tests/non-regression.js   (Playwright + Chromium requis)
   Note : le fixture du §5 a r[0] ET pp[0] pour Brebis ; l'appli lit pp en priorité. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-v5.json'), 'utf8'));
const KEY = 'bergerie_lots_v5';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let fails = 0, passes = 0;
function check(name, got, want, tol) {
  const ok = tol != null ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log((ok ? '  ok   ' : '  ÉCHEC ') + name + (ok ? '' : ' — obtenu ' + JSON.stringify(got) + ', attendu ' + JSON.stringify(want)));
}

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rep.writeHead(404); return rep.end(); }
      rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openWith(browser, url, state) {
  const page = await browser.newPage();
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('_init')) { localStorage.setItem(k, s); sessionStorage.setItem('_init', '1'); } }, [KEY, JSON.stringify(state)]);
  page.on('pageerror', e => { fails++; console.log('  ÉCHEC erreur JS : ' + e.message); });
  await page.goto(url);
  return page;
}

/* helpers évalués dans la page (globales de index.html) */
const H = `
  window.T = {
    L: id => lotById(id),
    P: id => lotStats(id).P,
    kg: id => { const l = lotById(id); let s = 0; state.feeds.forEach(f => s += perPlace(l, f.id) * lotStats(id).P); return s; },
    gpb: id => Math.round(sumRations(lotById(id)) * 1000),
    gpp: (id, fid) => Math.round(perPlace(lotById(id), fid) * 1000),
    gr: (id, fid) => Math.round(feedVal(lotById(id), fid) * 1000),
    trieText: () => { const d = document.createElement('div'); d.innerHTML = trieHtml(); return d; },
    lotText: id => { const d = document.createElement('div'); d.innerHTML = lotSection(id, false); return d.textContent; }
  };`;

(async () => {
  const srv = await serve();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const browser = await chromium.launch();

  /* ---- 0. Migration : la clé v5 existante est relue sans perte ---- */
  console.log('0. Relecture des données v5');
  let page = await openWith(browser, url, FIXTURE);
  await page.evaluate(H);
  check('état relu = fixture', await page.evaluate(() => JSON.parse(JSON.stringify(state))), FIXTURE);
  check('P(Brebis) = 524', await page.evaluate(() => T.P(0)), 524);
  check('P(Antenaises) = 130', await page.evaluate(() => T.P(1)), 130);
  await page.close();

  /* ---- 1. Mode g/place ---- */
  console.log('1. Mode g/place (ancre trémie constante)');
  page = await openWith(browser, url, FIXTURE);
  await page.evaluate(H);
  await page.evaluate(() => { const l = T.L(0); setPP(l, 0, 0.5); setPP(l, 1, 0.5); save(); });
  check('badge « réglée : 500 g/place »', await page.evaluate(() => T.lotText(0).includes('réglée : 500 g/place')), true);
  check('total 524 kg', await page.evaluate(() => T.kg(0)), 524, 1e-9);
  check('2620 g/brebis/j', await page.evaluate(() => T.gpb(0)), 2620);
  await page.evaluate(() => moveBarrier(3, 0, 40));
  check('barrière 65→40 : P = 574', await page.evaluate(() => T.P(0)), 574);
  check('dose/place inchangée (500)', await page.evaluate(() => [T.gpp(0, 0), T.gpp(0, 1)]), [500, 500]);
  check('2870 g/brebis/j', await page.evaluate(() => T.gpb(0)), 2870);
  await page.evaluate(() => setB(T.L(0), 220));
  check('effectif 220 : dose intacte', await page.evaluate(() => [T.gpp(0, 0), T.gpp(0, 1)]), [500, 500]);
  check('2609 g/brebis/j', await page.evaluate(() => T.gpb(0)), 2609);
  check('contrôle « 574 kg sur ses 574 places ÷ 220 têtes »',
    await page.evaluate(() => /574,00 kg sur ses 574 places÷ 220 têtes = 2609 g\/j/.test(T.trieText().textContent.replace(/\s+/g, ' ').replace(/ ÷/g, '÷'))), true);
  await page.close();

  /* ---- 2. Mode g/brebis / kg ---- */
  console.log('2. Mode g/brebis (kg stables quand l’effectif bouge)');
  const F2 = JSON.parse(JSON.stringify(FIXTURE)); F2.pref = 'per'; F2.lots[0].pp = {};
  page = await openWith(browser, url, F2);
  await page.evaluate(H);
  check('260 kg à 200 têtes', await page.evaluate(() => T.kg(0)), 260, 1e-9);
  check('≈ 305 g/place céréales', await page.evaluate(() => T.gpp(0, 0)), 305);
  await page.evaluate(() => setB(T.L(0), 180));
  check('effectif 180 : 260 kg stables', await page.evaluate(() => T.kg(0)), 260, 1e-9);
  check('céréales 889 g/brebis', await page.evaluate(() => T.gr(0, 0)), 889);
  check('≈ 305 g/place inchangé', await page.evaluate(() => T.gpp(0, 0)), 305);
  await page.evaluate(() => { setB(T.L(0), 0); setB(T.L(0), 150); });
  check('effectif via 0 puis 150 : 260 kg retrouvés', await page.evaluate(() => T.kg(0)), 260, 1e-9);
  await page.close();

  /* ---- 3. Tapis 3 partagé ---- */
  console.log('3. Tapis 3 partagé (une seule ration, versée au milieu)');
  page = await openWith(browser, url, FIXTURE);
  await page.evaluate(H);
  const t3 = await page.evaluate(() => {
    const rs = dblRanges(2).map(r => ({ k1: r.k1, k2: r.k2, a: r.a, b: r.b }));
    const card = [...T.trieText().querySelectorAll('.fcard')][2].textContent.replace(/\s+/g, ' ');
    const exp = state.feeds.map(f => {
      const pa = T.gpp(0, f.id), pb = T.gpp(1, f.id);
      return { mixte: '2 × ' + Math.round((pb + pa) / 2) + ' g', seul: '2 × ' + pa + ' g' };
    });
    return { rs, card, exp };
  });
  check('plages tapis 3', t3.rs, [{ k1: 0, k2: 65, a: 0, b: 1 }, { k1: 65, k2: 92, a: 0, b: 0 }]);
  check('plage mixte « ration commune »', t3.card.includes('Brebis + Antenaises · ration commune'), true);
  check('plage seule « des 2 côtés »', t3.card.includes('Brebis des 2 côtés'), true);
  t3.exp.forEach((e, i) => {
    check('aliment ' + i + ' : plage mixte ' + e.mixte, t3.card.includes(e.mixte), true);
    check('aliment ' + i + ' : plage seule ' + e.seul, t3.card.includes(e.seul), true);
  });
  check('jamais de parts séparées par lot', /Brebis \d+ \+|Antenaises \d+ g/.test(t3.card), false);
  await page.close();

  /* ---- 4. Contrôle par lot ---- */
  console.log('4. Contrôle par lot (kg ÷ têtes = ration)');
  const F4 = JSON.parse(JSON.stringify(FIXTURE)); F4.lots.push({ id: 2, b: 0, name: 'Vides', r: { 0: 1 }, pp: {} }); F4.nextLot = 3; F4.airs[0] = { barriers: [10], lots: [2, 0] };
  for (const st of [FIXTURE, F4]) {
    page = await openWith(browser, url, st);
    await page.evaluate(H);
    const rows = await page.evaluate(() => {
      const d = T.trieText(), out = [];
      d.querySelectorAll('.trow').forEach(r => {
        const m = r.textContent.replace(/\s+/g, ' ').match(/^(.*?) · ([\d,]+) kg sur ses (\d+) places ?÷ (\d+) têtes = (\d+) g\/j/);
        if (m) out.push({ name: m[1].trim(), kg: +m[2].replace(',', '.'), pl: +m[3], b: +m[4], g: +m[5] });
      });
      return out.map(o => { const l = state.lots.find(x => (x.name || '').slice(0, 14) === o.name); return Object.assign(o, { P: T.P(l.id), ration: T.gpb(l.id) }); });
    });
    rows.forEach(o => {
      check(o.name + ' : places contrôle = P', o.pl, o.P);
      check(o.name + ' : kg ÷ têtes = ' + o.ration + ' g/j (±1)', o.g, o.ration, 1);
      check(o.name + ' : kg/têtes recalculé', Math.round(o.kg / o.b * 1000), o.ration, 1);
    });
    check('lots à 0 tête absents (' + rows.map(r => r.name).join(', ') + ')', rows.map(r => r.name), ['Brebis', 'Antenaises']);
    await page.close();
  }

  /* ---- 5. Export → import ---- */
  console.log('5. Export → import → état identique');
  page = await openWith(browser, url, FIXTURE);
  await page.evaluate(H);
  const rt = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(state));
    const env = JSON.stringify({ app: 'bergerie-lots', v: 5, date: new Date().toISOString(), state });
    const a = importJson(env), b = importJson(JSON.stringify(before));
    return { before, env: a.ok && a.state, raw: b.ok && b.state };
  });
  check('import enveloppe {app,v,date,state}', rt.env, rt.before);
  check('import état brut', rt.raw, rt.before);
  await page.evaluate(() => { const l = T.L(1); setPP(l, 1, 0.42); state.pref = 'kg'; save(); });
  await page.reload(); await page.evaluate(H);
  check('persistance après rechargement (pp, pref)', await page.evaluate(() => [state.pref, T.L(1).pp[1], T.L(1).r[1]]), ['kg', 0.42, undefined]);
  await page.close();

  await browser.close(); srv.close();
  console.log('\n' + passes + ' ok, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

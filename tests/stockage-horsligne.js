/* Tests navigateur : stockage sans perte (miroir IndexedDB, copies, secours) et hors ligne (service worker).
   Lancer : node tests/stockage-horsligne.js */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-v5.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let fails = 0, passes = 0;
function check(nom, ok, info) { ok ? passes++ : fails++; console.log((ok ? '  ok   ' : '  ÉCHEC ') + nom + (ok || info === undefined ? '' : ' — ' + JSON.stringify(info))); }

const srv = http.createServer((req, rep) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rep.writeHead(404); return rep.end(); }
  rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rep);
});

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();

  console.log('Démarrage à vide');
  let ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(300);
  check('aucune erreur JS, état par défaut', errs.length === 0 && await page.evaluate(() => state.lots.length === 1 && lotStats(0).P === 654), errs);
  await ctx.close();

  console.log('Miroir IndexedDB et secours');
  ctx = await browser.newContext(); page = await ctx.newPage(); errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(500);
  await page.evaluate(s => localStorage.setItem('bergerie_lots_v5', s), JSON.stringify(FIX));
  await page.reload();
  await page.evaluate(() => { setPP(lotById(1), 1, 0.333); save(); return Stockage.vider(); });
  const avant = await page.evaluate(() => JSON.stringify(state));
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => state.lots.length === 2, null, { timeout: 3000 }).catch(() => {});
  check('localStorage vidé → données reprises du miroir', await page.evaluate(() => JSON.stringify(state)) === avant);
  check('message « reprises de la copie de secours »', (await page.textContent('#panel')).includes('copie de secours'));
  check('localStorage réécrit', await page.evaluate(() => localStorage.getItem('bergerie_lots_v5') === JSON.stringify(state)));
  await page.evaluate(() => { localStorage.setItem('bergerie_lots_v5', '{abîmé'); });
  await page.reload(); await page.waitForTimeout(500);
  check('localStorage abîmé → données reprises', await page.evaluate(() => JSON.stringify(state)) === avant);

  console.log('Copies automatiques');
  /* une copie de la veille (comme laissée par l'usage d'hier) */
  await page.evaluate(s => new Promise(r => { const q = indexedDB.open('bergerie', 1); q.onsuccess = () => { const t = q.result.transaction('etats', 'readwrite'); t.objectStore('etats').put(s, 'jour:2000-01-02'); t.oncomplete = r; }; }), JSON.stringify(FIX));
  await page.click('#btnReset'); await page.click('#btnReset');
  await page.waitForTimeout(300);
  check('remise à zéro effectuée', await page.evaluate(() => state.lots.length === 1 && !state.lots[0].name));
  await page.click('#btnCopies');
  await page.waitForSelector('#copiesList .trow');
  const libs = await page.$$eval('#copiesList .trow', rs => rs.map(r => r.textContent));
  check('copie « Avant remise a zero » listée en premier', /^Avant remise a zero .* 2 lot\(s\)/.test(libs[0]), libs);
  check('veille listée, pas la copie du jour', libs.length === 2 && /^Fin de journée du 02\/01\/2000 · 2 lot/.test(libs[1]), libs);
  await page.click('#copiesList [data-copie^="avant:"]');
  check('demande confirmation', await page.waitForFunction(() => document.querySelector('#copiesList').textContent.includes('Confirmer'), null, { timeout: 2000 }).then(() => true, () => false));
  await page.click('#copiesList [data-copie^="avant:"]');
  await page.waitForFunction(() => state.lots.length === 2);
  check('restauration : état d’avant la remise à zéro', await page.evaluate(() => JSON.stringify(state)) === avant);
  check('aucune erreur JS', errs.length === 0, errs);
  await ctx.close();

  console.log('Hors ligne');
  ctx = await browser.newContext(); page = await ctx.newPage(); errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(500);
  await page.evaluate(s => localStorage.setItem('bergerie_lots_v5', s), JSON.stringify(FIX));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
  check('service worker actif', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await ctx.setOffline(true);
  await page.reload();
  check('hors ligne : appli chargée avec les lots', await page.evaluate(() => typeof Bergerie === 'object' && state.lots.length === 2 && lotStats(0).P === 524));
  check('hors ligne : trémies calculées', await page.evaluate(() => trieHtml().includes('ration commune')));
  srv.close(); /* serveur coupé : même résultat */
  await ctx.setOffline(false);
  await page.reload();
  check('serveur injoignable : appli chargée', await page.evaluate(() => state.lots.length === 2));
  check('aucune erreur JS', errs.length === 0, errs);
  await ctx.close();

  await browser.close();
  console.log('\n' + passes + ' ok, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

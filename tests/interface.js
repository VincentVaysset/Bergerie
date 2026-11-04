/* Tests de l'interface dans un vrai navigateur (Chromium, taille téléphone) : CLAUDE.md §6 dans la v10.
   Lancer : node tests/interface.js */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const M = require('../modele.js');
const ROOT = path.resolve(__dirname, '..');
const FIX5 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-v5.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let fails = 0, passes = 0;
function check(nom, ok, info) { ok ? passes++ : fails++; console.log((ok ? '  ok   ' : '  ÉCHEC ') + nom + (ok || info === undefined ? '' : ' — ' + JSON.stringify(info))); }

/* état v6 de référence : géométrie du fixture, rations voulues 800+500 / 900+700, trémies à régler */
function v6() {
  const s = M.defaultState();
  s.feeds = [{ id: 0, name: 'Céréales' }, { id: 1, name: 'Alib maïs 22' }]; s.nextFeed = 2;
  s.lots = [{ id: 0, b: 200, name: 'Brebis', obj: { 0: 0.8, 1: 0.5 } }, { id: 1, b: 80, name: 'Antenaises', obj: { 0: 0.9, 1: 0.7 } }]; s.nextLot = 2;
  s.airs = JSON.parse(JSON.stringify(FIX5.airs));
  return s;
}
const srv = http.createServer((req, rep) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rep.writeHead(404); return rep.end(); }
  rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rep);
});
let browser, url;
async function ouvrir(cle, etat) {
  const ctx = await browser.newContext(devices['Pixel 7']), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('_i')) { localStorage.clear(); localStorage.setItem(k, v); sessionStorage.setItem('_i', '1'); } }, [cle, JSON.stringify(etat)]);
  await page.goto(url); await page.waitForTimeout(200);
  page.errs = errs; page.ctx = ctx;
  return page;
}
const txt = async (page, sel) => (await page.textContent(sel || 'main')).replace(/\s+/g, ' ');
const onglet = (page, v) => page.click('nav [data-vue=' + v + ']');

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + srv.address().port + '/';
  browser = await chromium.launch();

  console.log('Reprise des données de l’ancienne version');
  let p = await ouvrir('bergerie_lots_v5', FIX5);
  check('message de reprise', (await txt(p)).includes('Données reprises de l’ancienne version'));
  check('trémies figées sur les anciennes doses', (await txt(p, '#pill')).includes('Trémies figées'));
  check('ancienne sauvegarde v5 laissée intacte', await p.evaluate(s => localStorage.getItem('bergerie_lots_v5') === s, JSON.stringify(FIX5)));
  check('nouvelle sauvegarde v6 écrite', await p.evaluate(() => JSON.parse(localStorage.getItem('bergerie_v6')).v === 6));
  await onglet(p, 'tremies'); let t = await txt(p);
  check('tapis 3 : « Brebis + Antenaises · ration commune »', t.includes('Brebis + Antenaises · ration commune'));
  check('tapis 3 mixte : 2 × 527 g = 1054 g/place', t.includes('2 × 527 g') && t.includes('1054g/place'));
  check('plage d’un seul lot : « Brebis des 2 côtés », 2 × 500 g', t.includes('Brebis des 2 côtés') && t.includes('2 × 500 g'));
  check('jamais de parts séparées par lot', !/Brebis \d+ \+|Antenaises \d+ g/.test(t));
  await onglet(p, 'controle'); t = await txt(p);
  check('contrôle Brebis : 371,5 kg sur ses 524 places ÷ 200 têtes = 1858 g/j', t.includes('371,5 kg sur ses 524 places ÷ 200 têtes = 1858 g/j'));
  check('contrôle Antenaises : 118,5 kg sur ses 130 places ÷ 80 têtes = 1481 g/j', t.includes('118,5 kg sur ses 130 places ÷ 80 têtes = 1481 g/j'));
  check('repère : « 2 lots à surveiller »', t.includes('2 lots à surveiller'));
  check('aucune erreur JS', p.errs.length === 0, p.errs); await p.ctx.close();

  console.log('1. Agnelage : 500 g/place partout, trémies figées');
  p = await ouvrir('bergerie_v6', v6());
  await onglet(p, 'tremies');
  check('à régler au départ', (await txt(p)).includes('À régler'));
  await p.click('[data-act=figer]');
  await p.click('[data-act=unique]'); await p.fill('#uni_0', '500'); await p.fill('#uni_1', '500'); await p.click('[data-act=uniqueOk]');
  t = await txt(p);
  check('tapis double : 2 × 500 g = 1000 g/place', t.includes('2 × 500 g') && t.includes('1000g/place'));
  await onglet(p, 'plan');
  check('Brebis reçoit 2620 g/j', (await txt(p, '#planBas')).includes('524 places · reçoit 2620 g/j'));
  await p.evaluate(() => moveBarrier(3, 0, 40));
  check('barrière 65 → 40 : 574 places, 2870 g/j', (await txt(p, '#planBas')).includes('574 places · reçoit 2870 g/j'));
  await p.fill('#eff_0', '220');
  check('effectif 220 : 2609 g/j', (await txt(p, '#planBas')).includes('574 places · reçoit 2609 g/j'));
  await onglet(p, 'tremies');
  check('doses inchangées (1000 g/place)', (await txt(p)).includes('2 × 500 g'));
  await onglet(p, 'controle');
  check('contrôle « 574,0 kg sur ses 574 places ÷ 220 têtes = 2609 g/j »', (await txt(p)).includes('574,0 kg sur ses 574 places ÷ 220 têtes = 2609 g/j'));
  check('aucune erreur JS', p.errs.length === 0, p.errs); await p.ctx.close();

  console.log('2. Rations voulues → trémies, puis figer et bouger les lots');
  const s2 = v6(); s2.airs[3] = { barriers: [], lots: [0] }; s2.lots[1].b = 0;  /* Brebis seules : 654 places */
  p = await ouvrir('bergerie_v6', s2);
  await onglet(p, 'tremies'); t = await txt(p);
  const d0 = Math.round(2 * 200 * 0.8 / 654 * 1000), d1 = Math.round(2 * 200 * 0.5 / 654 * 1000);
  check('céréales tapis 1 : ' + d0 + ' g/place (2 × part)', t.includes(d0 + 'g/place'));
  await onglet(p, 'rations');
  await p.fill('#r_0_0', '900');
  check('saisie 900 g → part par place mise à jour', (await txt(p)).includes(Math.round(200 * 0.9 / 654 * 1000) + ' g/place'));
  await onglet(p, 'tremies');
  const d0b = Math.round(2 * 200 * 0.9 / 654 * 1000);
  check('trémies suivent la ration : ' + d0b + ' g/place', (await txt(p)).includes(d0b + 'g/place'));
  await p.click('[data-act=figer]');
  check('figées', (await txt(p, '#pill')).includes('Trémies figées'));
  await onglet(p, 'controle');
  check('tout dans les normes', (await txt(p)).includes('Tout est dans les normes'));
  await onglet(p, 'plan'); await p.fill('#eff_0', '180');
  await onglet(p, 'controle'); t = await txt(p);
  check('effectif 180 : kg stables, +11,1 % à surveiller · trop', t.includes('+11,1 % · à surveiller · trop') && t.includes('280,0 kg sur ses 654 places ÷ 180 têtes'));
  check('pastille d’alerte sur l’onglet Contrôle', await p.evaluate(() => !!document.querySelector('nav .alerte')));
  await onglet(p, 'tremies');
  check('doses figées inchangées', (await txt(p)).includes(d0b + 'g/place'));
  await p.click('[data-act=recalc]'); await p.click('[data-act=recalc]');
  check('recalculer : de nouveau « À régler »', (await txt(p)).includes('À régler'));
  await onglet(p, 'controle');
  check('après recalcul : dans les normes', (await txt(p)).includes('Tout est dans les normes'));
  check('aucune erreur JS', p.errs.length === 0, p.errs); await p.ctx.close();

  console.log('3. Saisies');
  p = await ouvrir('bergerie_v6', v6());
  await onglet(p, 'rations'); await p.click('[data-act=pref][data-v=kg]');
  await p.fill('#r_0_0', '200');
  check('saisie en kg du lot : 200 kg ÷ 200 têtes = 1000 g', await p.evaluate(() => Math.round(lotById(0).obj[0] * 1000) === 1000));
  await p.click('[data-act=pref][data-v=per]');
  await onglet(p, 'tremies'); await p.click('[data-act=figer]');
  await p.click('[data-act=dose] >> nth=0'); await p.fill('#doseIn', '700'); await p.press('#doseIn', 'Enter');
  check('corriger une dose figée (700 g/place)', (await txt(p)).includes('700g/place'));
  check('la différence avec le calcul est signalée', (await txt(p)).includes('d’après les rations'));
  await onglet(p, 'plan');
  await p.evaluate(() => { sel = { t: 'seg', i: 0, j: 0 }; render(); });
  await p.click('[data-act=assign][data-lot=new]');
  check('nouveau lot depuis un morceau : fiche ouverte, nom à saisir', await p.evaluate(() => vue === 'rations' && document.activeElement && document.activeElement.id === 'nameIn' && state.airs[0].lots[0] === 2));
  await p.fill('#nameIn', 'Agnelées'); await p.press('#nameIn', 'Enter');
  check('lot nommé « Agnelées »', await p.evaluate(() => lotById(2).name === 'Agnelées'));
  await onglet(p, 'reglages'); await p.fill('#newFeed', 'Foin'); await p.click('[data-act=feedAdd]');
  check('aliment ajouté', await p.evaluate(() => state.feeds.some(f => f.name === 'Foin')));
  check('aucun emoji dans l’interface', await p.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.innerText)));
  check('aucune erreur JS', p.errs.length === 0, p.errs); await p.ctx.close();

  console.log('4. Export → import');
  const s4 = v6(); M.figer(s4, new Date('2026-11-04T07:00:00Z')); s4.pref = 'kg';
  p = await ouvrir('bergerie_v6', s4);
  const rt = await p.evaluate(() => { const before = JSON.parse(JSON.stringify(state)); const r = Bergerie.importJson(Bergerie.exportJson(state)); return { before, after: r.state }; });
  check('état identique (trémies figées, rations, préférences, noms)', JSON.stringify(rt.before) === JSON.stringify(rt.after));
  await onglet(p, 'reglages');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]);
  const fichier = fs.readFileSync(await dl.path(), 'utf8');
  check('fichier exporté nommé bergerie-AAAA-MM-JJ.json', /^bergerie-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()));
  await p.evaluate(() => { state.lots[0].name = 'changé'; save(); });
  await p.setInputFiles('#impFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(fichier) });
  await p.waitForFunction(() => lotById(0).name === 'Brebis');
  check('import du fichier : état d’avant retrouvé', await p.evaluate(b => JSON.stringify(state) === b, JSON.stringify(rt.before)));
  check('aucune erreur JS', p.errs.length === 0, p.errs); await p.ctx.close();

  await browser.close(); srv.close();
  console.log('\n' + passes + ' ok, ' + fails + ' échec(s)');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

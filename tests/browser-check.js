// Drives the Tools page in headless Chromium and checks that each tracker works.
// Needs Playwright:  npm install playwright && npx playwright install chromium
// Run:  node tests/browser-check.js [screenshot-folder]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

const checks = [];
let dialogAnswer = '';
const check = (name, fn) => checks.push({ name, fn });

// Fill a bound field and fire its change event, as a person tabbing out would.
async function setField(page, selector, value) {
  await page.fill(selector, String(value));
  await page.press(selector, 'Tab');
  await page.waitForTimeout(30);
}
async function openTab(page, label) {
  await page.click(`#tool-tabs [role=tab]:has-text("${label}")`);
}
const text = (page, sel) => page.locator(sel).innerText();

// ---------- Character tab ----------

check('page loads with a default character and every tab renders', async (page) => {
  const tabs = await page.$$eval('#tool-tabs [role=tab]', els => els.map(e => e.textContent));
  for (const t of tabs) {
    await openTab(page, t);
    const html = await page.innerHTML('#tool-panel');
    if (html.length < 200) throw new Error(`Tab ${t} looks empty`);
  }
  await openTab(page, 'Character');
  const name = await page.$eval('#bh-char-select', s => s.selectedOptions[0].textContent);
  if (name !== 'New Recruit') throw new Error('default character is ' + name);
});

check('character: rename, roll abilities, earn and train a level, survives reload', async (page) => {
  await openTab(page, 'Character');
  await setField(page, '#f-name', 'Bowyer Campbell');
  if (await page.$eval('#bh-char-select', s => s.selectedOptions[0].textContent) !== 'Bowyer Campbell') throw new Error('rename not shown in list');
  await page.click('[data-action="character.rollAll"]');
  const scores = await page.$$eval('[data-bind^="character.abilities."]', els => els.map(e => Number(e.value)));
  if (scores.length !== 6 || scores.some(s => s < 8 || s > 20)) throw new Error('bad scores ' + scores);
  await setField(page, '#f-character-abilities-dex', 17);
  await page.fill('#xp-add', '450');
  await page.click('[data-action="character.addXp"]');
  if (!(await text(page, '#tool-panel')).includes('Eligible for level 2')) throw new Error('not eligible at 450 XP');
  await page.selectOption('#f-character-training-status', 'assigned');
  await setField(page, '#f-character-training-task', 'Hold the Yard against three veterans');
  await page.click('[data-action="character.passQuest"]');
  if (await page.inputValue('#f-character-level') !== '2') throw new Error('level did not go up');
  await page.reload();
  await openTab(page, 'Character');
  if (await page.inputValue('#f-character-abilities-dex') !== '17') throw new Error('typed score not saved');
  if (!(await text(page, '#tool-panel')).includes('Reached level 2')) throw new Error('history lost on reload');
});

check('characters: add, switch, delete and undo', async (page) => {
  dialogAnswer = 'Second Recruit';
  await page.click('[data-action="core.new"]');
  let names = await page.$$eval('#bh-char-select option', o => o.map(x => x.textContent));
  if (names.length !== 2) throw new Error('expected 2 characters, got ' + names);
  await page.click('[data-action="core.delete"]');
  names = await page.$$eval('#bh-char-select option', o => o.map(x => x.textContent));
  if (names.length !== 1) throw new Error('delete failed');
  await page.click('#bh-undo');
  names = await page.$$eval('#bh-char-select option', o => o.map(x => x.textContent));
  if (names.length !== 2) throw new Error('undo did not restore the character');
  await page.selectOption('#bh-char-select', { label: 'Bowyer Campbell' });
});

// ---------- run ----------

(async () => {
  const server = await serve();
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) problems.push(r.status() + ' ' + r.url()); });
  // Every confirm/prompt is accepted; prompts get the current dialogAnswer.
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? dialogAnswer : undefined));

  await page.goto(base + '/tools/', { waitUntil: 'networkidle' });
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn(page, base);
      console.log('ok   ' + c.name);
    } catch (e) {
      failed++;
      console.log('FAIL ' + c.name + '\n     ' + e.message.split('\n')[0]);
    }
  }

  // Phone width: nothing should push the page sideways on any tab.
  const phone = await browser.newPage({ viewport: { width: 375, height: 800 } });
  phone.on('pageerror', e => problems.push('page error (phone): ' + e.message));
  await phone.goto(base + '/tools/', { waitUntil: 'networkidle' });
  const tabs = await phone.$$eval('#tool-tabs [role=tab]', els => els.map(e => e.textContent));
  for (const t of tabs) {
    await phone.click(`#tool-tabs [role=tab]:has-text("${t}")`);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 0) { failed++; console.log(`FAIL phone width: ${t} tab overflows by ${wide}px`); }
    if (SHOTS) await phone.screenshot({ path: path.join(SHOTS, `phone-${t.toLowerCase().replace(/\W+/g, '-')}.png`), fullPage: true });
  }
  if (!failed) console.log('ok   phone width: no tab scrolls sideways');

  if (SHOTS) {
    for (const t of tabs) {
      await page.click(`#tool-tabs [role=tab]:has-text("${t}")`);
      await page.screenshot({ path: path.join(SHOTS, `desktop-${t.toLowerCase().replace(/\W+/g, '-')}.png`), fullPage: true });
    }
  }

  if (problems.length) { failed++; console.log('FAIL errors during run:\n     ' + problems.join('\n     ')); }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} problem(s)` : '\nAll browser checks passed');
  process.exit(failed ? 1 : 0);
})();

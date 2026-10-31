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

// ---------- Combat tab ----------

const combatText = page => text(page, '#tool-panel');

check('combat: damage into death throes, counters, stabilise and heal out', async (page) => {
  await openTab(page, 'Combat');
  await setField(page, '#f-combat-maxHp', 50);
  await setField(page, '#f-combat-hp', 6);
  await page.fill('#hp-amount', '6');
  await page.click('[data-action="combat.damage"]');
  if (!(await combatText(page)).includes('Unconscious')) throw new Error('exactly 0 HP should be unconscious');
  await page.fill('#hp-amount', '3');
  await page.click('[data-action="combat.damage"]');
  if (!(await combatText(page)).includes('Death throes')) throw new Error('below 0 should be death throes');
  await page.click('[data-action="combat.turnCounter"]');
  await page.fill('#hp-amount', '1');
  await page.click('[data-action="combat.damage"]'); // damage while in throes = another counter
  const pips = await page.getAttribute('.pips[aria-label^="Death counters"]', 'aria-label');
  if (pips !== 'Death counters: 2 of 4') throw new Error('expected 2 death counters, saw ' + pips);
  await page.click('[data-action="combat.stabilize"]');
  if (!(await combatText(page)).includes('Stable')) throw new Error('not stable');
  await page.fill('#hp-amount', '20');
  await page.click('[data-action="combat.heal"]');
  if (await page.inputValue('#f-combat-hp') !== '16') throw new Error('heal from -4 by 20 should give 16');
});

check('combat: bleeding rolls Nd4 and comes off HP', async (page) => {
  await openTab(page, 'Combat');
  await page.click('[data-action="combat.bleedUp"]');
  await page.click('[data-action="combat.bleedUp"]');
  const before = Number(await page.inputValue('#f-combat-hp'));
  await page.click('[data-action="combat.bleedRoll"]');
  const lost = before - Number(await page.inputValue('#f-combat-hp'));
  if (lost < 2 || lost > 8) throw new Error('2d4 bleeding took ' + lost);
  await page.click('[data-action="combat.bleedStop"]');
});

check('combat: called shot reaches the head threshold (10 at 50 max HP)', async (page) => {
  await openTab(page, 'Combat');
  const row = page.locator('tr', { has: page.locator('th:text-is("Head")') });
  if ((await row.locator('td').first().innerText()).trim() !== '10') throw new Error('head threshold should be 10');
  await page.fill('#reg-add-head', '10');
  await page.click('[data-action="combat.regionHit"][data-region="head"]');
  if (!(await combatText(page)).includes('Head reached its injury threshold')) throw new Error('no injury notice');
  await page.selectOption('#inj-region', 'head');
  await page.fill('#inj-text', 'Concussion');
  await page.click('[data-action="combat.addInjury"]');
  if (!(await combatText(page)).includes('Concussion')) throw new Error('injury not listed');
});

check('combat: three drops to 0 in a week is fatal exhaustion; a new week resets the count', async (page) => {
  await openTab(page, 'Combat');
  await page.click('[data-action="combat.knockdown"]');
  await page.click('[data-action="combat.nextDay"]');
  await page.click('[data-action="combat.knockdown"]');
  if (!(await combatText(page)).includes('Another drop to 0 HP within the week would be fatal')) throw new Error('no warning at 3 exhaustion');
  await page.click('#bh-undo');
  for (let i = 0; i < 7; i++) await page.click('[data-action="combat.nextDay"]');
  await page.click('[data-action="combat.knockdown"]');
  const ex = await page.locator('.stat:has(span:text-is("Exhaustion")) b').innerText();
  if (ex.trim() !== '2 / 6') throw new Error('first drop of a new week should add 1 (expected 2 / 6, got ' + ex + ')');
});

check('combat: crit severity and a defensive parry', async (page) => {
  await openTab(page, 'Combat');
  await setField(page, '#f-combat-crit-base', 9);
  await page.fill('#crit-d100', '60');
  await page.click('[data-action="combat.critManual"]');
  if (!(await combatText(page)).includes('27 damage')) throw new Error('3x 9 should be 27');
  await page.fill('#crit-d100', '99');
  await page.click('[data-action="combat.critManual"]');
  if (!(await combatText(page)).includes('Instant death')) throw new Error('96+ should be instant death');
  // Dex 17 from the Character tab gives +3. 12 + 3 = 15 does not beat 15.
  await page.fill('#def-attack', '15');
  await page.fill('#def-d20', '12');
  await page.click('[data-action="combat.defend"][data-roll="manual"]');
  if (!(await combatText(page)).includes('The attack lands')) throw new Error('a tie should hit');
  await page.fill('#def-attack', '15');
  await page.fill('#def-d20', '13');
  await page.click('[data-action="combat.defend"][data-roll="manual"]');
  if (!(await combatText(page)).includes('Avoided')) throw new Error('16 vs 15 should avoid');
});

check('combat: attack modifiers add up', async (page) => {
  await openTab(page, 'Combat');
  await page.selectOption('#f-combat-atk-called', 'head');
  await page.selectOption('#f-combat-atk-flank', 'rear');
  await page.check('#f-combat-atk-swarm');
  const hit = await page.locator('.stat:has(span:text-is("To hit")) b').innerText();
  if (hit.trim() !== '+1') throw new Error('-3 head +2 rear +2 swarm should be +1, got ' + hit);
  await page.selectOption('#f-combat-atk-mode', 'ranged');
  await setField(page, '#f-combat-atk-feet', 22);
  const dmg = await page.locator('.stat:has(span:text-is("Damage")) b').innerText();
  if (dmg.trim() !== '+2') throw new Error('20-29 ft downward should be +2 damage, got ' + dmg);
});

// ---------- Gear tab ----------

const firstItem = page => page.locator('#tool-panel section[id^="item-"]').first();

check('gear: Masterwork steel longsword has 114 durability and +3 to split', async (page) => {
  await openTab(page, 'Gear');
  await page.selectOption('#add-type', 'Longsword');
  await page.selectOption('#add-material', 'steel');
  await page.selectOption('#add-quality', 'Masterwork');
  await page.selectOption('#add-craft', 'Masterwork');
  await page.fill('#add-name', 'Oathbreaker');
  await page.click('[data-action="gear.add"]');
  const card = firstItem(page);
  if (!(await card.innerText()).includes('114 / 114')) throw new Error('expected 114 / 114');
  if (!(await card.innerText()).includes('+3 / ±0')) throw new Error('all three +1s should default to hit');
  await page.selectOption('#f-gear-items-0-alloc-craft', 'dmg');
  if (!(await firstItem(page).innerText()).includes('+2 / +1')) throw new Error('moving one +1 to damage should give +2 / +1');
});

check('gear: wear, repair costs max durability, and 0 destroys', async (page) => {
  await openTab(page, 'Gear');
  await page.click('[data-action="gear.wear"][data-event="nat1"]');
  let cur = Number(await page.inputValue('#f-gear-items-0-current'));
  if (cur < 110 || cur > 113) throw new Error('1d4 wear left ' + cur);
  // Repairer one grade below the item's Masterwork craftsmanship: -2 max.
  await page.selectOption('#f-gear-items-0-repairer', 'Good');
  await page.click('[data-action="gear.repair"]');
  if (!(await firstItem(page).innerText()).includes('112 / 112')) throw new Error('repair by a lower grade should leave 112 / 112');
  await page.click('[data-action="gear.wear"][data-event="parry"]');
  await page.selectOption('#f-gear-items-0-repairer', 'Fair');
  if (!(await firstItem(page).innerText()).includes('cannot repair')) throw new Error('two grades below should be refused');
  await page.fill('#wear-' + (await firstItem(page).getAttribute('id')).slice(5), '500');
  await page.click('[data-action="gear.wearManual"]');
  if (!(await firstItem(page).locator('.tag.red').count())) throw new Error('item at 0 should be destroyed');
  await page.click('#bh-undo');
  if (await firstItem(page).locator('.tag.red').count()) throw new Error('undo should bring it back');
});

check('gear: copper armor, natural weapons, and the weapon shows up in Combat', async (page) => {
  await openTab(page, 'Gear');
  await page.selectOption('#add-type', 'Chain Mail');
  await page.selectOption('#add-material', 'copper');
  await page.selectOption('#add-quality', 'Good');
  await page.selectOption('#add-craft', 'Good');
  await page.click('[data-action="gear.add"]');
  const armor = page.locator('#tool-panel section[id^="item-"]').nth(1);
  if (!(await armor.innerText()).includes('65 / 65')) throw new Error('copper chain mail should be 50% of 130');
  await setField(page, '#f-gear-items-1-baseAc', 16);
  if (!(await page.locator('#tool-panel section[id^="item-"]').nth(1).innerText()).includes('14')) throw new Error('copper should be -2 AC');
  await page.selectOption('#add-type', 'Spear');
  await page.selectOption('#add-material', 'natural');
  await page.click('[data-action="gear.add"]');
  await setField(page, '#f-gear-items-2-die', 'd6');
  await page.click('[data-action="gear.wear"][data-i="2"][data-event="nat1"]');
  const spear = await page.locator('#tool-panel section[id^="item-"]').nth(2).innerText();
  if (!spear.includes('d6 → d4')) throw new Error('natural weapon die should step down');
  if (!spear.includes('cannot be repaired once damaged')) throw new Error('natural weapon should not be repairable');
  await openTab(page, 'Combat');
  await page.selectOption('#f-combat-atk-mode', 'melee');
  await page.selectOption('#f-combat-atk-called', 'none');
  await page.selectOption('#f-combat-atk-flank', 'none');
  await page.uncheck('#f-combat-atk-swarm');
  await page.selectOption('#f-combat-atk-weaponId', { label: 'Oathbreaker (+2 / +1)' });
  const hit = await page.locator('.stat:has(span:text-is("To hit")) b').innerText();
  if (hit.trim() !== '+2') throw new Error('Oathbreaker alone should be +2 to hit, got ' + hit);
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

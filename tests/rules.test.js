// Checks the rules data and formulas against the examples printed in the PDFs.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/tools/rules.js');

test('character creation: 4d4 + 4 ranges from 8 to 20', () => {
  assert.equal(R.rollAbility(() => 1).total, 8);
  assert.equal(R.rollAbility(() => 4).total, 20);
  assert.equal(R.rollAbility(() => 2.5).total, 14); // the stated average
});

test('character creation: XP makes you eligible, not levelled', () => {
  assert.deepEqual(
    [R.advancement(1, 299).eligible, R.advancement(1, 300).eligible],
    [false, true]
  );
  assert.equal(R.advancement(1, 300).nextLevel, 2);
  assert.equal(R.advancement(1, 1000).levelsBanked, 2);
  assert.equal(R.advancement(20, 999999).maxed, true);
  assert.equal(R.abilityModifier(8), -1);
  assert.equal(R.abilityModifier(15), 2);
});

test('advanced combat: three drops in a week is 1 + 2 + 3 = 6 exhaustion, death', () => {
  const log = [];
  let exhaustion = 0;
  for (const day of [1, 3, 6]) {
    const n = R.knockdownsInWindow(log, day) + 1;
    const gained = R.exhaustionForOccurrence(n);
    log.push({ day, occurrence: n, gained });
    exhaustion += gained;
  }
  assert.deepEqual(log.map(k => k.gained), [1, 2, 3]);
  assert.equal(exhaustion, R.EXHAUSTION_FATAL);
  // Day 1's drop has dropped out of the window by day 8.
  assert.equal(R.knockdownsInWindow(log, 7), 3);
  assert.equal(R.knockdownsInWindow(log, 8), 2);
});

test('advanced combat: 50 max HP gives a head injury threshold of 10', () => {
  assert.equal(R.regionThreshold(50, 'head'), 10);
  assert.equal(R.regionThreshold(50, 'torso'), 20);
  assert.equal(R.regionThreshold(50, 'limb'), 5);
  // "A further 10 damage to that region can trigger another injury."
  assert.equal(R.injuriesReached(9, 10), 0);
  assert.equal(R.injuriesReached(10, 10), 1);
  assert.equal(R.injuriesReached(20, 10), 2);
});

test('advanced combat: percentile critical table', () => {
  const grade = d => R.critBand(d).grade;
  assert.deepEqual([1, 25, 26, 40, 41, 80, 81, 95, 96, 100].map(grade),
    ['Poor', 'Poor', 'Fair', 'Fair', 'Good', 'Good', 'Excellent', 'Excellent', 'Incredible', 'Incredible']);
  assert.equal(R.critDamage(10, 9).damage, 13);   // 1.5 x 9 rounded down
  assert.equal(R.critDamage(60, 9).damage, 27);   // 3x
  assert.equal(R.critDamage(97, 9).band.instantDeath, true);
});

test('advanced combat: elevation, flanking and swarming stack', () => {
  assert.deepEqual(R.elevationModifier(9, 'down'), { hit: 0, dmg: 0 });
  assert.deepEqual(R.elevationModifier(25, 'down'), { hit: 2, dmg: 2 });
  assert.deepEqual(R.elevationModifier(80, 'up'), { hit: -3, dmg: -3 });
  const m = R.attackModifiers({ mode: 'melee', called: 'head', flank: 'rear', swarm: true, ground: 'higher' });
  assert.equal(m.hit, -3 + 2 + 2 + 2);
  const r = R.attackModifiers({ mode: 'ranged', called: 'none', feet: 30, dir: 'down', ground: 'higher' });
  assert.deepEqual([r.hit, r.dmg], [3, 3]); // high ground is a melee rule only
  assert.equal(R.defenseSucceeds(15, 15), false);
  assert.equal(R.defenseSucceeds(16, 15), true);
});

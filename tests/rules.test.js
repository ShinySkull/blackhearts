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

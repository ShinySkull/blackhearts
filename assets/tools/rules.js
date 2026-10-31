/* Blackhearts house rules as data and pure functions.
 * Shared by the Tools page (window.BH.rules) and the tests (require()).
 * Each section names the PDF it comes from.
 */
(function (root) {
  'use strict';

  var R = {};

  // ---------- Campaign Rules & Character Creation ----------

  R.ABILITIES = [
    ['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'],
    ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']
  ];

  R.STARTING_CLASSES = ['Fighter', 'Rogue', 'Ranger', 'Barbarian', 'Monk'];
  // Unavailable at creation; reachable later through attainments and training.
  R.ADVANCED_CLASSES = ['Sorcerer', 'Wizard', 'Druid', 'Bard', 'Psion'];
  R.RACES = ['Human', 'Half-Orc', 'Dwarf', 'Elf', 'Half-Elf', 'Halfling', 'Gnome'];

  // Class trainers at Blackthorn Hollow (faction guide).
  R.TRAINERS = {
    Fighter: 'Hadrik Vale',
    Rogue: 'Nessa Quickfingers',
    Ranger: 'Corvin Ash',
    Barbarian: 'Brakka Ironjaw',
    Monk: 'Brother Caldus'
  };

  // Standard 5e / 2024 experience thresholds. Index = level - 1.
  R.XP_FOR_LEVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

  R.abilityModifier = function (score) { return Math.floor((score - 10) / 2); };

  /** 4d4 + 4 for one ability score: 8 to 20, average 14. */
  R.rollAbility = function (d4) {
    var rolls = [d4(), d4(), d4(), d4()];
    return { rolls: rolls, total: rolls[0] + rolls[1] + rolls[2] + rolls[3] + 4 };
  };

  /**
   * XP makes a character eligible for a level; a trainer's quest grants it.
   * Returns { nextLevel, needed, toGo, eligible, maxed }.
   */
  R.advancement = function (level, xp) {
    level = Math.max(1, Math.min(20, Math.floor(level) || 1));
    if (level >= 20) return { nextLevel: null, needed: null, toGo: 0, eligible: false, maxed: true };
    var needed = R.XP_FOR_LEVEL[level];
    return {
      nextLevel: level + 1,
      needed: needed,
      toGo: Math.max(0, needed - xp),
      eligible: xp >= needed,
      maxed: false,
      // How many levels the XP would cover, if every quest were passed.
      levelsBanked: R.XP_FOR_LEVEL.filter(function (t, i) { return i >= level && xp >= t; }).length
    };
  };

  // ---------- Advanced Combat, Injuries & Lethality ----------

  R.DEATH_COUNTERS_FATAL = 4;   // the fourth death counter kills
  R.EXHAUSTION_FATAL = 6;       // six exhaustion levels kill
  R.KNOCKDOWN_WINDOW_DAYS = 7;

  /** Drops to 0 HP or below already logged within the 7 days ending on `day`. */
  R.knockdownsInWindow = function (knockdowns, day) {
    return knockdowns.filter(function (k) {
      return k.day <= day && k.day > day - R.KNOCKDOWN_WINDOW_DAYS;
    }).length;
  };

  /** First drop in 7 days: 1 exhaustion, second: 2, third: 3 (cumulative 6, death). */
  R.exhaustionForOccurrence = function (n) { return Math.max(1, n); };

  R.REGION_KINDS = {
    torso: { label: 'Torso', covers: 'chest, back, abdomen', pct: 40, toHit: -1 },
    head: { label: 'Head', covers: 'skull, face, neck', pct: 20, toHit: -3 },
    limb: { label: 'Limb', covers: 'arm, leg, hand, foot', pct: 10, toHit: -2 }
  };
  R.REGIONS = [
    { key: 'head', label: 'Head', kind: 'head' },
    { key: 'torso', label: 'Torso', kind: 'torso' },
    { key: 'larm', label: 'Left arm', kind: 'limb' },
    { key: 'rarm', label: 'Right arm', kind: 'limb' },
    { key: 'lleg', label: 'Left leg', kind: 'limb' },
    { key: 'rleg', label: 'Right leg', kind: 'limb' }
  ];

  /** Damage a region must take before an injury may occur (a share of max HP, not a separate pool). */
  R.regionThreshold = function (maxHp, kind) {
    return Math.max(1, Math.ceil((maxHp * R.REGION_KINDS[kind].pct) / 100));
  };
  /** Each time accumulated damage reaches another multiple of the threshold, an injury may occur. */
  R.injuriesReached = function (damage, threshold) { return Math.floor(Math.max(0, damage) / threshold); };

  // Percentile severity for natural 20s and natural 1s.
  R.CRIT_BANDS = [
    { min: 1, max: 25, grade: 'Poor', mult: 1.5 },
    { min: 26, max: 40, grade: 'Fair', mult: 2 },
    { min: 41, max: 80, grade: 'Good', mult: 3 },
    { min: 81, max: 95, grade: 'Excellent', mult: 4 },
    { min: 96, max: 100, grade: 'Incredible', mult: null, instantDeath: true }
  ];
  R.critBand = function (d100) {
    var r = Math.max(1, Math.min(100, Math.round(d100)));
    return R.CRIT_BANDS.filter(function (b) { return r >= b.min && r <= b.max; })[0];
  };
  /** Weapon critical damage: the multiplier replaces normal crit dice. Rounded down. */
  R.critDamage = function (d100, baseDamage) {
    var b = R.critBand(d100);
    if (b.instantDeath) return { band: b, damage: null };
    return { band: b, damage: Math.floor(baseDamage * b.mult) };
  };

  /** Ranged elevation: 10-19 ft = 1, 20-29 = 2, 30+ = 3 (max). Down is a bonus, up a penalty. */
  R.elevationModifier = function (feet, direction) {
    var step = feet >= 30 ? 3 : feet >= 20 ? 2 : feet >= 10 ? 1 : 0;
    var sign = direction === 'up' ? -1 : 1;
    return { hit: step * sign, dmg: step * sign };
  };

  R.INTO_MELEE_STRAY_CHANCE = 25; // percent

  /**
   * Total situational modifiers for one attack.
   * o: { mode: 'melee'|'ranged', called: 'none'|'torso'|'head'|'limb', flank: 'none'|'front'|'rear',
   *      swarm: bool, ground: 'none'|'higher'|'lower', feet: n, dir: 'down'|'up',
   *      intoMelee: bool, surprise: bool, miscHit: n, miscDmg: n }
   */
  R.attackModifiers = function (o) {
    var hit = 0, dmg = 0, notes = [];
    function add(h, d, why) { hit += h; dmg += d; notes.push(why); }
    if (o.called && o.called !== 'none') {
      var k = R.REGION_KINDS[o.called];
      add(k.toHit, 0, 'Called shot to the ' + k.label.toLowerCase() + ' (' + k.toHit + ' to hit)');
    }
    if (o.flank === 'front') add(2, 0, 'Flanking from the front (+2 to hit; you also get +2 AC while you hold the engagement)');
    if (o.flank === 'rear') add(2, 0, 'Flanking from behind (+2 to hit; the target loses Dex, Wis and Con AC bonuses against you)');
    if (o.swarm) add(2, 0, 'Swarm of four or more (+2 to hit, +2 to grapples; target has disadvantage on Str and Dex saves and checks)');
    if (o.mode === 'melee') {
      if (o.ground === 'higher') add(2, 0, 'Higher ground (+2 to hit)');
      if (o.ground === 'lower') add(-2, 0, 'Lower ground (−2 to hit)');
    } else {
      var e = R.elevationModifier(o.feet || 0, o.dir);
      if (e.hit) add(e.hit, e.dmg, 'Firing ' + (o.dir === 'up' ? 'upward' : 'downward') + ' ' + o.feet + ' ft (' +
        (e.hit > 0 ? '+' : '') + e.hit + ' hit / ' + (e.dmg > 0 ? '+' : '') + e.dmg + ' damage)');
      if (o.intoMelee) notes.push('Firing into melee: ' + R.INTO_MELEE_STRAY_CHANCE + '% chance to hit an unintended target');
    }
    if (o.miscHit || o.miscDmg) add(o.miscHit || 0, o.miscDmg || 0, 'Other bonuses (weapon, tactics, DM)');
    if (o.surprise) notes.push('Surprise attack: hits automatically for maximum weapon damage. Still roll to see if it is a natural 20 or 1.');
    return { hit: hit, dmg: dmg, notes: notes };
  };

  R.DEFENSES = {
    block: { label: 'Block', ability: 'str', needs: 'an equipped shield', wear: 'May damage the shield (1d8 on a blocked crit).' },
    parry: { label: 'Parry', ability: 'dex', needs: 'a weapon that can parry', wear: 'May damage the weapon (1d6 on a parried crit).' },
    dodge: { label: 'Dodge', ability: 'dex', needs: 'light armor or none', wear: 'Does not usually wear down equipment.' }
  };
  /** The defender must beat the attacker's roll; a tie goes to the attacker. */
  R.defenseSucceeds = function (defenseTotal, attackTotal) { return defenseTotal > attackTotal; };

  if (typeof module === 'object' && module.exports) module.exports = R;
  else { root.BH = root.BH || {}; root.BH.rules = R; }
})(typeof window !== 'undefined' ? window : globalThis);

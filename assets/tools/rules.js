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
    if (o.weapon && (o.weapon.hit || o.weapon.dmg)) {
      add(o.weapon.hit, o.weapon.dmg, o.weapon.name + ' (' + (o.weapon.hit > 0 ? '+' : '') + o.weapon.hit + ' hit / ' +
        (o.weapon.dmg > 0 ? '+' : '') + o.weapon.dmg + ' damage from material and quality)');
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

  // ---------- Crafting grades & materials (Crafting, Materials & Equipment) ----------

  R.GRADES = ['Poor', 'Fair', 'Good', 'Masterwork', 'Incredible'];
  R.gradeIndex = function (g) { return R.GRADES.indexOf(g); };

  // Each quality layer moves maximum durability by these percentage points (additive).
  R.GRADE_DURABILITY = { Poor: -50, Fair: -25, Good: 0, Masterwork: 25, Incredible: 50 };

  // Hit/damage effect of one quality layer (material quality or craftsmanship).
  // flex = a +1 (or -1) that goes to hit OR damage, the owner's choice.
  R.GRADE_WEAPON = {
    Poor: { hit: -1, dmg: -1 },
    Fair: { flex: -1 },
    Good: {},
    Masterwork: { flex: 1 },
    Incredible: { hit: 1, dmg: 1, trait: 'May have additional traits' }
  };

  R.MATERIALS = {
    natural: {
      label: 'Natural: stone, flint, obsidian, bone', grade: 'Poor',
      weapon: { dieStep: -1 }, ac: null, repairable: false,
      note: 'Cannot be repaired once damaged.'
    },
    copper: { label: 'Copper', grade: 'Poor', weapon: { hit: -1, dieStep: -1 }, ac: -2, repairable: true, note: 'Soft, easily repaired.' },
    bronze: { label: 'Bronze', grade: 'Fair', weapon: { hit: -1, dmg: -1 }, ac: -1, repairable: true, note: 'Easily repaired.' },
    iron: { label: 'Iron', grade: 'Good', weapon: {}, ac: 0, repairable: true, note: 'Standard metal, easily repaired.' },
    steel: { label: 'Steel', grade: 'Masterwork', weapon: { flex: 1 }, ac: 1, repairable: true, note: 'Superior; costly to repair.' },
    legendary: {
      label: 'Legendary metal: mithril, orichalcum…', grade: 'Incredible', weapon: { trait: 'Unique material effects, revealed in play' },
      ac: null, repairable: true, note: 'Properties are discovered in play.'
    },
    other: {
      label: 'Wood, leather, hide or other (DM)', grade: 'Good', weapon: {}, ac: 0, repairable: true,
      note: 'Nonmetal categories are still to be set by the DM; treated as standard here.'
    }
  };

  // The universal percentile scale for materials, equipment and crafting results.
  R.gradeFromPercent = function (p) {
    if (p <= 25) return 'Poor';
    if (p <= 40) return 'Fair';
    if (p <= 80) return 'Good';     // exactly 80 is Good; Masterwork begins at 81
    if (p <= 95) return 'Masterwork';
    return 'Incredible';
  };

  /**
   * Weapon hit/damage from material + material quality + craftsmanship.
   * alloc: { material, quality, craft } each 'hit' or 'dmg', used where a layer offers a choice.
   */
  R.weaponBonuses = function (materialKey, quality, craft, alloc) {
    alloc = alloc || {};
    var out = { hit: 0, dmg: 0, dieStep: 0, traits: [], choices: [] };
    function layer(name, label, fx) {
      out.hit += fx.hit || 0;
      out.dmg += fx.dmg || 0;
      out.dieStep += fx.dieStep || 0;
      if (fx.trait) out.traits.push(label + ': ' + fx.trait);
      if (fx.flex) {
        var side = alloc[name] === 'dmg' ? 'dmg' : 'hit';
        out[side] += fx.flex;
        out.choices.push({ layer: name, label: label, amount: fx.flex, side: side });
      }
    }
    var mat = R.MATERIALS[materialKey] || R.MATERIALS.iron;
    layer('material', mat.label.split(':')[0], mat.weapon);
    layer('quality', 'Material quality', R.GRADE_WEAPON[quality] || {});
    layer('craft', 'Craftsmanship', R.GRADE_WEAPON[craft] || {});
    return out;
  };

  /** Metal armor AC effect from the material. AC cannot fall below 1. */
  R.armorClass = function (baseAc, materialKey) {
    var mat = R.MATERIALS[materialKey] || R.MATERIALS.iron;
    if (mat.ac == null || baseAc == null || baseAc === '') return { ac: null, delta: mat.ac };
    return { ac: Math.max(1, Number(baseAc) + mat.ac), delta: mat.ac };
  };

  var DIE_STEPS = ['d4', 'd6', 'd8', 'd10', 'd12'];
  /** Move a damage die down (negative steps). Below d4 is the DM's call, so returns null. */
  R.stepDie = function (die, steps) {
    var m = /^(\d*)(d\d+)$/i.exec(String(die || '').trim());
    if (!m) return null;
    var i = DIE_STEPS.indexOf(m[2].toLowerCase());
    if (i < 0 || i + steps < 0) return null;
    return (m[1] || '') + DIE_STEPS[Math.min(DIE_STEPS.length - 1, i + steps)];
  };

  /**
   * Crafting result = d100 + material + crafter + miscellaneous modifiers (all in %).
   * Materials and the crafter's skill can cap the grade (the DM sets the ceiling).
   */
  R.craftingResult = function (d100, modifiers, capGrade) {
    var bonus = (modifiers || []).reduce(function (s, m) { return s + (Number(m.pct) || 0); }, 0);
    var total = d100 + bonus;
    var rolledGrade = R.gradeFromPercent(total);
    var grade = rolledGrade;
    var capped = false;
    if (capGrade && R.gradeIndex(capGrade) >= 0 && R.gradeIndex(rolledGrade) > R.gradeIndex(capGrade)) {
      grade = capGrade;
      capped = true;
    }
    return { d100: d100, bonus: bonus, total: total, rolledGrade: rolledGrade, grade: grade, capped: capped };
  };

  // ---------- Equipment Durability & Wear ----------

  // Baseline durability: Good material, Good craftsmanship, no modifiers.
  R.EQUIPMENT = [
    { group: 'Simple melee weapons', kind: 'weapon', items: { Club: 40, Dagger: 35, Greatclub: 70, Handaxe: 55, Javelin: 40, 'Light Hammer': 55, Mace: 65, Quarterstaff: 60, Sickle: 40, Spear: 50 } },
    { group: 'Martial melee weapons', kind: 'weapon', items: { Battleaxe: 70, Flail: 55, Glaive: 65, Greataxe: 80, Greatsword: 85, Halberd: 70, Lance: 55, Longsword: 65, Maul: 90, Morningstar: 70, Pike: 65, Rapier: 45, Scimitar: 55, Shortsword: 50, Trident: 65, Warhammer: 80, 'War Pick': 70, Whip: 30 } },
    { group: 'Ranged weapons', kind: 'weapon', items: { Dart: 15, 'Light Crossbow': 50, Shortbow: 40, Sling: 25, Blowgun: 30, 'Hand Crossbow': 40, 'Heavy Crossbow': 70, Longbow: 50, 'Musket (DM permitting)': 65 } },
    { group: 'Armor', kind: 'armor', items: { Padded: 50, Leather: 65, 'Studded Leather': 75, Hide: 70, 'Chain Shirt': 90, 'Scale Mail': 105, Breastplate: 110, 'Half Plate': 125, 'Ring Mail': 110, 'Chain Mail': 130, Splint: 145, Plate: 160 } },
    { group: 'Shields & helmets', kind: 'shield', items: { Shield: 80 } },
    { group: 'Shields & helmets', kind: 'helmet', items: { 'Helmet (40–75)': 60 } }
  ];
  R.findEquipment = function (name) {
    for (var i = 0; i < R.EQUIPMENT.length; i++) {
      var g = R.EQUIPMENT[i];
      if (Object.prototype.hasOwnProperty.call(g.items, name)) return { name: name, kind: g.kind, base: g.items[name] };
    }
    return null;
  };

  /** Total durability percentage: 100 plus each layer's points, added (not multiplied). */
  R.durabilityPercent = function (materialKey, quality, craft) {
    var mat = R.MATERIALS[materialKey] || R.MATERIALS.iron;
    return 100 + R.GRADE_DURABILITY[mat.grade] + (R.GRADE_DURABILITY[quality] || 0) + (R.GRADE_DURABILITY[craft] || 0);
  };
  /**
   * Maximum durability before repair losses, rounded to the nearest point.
   * Three Poor layers add up to -50%, which the rules don't cover; the result
   * is held at 1 so the item exists, and the page asks for a DM ruling.
   */
  R.maxDurability = function (base, materialKey, quality, craft) {
    return Math.max(1, Math.round((base * R.durabilityPercent(materialKey, quality, craft)) / 100));
  };

  R.WEAR_EVENTS = [
    { key: 'nat1', label: 'Natural 1 on an attack', count: 1, sides: 4, kinds: ['weapon'] },
    { key: 'parry', label: 'Parried a critical hit', count: 1, sides: 6, kinds: ['weapon'] },
    { key: 'armorCrit', label: 'Absorbed a critical hit', count: 1, sides: 6, kinds: ['armor', 'helmet'] },
    { key: 'shieldCrit', label: 'Blocked a critical hit', count: 1, sides: 8, kinds: ['shield'] }
  ];
  R.ENVIRONMENT_DICE = ['1d4', '1d6', '1d8', '2d4', '2d6'];   // severe exposure: 1d4 to 2d6

  /**
   * Who can repair an item and what it costs in maximum durability.
   * A repairer may be at most one grade below the item.
   */
  R.repairOutcome = function (itemGrade, repairerGrade) {
    var diff = R.gradeIndex(repairerGrade) - R.gradeIndex(itemGrade);
    if (diff < -1) return { allowed: false, note: 'A ' + repairerGrade + ' artisan cannot repair a ' + itemGrade + ' item. They must be at most one grade below it.' };
    if (diff === -1) return { allowed: true, loss: 2, note: 'One grade below the item: −2 maximum durability.' };
    if (diff === 0) return { allowed: true, loss: 1, note: 'Same grade: −1 maximum durability.' };
    return { allowed: true, loss: null, gradesAbove: diff, note: diff + ' grade' + (diff > 1 ? 's' : '') + ' above the item: a chance of no loss at all, better with each grade. The DM rolls it.' };
  };

  if (typeof module === 'object' && module.exports) module.exports = R;
  else { root.BH = root.BH || {}; root.BH.rules = R; }
})(typeof window !== 'undefined' ? window : globalThis);

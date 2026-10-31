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

  if (typeof module === 'object' && module.exports) module.exports = R;
  else { root.BH = root.BH || {}; root.BH.rules = R; }
})(typeof window !== 'undefined' ? window : globalThis);

/* Combat tab: Advanced Combat, Injuries & Lethality.
 * Hit points and death throes, the 7-day exhaustion log, bleeding,
 * called-shot injuries, attack modifiers, percentile crits, defensive reactions.
 */
(function () {
  'use strict';
  var BH = window.BH;
  var R = BH.rules;
  var esc = BH.esc;

  function defaults() {
    var regions = {};
    R.REGIONS.forEach(function (r) { regions[r.key] = 0; });
    return {
      combat: {
        maxHp: 10,
        hp: 10,
        stable: false,
        deathCounters: 0,
        day: 1,
        exhaustion: 0,
        knockdowns: [],
        bleeding: 0,
        regions: regions,
        regionHitsHp: true,
        injuries: [],
        atk: { weaponId: '', mode: 'melee', called: 'none', flank: 'none', swarm: false, ground: 'none', feet: 0, dir: 'down', intoMelee: false, surprise: false, miscHit: 0, miscDmg: 0 },
        crit: { kind: 'success', base: 8, last: null },
        defense: { type: 'parry', last: null }
      }
    };
  }

  function isDead(c) {
    return c.deathCounters >= R.DEATH_COUNTERS_FATAL || c.exhaustion >= R.EXHAUSTION_FATAL;
  }

  /** Damage that goes through HP: while below 0 HP, every instance adds a death counter. */
  function applyDamage(ch, amount, why) {
    var c = ch.combat;
    if (amount <= 0) return;
    var wasBelow = c.hp < 0;
    c.hp -= amount;
    var msg = why + ': ' + amount + ' damage, HP ' + c.hp + '.';
    if (wasBelow) {
      c.deathCounters += 1;
      c.stable = false;
      msg += ' Damaged in death throes: death counter ' + c.deathCounters + ' of ' + R.DEATH_COUNTERS_FATAL + '.';
    } else if (c.hp < 0) {
      c.stable = false;
      msg += ' Below 0: death throes begin.';
    } else if (c.hp === 0) {
      msg += ' Exactly 0: unconscious.';
    }
    if (c.deathCounters >= R.DEATH_COUNTERS_FATAL) msg += ' Dead.';
    BH.log(ch, 'combat', msg);
  }

  function statusOf(c) {
    if (c.exhaustion >= R.EXHAUSTION_FATAL) return { label: 'Dead', note: 'Six levels of exhaustion.', cls: 'bad' };
    if (c.deathCounters >= R.DEATH_COUNTERS_FATAL) return { label: 'Dead', note: 'The fourth death counter.', cls: 'bad' };
    if (c.hp < 0 && c.stable) return { label: 'Stable', note: 'Below 0 HP but stabilized. Any further damage restarts the death throes.', cls: 'warn' };
    if (c.hp < 0) return { label: 'Death throes', note: 'One death counter at the start of each of your turns and one more for every instance of damage. The fourth kills.', cls: 'bad' };
    if (c.hp === 0) return { label: 'Unconscious', note: 'At exactly 0 HP you are out, but you gain no death counters.', cls: 'warn' };
    return { label: 'Standing', note: '', cls: 'good' };
  }

  // ---------- cards ----------

  function cardHp(ch) {
    var c = ch.combat;
    var s = statusOf(c);
    var out = '<section class="tool-card"><h3>Hit points &amp; death throes</h3>' +
      '<div class="stat-row">' + BH.stat(c.hp + ' / ' + c.maxHp, 'Hit points') + BH.stat(s.label, 'Condition') + '</div>';
    if (s.note) out += '<div class="callout ' + s.cls + '">' + esc(s.note) + '</div>';
    out += '<div class="row">' +
      BH.field('Max HP', 'combat.maxHp', c.maxHp, { type: 'number', min: 1, cls: 'narrow' }) +
      BH.field('Current HP', 'combat.hp', c.hp, { type: 'number', cls: 'narrow' }) +
      '</div><div class="row">' + BH.scratch('Amount', 'hp-amount', { min: 0, placeholder: '0' }) +
      BH.button('Take damage', 'combat.damage') + BH.button('Heal', 'combat.heal') + '</div>';

    if (c.hp < 0 || c.deathCounters > 0) {
      out += '<h4>Death counters</h4>' + BH.pips(c.deathCounters, R.DEATH_COUNTERS_FATAL, R.DEATH_COUNTERS_FATAL, 'Death counters') +
        '<div class="btns">' +
        BH.button('Start of my turn: +1', 'combat.turnCounter', { disabled: c.hp >= 0 || c.stable || isDead(c) }) +
        BH.button('Stabilized', 'combat.stabilize', { disabled: c.hp >= 0 || isDead(c) }) +
        BH.button('Clear counters', 'combat.clearCounters', { cls: 'small' }) + '</div>';
    }
    if (c.hp <= 0 && !isDead(c)) {
      out += '<p class="hint" style="margin-top:10px">If you come through this alive, log it under Exhaustion: surviving a drop to 0 HP or below costs exhaustion either way.</p>';
    }
    return out + '</section>';
  }

  function cardExhaustion(ch) {
    var c = ch.combat;
    var inWindow = R.knockdownsInWindow(c.knockdowns, c.day);
    var next = R.exhaustionForOccurrence(inWindow + 1);
    var out = '<section class="tool-card"><h3>Exhaustion from near-death</h3>' +
      '<p class="hint">Each time you survive a drop to 0 HP or below, you gain exhaustion based on how many drops you have had in the last seven days: 1 for the first, 2 for the second, 3 for the third. Six levels kill you.</p>' +
      BH.pips(c.exhaustion, R.EXHAUSTION_FATAL, R.EXHAUSTION_FATAL, 'Exhaustion') +
      '<div class="stat-row">' + BH.stat(c.exhaustion + ' / 6', 'Exhaustion') + BH.stat(inWindow, 'Drops in last 7 days') + BH.stat('+' + next, 'Next drop costs') + '</div>';
    if (c.exhaustion >= R.EXHAUSTION_FATAL) out += '<div class="callout bad">Six levels of exhaustion: the character dies.</div>';
    else if (c.exhaustion + next >= R.EXHAUSTION_FATAL) out += '<div class="callout bad">Another drop to 0 HP within the week would be fatal.</div>';
    if (c.exhaustion > 0) {
      out += '<p class="hint">2024 rules: each level gives −' + 2 + ' to d20 tests and −5 ft speed, so you are at −' +
        (2 * c.exhaustion) + ' and −' + (5 * c.exhaustion) + ' ft. Normal exhaustion removal applies, subject to the DM.</p>';
    }
    out += '<div class="row">' + BH.field('In-game day', 'combat.day', c.day, { type: 'number', min: 1, cls: 'narrow' }) +
      BH.button('Next day', 'combat.nextDay') + '</div>' +
      '<div class="btns">' + BH.button('Survived a drop to 0 HP or below', 'combat.knockdown', { cls: 'primary', disabled: isDead(c) }) +
      BH.button('Exhaustion −1', 'combat.exhaustionDown', { disabled: c.exhaustion <= 0 }) +
      BH.button('Exhaustion +1', 'combat.exhaustionUp', { disabled: c.exhaustion >= R.EXHAUSTION_FATAL }) + '</div>';
    if (c.knockdowns.length) {
      out += '<h4>Drops logged</h4><ul class="log">' + c.knockdowns.slice().reverse().map(function (k) {
        var live = k.day <= c.day && k.day > c.day - R.KNOCKDOWN_WINDOW_DAYS;
        return '<li>Day ' + esc(k.day) + ': drop #' + esc(k.occurrence) + ' that week, +' + esc(k.gained) + ' exhaustion ' +
          (live ? '<span class="tag red">counts this week</span>' : '<span class="tag">expired</span>') + '</li>';
      }).join('') + '</ul>';
    }
    return out + '</section>';
  }

  function cardBleeding(ch) {
    var c = ch.combat;
    var out = '<section class="tool-card"><h3>Bleeding</h3>' +
      '<p class="hint">Serious wounds only, not scrapes. Each instance deals 1d4 at the start of your turn, and instances stack. It continues until treated with a Medicine check (the DM sets the DC, higher with more instances) or otherwise stopped.</p>' +
      '<div class="stat-row">' + BH.stat(c.bleeding, 'Active instances') + BH.stat(c.bleeding ? c.bleeding + 'd4' : '—', 'Damage each turn') + '</div>' +
      '<div class="btns">' + BH.button('+1 instance', 'combat.bleedUp') + BH.button('−1', 'combat.bleedDown', { disabled: !c.bleeding }) +
      BH.button(c.bleeding ? 'Roll ' + c.bleeding + 'd4 and apply' : 'Roll bleeding', 'combat.bleedRoll', { cls: 'primary', disabled: !c.bleeding }) +
      BH.button('Bleeding stopped', 'combat.bleedStop', { disabled: !c.bleeding }) + '</div>';
    return out + '</section>';
  }

  function cardInjuries(ch) {
    var c = ch.combat;
    var rows = R.REGIONS.map(function (r) {
      var th = R.regionThreshold(c.maxHp, r.kind);
      var dmg = c.regions[r.key] || 0;
      var inj = R.injuriesReached(dmg, th);
      return '<tr class="' + (inj ? 'hit' : '') + '"><th scope="row">' + esc(r.label) + '</th>' +
        '<td class="num">' + th + '</td>' +
        '<td><input type="number" min="0" id="f-combat-regions-' + r.key + '" data-bind="combat.regions.' + r.key + '" value="' + esc(dmg) + '" aria-label="' + esc(r.label) + ' damage taken"></td>' +
        '<td class="num">' + (inj ? '<span class="tag red">' + inj + '</span>' : '0') + '</td>' +
        '<td><div class="btns" style="flex-wrap:nowrap"><input type="number" min="0" id="reg-add-' + r.key + '" placeholder="dmg" aria-label="Damage to add to ' + esc(r.label) + '" style="width:4.5em">' +
        BH.button('Hit', 'combat.regionHit', { cls: 'small', data: { region: r.key } }) + '</div></td></tr>';
    }).join('');
    var injuries = c.injuries.length
      ? '<ul class="log">' + c.injuries.map(function (j, i) {
        var region = R.REGIONS.filter(function (r) { return r.key === j.region; })[0];
        return '<li><span class="tag">' + esc(region ? region.label : j.region) + '</span> Day ' + esc(j.day) + ': ' + esc(j.text) + ' ' +
          BH.button('Healed', 'combat.removeInjury', { cls: 'small', data: { i: i } }) + '</li>';
      }).join('') + '</ul>'
      : '<p class="empty">No lasting injuries recorded.</p>';
    return '<section class="tool-card wide"><h3>Called shots &amp; injuries</h3>' +
      '<p class="hint">Damage to a body region builds toward its injury threshold, a share of your max HP (torso 40%, head 20%, each limb 10%). Thresholds are not extra hit points. Each time a region’s total reaches another multiple, an injury may occur, and the DM decides what it is.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Region</th><th class="num">Threshold</th><th>Damage taken</th><th class="num">Thresholds reached</th><th>Took a hit here</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<div class="row" style="justify-content:space-between">' + BH.checkbox('Hits here also come off current HP', 'combat.regionHitsHp', c.regionHitsHp) +
      BH.button('Clear region damage', 'combat.clearRegions', { cls: 'small' }) + '</div>' +
      '<h4>Injuries the DM has given you</h4>' +
      '<div class="row"><label class="field narrow" style="flex-basis:130px"><span>Region</span><select id="inj-region">' +
      R.REGIONS.map(function (r) { return '<option value="' + r.key + '">' + esc(r.label) + '</option>'; }).join('') +
      '</select></label><label class="field"><span>Injury and its effect</span><input id="inj-text" type="text" placeholder="e.g. Concussion: disadvantage on Int checks"></label>' +
      BH.button('Add', 'combat.addInjury') + '</div>' + injuries + '</section>';
  }

  function cardAttack(ch) {
    var a = ch.combat.atk;
    var weapons = BH.gearWeapons ? BH.gearWeapons(ch) : [];
    var weapon = weapons.filter(function (w) { return w.id === a.weaponId; })[0];
    var m = R.attackModifiers(Object.assign({}, a, { weapon: weapon }));
    var out = '<section class="tool-card"><h3>Attack modifiers</h3>' +
      '<p class="hint">Situational bonuses from the advanced rules. They stack: a target can be flanked and swarmed at once.</p>' +
      '<div class="row">' + BH.select('Attack', 'combat.atk.mode', a.mode, [['melee', 'Melee'], ['ranged', 'Ranged']]) +
      BH.select('Called shot', 'combat.atk.called', a.called, [['none', 'None'], ['torso', 'Torso (−1)'], ['head', 'Head (−3)'], ['limb', 'Limb (−2)']]) + '</div>' +
      '<div class="row">' + BH.select('Flanking', 'combat.atk.flank', a.flank, [['none', 'No'], ['front', 'From the front'], ['rear', 'From behind']]);
    if (a.mode === 'melee') {
      out += BH.select('Ground', 'combat.atk.ground', a.ground, [['none', 'Level'], ['higher', 'I am higher (+2)'], ['lower', 'I am lower (−2)']]) + '</div>';
    } else {
      out += BH.field('Height difference (ft)', 'combat.atk.feet', a.feet, { type: 'number', min: 0, cls: 'narrow' }) +
        BH.select('Firing', 'combat.atk.dir', a.dir, [['down', 'Downward'], ['up', 'Upward']]) + '</div>';
    }
    if (weapons.length) {
      out += '<div class="row">' + BH.select('Weapon (from Gear)', 'combat.atk.weaponId', a.weaponId || '', [['', 'None / not tracked']].concat(
        weapons.map(function (w) { return [w.id, w.name + ' (' + BH.signed(w.hit) + ' / ' + BH.signed(w.dmg) + ')' + (w.destroyed ? ', destroyed' : '')]; }))) + '</div>';
    }
    out += '<div class="row">' + BH.field('Other hit bonus', 'combat.atk.miscHit', a.miscHit, { type: 'number', cls: 'narrow' }) +
      BH.field('Other damage bonus', 'combat.atk.miscDmg', a.miscDmg, { type: 'number', cls: 'narrow' }) + '</div>' +
      '<div class="row" style="gap:6px 18px">' + BH.checkbox('Swarm: four or more of us on one target', 'combat.atk.swarm', a.swarm) +
      (a.mode === 'ranged' ? BH.checkbox('Firing into melee', 'combat.atk.intoMelee', a.intoMelee) : '') +
      BH.checkbox('Surprise attack (target unaware, before initiative)', 'combat.atk.surprise', a.surprise) + '</div>' +
      '<div class="stat-row">' + BH.stat(BH.signed(m.hit), 'To hit') + BH.stat(BH.signed(m.dmg), 'Damage') + '</div>';
    if (m.notes.length) out += '<ul class="log">' + m.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    if (a.mode === 'ranged' && a.intoMelee) {
      out += '<div class="btns" style="margin-top:10px">' + BH.button('Roll d100 for a stray shot', 'combat.strayRoll') + '</div>';
      if (ch.combat.lastStray) out += '<div class="result">' + esc(ch.combat.lastStray) + '</div>';
    }
    return out + '</section>';
  }

  function cardCrit(ch) {
    var k = ch.combat.crit;
    var out = '<section class="tool-card"><h3>Critical severity</h3>' +
      '<p class="hint">On a natural 20 or natural 1 (attacks, saves, ability and skill checks), roll d100 for severity. For weapon crits the multiplier replaces normal critical damage.</p>' +
      '<div class="row">' + BH.select('Natural', 'combat.crit.kind', k.kind, [['success', '20: critical success'], ['failure', '1: critical failure']]) +
      (k.kind === 'success' ? BH.field('Normal damage', 'combat.crit.base', k.base, { type: 'number', min: 0, cls: 'narrow' }) : '') + '</div>' +
      '<div class="row">' + BH.scratch('d100 (or roll)', 'crit-d100', { min: 1, placeholder: '1–100' }) +
      BH.button('Use this roll', 'combat.critManual') + BH.button('Roll d100', 'combat.critRoll', { cls: 'primary' }) + '</div>';
    if (k.last) out += '<div class="result">' + k.last + '</div>';
    out += '<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>d100</th><th>Grade</th><th>Weapon crit</th></tr></thead><tbody>' +
      R.CRIT_BANDS.map(function (b) {
        return '<tr><td>' + b.min + '–' + b.max + '</td><td>' + b.grade + '</td><td>' + (b.instantDeath ? 'Instant death' : b.mult + '× damage') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return out + '</section>';
  }

  function cardDefense(ch) {
    var d = ch.combat.defense;
    var def = R.DEFENSES[d.type];
    var score = ch.character && ch.character.abilities ? ch.character.abilities[def.ability] : 10;
    var mod = R.abilityModifier(score);
    var out = '<section class="tool-card"><h3>Block, parry or dodge</h3>' +
      '<p class="hint">If you see the attack coming, declare a reaction and roll d20 + modifier. You must beat the attacker’s roll; a tie still hits. Normal reaction limits apply.</p>' +
      '<div class="row">' + BH.select('Reaction', 'combat.defense.type', d.type, Object.keys(R.DEFENSES).map(function (k) {
        return [k, R.DEFENSES[k].label + ' (' + R.DEFENSES[k].ability.toUpperCase() + ')'];
      })) + '</div>' +
      '<p class="hint">Needs ' + esc(def.needs) + '. Your ' + def.ability.toUpperCase() + ' modifier is ' + BH.signed(mod) +
      ' (from the Character tab). ' + esc(def.wear) + '</p>' +
      '<div class="row">' + BH.scratch('Attacker’s roll', 'def-attack', { min: 0 }) + BH.scratch('Your d20', 'def-d20', { min: 1, placeholder: 'roll' }) +
      BH.button('Check', 'combat.defend', { data: { roll: 'manual' } }) + BH.button('Roll d20', 'combat.defend', { cls: 'primary', data: { roll: 'auto' } }) + '</div>';
    if (d.last) out += '<div class="result">' + d.last + '</div>';
    return out + '</section>';
  }

  BH.register({
    id: 'combat',
    label: 'Combat',
    source: { title: 'Advanced Combat, Injuries & Lethality', href: 'docs/mechanics/advanced-combat.pdf' },
    defaults: defaults,
    render: function (ch) {
      return '<div class="tool-grid">' + cardHp(ch) + cardExhaustion(ch) + cardBleeding(ch) + cardDefense(ch) +
        cardInjuries(ch) + cardAttack(ch) + cardCrit(ch) +
        '<section class="tool-card">' + (BH.logList(ch, 'combat', 'Combat log') || '<h3>Combat log</h3><p class="empty">Damage, healing and death counters will be listed here.</p>') + '</section>' +
        '</div>';
    },
    actions: {
      damage: function () {
        var n = BH.inputNumber('hp-amount', 0);
        if (n > 0) BH.update(function (ch) { applyDamage(ch, n, 'Took damage'); });
      },
      heal: function () {
        var n = BH.inputNumber('hp-amount', 0);
        if (n <= 0) return;
        BH.update(function (ch) {
          var c = ch.combat;
          c.hp = Math.min(c.maxHp, c.hp + n);
          var msg = 'Healed ' + n + ', HP ' + c.hp + '.';
          if (c.hp >= 0 && c.deathCounters && !isDead(c)) { c.deathCounters = 0; msg += ' Out of death throes.'; }
          if (c.hp >= 0) c.stable = false;
          BH.log(ch, 'combat', msg);
        });
      },
      turnCounter: function () {
        BH.update(function (ch) {
          var c = ch.combat;
          c.deathCounters += 1;
          BH.log(ch, 'combat', 'Start of turn in death throes: death counter ' + c.deathCounters + ' of ' + R.DEATH_COUNTERS_FATAL + '.' +
            (c.deathCounters >= R.DEATH_COUNTERS_FATAL ? ' Dead.' : ''));
        });
      },
      stabilize: function () {
        BH.update(function (ch) {
          ch.combat.stable = true;
          ch.combat.deathCounters = 0;
          BH.log(ch, 'combat', 'Stabilized at ' + ch.combat.hp + ' HP. Death throes end.');
        });
      },
      clearCounters: function () {
        BH.update(function (ch) { ch.combat.deathCounters = 0; ch.combat.stable = false; });
      },
      nextDay: function () { BH.update(function (ch) { ch.combat.day += 1; }); },
      knockdown: function () {
        BH.update(function (ch) {
          var c = ch.combat;
          var n = R.knockdownsInWindow(c.knockdowns, c.day) + 1;
          var gained = R.exhaustionForOccurrence(n);
          c.knockdowns.push({ day: c.day, occurrence: n, gained: gained });
          c.knockdowns = c.knockdowns.slice(-20);
          c.exhaustion = Math.min(R.EXHAUSTION_FATAL, c.exhaustion + gained);
          BH.log(ch, 'combat', 'Day ' + c.day + ': survived drop #' + n + ' this week, +' + gained + ' exhaustion (now ' + c.exhaustion + ').' +
            (n > 3 ? ' More than three drops in a week is beyond the table, so check with the DM.' : '') +
            (c.exhaustion >= R.EXHAUSTION_FATAL ? ' Six levels: dead.' : ''));
        });
      },
      exhaustionDown: function () { BH.update(function (ch) { ch.combat.exhaustion = Math.max(0, ch.combat.exhaustion - 1); }); },
      exhaustionUp: function () { BH.update(function (ch) { ch.combat.exhaustion = Math.min(R.EXHAUSTION_FATAL, ch.combat.exhaustion + 1); }); },
      bleedUp: function () { BH.update(function (ch) { ch.combat.bleeding += 1; }); },
      bleedDown: function () { BH.update(function (ch) { ch.combat.bleeding = Math.max(0, ch.combat.bleeding - 1); }); },
      bleedStop: function () {
        BH.update(function (ch) { ch.combat.bleeding = 0; BH.log(ch, 'combat', 'Bleeding stopped.'); });
      },
      bleedRoll: function (ch) {
        var r = BH.roll(ch.combat.bleeding, 4);
        BH.update(function (ch) { applyDamage(ch, r.total, 'Bleeding ' + r.text); });
      },
      regionHit: function (ch, btn) {
        var key = btn.dataset.region;
        var n = BH.inputNumber('reg-add-' + key, 0);
        if (n <= 0) return;
        BH.update(function (ch) {
          var c = ch.combat;
          var region = R.REGIONS.filter(function (r) { return r.key === key; })[0];
          var th = R.regionThreshold(c.maxHp, region.kind);
          var before = R.injuriesReached(c.regions[key], th);
          c.regions[key] += n;
          var after = R.injuriesReached(c.regions[key], th);
          if (c.regionHitsHp) applyDamage(ch, n, region.label + ' hit');
          if (after > before) {
            BH.log(ch, 'combat', region.label + ' reached its injury threshold' + (after > 1 ? ' for the ' + after + (after === 2 ? 'nd' : after === 3 ? 'rd' : 'th') + ' time' : '') +
              ' (' + c.regions[key] + ' of ' + th + ' per injury). The DM determines the injury.');
          }
        });
      },
      clearRegions: function () {
        BH.update(function (ch) { R.REGIONS.forEach(function (r) { ch.combat.regions[r.key] = 0; }); });
      },
      addInjury: function () {
        var text = BH.inputValue('inj-text').trim();
        if (!text) return;
        var region = BH.inputValue('inj-region');
        BH.update(function (ch) { ch.combat.injuries.push({ region: region, text: text, day: ch.combat.day }); });
      },
      removeInjury: function (ch, btn) {
        var i = Number(btn.dataset.i);
        BH.update(function (ch) { ch.combat.injuries.splice(i, 1); });
      },
      strayRoll: function () {
        var r = BH.dieRoll(100);
        BH.update(function (ch) {
          ch.combat.lastStray = 'd100 = ' + r + ': ' + (r <= R.INTO_MELEE_STRAY_CHANCE
            ? 'the shot strays toward an unintended combatant.'
            : 'the shot goes where you aimed it.');
        });
      },
      critRoll: function () { critWith(BH.dieRoll(100)); },
      critManual: function () {
        var n = BH.inputNumber('crit-d100', null);
        if (n == null || n < 1 || n > 100) return;
        critWith(n);
      },
      defend: function (ch, btn) {
        var atk = BH.inputNumber('def-attack', null);
        if (atk == null) { var el = document.getElementById('def-attack'); if (el) el.focus(); return; }
        var d20 = btn.dataset.roll === 'auto' ? BH.dieRoll(20) : BH.inputNumber('def-d20', null);
        if (d20 == null) return;
        BH.update(function (ch) {
          var def = R.DEFENSES[ch.combat.defense.type];
          var mod = R.abilityModifier(ch.character.abilities[def.ability]);
          var total = d20 + mod;
          var ok = R.defenseSucceeds(total, atk);
          ch.combat.defense.last = def.label + ': d20 ' + d20 + ' ' + BH.signed(mod) + ' = <strong>' + total + '</strong> against ' + atk + '. ' +
            (ok ? '<strong>Avoided.</strong>' : '<strong>The attack lands.</strong>');
        });
      }
    }
  });

  function critWith(d100) {
    BH.update(function (ch) {
      var k = ch.combat.crit;
      var band = R.critBand(d100);
      var head = 'd100 = <strong>' + d100 + '</strong>: ' + band.grade + '. ';
      if (k.kind === 'failure') {
        k.last = head + 'A critical failure of this severity is the DM’s call: a dropped weapon, damaged gear, lost footing, an accidental injury, an opening for the enemy, or worse. Higher is worse.';
      } else if (band.instantDeath) {
        k.last = head + '<strong>Instant death.</strong> An Incredible weapon critical kills the target outright.';
      } else {
        var r = R.critDamage(d100, Number(k.base) || 0);
        k.last = head + band.mult + '× ' + (Number(k.base) || 0) + ' = <strong>' + r.damage + ' damage</strong> (rounded down).';
      }
    });
  }
})();

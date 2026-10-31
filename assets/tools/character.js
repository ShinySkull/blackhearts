/* Character tab: Campaign Rules & Character Creation.
 * Ability scores (4d4 + 4), XP eligibility, trainer quests, advanced-class attainments.
 */
(function () {
  'use strict';
  var BH = window.BH;
  var R = BH.rules;
  var esc = BH.esc;

  var STATUSES = [
    ['none', 'Not started'],
    ['seeking', 'Looking for a trainer'],
    ['assigned', 'Quest assigned'],
    ['failed', 'Quest failed: need a new one']
  ];

  function defaults() {
    var abilities = {};
    R.ABILITIES.forEach(function (a) { abilities[a[0]] = 10; });
    return {
      character: {
        race: 'Human',
        variant: '',
        cls: 'Fighter',
        background: '',
        level: 1,
        xp: 0,
        abilities: abilities,
        rolls: {},
        training: { status: 'none', trainer: '', task: '' },
        history: [],
        attainments: []
      }
    };
  }

  function rollOne(c, key) {
    var r = R.rollAbility(function () { return BH.dieRoll(4); });
    c.abilities[key] = r.total;
    c.rolls[key] = r.rolls.join(' + ') + ' + 4';
    return r.total;
  }

  function renderIdentity(ch) {
    var c = ch.character;
    var classOptions = [
      { group: 'Starting classes', options: R.STARTING_CLASSES.map(function (k) { return [k, k]; }) },
      { group: 'Need attainment & training', options: R.ADVANCED_CLASSES.map(function (k) { return [k, k]; }) }
    ];
    return '<section class="tool-card"><h3>Who they are</h3>' +
      '<p class="hint">The name here is the one in the character list above.</p>' +
      '<div class="row">' + BH.field('Name', 'name', ch.name) + '</div>' +
      '<div class="row">' +
      BH.select('Class', 'character.cls', c.cls, classOptions) +
      BH.select('Race', 'character.race', c.race, R.RACES.map(function (k) { return [k, k]; })) +
      '</div><div class="row">' +
      BH.field('Variant (DM approval)', 'character.variant', c.variant, { placeholder: 'e.g. Hill Dwarf' }) +
      BH.field('Background', 'character.background', c.background) +
      '</div>' +
      (R.ADVANCED_CLASSES.indexOf(c.cls) >= 0
        ? '<div class="callout warn">' + esc(c.cls) + ' is not available at character creation. It opens up through multiclassing once the DM agrees the requirements, attainments and training are met.</div>'
        : '') +
      '</section>';
  }

  function renderAbilities(ch) {
    var c = ch.character;
    var rows = R.ABILITIES.map(function (a) {
      var key = a[0];
      var score = c.abilities[key];
      return '<tr><th scope="row">' + esc(a[1]) + '</th>' +
        '<td><input id="f-character-abilities-' + key + '" type="number" min="1" max="30" data-bind="character.abilities.' + key + '" value="' + esc(score) + '" aria-label="' + esc(a[1]) + ' score"></td>' +
        '<td class="num"><strong>' + BH.signed(R.abilityModifier(score)) + '</strong></td>' +
        '<td class="hint" style="margin:0">' + esc(c.rolls[key] || '') + '</td>' +
        '<td>' + BH.button('Roll', 'character.rollOne', { cls: 'small', data: { key: key }, title: 'Roll 4d4 + 4' }) + '</td></tr>';
    }).join('');
    var total = R.ABILITIES.reduce(function (s, a) { return s + Number(c.abilities[a[0]] || 0); }, 0);
    return '<section class="tool-card"><h3>Ability scores</h3>' +
      '<p class="hint">Roll 4d4 + 4 for each score, in order. Each lands between 8 and 20, averaging 14. Type the numbers in if you roll real dice.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ability</th><th>Score</th><th class="num">Mod</th><th>Last roll</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<div class="row" style="justify-content:space-between;align-items:center">' +
      '<span class="hint" style="margin:0">Total ' + total + ' (average set: 84)</span>' +
      BH.button('Roll all six', 'character.rollAll') + '</div>' +
      '</section>';
  }

  function renderAdvancement(ch) {
    var c = ch.character;
    var adv = R.advancement(c.level, c.xp);
    var out = '<section class="tool-card"><h3>Experience &amp; advancement</h3>' +
      '<p class="hint">Reaching the XP total only makes you eligible. To gain the level, find a trainer for your class and complete the quest, task or challenge they set.</p>' +
      '<div class="row">' +
      BH.field('Level', 'character.level', c.level, { type: 'number', min: 1, max: 20, cls: 'narrow' }) +
      BH.field('Experience', 'character.xp', c.xp, { type: 'number', min: 0 }) +
      '</div>' +
      '<div class="row">' + BH.scratch('Add XP', 'xp-add', { min: 0, placeholder: '0' }) +
      BH.button('Add', 'character.addXp') + '</div>';

    if (adv.maxed) {
      out += '<div class="callout good">Level 20. There is nowhere higher to climb.</div>';
    } else {
      var prev = R.XP_FOR_LEVEL[c.level - 1] || 0;
      var pct = Math.max(0, Math.min(100, ((c.xp - prev) / (adv.needed - prev)) * 100));
      out += '<div class="meter ' + (adv.eligible ? 'ok' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
      if (adv.eligible) {
        out += '<div class="callout good"><strong>Eligible for level ' + adv.nextLevel + '.</strong> ' +
          (adv.levelsBanked > 1 ? 'Your XP covers ' + adv.levelsBanked + ' levels, but each one needs its own trainer quest. ' : '') +
          'The level is yours once you pass a trainer’s quest.</div>';
      } else {
        out += '<p class="hint">' + adv.toGo.toLocaleString() + ' XP to go until you can train for level ' + adv.nextLevel +
          ' (' + adv.needed.toLocaleString() + ' XP).</p>';
      }
    }

    var t = c.training;
    var suggested = R.TRAINERS[c.cls];
    out += '<h4>Trainer quest</h4>' +
      '<div class="row">' + BH.select('Status', 'character.training.status', t.status, STATUSES) +
      BH.field('Trainer', 'character.training.trainer', t.trainer, { placeholder: suggested ? suggested + ' (' + c.cls + ')' : 'Who will train you?' }) +
      '</div>' +
      '<div class="row">' + BH.field('Quest, task or challenge', 'character.training.task', t.task, { type: 'textarea' }) + '</div>';
    if (t.status === 'failed') {
      out += '<div class="callout bad">You stay at level ' + c.level + ' until you complete an advancement quest from an appropriate trainer.</div>';
    }
    out += '<div class="btns">' +
      BH.button(adv.nextLevel ? 'Quest passed: gain level ' + adv.nextLevel : 'Quest passed', 'character.passQuest', {
        cls: 'primary', disabled: !adv.eligible,
        title: adv.eligible ? '' : 'Not enough XP for the next level yet'
      }) +
      BH.button('Quest failed', 'character.failQuest', { disabled: t.status === 'none' && !t.task }) +
      '</div>';

    if (c.history.length) {
      out += '<h4>History</h4><ul class="log">' + c.history.slice().reverse().map(function (h) {
        return '<li>' + esc(h) + '</li>';
      }).join('') + '</ul>';
    }
    return out + '</section>';
  }

  function renderAttainments(ch) {
    var c = ch.character;
    var list = c.attainments.length
      ? '<ul class="log">' + c.attainments.map(function (a, i) {
        return '<li><label class="check"><input type="checkbox" data-bind="character.attainments.' + i + '.done"' +
          ' id="f-attain-' + i + '"' + (a.done ? ' checked' : '') + '> <span><span class="tag">' + esc(a.cls) + '</span> ' +
          esc(a.text) + '</span></label> ' +
          BH.button('Remove', 'character.removeAttainment', { cls: 'small', data: { i: i } }) + '</li>';
      }).join('') + '</ul>'
      : '<p class="empty">Nothing recorded yet.</p>';
    return '<section class="tool-card"><h3>Advanced class attainments</h3>' +
      '<p class="hint">Sorcerer, Wizard, Druid, Bard and Psion need achievements, opportunities and training, not just XP or high scores. Note what the DM has told you is required and tick it off as you earn it.</p>' +
      '<div class="row"><label class="field narrow" style="flex-basis:130px"><span>Class</span><select id="attain-cls">' +
      R.ADVANCED_CLASSES.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') +
      '</select></label><label class="field"><span>Requirement or step</span><input id="attain-text" type="text" placeholder="e.g. Find a tutor willing to teach"></label>' +
      BH.button('Add', 'character.addAttainment') + '</div>' + list + '</section>';
  }

  BH.register({
    id: 'character',
    label: 'Character',
    source: { title: 'Campaign Rules & Character Creation', href: 'docs/mechanics/campaign-rules-character-creation.pdf' },
    defaults: defaults,
    render: function (ch) {
      return '<div class="tool-grid">' + renderIdentity(ch) + renderAbilities(ch) + renderAdvancement(ch) +
        renderAttainments(ch) + '</div>';
    },
    actions: {
      rollOne: function (ch, btn) {
        BH.update(function (ch) { rollOne(ch.character, btn.dataset.key); });
      },
      rollAll: function (ch) {
        var anySet = R.ABILITIES.some(function (a) { return ch.character.abilities[a[0]] !== 10; });
        if (anySet && !window.confirm('Reroll all six ability scores?')) return;
        BH.update(function (ch) { R.ABILITIES.forEach(function (a) { rollOne(ch.character, a[0]); }); });
      },
      addXp: function (ch) {
        var n = BH.inputNumber('xp-add', 0);
        if (!n) return;
        BH.update(function (ch) { ch.character.xp = Math.max(0, ch.character.xp + n); });
      },
      passQuest: function (ch) {
        var c = ch.character;
        var adv = R.advancement(c.level, c.xp);
        if (!adv.eligible) return;
        BH.update(function (ch) {
          var c = ch.character;
          var who = c.training.trainer || R.TRAINERS[c.cls] || 'a trainer';
          c.history.push('Reached level ' + adv.nextLevel + ' (' + c.cls + ') after ' + who + '’s quest' +
            (c.training.task ? ': ' + c.training.task : '') + '.');
          c.level = adv.nextLevel;
          c.training = { status: 'none', trainer: '', task: '' };
        });
      },
      failQuest: function () {
        BH.update(function (ch) {
          var c = ch.character;
          c.history.push('Failed ' + (c.training.trainer ? c.training.trainer + '’s' : 'a trainer’s') + ' quest for level ' +
            (c.level + 1) + (c.training.task ? ': ' + c.training.task : '') + '.');
          c.training.status = 'failed';
        });
      },
      addAttainment: function () {
        var text = BH.inputValue('attain-text').trim();
        if (!text) return;
        var cls = BH.inputValue('attain-cls');
        BH.update(function (ch) { ch.character.attainments.push({ cls: cls, text: text, done: false }); });
      },
      removeAttainment: function (ch, btn) {
        var i = Number(btn.dataset.i);
        BH.update(function (ch) { ch.character.attainments.splice(i, 1); });
      }
    }
  });
})();

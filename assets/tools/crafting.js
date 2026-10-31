/* Crafting tab: Crafting, Materials & Equipment.
 * The d100 crafting roll with modifiers and a grade ceiling, sending the
 * finished piece to Gear, a log of materials and finds awaiting appraisal,
 * and the material reference table.
 */
(function () {
  'use strict';
  var BH = window.BH;
  var R = BH.rules;
  var esc = BH.esc;

  function defaults() {
    return {
      crafting: {
        project: { type: 'Shortsword', name: '', material: 'iron', quality: 'Good', cap: '', special: '', mods: [], last: null },
        history: [],
        finds: []
      }
    };
  }

  function gradeOptions() { return R.GRADES.map(function (g) { return [g, g]; }); }
  function equipmentOptions() {
    var groups = {};
    var order = [];
    R.EQUIPMENT.forEach(function (g) {
      if (!groups[g.group]) { groups[g.group] = []; order.push(g.group); }
      Object.keys(g.items).forEach(function (n) { groups[g.group].push([n, n]); });
    });
    return order.map(function (g) { return { group: g, options: groups[g] }; }).concat([{
      group: 'Custom', options: [['custom-weapon', 'Custom weapon'], ['custom-armor', 'Custom armor'], ['custom-shield', 'Custom shield'], ['custom-other', 'Custom other']]
    }]);
  }
  function materialOptions() {
    return Object.keys(R.MATERIALS).map(function (k) { return [k, R.MATERIALS[k].label + ' (' + R.MATERIALS[k].grade + ')']; });
  }

  function projectCard(ch) {
    var pr = ch.crafting.project;
    var p = 'crafting.project.';
    var bonus = pr.mods.reduce(function (s, m) { return s + (Number(m.pct) || 0); }, 0);
    var out = '<section class="tool-card wide"><h3>Crafting roll</h3>' +
      '<p class="hint">Result = d100 + material modifiers + crafter modifiers + miscellaneous modifiers (gems, rare powders, unusual components). The total sets the workmanship grade: 1–25 Poor, 26–40 Fair, 41–80 Good, 81–95 Masterwork, 96+ Incredible. The DM sets the modifier values and any ceiling from the materials or the crafter.</p>' +
      '<div class="row">' + BH.select('Item', p + 'type', pr.type, equipmentOptions()) +
      BH.field('Name (optional)', p + 'name', pr.name, { placeholder: 'e.g. Serrated shortsword' }) + '</div>' +
      '<div class="row">' + BH.select('Material', p + 'material', pr.material, materialOptions()) +
      BH.select('Material quality', p + 'quality', pr.quality, gradeOptions()) +
      BH.select('Ceiling (DM)', p + 'cap', pr.cap, [['', 'None set']].concat(gradeOptions())) + '</div>' +
      '<div class="row">' + BH.field('Special design or features', p + 'special', pr.special, { placeholder: 'e.g. Serrated blade: +1d2 bleeding on a hit, if it succeeds' }) + '</div>' +
      '<h4>Modifiers</h4>';
    if (pr.mods.length) {
      out += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Crafting factor</th><th class="num">Modifier %</th><th></th></tr></thead><tbody>' +
        pr.mods.map(function (m, i) {
          return '<tr><td><input type="text" id="f-mod-label-' + i + '" data-bind="' + p + 'mods.' + i + '.label" value="' + esc(m.label) + '" aria-label="Factor" style="max-width:none"></td>' +
            '<td class="num"><input type="number" id="f-mod-pct-' + i + '" data-bind="' + p + 'mods.' + i + '.pct" value="' + esc(m.pct) + '" aria-label="Modifier percent"></td>' +
            '<td>' + BH.button('Remove', 'crafting.removeMod', { cls: 'small', data: { i: i } }) + '</td></tr>';
        }).join('') +
        '<tr><th scope="row">Total modifier</th><td class="num"><strong>' + BH.signed(bonus) + '%</strong></td><td></td></tr></tbody></table></div>';
    } else {
      out += '<p class="empty">No modifiers yet.</p>';
    }
    out += '<div class="btns">' + BH.button('Add modifier', 'crafting.addMod') +
      BH.button('Load the shortsword example', 'crafting.example', { cls: 'small' }) + '</div>' +
      '<h4>Roll</h4><div class="row">' + BH.scratch('d100 (or roll)', 'craft-d100', { min: 1, placeholder: '1–100' }) +
      BH.button('Use this roll', 'crafting.rollManual') + BH.button('Roll d100', 'crafting.roll', { cls: 'primary' }) + '</div>';

    var last = pr.last;
    if (last) {
      out += '<div class="result">d100 <strong>' + last.d100 + '</strong> ' + BH.signed(last.bonus) + '% = <strong>' + last.total + '%</strong>: ' +
        '<strong>' + esc(last.grade) + '</strong> craftsmanship' +
        (last.capped ? ' (rolled ' + esc(last.rolledGrade) + ', held to the ' + esc(last.grade) + ' ceiling)' : '') + '.' +
        (last.total === 80 ? ' Exactly 80% is Good; Masterwork starts at 81%.' : '') + '</div>' +
        '<div class="btns" style="margin-top:10px">' +
        BH.button(last.added ? 'Added to Gear' : 'Add to Gear as ' + last.grade, 'crafting.toGear', { cls: 'primary', disabled: last.added }) + '</div>';
    }
    out += '<p class="hint" style="margin-top:12px">The Character Creation guide’s example calls 40 + 40% = 80% Masterwork. The newer crafting rules put Masterwork at 81%+, so this tool reads 80% as Good.</p>';
    return out + '</section>';
  }

  function findsCard(ch) {
    var finds = ch.crafting.finds;
    var rows = finds.length
      ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Find</th><th>Category</th><th>Quality</th><th>Appraised by</th><th></th></tr></thead><tbody>' +
        finds.map(function (f, i) {
          var p = 'crafting.finds.' + i + '.';
          return '<tr><td>' + esc(f.name) + '</td>' +
            '<td><select id="f-find-cat-' + i + '" data-bind="' + p + 'category" aria-label="Category">' +
            [['', 'Unknown']].concat(materialOptions()).map(function (o) {
              return '<option value="' + esc(o[0]) + '"' + (o[0] === f.category ? ' selected' : '') + '>' + esc(o[1].replace(/ \(.*\)$/, '')) + '</option>';
            }).join('') + '</select></td>' +
            '<td><select id="f-find-q-' + i + '" data-bind="' + p + 'quality" aria-label="Quality">' +
            [['', 'Unknown']].concat(gradeOptions()).map(function (o) {
              return '<option value="' + esc(o[0]) + '"' + (o[0] === f.quality ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
            }).join('') + '</select></td>' +
            '<td><input type="text" id="f-find-by-' + i + '" data-bind="' + p + 'appraiser" value="' + esc(f.appraiser) + '" aria-label="Appraised by" placeholder="Not yet" style="max-width:10em"></td>' +
            '<td>' + BH.button('Remove', 'crafting.removeFind', { cls: 'small', data: { i: i } }) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="empty">Nothing waiting for appraisal.</p>';
    return '<section class="tool-card"><h3>Materials &amp; finds</h3>' +
      '<p class="hint">Quality isn’t obvious. Pass a relevant skill check or ask a professional (a jeweler’s magnifier, a smith’s eye) to learn what you have. Strange teeth, rare hides, odd timber and unusual ore can all become gear if the DM agrees.</p>' +
      '<div class="row"><label class="field"><span>What is it?</span><input id="find-name" type="text" placeholder="e.g. Wyvern tooth, raw ore from the Black Delves"></label>' +
      BH.button('Add', 'crafting.addFind') + '</div>' + rows + '</section>';
  }

  function referenceCard() {
    var rows = Object.keys(R.MATERIALS).map(function (k) {
      var m = R.MATERIALS[k];
      var w = [];
      if (m.weapon.dieStep) w.push('die one step smaller');
      if (m.weapon.hit) w.push(BH.signed(m.weapon.hit) + ' hit');
      if (m.weapon.dmg) w.push(BH.signed(m.weapon.dmg) + ' damage');
      if (m.weapon.flex) w.push('+1 hit or damage');
      if (m.weapon.trait) w.push('unique');
      return '<tr><td>' + esc(m.label.split(':')[0]) + '</td><td>' + esc(m.grade) + '</td><td>' + esc(w.join(', ') || 'none') + '</td><td>' +
        (m.ac == null ? (k === 'legendary' ? 'unique' : '—') : BH.signed(m.ac)) + '</td><td>' + BH.signed(R.GRADE_DURABILITY[m.grade]) + '%</td></tr>';
    }).join('');
    var grades = R.GRADES.map(function (g) {
      var fx = R.GRADE_WEAPON[g];
      var t = fx.flex ? BH.signed(fx.flex) + ' hit or damage' : (fx.hit ? BH.signed(fx.hit) + ' hit and ' + BH.signed(fx.dmg) + ' damage' : 'none');
      return '<tr><td>' + g + '</td><td>' + esc(t) + (fx.trait ? ', possible traits' : '') + '</td><td>' + (100 + R.GRADE_DURABILITY[g]) + '%</td></tr>';
    }).join('');
    return '<section class="tool-card"><h3>Material reference</h3>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Material</th><th>Category</th><th>Weapon</th><th>Metal AC</th><th>Durability</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h4>Each quality layer (material quality, craftsmanship)</h4>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Grade</th><th>Weapon</th><th>Durability</th></tr></thead><tbody>' + grades + '</tbody></table></div>' +
      '<p class="hint">Material, material quality and craftsmanship stack. Durability points add to 100% rather than multiplying.</p></section>';
  }

  function historyCard(ch) {
    var h = ch.crafting.history;
    return '<section class="tool-card"><h3>Past crafting rolls</h3>' + (h.length
      ? '<ul class="log">' + h.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'
      : '<p class="empty">Rolls you make above are kept here.</p>') + '</section>';
  }

  function resolve(d100) {
    BH.update(function (ch) {
      var pr = ch.crafting.project;
      var r = R.craftingResult(d100, pr.mods, pr.cap);
      r.added = false;
      pr.last = r;
      var label = pr.name || pr.type;
      ch.crafting.history.unshift(label + ': d100 ' + d100 + ' ' + BH.signed(r.bonus) + '% = ' + r.total + '%, ' + r.grade +
        (r.capped ? ' (capped from ' + r.rolledGrade + ')' : '') + '.');
      ch.crafting.history = ch.crafting.history.slice(0, 20);
    });
  }

  BH.register({
    id: 'crafting',
    label: 'Crafting',
    source: { title: 'Crafting, Materials & Equipment', href: 'docs/mechanics/crafting.pdf' },
    defaults: defaults,
    render: function (ch) {
      return '<div class="tool-grid">' + projectCard(ch) + findsCard(ch) + referenceCard() + historyCard(ch) + '</div>';
    },
    actions: {
      addMod: function () {
        BH.update(function (ch) { ch.crafting.project.mods.push({ label: '', pct: 0 }); });
        BH.focusAfterRender('#f-mod-label-' + (BH.active().crafting.project.mods.length - 1));
      },
      removeMod: function (ch, btn) {
        var i = Number(btn.dataset.i);
        BH.update(function (ch) { ch.crafting.project.mods.splice(i, 1); });
      },
      example: function () {
        BH.update(function (ch) {
          var pr = ch.crafting.project;
          pr.type = 'Shortsword';
          pr.name = 'Serrated shortsword';
          pr.material = 'iron';
          pr.quality = 'Good';
          pr.special = 'Ruby pommel; serrated blade adds 1d2 bleeding damage on a hit if crafted successfully (extra fee)';
          pr.mods = [
            { label: 'High-quality iron', pct: 10 },
            { label: 'Master swordsmith', pct: 25 },
            { label: 'Ruby embellishment', pct: 5 }
          ];
          pr.last = null;
        });
      },
      roll: function () { resolve(BH.dieRoll(100)); },
      rollManual: function () {
        var n = BH.inputNumber('craft-d100', null);
        if (n == null || n < 1 || n > 100) return;
        resolve(Math.round(n));
      },
      toGear: function (ch) {
        var pr = ch.crafting.project;
        if (!pr.last || pr.last.added) return;
        var item = BH.makeGearItem(pr.type, pr.material, pr.quality, pr.last.grade, pr.name.trim());
        if (pr.special) item.notes = pr.special;
        BH.update(function (ch) {
          ch.gear.items.push(item);
          ch.crafting.project.last.added = true;
          BH.log(ch, 'gear', item.name + ': crafted at ' + item.craft + ' craftsmanship and added.');
        });
      },
      addFind: function () {
        var name = BH.inputValue('find-name').trim();
        if (!name) return;
        BH.update(function (ch) { ch.crafting.finds.push({ name: name, category: '', quality: '', appraiser: '' }); });
      },
      removeFind: function (ch, btn) {
        var i = Number(btn.dataset.i);
        BH.update(function (ch) { ch.crafting.finds.splice(i, 1); });
      }
    }
  });
})();

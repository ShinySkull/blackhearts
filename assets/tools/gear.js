/* Gear tab: Equipment Durability & Wear (with grades from Crafting, Materials & Equipment).
 * Each item's maximum durability, wear events, repairs and destruction,
 * plus the hit/damage or AC its material and quality give.
 */
(function () {
  'use strict';
  var BH = window.BH;
  var R = BH.rules;
  var esc = BH.esc;

  var KIND_LABELS = { weapon: 'Weapon', armor: 'Armor', shield: 'Shield', helmet: 'Helmet', other: 'Other' };
  var CUSTOM = { 'custom-weapon': 'weapon', 'custom-armor': 'armor', 'custom-shield': 'shield', 'custom-other': 'other' };

  function defaults() { return { gear: { items: [] } }; }

  function gradeOptions() { return R.GRADES.map(function (g) { return [g, g]; }); }
  function materialOptions() {
    return Object.keys(R.MATERIALS).map(function (k) {
      return [k, R.MATERIALS[k].label + ' (' + R.MATERIALS[k].grade + ')'];
    });
  }

  function maxOf(item) { return Math.max(0, R.maxDurability(item.base, item.material, item.quality, item.craft) - (item.repairLoss || 0)); }

  /** Make a new item from an equipment name (or custom kind) and grades. */
  function makeItem(type, material, quality, craft, name) {
    var eq = R.findEquipment(type);
    var kind = eq ? eq.kind : (CUSTOM[type] || 'other');
    var item = {
      id: 'g' + BH.uid(),
      name: name || (eq ? eq.name.replace(/ \(.*\)$/, '') : 'Custom ' + KIND_LABELS[kind].toLowerCase()),
      type: eq ? eq.name : 'Custom',
      kind: kind,
      base: eq ? eq.base : 50,
      material: material || 'iron',
      quality: quality || 'Good',
      craft: craft || 'Good',
      alloc: { material: 'hit', quality: 'hit', craft: 'hit' },
      die: '',
      baseAc: '',
      repairer: 'Good',
      repairLoss: 0,
      repairs: 0,
      notes: ''
    };
    item.current = maxOf(item);
    return item;
  }
  BH.makeGearItem = makeItem;

  /** Weapons with their hit/damage, for the Combat tab's attack calculator. */
  BH.gearWeapons = function (ch) {
    return (ch.gear ? ch.gear.items : []).filter(function (it) { return it.kind === 'weapon'; }).map(function (it) {
      var b = R.weaponBonuses(it.material, it.quality, it.craft, it.alloc);
      return { id: it.id, name: it.name, hit: b.hit, dmg: b.dmg, destroyed: it.current <= 0 };
    });
  };

  function wear(ch, item, amount, why) {
    var before = item.current;
    item.current = Math.max(0, item.current - amount);
    var msg = item.name + ': ' + why + ', −' + amount + ' durability (' + before + ' → ' + item.current + ').';
    if (item.current === 0) msg += ' Destroyed beyond repair.';
    BH.log(ch, 'gear', msg);
  }

  // ---------- rendering ----------

  function addCard() {
    var options = '';
    var seen = {};
    R.EQUIPMENT.forEach(function (g) {
      if (!seen[g.group]) { if (options) options += '</optgroup>'; options += '<optgroup label="' + esc(g.group) + '">'; seen[g.group] = true; }
      Object.keys(g.items).forEach(function (name) {
        options += '<option value="' + esc(name) + '"' + (name === 'Longsword' ? ' selected' : '') + '>' + esc(name) + ' — ' + g.items[name] + '</option>';
      });
    });
    options += '</optgroup><optgroup label="Custom (set durability after adding)">' +
      Object.keys(CUSTOM).map(function (k) { return '<option value="' + k + '">Custom ' + KIND_LABELS[CUSTOM[k]].toLowerCase() + '</option>'; }).join('') +
      '</optgroup>';
    function sel(id, label, opts, value) {
      return '<label class="field"><span>' + esc(label) + '</span><select id="' + id + '">' + opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>';
    }
    return '<section class="tool-card wide"><h3>Add equipment</h3>' +
      '<p class="hint">The number after each item is its baseline durability (Good material, Good craftsmanship). Material, material quality and craftsmanship each add or subtract from it: Poor −50%, Fair −25%, Good ±0, Masterwork +25%, Incredible +50%. They add together, so a Masterwork steel longsword is 175% of 65, or 114.</p>' +
      '<div class="row"><label class="field" style="flex-basis:220px"><span>Item</span><select id="add-type">' + options + '</select></label>' +
      '<label class="field"><span>Name (optional)</span><input id="add-name" type="text" placeholder="e.g. Grandfather’s blade"></label></div>' +
      '<div class="row">' + sel('add-material', 'Material', materialOptions(), 'iron') +
      sel('add-quality', 'Material quality', gradeOptions(), 'Good') +
      sel('add-craft', 'Craftsmanship', gradeOptions(), 'Good') +
      BH.button('Add', 'gear.add', { cls: 'primary' }) + '</div></section>';
  }

  function itemCard(ch, item, i) {
    var p = 'gear.items.' + i + '.';
    var mat = R.MATERIALS[item.material] || R.MATERIALS.iron;
    var max = maxOf(item);
    var cur = Math.min(item.current, max);
    var pct = R.durabilityPercent(item.material, item.quality, item.craft);
    var destroyed = item.current <= 0;
    var ratio = max ? cur / max : 0;
    var meterCls = ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'mid' : '';

    var out = '<section class="tool-card" id="item-' + esc(item.id) + '"><h3>' + esc(item.name) + ' <span class="tag">' + esc(KIND_LABELS[item.kind]) + '</span>' +
      (destroyed ? ' <span class="tag red">Destroyed</span>' : '') + '</h3>' +
      '<p class="hint">' + esc(item.type !== 'Custom' ? item.type + ', baseline ' + item.base : 'Custom item, baseline ' + item.base) +
      ' × ' + pct + '% = ' + R.maxDurability(item.base, item.material, item.quality, item.craft) +
      (item.repairLoss ? ', −' + item.repairLoss + ' from ' + item.repairs + ' repair' + (item.repairs === 1 ? '' : 's') : '') + '</p>' +
      '<div class="stat-row">' + BH.stat(cur + ' / ' + max, 'Durability');

    var bonusNotes = [];
    if (item.kind === 'weapon') {
      var b = R.weaponBonuses(item.material, item.quality, item.craft, item.alloc);
      out += BH.stat(BH.signed(b.hit) + ' / ' + BH.signed(b.dmg), 'Hit / damage');
      if (b.dieStep) {
        var stepped = item.die ? R.stepDie(item.die, b.dieStep) : null;
        bonusNotes.push('Damage die one step smaller' + (item.die ? ': ' + item.die + ' → ' + (stepped || 'below d4, the DM decides') : ' than listed') + '.');
      }
      b.traits.forEach(function (t) { bonusNotes.push(t + '.'); });
    } else if (item.kind === 'armor' || item.kind === 'shield' || item.kind === 'helmet') {
      var ac = R.armorClass(item.baseAc, item.material);
      if (ac.delta != null) out += BH.stat(ac.ac != null ? String(ac.ac) : BH.signed(ac.delta), ac.ac != null ? 'AC (min 1)' : 'AC from metal');
      bonusNotes.push('Armor quality and craftsmanship effects on AC are still to be set by the DM.');
    }
    if (pct <= 0) bonusNotes.unshift('These grades add up to ' + pct + '% durability, which the rules don\u2019t cover. Shown as 1 until the DM rules on it.');
    out += '</div><div class="meter ' + meterCls + '"><i style="width:' + (ratio * 100).toFixed(1) + '%"></i></div>';

    out += '<div class="row">' + BH.field('Name', p + 'name', item.name) +
      BH.field('Current', p + 'current', item.current, { type: 'number', min: 0, cls: 'narrow' }) +
      BH.field('Baseline', p + 'base', item.base, { type: 'number', min: 1, cls: 'narrow' }) + '</div>' +
      '<div class="row">' + BH.select('Material', p + 'material', item.material, materialOptions()) + '</div>' +
      '<div class="row">' + BH.select('Material quality', p + 'quality', item.quality, gradeOptions()) +
      BH.select('Craftsmanship', p + 'craft', item.craft, gradeOptions()) +
      (item.kind === 'weapon'
        ? BH.field('Damage die', p + 'die', item.die, { placeholder: 'd8', cls: 'narrow' })
        : item.kind !== 'other' ? BH.field('Base AC', p + 'baseAc', item.baseAc, { type: 'number', min: 0, cls: 'narrow' }) : '') +
      '</div>';

    if (item.kind === 'weapon') {
      var choices = R.weaponBonuses(item.material, item.quality, item.craft, item.alloc).choices;
      if (choices.length) {
        out += '<div class="row">' + choices.map(function (c) {
          return BH.select(c.label + ' ' + BH.signed(c.amount) + ' to', p + 'alloc.' + c.layer, c.side, [['hit', 'Hit'], ['dmg', 'Damage']]);
        }).join('') + '</div>';
      }
    }
    if (mat.note) bonusNotes.unshift(mat.label.split(':')[0] + ': ' + mat.note);
    out += '<ul class="log">' + bonusNotes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';

    if (destroyed) {
      out += '<div class="callout bad" style="margin-top:12px">At 0 durability the item is permanently destroyed and cannot be repaired.</div>';
    } else {
      // Wear
      var events = R.WEAR_EVENTS.filter(function (e) { return e.kinds.indexOf(item.kind) >= 0; });
      out += '<h4>Wear</h4><p class="hint">Ordinary successful attacks cost nothing.</p><div class="btns">' + events.map(function (e) {
        return BH.button(e.label + ' (' + e.count + 'd' + e.sides + ')', 'gear.wear', { cls: 'small', data: { i: i, event: e.key } });
      }).join('') + '</div>' +
        '<div class="row" style="margin-top:10px"><label class="field narrow"><span>Exposure</span><select id="env-' + esc(item.id) + '">' +
        R.ENVIRONMENT_DICE.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></label>' +
        BH.button('Roll', 'gear.environment', { cls: 'small', data: { i: i } }) +
        BH.scratch('Other (DM)', 'wear-' + item.id, { min: 0, placeholder: '0' }) +
        BH.button('Apply', 'gear.wearManual', { cls: 'small', data: { i: i } }) + '</div>';

      // Repair
      out += '<h4>Repair</h4>';
      if (cur >= max) {
        out += '<p class="hint">Undamaged.</p>';
      } else if (!mat.repairable) {
        out += '<div class="callout warn">' + esc(mat.label.split(':')[0]) + ' equipment cannot be repaired once damaged.</div>';
      } else {
        var r = R.repairOutcome(item.craft, item.repairer);
        out += '<p class="hint">Item grade for repairs is its craftsmanship: ' + esc(item.craft) + '.</p>' +
          '<div class="row">' + BH.select('Repairer’s grade', p + 'repairer', item.repairer, gradeOptions()) + '</div>' +
          '<div class="callout ' + (r.allowed ? '' : 'bad') + '">' + esc(r.note) + '</div><div class="btns">';
        if (!r.allowed) out += BH.button('Repair', 'gear.repair', { disabled: true });
        else if (r.loss) out += BH.button('Repaired (−' + r.loss + ' max)', 'gear.repair', { data: { i: i, loss: r.loss } });
        else out += BH.button('Repaired, no loss', 'gear.repair', { data: { i: i, loss: 0 } }) + BH.button('Repaired, −1 max', 'gear.repair', { data: { i: i, loss: 1 } });
        out += '</div>';
      }
    }
    out += '<div class="row" style="margin-top:14px">' + BH.field('Notes', p + 'notes', item.notes) + '</div>' +
      '<div class="btns">' + BH.button('Remove item', 'gear.remove', { cls: 'small danger', data: { i: i } }) + '</div>';
    return out + '</section>';
  }

  BH.register({
    id: 'gear',
    label: 'Gear & Durability',
    source: { title: 'Equipment Durability & Wear', href: 'docs/mechanics/durability.pdf' },
    defaults: defaults,
    render: function (ch) {
      var items = ch.gear.items;
      return '<p class="hint">Grades and material effects are from <a href="../docs/mechanics/crafting.pdf" target="_blank" rel="noopener">Crafting, Materials &amp; Equipment</a>. Keep gear maintained: an item at 0 durability is gone for good.</p>' +
        '<div class="tool-grid">' + addCard() +
        (items.length ? items.map(function (it, i) { return itemCard(ch, it, i); }).join('') : '<section class="tool-card"><p class="empty">No equipment yet.</p></section>') +
        '<section class="tool-card">' + (BH.logList(ch, 'gear', 'Wear and repairs') || '<h3>Wear and repairs</h3><p class="empty">Durability losses and repairs will be listed here.</p>') + '</section>' +
        '</div>';
    },
    actions: {
      add: function () {
        var item = makeItem(BH.inputValue('add-type'), BH.inputValue('add-material'), BH.inputValue('add-quality'),
          BH.inputValue('add-craft'), BH.inputValue('add-name').trim());
        BH.update(function (ch) { ch.gear.items.push(item); });
      },
      remove: function (ch, btn) {
        var i = Number(btn.dataset.i);
        if (!window.confirm('Remove ' + ch.gear.items[i].name + '?')) return;
        BH.update(function (ch) { ch.gear.items.splice(i, 1); });
      },
      wear: function (ch, btn) {
        var i = Number(btn.dataset.i);
        var ev = R.WEAR_EVENTS.filter(function (e) { return e.key === btn.dataset.event; })[0];
        var r = BH.roll(ev.count, ev.sides);
        BH.update(function (ch) { wear(ch, ch.gear.items[i], r.total, ev.label.toLowerCase() + ' ' + r.text); });
      },
      environment: function (ch, btn) {
        var i = Number(btn.dataset.i);
        var dice = BH.inputValue('env-' + ch.gear.items[i].id).split('d');
        var r = BH.roll(Number(dice[0]), Number(dice[1]));
        BH.update(function (ch) { wear(ch, ch.gear.items[i], r.total, 'severe exposure ' + r.text); });
      },
      wearManual: function (ch, btn) {
        var i = Number(btn.dataset.i);
        var n = BH.inputNumber('wear-' + ch.gear.items[i].id, 0);
        if (n > 0) BH.update(function (ch) { wear(ch, ch.gear.items[i], n, 'damage set by the DM'); });
      },
      repair: function (ch, btn) {
        var i = Number(btn.dataset.i);
        var loss = Number(btn.dataset.loss);
        BH.update(function (ch) {
          var item = ch.gear.items[i];
          item.repairLoss = (item.repairLoss || 0) + loss;
          item.repairs = (item.repairs || 0) + 1;
          item.current = maxOf(item);
          BH.log(ch, 'gear', item.name + ': repaired by a ' + item.repairer + ' artisan' +
            (loss ? ', maximum durability −' + loss : ', no loss') + '. Now ' + item.current + ' / ' + item.current + '.');
        });
      }
    }
  });
})();

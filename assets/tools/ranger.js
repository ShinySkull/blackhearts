/* Ranger Arts tab: The Ranger Arts.
 * Prepared Arts against the 2024 Ranger allowance, slots by rank,
 * Predator's Focus free uses, the one active Focus, and Long Rests.
 */
(function () {
  'use strict';
  var BH = window.BH;
  var R = BH.rules;
  var esc = BH.esc;
  var RANKS = [1, 2, 3, 4, 5];

  function defaults() {
    return {
      ranger: {
        prepared: [],
        used: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        override: false,
        max: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
        favoredUsed: 0,
        focus: '',
        spend: 'lowest'
      }
    };
  }

  function level(ch) { return (ch.character && ch.character.level) || 1; }

  function maxSlots(ch) {
    if (ch.ranger.override) return ch.ranger.max;
    var out = {};
    RANKS.forEach(function (r) { out[r] = R.rangerSlots(level(ch), r); });
    return out;
  }
  function highestRank(max) {
    return RANKS.filter(function (r) { return max[r] > 0; }).pop() || 0;
  }
  function isPrepared(ch, art) { return art.favored || ch.ranger.prepared.indexOf(art.name) >= 0; }
  function preparedCount(ch) {
    return ch.ranger.prepared.filter(function (n) {
      return R.RANGER_ARTS.some(function (a) { return a.name === n && !a.favored; });
    }).length;
  }
  function findArt(name) { return R.RANGER_ARTS.filter(function (a) { return a.name === name; })[0]; }

  function startFocus(ch, art) {
    var r = ch.ranger;
    if (r.focus && r.focus !== art.name) BH.log(ch, 'ranger', 'Focus on ' + r.focus + ' ends.');
    r.focus = art.name;
  }

  // ---------- cards ----------

  function slotsCard(ch) {
    var r = ch.ranger;
    var max = maxSlots(ch);
    var t = R.rangerTable(level(ch));
    var out = '<section class="tool-card"><h3>Slots, Focus &amp; rest</h3>';
    if (ch.character && ch.character.cls !== 'Ranger') {
      out += '<div class="callout warn">The Character tab lists this character as a ' + esc(ch.character.cls) + '. These tools follow the Ranger table.</div>';
    }
    out += '<p class="hint">Level ' + level(ch) + ' (set on the Character tab). Arts use normal 2024 Ranger spell slots.</p>';

    var rows = RANKS.filter(function (rank) { return max[rank] > 0 || (r.used[rank] || 0) > 0; }).map(function (rank) {
      var left = Math.max(0, max[rank] - (r.used[rank] || 0));
      return '<tr><th scope="row">Rank ' + rank + '</th><td>' + BH.pips(left, max[rank], null, 'Rank ' + rank + ' slots left') + '</td>' +
        '<td class="num">' + left + ' / ' + max[rank] + '</td><td><div class="btns" style="flex-wrap:nowrap">' +
        BH.button('Spend', 'ranger.spendSlot', { cls: 'small', data: { rank: rank }, disabled: !left }) +
        BH.button('Regain', 'ranger.regainSlot', { cls: 'small', data: { rank: rank }, disabled: !(r.used[rank] > 0) }) + '</div></td></tr>';
    }).join('');
    var favLeft = Math.max(0, t.favored - r.favoredUsed);
    rows += '<tr><th scope="row">Predator’s Focus, free</th><td>' + BH.pips(favLeft, t.favored, null, 'Free Predator’s Focus uses left') + '</td>' +
      '<td class="num">' + favLeft + ' / ' + t.favored + '</td><td>' +
      BH.button('Regain', 'ranger.regainFavored', { cls: 'small', disabled: !r.favoredUsed }) + '</td></tr>';
    out += '<div class="tbl-wrap"><table class="tbl"><tbody>' + rows + '</tbody></table></div>' +
      '<p class="hint">Favored Enemy (2024) lets you use Predator’s Focus without a slot a few times per Long Rest.</p>';

    out += '<div class="row">' + BH.checkbox('Custom slot counts (DM ruling)', 'ranger.override', r.override) + '</div>';
    if (r.override) {
      out += '<div class="row">' + RANKS.map(function (rank) {
        return BH.field('Rank ' + rank, 'ranger.max.' + rank, r.max[rank], { type: 'number', min: 0, max: 9, cls: 'narrow' });
      }).join('') + '</div>';
    }

    out += '<h4>Focus</h4>' + (r.focus
      ? '<div class="callout">Focusing on <strong>' + esc(r.focus) + '</strong>. Starting another Focus Art ends this one. Focus follows the Concentration rules: taking damage calls for a Constitution save (DC 10 or half the damage, whichever is higher).</div>' +
        BH.button('End Focus', 'ranger.endFocus')
      : '<p class="empty">No Art held in Focus.</p>');
    out += '<div class="btns" style="margin-top:14px">' + BH.button('Long Rest', 'ranger.longRest', { cls: 'primary' }) + '</div>' +
      '<p class="hint" style="margin-top:6px">Restores every slot and free use, and ends Focus.</p>';
    return out + '</section>';
  }

  function artsCard(ch) {
    var r = ch.ranger;
    var max = maxSlots(ch);
    var top = highestRank(max);
    var t = R.rangerTable(level(ch));
    var count = preparedCount(ch);
    var spendOptions = [['lowest', 'Lowest slot that works']].concat(RANKS.filter(function (k) { return max[k] > 0; }).map(function (k) {
      return [String(k), 'Rank ' + k + ' slot'];
    }));
    var out = '<section class="tool-card wide"><h3>Arts</h3>' +
      '<p class="hint">Arts replace your Ranger spells. They keep the source spell’s action, range, duration, saving throw and scaling unless noted, have no components and are not magic: Detect Magic, Counterspell, Dispel Magic and Antimagic Field don’t touch them. Physical Arts still need the tools, weapons, supplies or terrain described.</p>' +
      '<div class="stat-row">' + BH.stat(count + ' / ' + t.prepared, 'Prepared (2024 Ranger, level ' + level(ch) + ')') + '</div>';
    if (count > t.prepared) out += '<div class="callout warn">More Arts prepared than your level allows. Unprepare some after your next Long Rest.</div>';
    out += '<div class="row">' + BH.select('Spend', 'ranger.spend', r.spend, spendOptions) + '</div>';

    [1, 2, 3].forEach(function (rank) {
      var locked = rank > top;
      out += '<h4>Rank ' + rank + (locked ? ' <span class="tag">needs a rank ' + rank + ' slot</span>' : '') + '</h4>' +
        '<div class="tbl-wrap"><table class="tbl stack"><thead><tr><th>Ready</th><th>Art</th><th>What it looks like</th><th></th></tr></thead><tbody>' +
        R.RANGER_ARTS.filter(function (a) { return a.rank === rank; }).map(function (a) {
          var prepared = isPrepared(ch, a);
          var canPrepare = !locked && (prepared || count < t.prepared);
          var box = a.favored
            ? '<span class="tag" title="Always prepared through Favored Enemy">Always</span>'
            : '<input type="checkbox" data-action="ranger.togglePrepared" data-art="' + esc(a.name) + '"' + (prepared ? ' checked' : '') +
              (!canPrepare && !prepared ? ' disabled' : '') + ' aria-label="Prepare ' + esc(a.name) + '">';
          var slot = R.lowestOpenSlot(max, r.used, rank);
          var favLeft = t.favored - r.favoredUsed;
          var buttons = BH.button('Use', 'ranger.use', { cls: 'small', data: { art: a.name }, disabled: !prepared || !slot });
          if (a.favored) buttons += BH.button('Free (' + Math.max(0, favLeft) + ')', 'ranger.useFavored', { cls: 'small', disabled: favLeft <= 0 });
          return '<tr class="' + (r.focus === a.name ? 'hit' : '') + '"><td>' + box + '</td>' +
            '<td><strong>' + esc(a.name) + '</strong>' + (a.focus ? ' <span class="tag red">Focus</span>' : '') +
            '<br><span class="hint">' + esc(a.basedOn) + '</span></td>' +
            '<td>' + esc(a.looks) + (a.rule ? '<br><span class="hint">' + esc(a.rule) + '</span>' : '') + '</td>' +
            '<td><div class="btns" style="flex-wrap:nowrap">' + buttons + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
    });
    return out + '</section>';
  }

  function limitsCard() {
    return '<section class="tool-card"><h3>Limits</h3><ul class="log">' +
      '<li>An Art cannot conjure tools, medicine, ammunition, animals or terrain from nothing.</li>' +
      '<li>A disarmed Ranger cannot use a weapon Art; a restrained one cannot use an Art that needs free movement.</li>' +
      '<li>The GM decides whether an unusual place provides what an Art needs.</li>' +
      '<li>Onlookers see only what the Art describes: no glowing runes, incantations or visible spell energy.</li>' +
      '<li>Ranger spells not on this list need the GM’s explicit permission.</li></ul>' +
      '<h4>Not Ranger Arts</h4><ul class="log">' + [1, 2, 3].map(function (k) {
        return '<li><span class="tag">Rank ' + k + '</span> ' + esc(R.ARTS_NOT_AVAILABLE[k].join(', ')) + '</li>';
      }).join('') + '</ul></section>';
  }

  BH.register({
    id: 'ranger',
    label: 'Ranger Arts',
    source: { title: 'The Ranger Arts', href: 'docs/mechanics/ranger-arts.pdf' },
    defaults: defaults,
    render: function (ch) {
      return '<div class="tool-grid">' + slotsCard(ch) +
        '<section class="tool-card">' + (BH.logList(ch, 'ranger', 'Arts used') || '<h3>Arts used</h3><p class="empty">Arts you use will be listed here.</p>') + '</section>' +
        artsCard(ch) + limitsCard() + '</div>';
    },
    actions: {
      togglePrepared: function (ch, box) {
        var name = box.dataset.art;
        BH.update(function (ch) {
          var list = ch.ranger.prepared;
          var i = list.indexOf(name);
          if (i >= 0) list.splice(i, 1); else list.push(name);
          if (i >= 0 && ch.ranger.focus === name) ch.ranger.focus = '';
        });
        BH.focusAfterRender('[data-action="ranger.togglePrepared"][data-art="' + CSS.escape(name) + '"]');
      },
      use: function (ch, btn) {
        var art = findArt(btn.dataset.art);
        var max = maxSlots(ch);
        var rank = ch.ranger.spend === 'lowest'
          ? R.lowestOpenSlot(max, ch.ranger.used, art.rank)
          : Number(ch.ranger.spend);
        if (rank < art.rank) { window.alert(art.name + ' needs a rank ' + art.rank + ' slot or higher.'); return; }
        if (!rank || max[rank] - (ch.ranger.used[rank] || 0) <= 0) { window.alert('No rank ' + (rank || art.rank) + ' slot left.'); return; }
        BH.update(function (ch) {
          ch.ranger.used[rank] = (ch.ranger.used[rank] || 0) + 1;
          if (art.focus) startFocus(ch, art);
          BH.log(ch, 'ranger', art.name + ' with a rank ' + rank + ' slot' + (rank > art.rank ? ' (upcast)' : '') + (art.focus ? ', held in Focus.' : '.'));
        });
      },
      useFavored: function () {
        BH.update(function (ch) {
          var art = findArt('Predator’s Focus');
          ch.ranger.favoredUsed += 1;
          startFocus(ch, art);
          BH.log(ch, 'ranger', 'Predator’s Focus, free use from Favored Enemy, held in Focus.');
        });
      },
      spendSlot: function (ch, btn) {
        var rank = Number(btn.dataset.rank);
        BH.update(function (ch) { ch.ranger.used[rank] = (ch.ranger.used[rank] || 0) + 1; });
      },
      regainSlot: function (ch, btn) {
        var rank = Number(btn.dataset.rank);
        BH.update(function (ch) { ch.ranger.used[rank] = Math.max(0, (ch.ranger.used[rank] || 0) - 1); });
      },
      regainFavored: function () { BH.update(function (ch) { ch.ranger.favoredUsed = Math.max(0, ch.ranger.favoredUsed - 1); }); },
      endFocus: function () {
        BH.update(function (ch) { BH.log(ch, 'ranger', 'Focus on ' + ch.ranger.focus + ' ends.'); ch.ranger.focus = ''; });
      },
      longRest: function () {
        BH.update(function (ch) {
          RANKS.forEach(function (k) { ch.ranger.used[k] = 0; });
          ch.ranger.favoredUsed = 0;
          ch.ranger.focus = '';
          BH.log(ch, 'ranger', 'Long Rest: slots and free uses restored, Focus ended.');
        });
      }
    }
  });
})();

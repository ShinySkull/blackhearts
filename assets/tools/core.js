/* Blackhearts Tools: shared state, browser storage, rendering and events.
 *
 * Each rules document is a module (character.js, combat.js, ...) that calls
 * BH.register({ id, label, source, defaults, render, actions }).
 *   defaults()     -> the slice of character data the module owns
 *   render(ch)     -> HTML for the module's tab
 *   actions        -> click handlers, wired with data-action="<id>.<name>"
 * Inputs with data-bind="path.to.value" save themselves on change.
 */
(function () {
  'use strict';

  var BH = (window.BH = window.BH || {});
  var STORAGE_KEY = 'blackhearts.tools.v1';
  var MAX_UNDO = 40;
  var LOG_LENGTH = 12;

  var modules = [];
  var actions = {};
  var state = null;
  var undoStack = [];
  var storageOk = true;
  var renderTimer = null;
  var pointerDown = false;
  var focusAfterRender = null;

  // ---------- helpers ----------

  BH.esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var esc = BH.esc;

  BH.signed = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); };

  BH.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  BH.dieRoll = function (sides) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / sides) * sides;
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return (buf[0] % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  };

  /** Roll `count` dice of `sides`. Returns { total, rolls, text }. */
  BH.roll = function (count, sides) {
    var rolls = [];
    for (var i = 0; i < count; i++) rolls.push(BH.dieRoll(sides));
    var total = rolls.reduce(function (a, b) { return a + b; }, 0);
    var text = count + 'd' + sides + ' (' + rolls.join(' + ') + ')';
    return { total: total, rolls: rolls, text: text };
  };

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  }
  BH.get = getPath;
  BH.set = setPath;

  function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function mergeMissing(target, src) {
    Object.keys(src).forEach(function (k) {
      if (!(k in target)) target[k] = src[k];
      else if (isPlainObject(target[k]) && isPlainObject(src[k])) mergeMissing(target[k], src[k]);
    });
  }

  /** Read a number from an input by id (used by action buttons). */
  BH.inputNumber = function (id, fallback) {
    var el = document.getElementById(id);
    if (!el || el.value.trim() === '') return fallback;
    var n = Number(el.value);
    return isFinite(n) ? n : fallback;
  };
  BH.inputValue = function (id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  };

  function fieldId(path) { return 'f-' + path.replace(/[^a-zA-Z0-9]+/g, '-'); }

  /** A labelled input bound to character data. */
  BH.field = function (label, path, value, opts) {
    opts = opts || {};
    var type = opts.type || 'text';
    var attrs = '';
    ['min', 'max', 'step', 'placeholder', 'inputmode'].forEach(function (a) {
      if (opts[a] != null) attrs += ' ' + a + '="' + esc(opts[a]) + '"';
    });
    if (type === 'textarea') {
      return '<label class="field ' + (opts.cls || '') + '"><span>' + esc(label) + '</span>' +
        '<textarea id="' + fieldId(path) + '" data-bind="' + esc(path) + '"' + attrs + '>' + esc(value) + '</textarea></label>';
    }
    return '<label class="field ' + (opts.cls || '') + '"><span>' + esc(label) + '</span>' +
      '<input id="' + fieldId(path) + '" type="' + type + '" data-bind="' + esc(path) + '" value="' + esc(value) + '"' + attrs + '></label>';
  };

  /** A labelled select bound to character data. options: [[value, label]] or [{group, options}]. */
  BH.select = function (label, path, value, options, opts) {
    opts = opts || {};
    function opt(o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }
    var inner = options.map(function (o) {
      if (o.group) return '<optgroup label="' + esc(o.group) + '">' + o.options.map(opt).join('') + '</optgroup>';
      return opt(o);
    }).join('');
    return '<label class="field ' + (opts.cls || '') + '"><span>' + esc(label) + '</span>' +
      '<select id="' + fieldId(path) + '" data-bind="' + esc(path) + '"' + (opts.number ? ' data-type="number"' : '') + '>' + inner + '</select></label>';
  };

  BH.checkbox = function (label, path, checked) {
    return '<label class="check"><input type="checkbox" id="' + fieldId(path) + '" data-bind="' + esc(path) + '"' +
      (checked ? ' checked' : '') + '> ' + esc(label) + '</label>';
  };

  /** A button that runs a module action. */
  BH.button = function (label, action, opts) {
    opts = opts || {};
    var data = '';
    if (opts.data) Object.keys(opts.data).forEach(function (k) { data += ' data-' + k + '="' + esc(opts.data[k]) + '"'; });
    return '<button type="button" class="btn ' + (opts.cls || '') + '" data-action="' + esc(action) + '"' + data +
      (opts.disabled ? ' disabled' : '') + (opts.title ? ' title="' + esc(opts.title) + '"' : '') +
      (opts.id ? ' id="' + esc(opts.id) + '"' : '') + '>' + esc(label) + '</button>';
  };

  /** An unbound number input, read by an action button through BH.inputNumber(id). */
  BH.scratch = function (label, id, opts) {
    opts = opts || {};
    return '<label class="field ' + (opts.cls || 'narrow') + '"><span>' + esc(label) + '</span><input id="' + esc(id) +
      '" type="number" inputmode="numeric"' + (opts.min != null ? ' min="' + opts.min + '"' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.value != null ? ' value="' + esc(opts.value) + '"' : '') + '></label>';
  };

  BH.stat = function (value, label) {
    return '<div class="stat"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  };

  BH.pips = function (filled, total, fatalAt, label) {
    var out = '<div class="pips" role="img" aria-label="' + esc(label ? label + ': ' : '') + filled + ' of ' + total + '">';
    for (var i = 1; i <= total; i++) {
      out += '<span class="pip' + (i <= filled ? ' on' : '') + (i === fatalAt ? ' fatal' : '') + '"></span>';
    }
    return out + '</div>';
  };

  /** Keep a short running log per tool area. */
  BH.log = function (ch, area, text) {
    ch.logs = ch.logs || {};
    var list = ch.logs[area] || [];
    list.unshift({ text: text, at: Date.now() });
    ch.logs[area] = list.slice(0, LOG_LENGTH);
  };
  BH.logList = function (ch, area, heading) {
    var list = (ch.logs && ch.logs[area]) || [];
    if (!list.length) return '';
    return '<h4>' + esc(heading || 'Recent') + '</h4><ul class="log">' + list.map(function (e) {
      var d = new Date(e.at);
      var t = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return '<li><time>' + esc(t) + '</time>' + esc(e.text) + '</li>';
    }).join('') + '</ul>';
  };

  // ---------- modules & state ----------

  BH.register = function (mod) {
    modules.push(mod);
    Object.keys(mod.actions || {}).forEach(function (name) {
      actions[mod.id + '.' + name] = mod.actions[name];
    });
  };

  function fillDefaults(ch) {
    modules.forEach(function (m) { if (m.defaults) mergeMissing(ch, m.defaults()); });
    ch.logs = ch.logs || {};
  }

  function newCharacter(name) {
    var ch = { id: 'c' + BH.uid(), name: name || 'New Recruit', created: new Date().toISOString() };
    fillDefaults(ch);
    return ch;
  }

  function freshState() {
    return { version: 1, characters: {}, order: [], activeId: null, tab: null };
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) { storageOk = false; }
    try { state = raw ? JSON.parse(raw) : null; } catch (e) { state = null; }
    if (!state || typeof state !== 'object' || !isPlainObject(state.characters)) state = freshState();
    if (!Array.isArray(state.order)) state.order = Object.keys(state.characters);
    state.order = state.order.filter(function (id) { return isPlainObject(state.characters[id]); });
    state.order.forEach(function (id) { fillDefaults(state.characters[id]); });
    if (!state.order.length) addCharacter();
    if (!state.characters[state.activeId]) state.activeId = state.order[0];
    if (!modules.some(function (m) { return m.id === state.tab; })) state.tab = modules[0].id;
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function addCharacter(name) {
    var ch = newCharacter(name);
    state.characters[ch.id] = ch;
    state.order.push(ch.id);
    state.activeId = ch.id;
    return ch;
  }

  function active() { return state.characters[state.activeId]; }
  BH.active = active;
  BH.allCharacters = function () { return state.order.map(function (id) { return state.characters[id]; }); };

  /** Change the active character's data. Saves, records undo, re-renders. */
  BH.update = function (fn) {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    fn(active());
    save();
    queueRender();
  };

  function undo() {
    if (!undoStack.length) return;
    var tab = state.tab;
    state = JSON.parse(undoStack.pop());
    state.tab = tab;
    save();
    render();
  }

  // ---------- rendering ----------

  var els = {};

  // Remember what had focus so a redraw doesn't throw keyboard users back to
  // the top: inputs by id, buttons by their action and data attributes.
  function captureFocus() {
    var a = document.activeElement;
    if (!a || !els.root.contains(a)) return null;
    var f = {};
    if (a.id) f.selector = '#' + CSS.escape(a.id);
    else if (a.dataset && (a.dataset.action || a.dataset.tab)) {
      f.selector = Object.keys(a.dataset).map(function (k) {
        var attr = 'data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); });
        return '[' + attr + '="' + CSS.escape(a.dataset[k]) + '"]';
      }).join('');
    } else return null;
    try { f.start = a.selectionStart; f.end = a.selectionEnd; } catch (e) { /* number inputs */ }
    return f;
  }
  function restoreFocus(f) {
    if (!f) return;
    var el = els.root.querySelector(f.selector);
    if (!el || el.disabled) return;
    el.focus({ preventScroll: true });
    if (f.start != null) { try { el.setSelectionRange(f.start, f.end); } catch (e) { /* ignore */ } }
  }

  // Re-rendering replaces the panel's HTML. If that happened between a
  // pointer press and its release, the click would land on a removed button,
  // so renders wait for the pointer to come up.
  function queueRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      if (pointerDown) { renderTimer = setTimeout(render, 600); return; }
      render();
    }, 0);
  }

  function render() {
    clearTimeout(renderTimer);
    renderTimer = null;
    var focus = captureFocus();
    var ch = active();
    var mod = modules.filter(function (m) { return m.id === state.tab; })[0] || modules[0];

    els.select.innerHTML = state.order.map(function (id) {
      var c = state.characters[id];
      return '<option value="' + esc(id) + '"' + (id === state.activeId ? ' selected' : '') + '>' +
        esc(c.name || 'Unnamed') + '</option>';
    }).join('');
    els.undo.disabled = !undoStack.length;
    els.warning.hidden = storageOk;

    els.tabs.innerHTML = modules.map(function (m) {
      var on = m.id === mod.id;
      return '<button type="button" role="tab" id="tab-' + m.id + '" data-tab="' + m.id + '" aria-controls="tool-panel"' +
        ' aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '">' + esc(m.label) + '</button>';
    }).join('');

    var source = mod.source
      ? '<p class="source">Rules from <a href="../' + esc(mod.source.href) + '" target="_blank" rel="noopener">' +
        esc(mod.source.title) + '</a>.</p>'
      : '';
    els.panel.setAttribute('aria-labelledby', 'tab-' + mod.id);
    els.panel.innerHTML = source + mod.render(ch);
    restoreFocus(focus);
    if (focusAfterRender) {
      var target = els.root.querySelector(focusAfterRender);
      focusAfterRender = null;
      if (target) target.focus();
    }
  }
  BH.render = render;
  /** Move focus to `selector` once the next redraw is done (e.g. a newly added row). */
  BH.focusAfterRender = function (selector) { focusAfterRender = selector; };

  // ---------- events ----------

  function onClick(e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      save();
      render();
      return;
    }
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled || !els.root.contains(btn)) return;
    var name = btn.dataset.action;
    if (name === 'core.new') {
      var label = window.prompt('Name for the new character:', 'New Recruit');
      if (label === null) return;
      undoStack.push(JSON.stringify(state));
      addCharacter(label.trim() || 'New Recruit');
      save();
      render();
      return;
    }
    if (name === 'core.delete') {
      var ch = active();
      if (!window.confirm('Delete ' + (ch.name || 'this character') + ' from this browser? You can undo right after.')) return;
      undoStack.push(JSON.stringify(state));
      delete state.characters[ch.id];
      state.order = state.order.filter(function (id) { return id !== ch.id; });
      if (!state.order.length) addCharacter();
      state.activeId = state.order[0];
      save();
      render();
      return;
    }
    if (name === 'core.undo') { undo(); return; }
    var fn = actions[name];
    if (fn) {
      e.preventDefault();
      fn(active(), btn, e);
      // The click is complete, so it is safe to redraw straight away.
      if (renderTimer) render();
    }
  }

  function onChange(e) {
    var el = e.target;
    if (el === els.select) {
      state.activeId = el.value;
      save();
      render();
      return;
    }
    var path = el.dataset && el.dataset.bind;
    if (!path) return;
    var value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number' || el.dataset.type === 'number') {
      value = el.value.trim() === '' ? 0 : Number(el.value);
      if (!isFinite(value)) value = 0;
      if (el.min !== '' && value < Number(el.min)) value = Number(el.min);
      if (el.max !== '' && value > Number(el.max)) value = Number(el.max);
    } else value = el.value;
    BH.update(function (ch) { setPath(ch, path, value); });
    // Checkboxes and dropdowns change after the click is over, so they can
    // redraw at once. Text fields wait (see queueRender).
    if (el.type === 'checkbox' || el.tagName === 'SELECT') render();
  }

  function onTabKey(e) {
    var tab = e.target.closest('[role="tab"]');
    if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    var i = modules.findIndex(function (m) { return m.id === tab.dataset.tab; });
    i = (i + (e.key === 'ArrowRight' ? 1 : modules.length - 1)) % modules.length;
    state.tab = modules[i].id;
    save();
    render();
    var next = document.getElementById('tab-' + state.tab);
    if (next) next.focus();
  }

  BH.start = function () {
    els.root = document.getElementById('tools');
    els.select = document.getElementById('bh-char-select');
    els.undo = document.getElementById('bh-undo');
    els.tabs = document.getElementById('tool-tabs');
    els.panel = document.getElementById('tool-panel');
    els.warning = document.getElementById('storage-warning');
    load();
    save();
    els.root.addEventListener('click', onClick);
    els.root.addEventListener('change', onChange);
    els.tabs.addEventListener('keydown', onTabKey);
    document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
    ['pointerup', 'pointercancel'].forEach(function (t) {
      document.addEventListener(t, function () {
        pointerDown = false;
        if (renderTimer) queueRender();
      }, true);
    });
    window.addEventListener('blur', function () { pointerDown = false; });
    render();
  };
})();

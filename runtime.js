/* AX LF Prototype — 작은 템플릿 런타임
   화면 템플릿의 {{값}}, <sc-for>, <sc-if>, onClick 등을 해석해서 실제로 동작하게 만듭니다. */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = Object.assign({}, this.state, next);
      if (this.__view) this.__view.schedule();
    }
  }

  const EVENT_MAP = { onclick: 'click', onfocus: 'focus', onblur: 'blur', oninput: 'input', onkeydown: 'keydown', onkeyup: 'keyup', onsubmit: 'submit', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave' };

  function lookup(expr, scope, vals) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null' || expr === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return +expr;
    if (/^'.*'$/.test(expr) || /^".*"$/.test(expr)) return expr.slice(1, -1);
    const parts = expr.split('.');
    let v; let found = false;
    for (let i = scope.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { v = scope[i][parts[0]]; found = true; break; }
    }
    if (!found) v = vals[parts[0]];
    for (let k = 1; k < parts.length; k++) { if (v == null) return undefined; v = v[parts[k]]; }
    return v;
  }

  function interp(str, scope, vals) {
    return str.replace(/\{\{([^}]*)\}\}/g, (m, e) => {
      const v = lookup(e, scope, vals);
      return v == null || typeof v === 'function' ? '' : String(v);
    });
  }

  function singleHole(str) { const m = /^\s*\{\{([^}]*)\}\}\s*$/.exec(str); return m ? m[1] : null; }

  function process(parent, scope, vals, linkHook) {
    const kids = Array.from(parent.childNodes);
    for (const node of kids) {
      if (node.nodeType === 3) { if (node.nodeValue.indexOf('{{') >= 0) node.nodeValue = interp(node.nodeValue, scope, vals); continue; }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();

      if (tag === 'sc-for') {
        const list = lookup((node.getAttribute('list') || '').replace(/[{}]/g, ''), scope, vals);
        const as = node.getAttribute('as') || 'item';
        const frag = document.createDocumentFragment();
        (Array.isArray(list) ? list : []).forEach((item, index) => {
          const t = document.createElement('template');
          t.innerHTML = node.innerHTML;
          const s = {}; s[as] = item; s.index = index;
          process(t.content, scope.concat([s]), vals, linkHook);
          frag.appendChild(t.content);
        });
        node.replaceWith(frag);
        continue;
      }

      if (tag === 'sc-if') {
        const v = lookup((node.getAttribute('value') || '').replace(/[{}]/g, ''), scope, vals);
        if (v) {
          const t = document.createElement('template');
          t.innerHTML = node.innerHTML;
          process(t.content, scope, vals, linkHook);
          node.replaceWith(t.content);
        } else node.remove();
        continue;
      }

      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const raw = attr.value;
        if (name.indexOf('on') === 0) {
          node.removeAttribute(attr.name);
          const h = singleHole(raw);
          const fn = h ? lookup(h, scope, vals) : null;
          if (typeof fn !== 'function') continue;
          let ev = EVENT_MAP[name];
          if (name === 'onchange') {
            const t = (node.getAttribute('type') || '').toLowerCase();
            ev = (node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && t !== 'checkbox' && t !== 'radio')) ? 'input' : 'change';
          }
          if (!ev) ev = name.slice(2);
          node.addEventListener(ev, function (e) { fn(e); });
          continue;
        }
        if (raw.indexOf('{{') < 0) continue;
        const h = singleHole(raw);
        if (h !== null) {
          const v = lookup(h, scope, vals);
          if (name === 'checked' || name === 'selected' || name === 'disabled') {
            if (v) node.setAttribute(attr.name, ''); else node.removeAttribute(attr.name);
            if (name === 'checked') node.__checked = !!v;
          } else if (v == null || v === false || typeof v === 'function') node.removeAttribute(attr.name);
          else node.setAttribute(attr.name, v === true ? '' : String(v));
          if (name === 'value') node.__value = v == null ? '' : String(v);
        } else node.setAttribute(attr.name, interp(raw, scope, vals));
      }
      if (node.tagName === 'A' && linkHook) linkHook(node);
      process(node, scope, vals, linkHook);
    }
  }

  function pathOf(el, root) {
    const p = [];
    while (el && el !== root) { p.unshift(Array.prototype.indexOf.call(el.parentNode.children, el)); el = el.parentNode; }
    return p;
  }
  function byPath(root, p) { let el = root; for (const i of p) { if (!el || !el.children[i]) return null; el = el.children[i]; } return el; }

  class View {
    constructor(host, screen, linkHook) {
      this.host = host; this.screen = screen; this.linkHook = linkHook; this.pending = false;
      const Cls = new Function('DCLogic', screen.code + '\n;return Component;')(DCLogic);
      this.comp = new Cls({});
      this.comp.__view = this;
      this.render();
    }
    schedule() { if (this.pending) return; this.pending = true; Promise.resolve().then(() => { this.pending = false; this.render(); }); }
    render() {
      const host = this.host;
      // 입력 중이던 내용·포커스·스크롤을 기억
      const saved = [];
      host.querySelectorAll('input, textarea').forEach(el => {
        if (el.type === 'radio' || el.type === 'checkbox') return;
        saved.push({ p: pathOf(el, host), v: el.value, bound: el.__value !== undefined });
      });
      const active = host.contains(document.activeElement) ? document.activeElement : null;
      const activePath = active ? pathOf(active, host) : null;
      const selStart = active && 'selectionStart' in active ? active.selectionStart : null;
      const scrolls = [];
      host.querySelectorAll('*').forEach(el => { if (el.scrollTop) scrolls.push({ p: pathOf(el, host), t: el.scrollTop }); });
      const hostScroll = host.scrollTop;

      let vals = {};
      try { vals = this.comp.renderVals() || {}; } catch (e) { console.error(this.screen.id, e); }
      const t = document.createElement('template');
      t.innerHTML = this.screen.tpl;
      process(t.content, [], vals, this.linkHook);
      host.replaceChildren(t.content);

      // 값 반영 (checked / value 속성 → 실제 상태)
      host.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.__checked !== undefined) el.checked = el.__checked;
        if (el.__value !== undefined) el.value = el.__value;
      });
      for (const s of saved) {
        if (s.bound) continue;
        const el = byPath(host, s.p);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.__value === undefined) el.value = s.v;
      }
      if (activePath) {
        const el = byPath(host, activePath);
        if (el && el.focus) { el.focus({ preventScroll: true }); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} }
      }
      for (const s of scrolls) { const el = byPath(host, s.p); if (el) el.scrollTop = s.t; }
      host.scrollTop = hostScroll;
    }
  }

  window.AXRuntime = { DCLogic, View };
})();

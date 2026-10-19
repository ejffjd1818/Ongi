/* AX LF Prototype — 보드(전체 펼침) / 프로토타입 실행 모드 */
(function () {
  'use strict';
  const S = window.AX_SCREENS, ROWS = window.AX_ROWS;
  const board = document.getElementById('board');
  const body = document.body;
  const pick = document.getElementById('pick');
  const ids = [];
  let zoomMode = 'fit';

  // 1) 모든 화면을 줄별로 펼쳐서 실제로 동작하는 상태로 렌더
  ROWS.forEach(([title, list]) => {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<h2 class="row-title"></h2><div class="row-frames"></div>';
    row.firstChild.textContent = title;
    list.forEach(id => {
      const sc = S[id]; ids.push(id);
      const cell = document.createElement('figure'); cell.className = 'cell';
      const cap = document.createElement('figcaption'); cap.className = 'cell-cap';
      cap.innerHTML = '<span></span><button type="button">▶ 이 화면부터 실행</button>';
      cap.firstChild.textContent = id + ' · ' + sc.title;
      cap.lastChild.addEventListener('click', () => go(id, true));
      const frame = document.createElement('section');
      frame.className = 'frame'; frame.id = id; frame.dataset.screen = id;
      frame.style.width = sc.w + 'px'; frame.style.height = sc.h + 'px';
      cell.append(cap, frame); row.lastChild.appendChild(cell);
      new window.AXRuntime.View(frame, sc, null);
      const opt = document.createElement('option'); opt.value = id; opt.textContent = id + ' · ' + sc.title; pick.appendChild(opt);
    });
    board.appendChild(row);
  });

  // 2) 빈 링크(#)는 화면이 튀지 않게 막기
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#' || (href.charAt(0) === '#' && !S[href.slice(1)])) e.preventDefault();
  });

  // 3) 보드 확대/축소
  function applyZoom() {
    if (body.classList.contains('play')) { board.style.zoom = ''; return; }
    board.style.zoom = '';
    const z = zoomMode === 'fit' ? Math.min(1, innerWidth / board.scrollWidth) : zoomMode === 'z50' ? 0.5 : 1;
    board.style.zoom = z;
    document.querySelectorAll('#toolbar [data-act]').forEach(b => b.classList.toggle('on', b.dataset.act === zoomMode));
  }

  // 4) 프로토타입 실행 모드: 한 화면을 창에 맞춰 보여 줌
  function fitPlay() {
    const f = document.getElementById(current());
    if (!f) return;
    const s = Math.min(innerWidth / f.offsetWidth, innerHeight / f.offsetHeight);
    f.style.transform = 'translate(' + (innerWidth - f.offsetWidth * s) / 2 + 'px,' + (innerHeight - f.offsetHeight * s) / 2 + 'px) scale(' + s + ')';
  }
  function current() { const h = decodeURIComponent(location.hash.slice(1)); return S[h] ? h : 'S01-Start'; }

  function show() {
    const id = current();
    document.querySelectorAll('.frame').forEach(f => { f.classList.toggle('on', f.id === id); f.style.transform = ''; });
    pick.value = id;
    const f = document.getElementById(id);
    if (body.classList.contains('play')) { f.scrollTop = 0; fitPlay(); }
    else if (location.hash) {
      document.querySelectorAll('.frame.hit').forEach(x => x.classList.remove('hit'));
      f.classList.add('hit'); f.scrollTop = 0;
      f.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }
  function setMode(play) {
    body.classList.toggle('play', play); body.classList.toggle('board', !play);
    applyZoom(); show();
  }
  function go(id, play) { if (play) body.classList.add('play'), body.classList.remove('board'); if (location.hash.slice(1) === id) show(); else location.hash = id; applyZoom(); }

  addEventListener('hashchange', show);
  addEventListener('resize', () => { applyZoom(); if (body.classList.contains('play')) fitPlay(); });
  pick.addEventListener('change', () => { location.hash = pick.value; });
  document.getElementById('toolbar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'play') go(location.hash ? current() : 'S01-Start', true);
    else if (act === 'board') setMode(false);
    else { zoomMode = act; applyZoom(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('play')) setMode(false); });

  if (/[?&]play/.test(location.search)) setMode(true); else { applyZoom(); }
})();

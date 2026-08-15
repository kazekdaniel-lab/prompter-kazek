/* Prompter - dashboard do zarządzania skryptami (komputer i telefon). */
(() => {
  'use strict';
  const S = window.TPStore;
  const $ = (id) => document.getElementById(id);

  const listEl = $('list'), searchEl = $('search'), nameEl = $('name'), bodyEl = $('body');
  const topEl = document.querySelector('#ed .top'), footEl = $('edFoot'), noSel = $('noSel');
  const saveState = $('saveState'), statsEl = $('stats');
  const chip = $('cloudChip'), chipTxt = $('cloudTxt');

  let selId = null, dirty = false, saveT = null, pushT = null, dragId = null;

  S.seedIfEmpty();

  // ---------- toast ----------
  let toastT;
  function toast(msg, bad){
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 5000 : 2200);
  }

  // ---------- lista ----------
  function renderList(){
    const q = searchEl.value.trim().toLowerCase();
    const items = S.all().filter(s =>
      !q || (s.name || '').toLowerCase().includes(q) || (s.text || '').toLowerCase().includes(q));
    listEl.innerHTML = '';
    if (!items.length){
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = q ? 'Nic nie pasuje do wyszukiwania.' : 'Brak skryptów. Dodaj pierwszy przyciskiem „＋ Nowy”.';
      listEl.appendChild(d);
      return;
    }
    items.forEach((s, i) => {
      const st = S.stats(s.text);
      const el = document.createElement('div');
      el.className = 'item' + (s.id === selId ? ' sel' : '');
      el.draggable = true;
      el.dataset.id = s.id;
      el.innerHTML =
        `<div class="nm"></div><div class="pv"></div>` +
        `<div class="mt">${st.words} słów · ~${st.time} · ${S.ago(s.updatedAt)}</div>` +
        `<div class="mv"><button data-up title="W górę">▲</button><button data-dn title="W dół">▼</button></div>`;
      el.querySelector('.nm').textContent = s.name || 'Bez nazwy';
      el.querySelector('.pv').textContent = (s.text || '').replace(/\s+/g, ' ').slice(0, 60) || '(pusty)';
      el.addEventListener('click', (e) => {
        if (e.target.closest('.mv')) return;
        select(s.id);
      });
      el.querySelector('[data-up]').addEventListener('click', () => move(s.id, -1));
      el.querySelector('[data-dn]').addEventListener('click', () => move(s.id, 1));
      el.addEventListener('dragstart', () => { dragId = s.id; el.classList.add('drag'); });
      el.addEventListener('dragend', () => { dragId = null; el.classList.remove('drag');
        listEl.querySelectorAll('.item').forEach(x => x.classList.remove('over')); });
      el.addEventListener('dragover', (e) => { e.preventDefault(); if (dragId && dragId !== s.id) el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); dropOn(s.id); });
      listEl.appendChild(el);
    });
  }

  function move(id, dir){
    const ids = S.all().map(s => s.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    S.reorder(ids); renderList(); schedulePush();
  }
  function dropOn(targetId){
    if (!dragId || dragId === targetId) return;
    const ids = S.all().map(s => s.id);
    const from = ids.indexOf(dragId);
    ids.splice(from, 1);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    S.reorder(ids); renderList(); schedulePush();
  }

  // ---------- edytor ----------
  function select(id){
    flush();
    const s = S.get(id);
    if (!s){ selId = null; showEditor(false); renderList(); return; }
    selId = id;
    nameEl.value = s.name;
    bodyEl.value = s.text;
    showEditor(true);
    updateStats();
    setSaved(true);
    document.body.classList.add('editing');
    renderList();
  }
  function showEditor(v){
    topEl.style.display = v ? 'flex' : 'none';
    bodyEl.style.display = v ? 'block' : 'none';
    footEl.style.display = v ? 'flex' : 'none';
    noSel.style.display = v ? 'none' : 'flex';
  }
  function updateStats(){
    const st = S.stats(bodyEl.value);
    statsEl.innerHTML = `<b>${st.words}</b> słów · <b>${st.chars}</b> znaków · czytanie ~<b>${st.time}</b>`;
  }
  function setSaved(ok){
    dirty = !ok;
    saveState.textContent = ok ? 'Zapisano' : 'Zapisywanie...';
    saveState.style.color = ok ? '' : '#e0b48b';
  }
  function onEdit(){
    if (!selId) return;
    setSaved(false); updateStats();
    clearTimeout(saveT); saveT = setTimeout(flush, 600);
  }
  function flush(){
    clearTimeout(saveT);
    if (!selId || !dirty) return;
    S.save({ id: selId, name: nameEl.value.trim() || 'Bez nazwy', text: bodyEl.value });
    setSaved(true); renderList(); schedulePush();
  }
  nameEl.addEventListener('input', onEdit);
  bodyEl.addEventListener('input', onEdit);
  nameEl.addEventListener('blur', flush);
  bodyEl.addEventListener('blur', flush);
  searchEl.addEventListener('input', renderList);
  $('backList').addEventListener('click', () => { flush(); document.body.classList.remove('editing'); });

  $('btnNew').addEventListener('click', () => {
    flush();
    const id = S.save({ name: 'Nowy skrypt', text: '' });
    select(id); nameEl.focus(); nameEl.select(); schedulePush();
  });
  $('btnDup').addEventListener('click', () => {
    flush();
    const id = S.duplicate(selId);
    if (id){ select(id); schedulePush(); toast('Zduplikowano'); }
  });
  $('btnDel').addEventListener('click', () => {
    const s = S.get(selId); if (!s) return;
    if (!confirm('Usunąć „' + (s.name || 'Bez nazwy') + '”?')) return;
    S.remove(selId); selId = null; dirty = false;
    showEditor(false); renderList(); schedulePush();
    document.body.classList.remove('editing');
    toast('Usunięto');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); flush(); syncNow(true); }
  });

  // ---------- import / eksport ----------
  $('btnImport').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

  async function handleFiles(files){
    let n = 0, lastId = null;
    for (const f of files){
      const txt = await f.text();
      if (/\.json$/i.test(f.name)){
        try{ n += S.importJSON(txt); }catch(err){ toast(err.message, true); }
      } else {
        lastId = S.importPlain(f.name, txt); n++;
      }
    }
    renderList(); schedulePush();
    if (lastId) select(lastId);
    toast(n ? 'Wgrano skryptów: ' + n : 'Nic nie wgrano', !n);
  }

  ['dragover', 'drop'].forEach(ev => document.addEventListener(ev, (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (ev === 'drop') handleFiles(e.dataTransfer.files);
  }));

  $('btnExport').addEventListener('click', () => {
    flush();
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prompter-skrypty.json';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // ---------- chmura ----------
  function refreshChip(){
    const c = S.cloud();
    if (S.connected()){
      chip.className = 'chip on';
      chipTxt.textContent = 'Chmura: ' + (c.user ? c.user + ' · ' : '') + S.ago(c.lastSync);
    } else {
      chip.className = 'chip';
      chipTxt.textContent = 'Tylko lokalnie';
    }
  }
  function schedulePush(){
    refreshChip();
    if (!S.connected()) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => syncNow(false), 2500);
  }
  let syncing = false;
  async function syncNow(loud){
    if (!S.connected()){ if (loud) openCloud(); return; }
    if (syncing) return;
    syncing = true;
    chip.className = 'chip on'; chipTxt.textContent = 'Synchronizuję...';
    flush();
    try{
      const r = await S.sync();
      renderList();
      if (selId && !S.get(selId)){ selId = null; showEditor(false); }
      refreshChip();
      if (loud) toast('Zsynchronizowano · skryptów: ' + r.total);
    }catch(err){
      chip.className = 'chip err'; chipTxt.textContent = 'Błąd synchronizacji';
      toast(err.message, true);
    }finally{ syncing = false; }
  }
  $('btnSync').addEventListener('click', () => syncNow(true));
  $('btnCloud').addEventListener('click', openCloud);

  const ov = $('ov'), modal = $('modal');
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });

  function openCloud(){
    modal.innerHTML = S.connected() ? connectedHTML() : setupHTML();
    ov.classList.add('show');
    if (S.connected()){
      $('mCopy').addEventListener('click', async () => {
        const code = S.pairCode();
        try{ await navigator.clipboard.writeText(code); toast('Kod parowania skopiowany'); }
        catch(e){ const t = $('mCode'); t.focus();
          if (document.createRange && window.getSelection){
            const r = document.createRange(); r.selectNodeContents(t);
            const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          }
          toast('Skopiuj zaznaczony kod ręcznie'); }
      });
      $('mSync').addEventListener('click', () => { ov.classList.remove('show'); syncNow(true); });
      $('mOff').addEventListener('click', () => {
        if (!confirm('Odłączyć to urządzenie od chmury? Skrypty zostają lokalnie.')) return;
        S.clearCloud(); ov.classList.remove('show'); refreshChip(); toast('Odłączono');
      });
    } else {
      $('mConnect').addEventListener('click', async () => {
        const btn = $('mConnect'), val = $('mToken').value.trim();
        btn.disabled = true; btn.textContent = 'Łączę...';
        try{
          if (val.startsWith('PRM1.')) await S.applyPairCode(val);
          else await S.connect(val);
          ov.classList.remove('show');
          renderList(); refreshChip();
          toast('Połączono z chmurą');
        }catch(err){ toast(err.message, true); btn.disabled = false; btn.textContent = 'Połącz'; }
      });
      $('mToken').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('mConnect').click(); });
    }
  }

  function setupHTML(){
    return `
      <h3>Połącz z chmurą</h3>
      <p>Skrypty trzymają się wtedy w Twoim <b>prywatnym Gistcie na GitHubie</b> - dzięki temu to, co wpiszesz na komputerze, widzisz na telefonie i odwrotnie. Bez tego wszystko działa dalej, tylko lokalnie na tym urządzeniu.</p>
      <ol>
        <li>Otwórz <a class="link" href="${S.TOKEN_URL}" target="_blank" rel="noopener">stronę tworzenia tokenu</a> (zakres <b>gist</b> jest już zaznaczony, termin ważności ustaw na „No expiration”).</li>
        <li>Kliknij <b>Generate token</b> i skopiuj wartość zaczynającą się od <code>ghp_</code>.</li>
        <li>Wklej ją poniżej. Na telefonie zamiast tokenu wklej <b>kod parowania</b> z tego okna.</li>
      </ol>
      <input type="password" id="mToken" placeholder="ghp_... albo kod PRM1..." autocomplete="off" spellcheck="false">
      <div class="row"><button class="btn primary" id="mConnect">Połącz</button></div>
      <div class="warn">Token zostaje tylko w pamięci tej przeglądarki i daje dostęp wyłącznie do gistów - nie do repozytoriów.</div>`;
  }
  function connectedHTML(){
    const c = S.cloud();
    return `
      <h3>Chmura połączona</h3>
      <p>Konto: <b>${c.user || '-'}</b> · ostatnia synchronizacja: <b>${S.ago(c.lastSync)}</b><br>
         Gist: <a class="link" href="https://gist.github.com/${c.gistId}" target="_blank" rel="noopener">${c.gistId}</a></p>
      <p><b>Kod parowania</b> - skopiuj go tutaj i wklej w prompterze na telefonie (Ustawienia → Chmura → Wklej kod). Uniwersalny schowek Apple przenosi go z Maca na iPhone'a sam.</p>
      <div class="code" id="mCode">${S.pairCode()}</div>
      <div class="row">
        <button class="btn primary" id="mCopy">Kopiuj kod parowania</button>
        <button class="btn" id="mSync">Synchronizuj teraz</button>
        <button class="btn ghost" id="mOff">Odłącz</button>
      </div>
      <div class="warn">Kod zawiera token - nie wysyłaj go nikomu.</div>`;
  }

  // ---------- start ----------
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.connected() && Date.now() - (S.cloud().lastSync || 0) > 20000) syncNow(false);
  });

  renderList();
  refreshChip();
  const first = S.all()[0];
  if (first && window.innerWidth > 820) select(first.id);
  document.body.classList.remove('editing');
  if (S.connected()) syncNow(false);
})();

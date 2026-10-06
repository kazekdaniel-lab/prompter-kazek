/* Prompter - prosty teleprompter do self-video. Wszystko lokalnie na urządzeniu. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---- Elementy ----
  const cam = $('cam'), camMsg = $('camMsg'), camMsgText = $('camMsgText');
  const prompter = $('prompter'), viewport = $('viewport'), textEl = $('text');
  const recBtn = $('recBtn'), recbar = $('recbar'), recTime = $('recTime');
  const countEl = $('count'), countNum = $('countNum');
  const backdrop = $('backdrop'), toast = $('toast');
  const spdLab = $('spdLab');

  // ---- Ustawienia (localStorage) ----
  const SET_KEY = 'tp_settings_v1';
  const defaults = { speed:70, font:42, panel:55, width:92, opac:50, zoom:1, mirror:true, back:false,
                     res:'fhd', fps:30, vbr:0, preroll:3, delay:0 };
  let S = load(SET_KEY, defaults);
  // stary przełącznik odliczania -> nowe ustawienie w sekundach (jednorazowo)
  if (typeof S.countdown === 'boolean'){ S.preroll = S.countdown ? 3 : 0; delete S.countdown; save(SET_KEY, S); }

  function load(key, fb){ try{ return Object.assign({}, fb, JSON.parse(localStorage.getItem(key)||'{}')); }catch(e){ return {...fb}; } }
  function save(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
  const saveSettings = () => save(SET_KEY, S);

  // ---- Skrypty (wspólna baza TPStore, ta sama co w dashboardzie) ----
  const DB = window.TPStore;
  DB.seedIfEmpty();
  let currentId = DB.lastId();
  if (!DB.get(currentId)){ const f = DB.all()[0]; currentId = f ? f.id : ''; DB.setLastId(currentId); }
  function currentScript(){ return DB.get(currentId); }
  const EMPTY_TEXT = 'Brak skryptów.\n\nTapnij „Skrypty” na dole i dodaj pierwszy - albo wgraj je z komputera w dashboardzie i połącz telefon kodem parowania.';

  // ---- Toast ----
  let toastT;
  function showToast(msg){ toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(()=>toast.classList.remove('show'), 2200); }

  // ======================================================
  //  Kamera
  // ======================================================
  let stream = null;
  const RES = { max:{ w:3840, h:2160 }, fhd:{ w:1920, h:1080 }, hd:{ w:1280, h:720 } };

  function videoConstraints(){
    const d = RES[S.res] || RES.max;
    return { facingMode: S.back ? 'environment' : 'user',
             width:{ ideal:d.w }, height:{ ideal:d.h }, frameRate:{ ideal:S.fps } };
  }
  /* Dźwięk bierzemy dokładnie taki, jaki daje wpięty mikrofon. Wyłączone jest wyłącznie
     przetwarzanie systemu (echo, szumy, AGC) - poza tym apka nie dotyka niczego. */
  const AUDIO = { echoCancellation:false, noiseSuppression:false, autoGainControl:false };

  let camBusy = false;
  async function initCamera(){
    if (camBusy) return;              // bez podwójnych startów - każdy to mrugnięcie obrazu
    camBusy = true;
    stopStream();
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: videoConstraints() });
      cam.srcObject = stream;
      detectZoom();
      applyZoom();
      camMsg.classList.remove('show');
      await cam.play().catch(()=>{});
      updateMediaInfo();
    }catch(err){
      camMsg.classList.add('show');
      camMsgText.textContent = errText(err);
      $('camInfo').textContent = 'Kamera wyłączona.';
    }finally{ camBusy = false; }
  }

  /* Wpięcie mikrofonu w trakcie pracy nie przełącza trasy audio samo z siebie.
     Bierzemy wtedy ścieżkę dźwięku od nowa - obraz zostaje nietknięty. */
  async function refreshAudio(){
    if (!stream || recording) return;
    try{
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
      const nt = fresh.getAudioTracks()[0];
      if (!nt) return;
      stream.getAudioTracks().forEach(t => { stream.removeTrack(t); t.stop(); });
      stream.addTrack(nt);
      updateMediaInfo();
    }catch(e){}
  }

  function stopStream(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
  function errText(err){
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError')
      return 'Brak zgody na kamerę/mikrofon. Wejdź w ustawienia strony i zezwól, potem tapnij poniżej.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError')
      return 'Nie znaleziono kamery. Podłącz/odblokuj kamerę i spróbuj ponownie.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1')
      return 'Kamera działa tylko przez HTTPS. Otwórz stronę z adresu https://…';
    return 'Nie udało się włączyć kamery. Tapnij, aby spróbować ponownie.';
  }
  $('camRetry').addEventListener('click', initCamera);

  // Lustro + zoom (transform ustawiany z JS). Zoom sprzętowy = zmienia realny obraz (jest w nagraniu);
  // gdy urządzenie go nie ma (częste na przedniej kamerze), zoom cyfrowy przybliża sam podgląd kadru.
  let hwZoom = false, zoomCaps = null;
  function applyCamTransform(){
    const mir = (S.mirror && !S.back) ? -1 : 1;
    const dz = hwZoom ? 1 : (S.zoom || 1);
    cam.style.transform = `scaleX(${(mir*dz).toFixed(3)}) scaleY(${dz.toFixed(3)})`;
  }
  function detectZoom(){
    hwZoom = false; zoomCaps = null;
    try{
      const vt = stream && stream.getVideoTracks()[0];
      const caps = vt && vt.getCapabilities ? vt.getCapabilities() : null;
      if (caps && caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > (caps.zoom.min || 1)){
        zoomCaps = { min: caps.zoom.min || 1, max: caps.zoom.max, step: caps.zoom.step || 0.1 };
        hwZoom = true;
        const rz = $('rZoom');
        rz.min = zoomCaps.min; rz.max = zoomCaps.max; rz.step = zoomCaps.step;
        S.zoom = Math.min(zoomCaps.max, Math.max(zoomCaps.min, S.zoom || 1));
        rz.value = S.zoom; $('vZoom').textContent = (+S.zoom).toFixed(1) + '×';
      }
    }catch(e){}
  }
  function applyZoom(){
    const vt = stream && stream.getVideoTracks()[0];
    if (hwZoom && vt && zoomCaps){
      const z = Math.min(zoomCaps.max, Math.max(zoomCaps.min, S.zoom));
      try{ vt.applyConstraints({ advanced:[{ zoom: z }] }); }catch(e){}
    }
    applyCamTransform();
  }

  // ======================================================
  //  Co realnie leci do pliku: rozdzielczość, klatki, mikrofon
  // ======================================================
  function micLabel(){
    const at = stream && stream.getAudioTracks()[0];
    return (at && at.label) || 'systemowy';
  }

  function updateMediaInfo(){
    const vt = stream && stream.getVideoTracks()[0];
    if (!vt){ $('camInfo').textContent = 'Kamera wyłączona.'; return; }
    const s = vt.getSettings ? vt.getSettings() : {};
    const px = (s.width && s.height) ? s.width + '×' + s.height : 'nieznana rozdzielczość';
    const fps = s.frameRate ? ' @ ' + Math.round(s.frameRate) + ' kl/s' : '';
    const vbr = S.vbr ? S.vbr + ' Mb/s' : 'automatyczna';
    $('camInfo').innerHTML = 'Nagrywa: <b>' + px + fps + '</b> · zapis ' + vbr +
      '<br>Dźwięk: <b>' + esc(micLabel()) + '</b>';
  }

  // ======================================================
  //  Silnik przewijania
  // ======================================================
  let playing = false, scrollPos = 0, lastT = 0, rafId = null, maxScroll = 0;

  function renderText(){
    const s = currentScript();
    const txt = s ? (s.text || '') : EMPTY_TEXT;
    // linie produkcyjne zostają w tekście, ale są wygaszone - oko je przeskakuje
    const dim = (t) => '<i class="note">' + esc(t) + '</i>';
    textEl.innerHTML = txt.split('\n').map(line => {
      if (DB.isNote(line)) return dim(line);
      const p = DB.notePrefix(line);                 // np. `CTA: „...”` - szara etykieta, biała wypowiedź
      const rest = p ? p.said : line;
      const body = esc(rest).replace(/\((gest|przebitka|pauza|uwaga)\s*:[^)]*\)/gi, m => dim(m));
      return p ? dim(p.note) + body : body;
    }).join('\n');
    requestAnimationFrame(relayout);
  }
  function relayout(){
    const vh = viewport.clientHeight;
    const readY = vh * parseFloat(getComputedStyle(root).getPropertyValue('--reading'));
    textEl.style.paddingTop = readY + 'px';
    textEl.style.paddingBottom = vh + 'px';
    maxScroll = Math.max(0, textEl.scrollHeight - vh);
    applyScroll();
  }
  function applyScroll(){ textEl.style.transform = `translateX(-50%) translateY(${-scrollPos}px)`; }

  function tick(t){
    if (playing){
      if (!lastT) lastT = t;
      const dt = (t - lastT) / 1000; lastT = t;
      scrollPos += S.speed * dt;
      if (scrollPos >= maxScroll){ scrollPos = maxScroll; setPlaying(false); }
      applyScroll();
    } else { lastT = 0; }
    rafId = requestAnimationFrame(tick);
  }
  function setPlaying(v){
    playing = v; lastT = 0;
    $('playIcon').innerHTML = v
      ? '<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>'
      : '<path d="M8 5v14l11-7z"/>';
    $('playLabel').textContent = v ? 'Pauza' : 'Przewiń';
  }
  function restartScroll(){ scrollPos = 0; applyScroll(); }

  $('btnPlay').addEventListener('click', () => setPlaying(!playing));
  $('btnRestart').addEventListener('click', () => { restartScroll(); if(!recording) setPlaying(false); });

  // Palec po panelu = ręczne przewijanie tekstu (działa też w trakcie nagrania).
  // Tap bez przesunięcia = pauza/wznowienie, podwójny tap = od początku.
  let lastTap = 0, drag = null;

  prompter.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, y0: e.clientY, moved: false, wasPlaying: playing };
    try{ prompter.setPointerCapture(e.pointerId); }catch(err){}
  });
  prompter.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y0) > 6){
      drag.moved = true;
      if (playing) setPlaying(false);          // przy chwytaniu tekst staje
    }
    if (drag.moved){
      scrollPos = Math.max(0, Math.min(maxScroll, scrollPos - (e.clientY - drag.y)));
      applyScroll();
      drag.y = e.clientY;
    }
  });
  function endDrag(e){
    if (!drag) return;
    const moved = drag.moved, wasPlaying = drag.wasPlaying;
    drag = null;
    try{ prompter.releasePointerCapture(e.pointerId); }catch(err){}
    if (moved){
      if (wasPlaying) setPlaying(true);        // po przewinięciu wraca do tego, co było
      return;
    }
    const now = Date.now();
    if (now - lastTap < 300){ restartScroll(); setPlaying(false); }
    else setPlaying(!playing);
    lastTap = now;
  }
  prompter.addEventListener('pointerup', endDrag);
  prompter.addEventListener('pointercancel', endDrag);

  // ======================================================
  //  Prędkość (szybkie +/- na prawej krawędzi)
  // ======================================================
  function setSpeed(v){
    S.speed = Math.min(260, Math.max(15, Math.round(v)));
    spdLab.textContent = S.speed; $('spdLab').textContent = S.speed;
    $('rSpeed').value = S.speed; $('vSpeed').textContent = S.speed;
    saveSettings();
  }
  $('spdUp').addEventListener('click', () => setSpeed(S.speed + 10));
  $('spdDn').addEventListener('click', () => setSpeed(S.speed - 10));

  // ======================================================
  //  Nagrywanie
  // ======================================================
  let recorder = null, chunks = [], recording = false, recordedBlob = null, recStart = 0, recTimer = null, mime = '';
  let recScriptName = '';   // tytuł skryptu z chwili startu - trafia do nazwy pliku
  let failReason = '';      // powód, dla którego nagranie skończyło się samo

  /* Gdy system ubije kamerę, mikrofon albo koder, MediaRecorder cichnie bez słowa.
     Pilnujemy ścieżek i błędów kodera, żeby dało się to zobaczyć i uratować materiał. */
  function watchTracks(){
    if (!stream) return;
    stream.getTracks().forEach(t => {
      t.onended = () => failRec((t.kind === 'audio' ? 'mikrofon' : 'kamera') + ' przestała dostarczać sygnał');
      t.onmute = () => { if (recording && t.kind === 'audio') showToast('Mikrofon wyciszony przez system'); };
    });
  }
  function failRec(reason){
    if (!recording) return;
    failReason = reason;
    stopRecording();
  }

  function pickMime(){
    if (!('MediaRecorder' in window)) return '';
    const cands = ['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp9,opus',
                   'video/webm;codecs=vp8,opus','video/webm'];
    for (const c of cands){ try{ if (MediaRecorder.isTypeSupported(c)) return c; }catch(e){} }
    return '';
  }

  recBtn.addEventListener('click', () => {
    if (counting){ cancelled = true; showToast('Odliczanie przerwane'); return; }
    if (recording) stopRecording(); else startFlow();
  });

  async function startFlow(){
    if (!stream){ await initCamera(); if (!stream){ showToast('Najpierw włącz kamerę'); return; } }
    if (!('MediaRecorder' in window)){ showToast('Ta przeglądarka nie nagrywa wideo'); return; }
    acquireWake();                    // ekran nie może zgasnąć w trakcie ujęcia
    if (S.preroll > 0){
      cancelled = false;
      await countdown(S.preroll);
      if (cancelled) return;          // tapnięcie w czerwony przycisk w trakcie odliczania = anulowanie
    }
    startRecording();
  }
  let cancelled = false;

  let counting = false;
  function countdown(n){
    return new Promise((resolve) => {
      counting = true;
      countEl.classList.add('show');
      countNum.textContent = n;
      const iv = setInterval(() => {
        n--;
        if (cancelled || n <= 0){ clearInterval(iv); countEl.classList.remove('show'); counting = false; resolve(); }
        else countNum.textContent = n;
      }, 1000);
    });
  }

  function startRecording(){
    chunks = []; recordedBlob = null; mime = pickMime();
    const cs = currentScript();
    recScriptName = (cs && cs.name) || 'prompter';
    const opts = { audioBitsPerSecond: 192000 };
    if (mime) opts.mimeType = mime;
    if (S.vbr) opts.videoBitsPerSecond = S.vbr * 1000000;
    try{ recorder = new MediaRecorder(stream, opts); }
    catch(e){
      try{ recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch(e2){ recorder = new MediaRecorder(stream); }
    }
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = onRecStop;
    recorder.onerror = (e) => failRec('koder zgłosił błąd (' + ((e && e.error && e.error.name) || 'nieznany') + ')');
    watchTracks();
    failReason = '';
    // Bez timeslice. Zrzuty co sekundę dawały fragmentowany MP4, przez który iOS
    // nie proponował już zapisu do Zdjęć - plik leciał prosto do Plików.
    recorder.start();
    recording = true;
    recBtn.classList.add('recording');
    recbar.classList.add('show');
    setChromeHidden(true);
    restartScroll();
    startTextDelay();
    recStart = performance.now();
    updateRecTime();
    recTimer = setInterval(updateRecTime, 250);
  }

  /* Tekst może ruszyć dopiero po chwili od startu nagrania - czas na wejście w kadr. */
  let holdTimer = null, holdTick = null;
  const recHold = $('recHold');
  function startTextDelay(){
    clearTextDelay();
    const d = Math.round(S.delay || 0);
    if (d <= 0){ setPlaying(true); return; }
    setPlaying(false);
    let left = d;
    recHold.textContent = 'tekst za ' + left;
    recHold.classList.add('show');
    holdTick = setInterval(() => {
      left--;
      if (left > 0) recHold.textContent = 'tekst za ' + left;
    }, 1000);
    holdTimer = setTimeout(() => { clearTextDelay(); if (recording) setPlaying(true); }, d * 1000);
  }
  function clearTextDelay(){
    clearTimeout(holdTimer); clearInterval(holdTick);
    holdTimer = holdTick = null;
    recHold.classList.remove('show');
  }

  function stopRecording(){
    if (!recorder || !recording) return;
    recording = false;
    clearTextDelay();
    setPlaying(false);
    clearInterval(recTimer);
    recBtn.classList.remove('recording');
    recbar.classList.remove('show');
    setChromeHidden(false);
    try{ recorder.stop(); }catch(e){}
  }

  function updateRecTime(){
    const s = Math.floor((performance.now() - recStart) / 1000);
    recTime.textContent = Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
  }

  function onRecStop(){
    // jeśli recording jest wciąż true, to znaczy, że nikt nie tapnął stopu - przerwał system
    const interrupted = recording || !!failReason;
    if (recording){ recording = false; clearTextDelay(); setPlaying(false); clearInterval(recTimer);
      recBtn.classList.remove('recording'); recbar.classList.remove('show'); setChromeHidden(false); }
    const type = (chunks[0] && chunks[0].type) || mime || 'video/mp4';
    recordedBlob = new Blob(chunks, { type });
    if (!recordedBlob.size){ showToast('Puste nagranie' + (failReason ? ': ' + failReason : '')); return; }
    const secs = Math.max(0.1, (performance.now() - recStart) / 1000);
    showFail(interrupted, secs);
    const url = URL.createObjectURL(recordedBlob);
    const rv = $('reviewVid');
    rv.src = url; rv.muted = false;
    rv.onloadedmetadata = () => showRecStats(rv, secs);
    showRecStats(rv, secs);
    openSheet('reviewSheet');
  }

  function showFail(interrupted, secs){
    const box = $('recFail');
    box.classList.toggle('show', !!interrupted);
    if (!interrupted) return;
    const vt = stream && stream.getVideoTracks()[0];
    const set = (vt && vt.getSettings) ? vt.getSettings() : {};
    const heavy = (set.height > 1200) || S.vbr >= 20 || S.fps > 30;
    $('recFailTxt').innerHTML =
      '<b>Nagranie urwało się samo po ' + Math.round(secs) + ' s.</b> ' +
      (failReason ? 'Powód: ' + esc(failReason) + '. ' : '') +
      'Materiał do tego momentu jest zapisany - możesz go zapisać niżej.' +
      (heavy ? '<br>Ustawienia obrazu są ciężkie (' + (set.height || '?') + 'p, ' + S.fps + ' kl/s' +
               (S.vbr ? ', ' + S.vbr + ' Mb/s' : '') + '). Safari na iPhonie potrafi przy takich przerwać zapis.' : '');
    $('recFix').style.display = heavy ? 'block' : 'none';
  }
  $('recFix').addEventListener('click', () => {
    S.res = 'fhd'; S.fps = 30; S.vbr = 12; saveSettings();
    $('selRes').value = 'fhd'; $('selFps').value = '30'; $('selVbr').value = '12';
    initCamera();
    $('recFail').classList.remove('show');
    showToast('Ustawione: 1080p, 30 kl/s, 12 Mb/s');
  });

  function showRecStats(rv, secs){
    const mb = recordedBlob.size / 1048576;
    const mbps = (recordedBlob.size * 8) / secs / 1000000;
    const px = (rv.videoWidth && rv.videoHeight) ? rv.videoWidth + '×' + rv.videoHeight + ' · ' : '';
    $('recStats').innerHTML = '<b>' + esc(recScriptName) + '</b><br>' + px + mb.toFixed(1) + ' MB · ' +
      mbps.toFixed(1) + ' Mb/s · ' + Math.round(secs) + ' s · dźwięk: ' + esc(micLabel());
  }

  // Zapis / udostępnianie
  $('saveRec').addEventListener('click', shareRecording);
  /* Nazwa pliku bierze tytuł skryptu, z którego nagrywałeś. */
  const PL = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
               'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z' };
  function slug(s){
    return String(s || '').trim()
      .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL[c] || c)
      .replace(/[\\/:*?'"<>|#%{}$!@+`=,;.]/g, '')  // znaki kłopotliwe w nazwach plików
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 64) || 'prompter';
  }

  async function shareRecording(){
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const title = recScriptName || (currentScript() && currentScript().name) || 'prompter';
    const name = slug(title) + '-' + tstamp() + '.' + ext;
    const file = new File([recordedBlob], name, { type: recordedBlob.type });
    if (navigator.canShare && navigator.canShare({ files:[file] })){
      try{ await navigator.share({ files:[file] }); return; }
      catch(e){ if (e && e.name === 'AbortError') return; }
    }
    // fallback: pobranie pliku
    const a = document.createElement('a');
    a.href = URL.createObjectURL(recordedBlob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    showToast('Pobrano do plików');
  }
  function tstamp(){ const d = new Date(); const p = (x)=>String(x).padStart(2,'0');
    return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds()); }

  $('againRec').addEventListener('click', () => { closeSheet(); restartScroll(); });

  function setChromeHidden(hidden){ $('bar').classList.toggle('rec', hidden); $('recCaption').classList.toggle('show', hidden); }

  // ======================================================
  //  Bottom sheets
  // ======================================================
  let openId = null;
  function openSheet(id){ if(openId) $(openId).classList.remove('open');
    openId = id; $(id).classList.add('open'); backdrop.classList.add('show'); }
  function closeSheet(){ if(openId) $(openId).classList.remove('open'); openId=null; backdrop.classList.remove('show'); }
  backdrop.addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
  $('btnSettings').addEventListener('click', () => { openSheet('settingsSheet'); updateMediaInfo(); });
  $('btnScripts').addEventListener('click', () => { renderScriptList(); hideEditor(); openSheet('scriptsSheet'); });

  // ======================================================
  //  Panel skryptów
  // ======================================================
  const scriptList = $('scriptList'), editor = $('editor'),
        nameInput = $('scriptName'), textInput = $('scriptText');
  let editingId = null;

  function renderScriptList(){
    scriptList.innerHTML = '';
    const items = DB.all();
    if (!items.length){
      const e = document.createElement('p');
      e.className = 'hint';
      e.style.textAlign = 'center';
      e.textContent = 'Brak skryptów. Dodaj pierwszy poniżej.';
      scriptList.appendChild(e);
      return;
    }
    items.forEach(s => {
      const div = document.createElement('div');
      div.className = 'sitem' + (s.id === currentId ? ' active' : '');
      const st = DB.stats(s.text);
      const preview = (s.text||'').replace(/\s+/g,' ').slice(0,38);
      const nm = document.createElement('div'); nm.className='nm';
      nm.innerHTML = `${esc(s.name||'Bez nazwy')}<div class="pv">${esc(preview)||'(pusty)'} · ~${st.time}</div>`;
      nm.addEventListener('click', () => { selectScript(s.id); closeSheet(); });
      const eBtn = document.createElement('button'); eBtn.className='iconbtn'; eBtn.textContent='✎';
      eBtn.addEventListener('click', () => showEditor(s.id));
      const dBtn = document.createElement('button'); dBtn.className='iconbtn'; dBtn.textContent='🗑';
      dBtn.addEventListener('click', () => deleteScript(s.id));
      div.appendChild(nm); div.appendChild(eBtn); div.appendChild(dBtn);
      scriptList.appendChild(div);
    });
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function selectScript(id){ currentId = id; DB.setLastId(id); renderText(); restartScroll(); setPlaying(false); }

  function showEditor(id){
    editingId = id;
    const s = id ? DB.get(id) : null;
    nameInput.value = s ? s.name : '';
    textInput.value = s ? s.text : '';
    editor.style.display = 'block';
    editor.scrollIntoView({ behavior:'smooth', block:'center' });
  }
  function hideEditor(){ editor.style.display = 'none'; editingId = null; }
  $('newScript').addEventListener('click', () => showEditor(null));
  $('cancelEdit').addEventListener('click', hideEditor);

  $('saveScript').addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Bez nazwy';
    const id = DB.save({ id: editingId, name, text: textInput.value });
    if (!editingId){ currentId = id; DB.setLastId(id); }
    hideEditor(); renderScriptList();
    if (id === currentId) renderText();
    showToast('Zapisano');
    pushSoon();
  });

  function deleteScript(id){
    if (!confirm('Usunąć ten skrypt?')) return;
    DB.remove(id);
    if (currentId === id){
      const f = DB.all()[0];
      currentId = f ? f.id : '';
      DB.setLastId(currentId);
      renderText();
    }
    renderScriptList();
    pushSoon();
  }

  // ======================================================
  //  Chmura (wspólna baza z komputerem)
  // ======================================================
  const syncRow = $('syncRow'), syncTxt = $('syncTxt'), cloudStatus = $('cloudStatus'),
        cloudInput = $('cloudInput'), cloudOff = $('cloudOff');
  let syncing = false, pushT = null;

  function updateCloudUI(msg, state){
    const c = DB.cloud(), on = DB.connected();
    syncRow.className = 'syncrow' + (state ? ' ' + state : (on ? ' on' : ''));
    syncTxt.textContent = msg || (on ? 'Chmura · ' + DB.ago(c.lastSync) : 'Tylko na tym telefonie');
    cloudStatus.textContent = on
      ? 'Połączono' + (c.user ? ' jako ' + c.user : '') + '. Ostatnia synchronizacja: ' + DB.ago(c.lastSync) + '.'
      : 'Nie połączono. Skrypty są tylko na tym telefonie.';
    cloudOff.style.display = on ? 'block' : 'none';
    $('cloudPaste').textContent = on ? 'Wklej inny kod' : 'Połącz kodem';
  }

  async function cloudSync(loud){
    if (!DB.connected()){ if (loud){ showToast('Najpierw połącz kodem z dashboardu'); openSheet('settingsSheet'); } return; }
    if (syncing) return;
    syncing = true;
    updateCloudUI('Synchronizuję...', 'on');
    try{
      const r = await DB.sync();
      if (!DB.get(currentId)){ const f = DB.all()[0]; currentId = f ? f.id : ''; DB.setLastId(currentId); renderText(); }
      else renderText();
      renderScriptList();
      updateCloudUI();
      if (loud) showToast('Zsynchronizowano · skryptów: ' + r.total);
    }catch(err){
      updateCloudUI('Błąd: ' + err.message.slice(0, 40), 'err');
      if (loud) showToast(err.message.slice(0, 60));
    }finally{ syncing = false; }
  }
  function pushSoon(){
    updateCloudUI();
    if (!DB.connected()) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => cloudSync(false), 1500);
  }

  $('syncBtn').addEventListener('click', () => cloudSync(true));
  $('cloudSync').addEventListener('click', () => cloudSync(true));

  $('cloudPaste').addEventListener('click', async () => {
    let code = '';
    try{ code = await navigator.clipboard.readText(); }catch(e){}
    if (code && code.trim().startsWith('PRM1.')) return applyCode(code);
    cloudInput.style.display = 'block';
    cloudInput.focus();
    showToast('Wklej kod w pole powyżej');
  });
  cloudInput.addEventListener('change', () => applyCode(cloudInput.value));
  cloudInput.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); applyCode(cloudInput.value); } });

  async function applyCode(code){
    try{
      updateCloudUI('Łączę...', 'on');
      await DB.applyPairCode(code);
      cloudInput.value = ''; cloudInput.style.display = 'none';
      if (!DB.get(currentId)){ const f = DB.all()[0]; currentId = f ? f.id : ''; DB.setLastId(currentId); }
      renderText(); renderScriptList(); updateCloudUI();
      showToast('Połączono z chmurą');
    }catch(err){
      updateCloudUI('Błąd połączenia', 'err');
      showToast(err.message.slice(0, 70));
    }
  }

  cloudOff.addEventListener('click', () => {
    if (!confirm('Odłączyć telefon od chmury? Skrypty zostaną na telefonie.')) return;
    DB.clearCloud(); updateCloudUI(); showToast('Odłączono');
  });

  // ======================================================
  //  Ustawienia (suwaki + przełączniki)
  // ======================================================
  function applyVars(){
    root.style.setProperty('--font', S.font + 'px');
    root.style.setProperty('--panel-h', S.panel);
    root.style.setProperty('--text-w', S.width);
    root.style.setProperty('--panel-op', (S.opac/100).toFixed(2));
    requestAnimationFrame(relayout);
  }
  function bindRange(id, key, label, fmt){
    const el = $(id), out = $(label);
    el.value = S[key];
    out.textContent = fmt ? fmt(S[key]) : S[key];
    el.addEventListener('input', () => {
      S[key] = parseFloat(el.value);
      out.textContent = fmt ? fmt(S[key]) : S[key];
      if (key === 'speed'){ spdLab.textContent = S.speed; }
      applyVars(); saveSettings();
    });
  }
  bindRange('rSpeed','speed','vSpeed');
  bindRange('rFont','font','vFont');
  bindRange('rPanel','panel','vPanel', v => v+'%');
  bindRange('rWidth','width','vWidth', v => v+'%');
  bindRange('rOpac','opac','vOpac', v => v+'%');
  (function(){
    const el = $('rZoom'), out = $('vZoom');
    el.value = S.zoom; out.textContent = (+S.zoom).toFixed(1) + '×';
    el.addEventListener('input', () => {
      S.zoom = parseFloat(el.value); out.textContent = S.zoom.toFixed(1) + '×';
      applyZoom(); saveSettings();
    });
  })();

  function bindToggle(id, key, onChange){
    const el = $(id);
    el.classList.toggle('on', !!S[key]);
    el.addEventListener('click', () => {
      S[key] = !S[key]; el.classList.toggle('on', S[key]); saveSettings();
      if (onChange) onChange();
    });
  }
  bindToggle('tMirror','mirror', applyCamTransform);
  bindToggle('tBack','back', () => initCamera());

  // Listy w ustawieniach: obraz i start nagrania
  function bindSelect(id, key, num, onChange){
    const el = $(id);
    if (!el) return;
    el.value = String(S[key]);
    el.addEventListener('change', () => {
      S[key] = num ? (parseFloat(el.value) || 0) : el.value;
      saveSettings();
      if (onChange) onChange();
    });
  }
  bindSelect('selRes','res', false, () => initCamera());
  bindSelect('selFps','fps', true, () => initCamera());
  bindSelect('selVbr','vbr', true, updateMediaInfo);
  bindSelect('selPre','preroll', true);
  bindSelect('selDelay','delay', true);

  // Wpięcie/odpięcie mikroportu: po cichu bierzemy nowe wejście, bez pytania i bez komunikatów
  if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices){
    let devT = null;
    navigator.mediaDevices.addEventListener('devicechange', () => {
      clearTimeout(devT);
      devT = setTimeout(() => { if (!recording) refreshAudio(); }, 600);
    });
  }

  // ======================================================
  //  Pilot: telefon słucha komend z komputera (MQTT po WSS, bez serwera)
  // ======================================================
  const RKEY = 'tp_remote_v1';
  let R = (function(){ try{ return JSON.parse(localStorage.getItem(RKEY)) || {}; }catch(e){ return {}; } })();
  if (!R.code) R.code = String(Math.floor(100000 + Math.random() * 900000));
  R.on = !!R.on;
  const saveRemote = () => { try{ localStorage.setItem(RKEY, JSON.stringify(R)); }catch(e){} };
  saveRemote();

  let mq = null, stateT = null;
  const topicCmd = () => 'prompter/' + R.code + '/cmd';
  const topicState = () => 'prompter/' + R.code + '/state';

  let lastStatus = '';
  function remoteUI(status){
    if (status) lastStatus = status;
    const code = $('remoteCode'), sw = $('tRemote'), info = $('remoteInfo');
    if (!code || !sw || !info) return;          // starsza wersja strony - nie wywracamy apki
    code.textContent = R.code;
    sw.classList.toggle('on', R.on);
    info.textContent = !R.on ? 'Wyłączony.'
      : (mq && mq.connected() ? 'Połączony - czeka na komendy. Kod wpisz w pilocie na komputerze.'
                              : (lastStatus || 'Łączę...'));
  }

  function remoteStart(){
    if (mq || !window.TPMqtt || !R.on) return;
    mq = TPMqtt.connect({
      onStatus: (st) => remoteUI(st),
      onOpen: () => { mq.subscribe(topicCmd()); sendState(); },
      onMessage: (t, m) => { if (t === topicCmd()) handleCmd(m); }
    });
    clearInterval(stateT);
    stateT = setInterval(sendState, 1000);
  }
  function remoteStop(){
    clearInterval(stateT); stateT = null;
    if (mq){ mq.close(); mq = null; }
    remoteUI();
  }
  function sendState(){
    if (!mq || !mq.connected()) return;
    const s = currentScript();
    mq.publish(topicState(), { rec: recording, cnt: counting, t: recording ? Math.floor((performance.now() - recStart) / 1000) : 0,
                               playing: playing, speed: S.speed, script: (s && s.name) || '', ready: !!stream });
  }
  function handleCmd(m){
    if (!m || !m.c) return;
    switch (m.c){
      case 'start':   if (!recording && !counting) startFlow(); break;
      case 'stop':    if (recording) stopRecording(); else if (counting) cancelled = true; break;
      case 'toggle':  if (recording) stopRecording(); else if (counting) cancelled = true; else startFlow(); break;
      case 'restart': restartScroll(); break;
      case 'play':    setPlaying(!playing); break;
      case 'speed':   setSpeed(S.speed + (m.v || 0)); break;
      case 'ping':    break;
    }
    sendState();
  }

  bindToggleRemote();
  function bindToggleRemote(){
    remoteUI();
    const sw = $('tRemote');
    if (!sw) return;
    sw.addEventListener('click', async () => {
      R.on = !R.on; saveRemote();
      remoteUI();                          // przełącznik reaguje od razu, zanim ruszy sieć
      if (!R.on){ remoteStop(); showToast('Pilot wyłączony'); return; }
      showToast('Pilot włączony - kod ' + R.code);
      try{
        await ensureMqtt();
        remoteStart();
      }catch(err){
        remoteUI('Nie udało się wczytać pilota - odśwież apkę');
      }
    });
    if (R.on) ensureMqtt().then(remoteStart).catch(() => remoteUI('Brak pliku pilota - odśwież apkę'));
  }

  /* Gdyby mqtt.js nie zdążył się wczytać (stary cache), dociągamy go w locie. */
  function ensureMqtt(){
    if (window.TPMqtt) return Promise.resolve();
    return new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = './mqtt.js?v=' + Date.now();
      sc.onload = () => window.TPMqtt ? res() : rej(new Error('brak TPMqtt'));
      sc.onerror = () => rej(new Error('nie pobrano mqtt.js'));
      document.head.appendChild(sc);
    });
  }

  // ======================================================
  //  Wake Lock (ekran nie gaśnie)
  // ======================================================
  let wl = null;
  async function acquireWake(){
    try{ if ('wakeLock' in navigator){ wl = await navigator.wakeLock.request('screen'); } }catch(e){}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    acquireWake();
    if (!recording && DB.connected() && Date.now() - (DB.cloud().lastSync || 0) > 20000) cloudSync(false);
  });

  // ======================================================
  //  Instrukcja "Dodaj do ekranu głównego" (iOS Safari)
  // ======================================================
  (function installHint(){
    const standalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!standalone && iOS && !localStorage.getItem('tp_install_dismissed')){
      const el = $('install'); el.classList.add('show');
      $('installClose').addEventListener('click', () => { el.classList.remove('show'); localStorage.setItem('tp_install_dismissed','1'); });
    }
  })();

  // ======================================================
  //  Start
  // ======================================================
  window.addEventListener('resize', () => requestAnimationFrame(relayout));
  window.addEventListener('orientationchange', () => setTimeout(relayout, 300));
  setSpeed(S.speed);
  applyVars();
  renderText();
  setPlaying(false);
  rafId = requestAnimationFrame(tick);
  acquireWake();
  initCamera();
  updateCloudUI();
  DB.pullInbox().then(n => {
    if (!n) return;
    if (!DB.get(currentId)){ const f = DB.all()[0]; currentId = f ? f.id : ''; DB.setLastId(currentId); renderText(); }
    renderScriptList();
    showToast(n === 1 ? 'Doszedł 1 nowy skrypt' : 'Doszły nowe skrypty: ' + n);
    pushSoon();
  }).catch(() => {});
  if (DB.connected()) cloudSync(false);

  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();

/* Pilot: wysyła komendy do telefonu i pokazuje jego stan. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'tp_remote_code_v1';

  let mq = null, code = localStorage.getItem(KEY) || '', last = 0, state = {};

  $('code').value = code;
  $('code').addEventListener('input', () => {
    code = $('code').value.replace(/\D/g, '').slice(0, 6);
    $('code').value = code;
    localStorage.setItem(KEY, code);
    if (code.length === 6) connect();
  });

  function connect(){
    if (mq) mq.close();
    setChip('łączę z brokerem...', '');
    mq = TPMqtt.connect({
      onStatus: (st) => { if (st !== 'połączono') setChip(st.indexOf('łączę') === 0 ? 'łączę z brokerem...' : 'szukam połączenia...', ''); },
      onOpen: () => { mq.subscribe('prompter/' + code + '/state'); mq.publish('prompter/' + code + '/cmd', {c:'ping'}); setChip('czekam na telefon...', ''); setTimeout(flush, 200); },
      onMessage: (t, m) => { if (t === 'prompter/' + code + '/state') onState(m); }
    });
  }
  let pending = null;
  function send(c, v){
    if (code.length !== 6) return;
    if (!mq || !mq.connected()){ pending = { c: c, v: v }; setChip('czekam na połączenie...', ''); return; }
    mq.publish('prompter/' + code + '/cmd', { c: c, v: v });
  }
  function flush(){
    if (!pending || !mq || !mq.connected()) return;
    mq.publish('prompter/' + code + '/cmd', pending);
    pending = null;
  }
  function setChip(txt, cls){
    $('chip').className = 'chip' + (cls ? ' ' + cls : '');
    $('chipTxt').textContent = txt;
  }
  function onState(m){
    state = m || {};
    last = Date.now();
    const rec = !!state.rec, cnt = !!state.cnt;
    setChip(rec ? 'NAGRYWA' : (cnt ? 'odliczanie...' : 'telefon gotowy'), rec ? 'rec' : 'on');
    $('btnRec').disabled = false;
    $('btnRec').textContent = rec ? 'STOP' : (cnt ? 'PRZERWIJ' : 'START');
    $('btnRec').className = 'big' + (rec || cnt ? ' stop' : '');
    const t = state.t || 0;
    $('time').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    $('time').className = 'rec-time' + (rec ? '' : ' off');
    $('scriptName').textContent = state.script || '-';
    $('speed').textContent = state.speed ? state.speed + ' px/s' : '-';
  }

  // telefon milczy dłużej niż 4 s = kontakt zerwany
  setInterval(() => {
    if (!last || Date.now() - last < 4000) return;
    setChip('telefon nie odpowiada', '');
    $('btnRec').disabled = true;
  }, 1500);

  $('btnRec').addEventListener('click', () => send('toggle'));
  $('btnRestart').addEventListener('click', () => send('restart'));
  $('btnPlay').addEventListener('click', () => send('play'));
  $('btnSlow').addEventListener('click', () => send('speed', -10));
  $('btnFast').addEventListener('click', () => send('speed', 10));
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space'){ e.preventDefault(); send('toggle'); }
    if (e.code === 'KeyR') send('restart');
    if (e.code === 'KeyP') send('play');
  });

  if (code.length === 6) connect();
})();

/* Prompter - wspólna warstwa danych: skrypty + synchronizacja przez prywatnego Gista.
   Używane i przez prompter (index.html), i przez dashboard (dashboard.html).
   Bez chmury działa wszystko lokalnie; chmura tylko dokłada wymianę między urządzeniami. */
(function (global) {
  'use strict';

  const SCR_KEY   = 'tp_scripts_v2';
  const OLD_KEY   = 'tp_scripts_v1';
  const LAST_KEY  = 'tp_last_v1';
  const CLOUD_KEY = 'tp_cloud_v1';
  const SEED_KEY  = 'tp_seeded_v2';
  const FILE      = 'prompter-scripts.json';
  const API       = 'https://api.github.com';
  const TOMB_TTL  = 60 * 24 * 3600 * 1000;   // tombstone'y trzymamy 60 dni
  const PAIR_PFX  = 'PRM1.';

  const now = () => Date.now();
  function readLS(k, fb){ try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }catch(e){ return fb; } }
  function writeLS(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function uid(){ return 's' + now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- model ----------
  function norm(s){
    return {
      id: String(s.id),
      name: String(s.name == null ? '' : s.name),
      text: String(s.text == null ? '' : s.text),
      order: typeof s.order === 'number' ? s.order : 0,
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
      deleted: !!s.deleted
    };
  }
  const byOrder = (a, b) => (a.order - b.order) || (a.name || '').localeCompare(b.name || '');

  function raw(){
    let list = readLS(SCR_KEY, null);
    if (!Array.isArray(list)){
      // migracja ze starego formatu (bez znaczników czasu)
      const old = readLS(OLD_KEY, null);
      if (Array.isArray(old) && old.length){
        list = old.map((s, i) => norm({ id: s.id || uid(), name: s.name, text: s.text, order: i, updatedAt: now() }));
      } else {
        list = [];
      }
      writeLS(SCR_KEY, list);
    }
    return list.map(norm);
  }
  function writeRaw(list){ writeLS(SCR_KEY, list.map(norm)); }

  function all(){ return raw().filter(s => !s.deleted).sort(byOrder); }
  function get(id){ return raw().find(s => s.id === id && !s.deleted) || null; }
  function count(){ return all().length; }

  function seedIfEmpty(){
    if (localStorage.getItem(SEED_KEY)) return;
    writeLS(SEED_KEY, 1);
    if (raw().length) return;
    save({
      name: 'Przykład',
      text: 'To jest Twój teleprompter.\n\nWklej tu swój tekst, ustaw prędkość suwakiem i tapnij czerwony przycisk, żeby nagrać.\n\nPatrz w obiektyw u góry - tekst przewija się tuż obok, więc na nagraniu wygląda, jakbyś mówił prosto do kamery.'
    });
  }

  function save(s){
    const list = raw();
    const id = s.id || uid();
    const i = list.findIndex(x => x.id === id);
    const maxOrder = list.reduce((m, x) => Math.max(m, x.order || 0), 0);
    if (i >= 0){
      list[i] = norm({ ...list[i], name: s.name, text: s.text, deleted: false, updatedAt: now() });
    } else {
      list.push(norm({ id, name: s.name, text: s.text, order: maxOrder + 1, updatedAt: now() }));
    }
    writeRaw(list);
    return id;
  }

  function remove(id){
    const list = raw();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return false;
    list[i] = norm({ ...list[i], text: '', deleted: true, updatedAt: now() });
    writeRaw(list);
    return true;
  }

  function duplicate(id){
    const s = get(id);
    if (!s) return null;
    return save({ name: (s.name || 'Bez nazwy') + ' (kopia)', text: s.text });
  }

  function reorder(ids){
    const list = raw();
    ids.forEach((id, i) => {
      const s = list.find(x => x.id === id);
      if (s && s.order !== i + 1){ s.order = i + 1; s.updatedAt = now(); }
    });
    writeRaw(list);
  }

  function lastId(){ return localStorage.getItem(LAST_KEY) || ''; }
  function setLastId(id){ try{ localStorage.setItem(LAST_KEY, id); }catch(e){} }

  // ---------- linie produkcyjne (nie do czytania na głos) ----------
  /* PRZEBITKA:, NA EKRANIE:, BÓL:, DŁUGOŚĆ:, nagłówki z timecodem (HOOK 0-5s)
     oraz całe linie w nawiasie. Zostają w tekście, ale prompter je wygasza
     i nie liczy do czasu czytania. */
  const NOTE_RE = /^\s*(przebitka|na ekranie|b[oó]l|d[lł]ugo[sś][cć]|gest|uwaga|notatka|hook|mechanizm|rozwi[aą]zanie|cta|intro|outro|wideo|napis)\b/i;
  const NOTE_ONLY = /^\s*(pauza|cisza|ping|stoper)\s*[.!…:]*\s*$/i;   // sam znacznik w linii
  const NOTE_PAREN = /^\s*\(.*\)\s*$/;
  const INLINE_NOTE = /\((gest|przebitka|pauza|uwaga)\s*:[^)]*\)/gi;

  const QUOTE = /[„"]/;

  /* Linie typu `CTA: „Zostaw kontakt."` niosą i wskazówkę, i tekst do przeczytania.
     Wtedy wygaszamy sam początek, a wypowiedź zostaje normalna. */
  function notePrefix(line){
    if (!NOTE_RE.test(line)) return null;
    const m = String(line).match(QUOTE);
    if (!m) return null;
    return { note: line.slice(0, m.index), said: line.slice(m.index) };
  }
  function isNote(line){
    return (NOTE_RE.test(line) && !QUOTE.test(line)) || NOTE_ONLY.test(line) || NOTE_PAREN.test(line);
  }
  function spoken(text){
    return String(text || '').split('\n')
      .filter(l => !isNote(l))
      .map(l => { const p = notePrefix(l); return p ? p.said : l; })
      .join('\n')
      .replace(INLINE_NOTE, ' ');
  }

  // ---------- statystyki ----------
  function stats(text, wpm){
    const t = spoken(text).trim();
    const words = t ? t.split(/\s+/).length : 0;
    const secs = words ? Math.round(words / ((wpm || 140) / 60)) : 0;
    return { chars: String(text || '').length, words, secs,
             time: Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') };
  }

  // ---------- chmura: konto mailowe (Supabase) albo prywatny Gist ----------
  function cloud(){ return readLS(CLOUD_KEY, { token: '', gistId: '', lastSync: 0, user: '' }); }
  function setCloud(patch){ const c = Object.assign(cloud(), patch); writeLS(CLOUD_KEY, c); return c; }
  function clearCloud(){ try{ localStorage.removeItem(CLOUD_KEY); }catch(e){} }

  function connected(){ const c = cloud(); return !!(c.token && c.gistId); }
  function who(){ return cloud().user || ''; }

  async function api(path, opts, token){
    const t = token || cloud().token;
    const res = await fetch(API + path, Object.assign({ cache: 'no-store' }, opts, {
      headers: Object.assign({
        'Authorization': 'Bearer ' + t,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }, (opts && opts.headers) || {})
    }));
    if (res.status === 401) throw new Error('Token odrzucony przez GitHub (401). Wygeneruj nowy z uprawnieniem "gist".');
    if (res.status === 403) throw new Error('GitHub odmówił (403). Token musi mieć zakres "gist".');
    if (res.status === 404) throw new Error('Nie znaleziono zasobu (404). Gist mógł zostać usunięty - połącz od nowa.');
    if (!res.ok){ const t2 = await res.text().catch(() => ''); throw new Error('GitHub ' + res.status + ': ' + t2.slice(0, 160)); }
    return res.json();
  }

  function docOf(list){
    return JSON.stringify({ app: 'prompter', version: 2, updatedAt: now(), scripts: list }, null, 1);
  }
  function parseDoc(txt){
    try{
      const d = JSON.parse(txt);
      const arr = Array.isArray(d) ? d : (d && Array.isArray(d.scripts) ? d.scripts : []);
      return arr.filter(x => x && x.id).map(norm);
    }catch(e){ return []; }
  }

  /* Łączy z chmurą: sprawdza token, znajduje istniejącego Gista promptera albo tworzy nowego. */
  async function connect(token){
    token = String(token || '').trim();
    if (!token) throw new Error('Wklej token');
    const me = await api('/user', {}, token);
    const gists = await api('/gists?per_page=100', {}, token);
    let g = (gists || []).find(x => x.files && x.files[FILE]);
    if (!g){
      g = await api('/gists', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Prompter - skrypty (nie usuwaj)',
          public: false,
          files: { [FILE]: { content: docOf(raw()) } }
        })
      }, token);
    }
    setCloud({ token, gistId: g.id, user: me.login || '' });
    return sync();
  }

  function merge(local, remote){
    const map = new Map();
    remote.forEach(s => map.set(s.id, s));
    local.forEach(s => {
      const cur = map.get(s.id);
      if (!cur || (s.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(s.id, s);
    });
    return [...map.values()].sort(byOrder);
  }
  function gc(list){
    const cut = now() - TOMB_TTL;
    return list.filter(s => !(s.deleted && (s.updatedAt || 0) < cut));
  }

  let inFlight = null;
  /* Pełna synchronizacja: pobierz -> scal -> zapisz lokalnie -> odeślij, jeśli coś się zmieniło. */
  function sync(){
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const c = cloud();
      if (!c.token || !c.gistId) throw new Error('Chmura nie jest połączona');
      const g = await api('/gists/' + c.gistId);
      const f = g.files && g.files[FILE];
      let remote = [];
      if (f){
        let content = f.content || '';
        if (f.truncated && f.raw_url) content = await fetch(f.raw_url, { cache: 'no-store' }).then(r => r.text());
        remote = parseDoc(content);
      }
      const before = raw();
      const merged = gc(merge(before, remote));
      writeRaw(merged);
      const changed = JSON.stringify(merged.map(strip)) !== JSON.stringify(remote.map(strip));
      if (changed || !f){
        await api('/gists/' + c.gistId, {
          method: 'PATCH',
          body: JSON.stringify({ files: { [FILE]: { content: docOf(merged) } } })
        });
      }
      setCloud({ lastSync: now() });
      return { pushed: changed, remote: remote.length, total: merged.filter(s => !s.deleted).length };
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  function strip(s){ return [s.id, s.name, s.text, s.order, s.updatedAt, s.deleted]; }

  // ---------- kod parowania (Mac -> telefon) ----------
  function b64e(str){ return btoa(unescape(encodeURIComponent(str))).replace(/=+$/, ''); }
  function b64d(str){ return decodeURIComponent(escape(atob(str))); }

  function pairCode(){
    const c = cloud();
    if (!c.token || !c.gistId) return '';
    return PAIR_PFX + b64e(JSON.stringify({ t: c.token, g: c.gistId, u: c.user || '' }));
  }
  async function applyPairCode(code){
    code = String(code || '').trim().replace(/\s+/g, '');
    if (!code.startsWith(PAIR_PFX)) throw new Error('To nie wygląda na kod parowania (ma zaczynać się od PRM1.)');
    let d;
    try{ d = JSON.parse(b64d(code.slice(PAIR_PFX.length))); }catch(e){ throw new Error('Kod parowania jest uszkodzony'); }
    if (!d || !d.t || !d.g) throw new Error('Kod parowania jest niekompletny');
    setCloud({ token: d.t, gistId: d.g, user: d.u || '' });
    return sync();
  }

  // ---------- skrzynka: skrypty dorzucane z repo ----------
  /* inbox.json wchodzi do biblioteki raz na urządzenie (po id). Skasowany albo
     zmieniony skrypt nie wraca przy kolejnym otwarciu. */
  const INBOX_KEY = 'tp_inbox_seen_v1';
  async function pullInbox(){
    const res = await fetch('./inbox.json', { cache: 'no-store' });
    if (!res.ok) return 0;
    const doc = await res.json();
    const items = Array.isArray(doc) ? doc : (doc && doc.scripts) || [];
    const seen = readLS(INBOX_KEY, []);
    let n = 0;
    items.forEach(it => {
      if (!it || !it.id || seen.indexOf(it.id) >= 0) return;
      seen.push(it.id);
      save({ id: it.id, name: it.name || 'Bez nazwy', text: it.text || '' });
      n++;
    });
    if (n) writeLS(INBOX_KEY, seen);
    return n;
  }

  // ---------- import / eksport ----------
  function exportJSON(){ return JSON.stringify({ app: 'prompter', version: 2, exportedAt: new Date().toISOString(), scripts: all() }, null, 2); }
  function importJSON(text){
    const arr = parseDoc(text);
    if (!arr.length) throw new Error('Brak skryptów w pliku');
    let n = 0;
    arr.filter(s => !s.deleted).forEach(s => { save({ name: s.name || 'Bez nazwy', text: s.text }); n++; });
    return n;
  }
  function importPlain(name, text){
    return save({ name: String(name || 'Bez nazwy').replace(/\.(txt|md|rtf)$/i, ''), text: String(text || '') });
  }

  function ago(ts){
    if (!ts) return 'nigdy';
    const s = Math.max(0, Math.round((now() - ts) / 1000));
    if (s < 60) return 'przed chwilą';
    if (s < 3600) return Math.floor(s / 60) + ' min temu';
    if (s < 86400) return Math.floor(s / 3600) + ' godz. temu';
    return Math.floor(s / 86400) + ' dni temu';
  }

  global.TPStore = {
    all, get, raw, writeRaw, count, save, remove, duplicate, reorder, seedIfEmpty,
    lastId, setLastId, stats, ago, uid, who, isNote, notePrefix, spoken,
    cloud, setCloud, clearCloud, connected, connect, sync, pairCode, applyPairCode, pullInbox,
    exportJSON, importJSON, importPlain,
    TOKEN_URL: 'https://github.com/settings/tokens/new?scopes=gist&description=Prompter'
  };
})(window);

/* Prompter - logowanie mailem (Supabase Auth, bez SDK - same wywołania REST).
   Dwa sposoby wejścia:
     - kod 6-cyfrowy z maila (działa też w apce dodanej do ekranu głównego),
     - kliknięcie linku z maila (wtedy tokeny wracają w #hash adresu).
   Sesja ważna sessionDays dni od zalogowania - potem twarde wylogowanie. */
(function (global) {
  'use strict';

  const CFG = global.TP_CONFIG || {};
  const KEY = 'tp_auth_v1';
  const DAY = 24 * 3600 * 1000;

  const cfgOk = () => !!(CFG.supabaseUrl && CFG.supabaseKey);
  const base = () => String(CFG.supabaseUrl || '').replace(/\/+$/, '');
  const days = () => Number(CFG.sessionDays || 30);
  const allowed = () => (CFG.allowed || []).map(e => String(e).toLowerCase());

  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)) || null; }catch(e){ return null; } }
  function write(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  function wipe(){ try{ localStorage.removeItem(KEY); }catch(e){} }

  function session(){
    const s = read();
    if (!s || !s.refresh_token) return null;
    if (Date.now() - (s.authAt || 0) > days() * DAY){ wipe(); return null; }
    return s;
  }
  const ready = () => cfgOk() && !!session();
  const email = () => { const s = session(); return s ? s.email : ''; };
  function daysLeft(){
    const s = session();
    if (!s) return 0;
    return Math.max(0, Math.ceil((days() * DAY - (Date.now() - (s.authAt || 0))) / DAY));
  }

  async function call(path, body, extraHeaders){
    const res = await fetch(base() + path, {
      method: 'POST',
      cache: 'no-store',
      headers: Object.assign({
        'apikey': CFG.supabaseKey,
        'Authorization': 'Bearer ' + CFG.supabaseKey,
        'Content-Type': 'application/json'
      }, extraHeaders || {}),
      body: JSON.stringify(body)
    });
    const txt = await res.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; }catch(e){}
    if (!res.ok){
      const msg = (data && (data.msg || data.error_description || data.message || data.error)) || ('HTTP ' + res.status);
      const err = new Error(humanize(msg, res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function humanize(msg, status){
    const m = String(msg || '').toLowerCase();
    if (status === 429 || m.includes('rate limit') || m.includes('for security purposes'))
      return 'Za szybko - odczekaj minutę przed kolejnym mailem.';
    if (m.includes('expired') || (m.includes('invalid') && m.includes('token')))
      return 'Kod nieprawidłowy albo wygasł. Sprawdź 6 cyfr z najnowszego maila.';
    if (m.includes('signups not allowed') || m.includes('not allowed'))
      return 'Ten adres nie ma dostępu.';
    return msg || 'Nie udało się';
  }

  function checkAllowed(mail){
    const e = String(mail || '').trim().toLowerCase();
    if (!e) throw new Error('Podaj adres e-mail');
    if (allowed().length && !allowed().includes(e))
      throw new Error('Ten adres nie ma dostępu do promptera');
    return e;
  }

  /* Wysyła maila z linkiem i kodem. */
  async function requestCode(mail){
    if (!cfgOk()) throw new Error('Logowanie nie jest jeszcze skonfigurowane (config.js)');
    const e = checkAllowed(mail);
    const back = encodeURIComponent(location.origin + location.pathname);
    await call('/auth/v1/otp?redirect_to=' + back, { email: e, create_user: true });
    try{ localStorage.setItem('tp_auth_mail', e); }catch(err){}
    return e;
  }

  /* Wymienia 6-cyfrowy kod na sesję. */
  async function verifyCode(mail, code){
    const e = checkAllowed(mail);
    const token = String(code || '').replace(/\D/g, '');
    if (token.length < 6) throw new Error('Kod ma 6 cyfr');
    const d = await call('/auth/v1/verify', { type: 'email', email: e, token });
    return store(d);
  }

  function store(d){
    if (!d || !d.access_token) throw new Error('Serwer nie oddał sesji');
    const mail = (d.user && d.user.email) || lastMail();
    if (allowed().length && !allowed().includes(String(mail).toLowerCase())){
      wipe();
      throw new Error('Ten adres nie ma dostępu do promptera');
    }
    write({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expiresAt: Date.now() + ((d.expires_in || 3600) * 1000) - 60000,
      email: mail,
      authAt: Date.now()
    });
    return session();
  }
  function lastMail(){ try{ return localStorage.getItem('tp_auth_mail') || ''; }catch(e){ return ''; } }

  /* Odświeża token dostępu, zachowując datę pierwszego logowania (limit 30 dni). */
  let refreshing = null;
  async function token(){
    const s = session();
    if (!s) return null;
    if (Date.now() < (s.expiresAt || 0)) return s.access_token;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try{
        const d = await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
        write({
          access_token: d.access_token,
          refresh_token: d.refresh_token || s.refresh_token,
          expiresAt: Date.now() + ((d.expires_in || 3600) * 1000) - 60000,
          email: (d.user && d.user.email) || s.email,
          authAt: s.authAt            // 30 dni liczy się od logowania, nie od odświeżenia
        });
        return read().access_token;
      }catch(err){
        if (err.status === 400 || err.status === 401){ wipe(); }
        throw err;
      }finally{ refreshing = null; }
    })();
    return refreshing;
  }

  /* Link z maila wraca z tokenami w #hash - przechwytujemy je przy starcie. */
  function consumeHash(){
    const h = location.hash || '';
    if (!h.includes('access_token=')) return null;
    const p = new URLSearchParams(h.slice(1));
    const d = {
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      expires_in: parseInt(p.get('expires_in') || '3600', 10),
      user: { email: lastMail() }
    };
    history.replaceState(null, '', location.pathname + location.search);
    try{ return store(d); }catch(e){ return null; }
  }

  function signOut(){
    const s = read();
    wipe();
    if (s && s.access_token){
      call('/auth/v1/logout', {}, { 'Authorization': 'Bearer ' + s.access_token }).catch(() => {});
    }
  }

  global.TPAuth = {
    configured: cfgOk, ready, session, email, daysLeft, lastMail,
    requestCode, verifyCode, token, consumeHash, signOut,
    allowed: () => allowed(), sessionDays: days,
    url: base, key: () => CFG.supabaseKey
  };
})(window);

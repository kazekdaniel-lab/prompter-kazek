/* Malutki klient MQTT 3.1.1 po WebSocket (bez bibliotek).
   Obsługuje tyle, ile potrzeba pilotowi: connect, subscribe, publish QoS 0, ping. */
(function (global) {
  'use strict';

  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  function enc(str){ return new TextEncoder().encode(str); }
  function lenBytes(n){                       // zmienna długość wg specyfikacji MQTT
    const out = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
    return out;
  }
  function str(s){ const b = enc(s); return [ (b.length >> 8) & 255, b.length & 255, ...b ]; }
  function packet(type, flags, payload){
    return new Uint8Array([ (type << 4) | flags, ...lenBytes(payload.length), ...payload ]);
  }

  function connect(opts){
    const onMsg = opts.onMessage || (() => {});
    const onUp = opts.onStatus || (() => {});
    let ws = null, ping = null, alive = false, closed = false, tries = 0, subs = [];

    function open(){
      if (closed) return;
      const url = BROKERS[tries % BROKERS.length];
      onUp('łączę');
      try{ ws = new WebSocket(url, 'mqtt'); }catch(e){ retry(); return; }
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        const id = 'prm' + Math.random().toString(16).slice(2, 10);
        const payload = [ ...str('MQTT'), 4, 0x02, 0, 60, ...str(id) ];
        ws.send(packet(1, 0, payload));
      };
      ws.onmessage = (e) => {
        const d = new Uint8Array(e.data);
        const type = d[0] >> 4;
        if (type === 2){                       // CONNACK
          alive = true; tries = 0; onUp('połączono');
          subs.forEach(t => sub(t));
          clearInterval(ping);
          ping = setInterval(() => { try{ ws.send(new Uint8Array([0xC0, 0])); }catch(err){} }, 25000);
          if (opts.onOpen) opts.onOpen();
        }
        if (type === 3){                       // PUBLISH
          let i = 1, mult = 1, rest = 0, b;
          do { b = d[i++]; rest += (b & 127) * mult; mult *= 128; } while (b & 128);
          const tlen = (d[i] << 8) | d[i + 1];
          const topic = new TextDecoder().decode(d.slice(i + 2, i + 2 + tlen));
          const body = new TextDecoder().decode(d.slice(i + 2 + tlen, i + rest));
          try{ onMsg(topic, JSON.parse(body)); }catch(err){ onMsg(topic, body); }
        }
      };
      ws.onclose = () => { alive = false; clearInterval(ping); onUp('rozłączono'); retry(); };
      ws.onerror = () => { try{ ws.close(); }catch(e){} };
    }
    function retry(){
      if (closed) return;
      tries++;
      setTimeout(open, Math.min(4000, 500 * tries));
    }
    function sub(topic){
      if (!alive) return;
      ws.send(packet(8, 2, [ 0, 1, ...str(topic), 0 ]));
    }

    open();
    return {
      subscribe(topic){ if (subs.indexOf(topic) < 0) subs.push(topic); sub(topic); },
      publish(topic, obj){
        if (!alive) return false;
        try{ ws.send(packet(3, 0, [ ...str(topic), ...enc(JSON.stringify(obj)) ])); return true; }
        catch(e){ return false; }
      },
      connected(){ return alive; },
      close(){ closed = true; clearInterval(ping); try{ ws.close(); }catch(e){} }
    };
  }

  global.TPMqtt = { connect };
})(window);

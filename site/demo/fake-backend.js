/* SELLINTEL demo: in-browser fake backend.
 * Loaded before the app. Replaces window.fetch for the demo API hosts and neutralises the realtime socket.
 * Everything is answered from a synthetic in-memory dataset (see data-*.js and api-*.js). No network, no secrets. */
(function () {
  'use strict';
  if (window.__DEMO_BACKEND_INSTALLED) return;
  window.__DEMO_BACKEND_INSTALLED = true;

  var FILES = ['data-core.js', 'data-orders.js', 'data-misc.js', 'api-hub.js', 'api-dash.js'];
  var VERSION = '1';
  // Load the data/handler files synchronously, in order, before the app module runs.
  (function () {
    var base = '/demo/';
    try {
      var me = document.currentScript && document.currentScript.src;
      if (me) base = me.replace(/[^\/]*$/, '').replace(/^https?:\/\/[^\/]+/, '');
    } catch (e) { /* default base */ }
    FILES.forEach(function (f) { document.write('<script src="' + base + f + '?v=' + VERSION + '"><\/script>'); });
    document.write('<link rel="stylesheet" href="' + base + 'demo-fixes.css?v=' + VERSION + '">');
  })();

  var HOST = 'demo.sellintel.invalid';
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var nativeWS = window.WebSocket;
  var D = function () { return window.__DEMO; };

  /* ---------------- helpers ---------------- */
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64urlDecode(s) { try { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; } }
  function uid() { return 'xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx'.replace(/x/g, function () { return Math.floor(Math.random() * 16).toString(16); }); }
  function json(body, status, headers) {
    var h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    for (var k in (headers || {})) h[k] = headers[k];
    return new Response(status === 204 ? null : JSON.stringify(body), { status: status || 200, headers: h });
  }
  function delay(signal) {
    var ms = 80 + Math.floor(Math.random() * 171);
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) { reject(new DOMException('The operation was aborted.', 'AbortError')); return; }
      var t = setTimeout(function () { if (signal) signal.removeEventListener('abort', onAbort); resolve(); }, ms);
      function onAbort() { clearTimeout(t); reject(new DOMException('The operation was aborted.', 'AbortError')); }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }
  function errBody(code, message, rid) { return { error: { code: code, message: message, request_id: rid } }; }

  /* ---------------- auth ---------------- */
  var emailFallback = 'demo@sellintel.example';
  function makeJwt(email) {
    var now = Math.floor(Date.now() / 1000);
    var payload = { iss: 'https://' + HOST + '/auth/v1', sub: D() ? D().userId : '7d3e0f10-0000-4000-a000-0000000000d1', aud: 'authenticated', role: 'authenticated', email: email, iat: now, exp: now + 604800, session_id: 'demo-session' };
    return b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(payload)) + '.' + b64url('demo-signature');
  }
  function emailFromAuthHeader(h) {
    var m = String(h || '').match(/^Bearer\s+(.+)$/i); if (!m) return null;
    var p = m[1].split('.'); if (p.length < 2) return null;
    try { return JSON.parse(b64urlDecode(p[1])).email || null; } catch (e) { return null; }
  }
  function userObj(email) {
    var iso = new Date().toISOString();
    return { id: D().userId, aud: 'authenticated', role: 'authenticated', email: email, email_confirmed_at: iso, phone: '', confirmed_at: iso, last_sign_in_at: iso, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { email: email, email_verified: true }, identities: [], created_at: iso, updated_at: iso, is_anonymous: false };
  }
  function session(email) {
    var exp = Math.floor(Date.now() / 1000) + 604800;
    return { access_token: makeJwt(email), token_type: 'bearer', expires_in: 604800, expires_at: exp, refresh_token: 'demo-refresh-' + uid().slice(0, 12), user: userObj(email) };
  }
  function handleAuth(path, method, body, headers) {
    var p = path.replace(/^\/auth\/v1/, '');
    if (p === '/token') {
      var email = (body && body.email) || emailFallback;
      if (body && body.refresh_token && !body.email) email = emailFromAuthHeader(headers.authorization) || emailFallback;
      emailFallback = email;
      return json(session(email));
    }
    if (p === '/user') {
      var em = emailFromAuthHeader(headers.authorization) || emailFallback;
      return json(userObj(em));
    }
    if (p === '/signup') { var e2 = (body && body.email) || emailFallback; emailFallback = e2; return json(session(e2)); }
    if (p === '/logout') return json(null, 204);
    if (p === '/settings') return json({ external: { email: true }, disable_signup: false, mailer_autoconfirm: true, phone_autoconfirm: false });
    return json({});
  }

  /* ---------------- PostgREST-ish tables ---------------- */
  function tables() {
    var d = D();
    return {
      workspace_members: [{ workspace_id: d.workspace.id, user_id: d.userId, role: d.membership.role, is_active: true }],
      workspaces: [d.workspace],
      suppliers: d.suppliers, purchases: d.purchases, supplier_invoices: d.invoices, alerts: d.alerts, sourcing_runs: d.runs, sourcing_profiles: d.profiles,
      supplier_price_watches: d.watches, inventory_items: d.invItems, v_stock_on_hand: d.stockOnHand, stock_on_hand_log: d.stockLog,
    };
  }
  function parseCols(sel) { if (!sel || sel === '*') return null; var cols = []; sel.split(',').forEach(function (c) { c = c.trim(); if (c && c.indexOf('(') < 0) cols.push(c.split(':').pop()); }); return cols.length ? cols : null; }
  function cmpv(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function matchOne(val, spec) {
    var m = String(spec).match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|like|ilike)\.(.*)$/); if (!m) return true;
    var neg = !!m[1], op = m[2], arg = m[3], res;
    var sv = val == null ? null : String(val);
    if (op === 'eq') res = sv === arg;
    else if (op === 'neq') res = sv !== arg;
    else if (op === 'gt') res = val != null && (isNaN(val) ? sv > arg : Number(val) > Number(arg));
    else if (op === 'gte') res = val != null && (isNaN(val) ? sv >= arg : Number(val) >= Number(arg));
    else if (op === 'lt') res = val != null && (isNaN(val) ? sv < arg : Number(val) < Number(arg));
    else if (op === 'lte') res = val != null && (isNaN(val) ? sv <= arg : Number(val) <= Number(arg));
    else if (op === 'in') res = arg.replace(/^\(|\)$/g, '').split(',').map(function (x) { return x.replace(/^"|"$/g, ''); }).indexOf(sv) >= 0;
    else if (op === 'is') res = arg === 'null' ? val == null : arg === 'true' ? val === true : arg === 'false' ? val === false : false;
    else { var re = new RegExp('^' + arg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : ''); res = re.test(sv || ''); }
    return neg ? !res : res;
  }
  function handleTable(table, url, method, headers) {
    var rows = (tables()[table] || []).slice();
    var RESERVED = { select: 1, order: 1, limit: 1, offset: 1, on_conflict: 1, columns: 1 };
    url.searchParams.forEach(function (v, k) { if (!RESERVED[k]) rows = rows.filter(function (r) { return matchOne(r[k], v); }); });
    var order = url.searchParams.get('order');
    if (order) order.split(',').reverse().forEach(function (o) { var p = o.split('.'), col = p[0], desc = p[1] === 'desc'; rows.sort(function (a, b) { var c = cmpv(a[col] == null ? '' : a[col], b[col] == null ? '' : b[col]); return desc ? -c : c; }); });
    var total = rows.length;
    var off = Number(url.searchParams.get('offset') || 0), lim = url.searchParams.get('limit');
    var range = headers.range;
    if (range && /^\d+-\d+$/.test(range)) { var rg = range.split('-').map(Number); off = rg[0]; lim = rg[1] - rg[0] + 1; }
    rows = rows.slice(off, lim != null ? off + Number(lim) : undefined);
    var cols = parseCols(url.searchParams.get('select'));
    if (cols) rows = rows.map(function (r) { var o = {}; cols.forEach(function (c) { o[c] = r[c]; }); return o; });
    rows = rows.map(function (r) { var o = {}; for (var k in r) if (k.charAt(0) !== '_') o[k] = r[k]; return o; });
    var hdr = {}, end = rows.length ? off + rows.length - 1 : off;
    if (/count=/.test(headers.prefer || '')) hdr['content-range'] = (rows.length ? off + '-' + end : '*') + '/' + total;
    if (/pgrst\.object/.test(headers.accept || '')) {
      if (rows.length !== 1) return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains ' + rows.length + ' rows', hint: null }, 406, hdr);
      return json(rows[0], 200, hdr);
    }
    if (method === 'HEAD') return json(null, 200, hdr);
    return json(rows, 200, hdr);
  }
  function handleRest(path, url, method, body, headers) {
    var p = path.replace(/^\/rest\/v1\//, '');
    if (p.indexOf('rpc/') === 0) {
      var fn = p.slice(4);
      if (fn === 'purchase_spend_summary') return json(D().dash.spendSummary());
      return json(null);
    }
    if (method === 'GET' || method === 'HEAD') return handleTable(p, url, method, headers);
    // writes through the browser client are not used by the app; accept harmlessly
    return json(Array.isArray(body) ? body : body ? [body] : [], method === 'POST' ? 201 : 200);
  }

  /* ---------------- netlify functions ---------------- */
  function envelope(rid, extra) {
    var d = D();
    var o = { request_id: rid, workspace: d.workspace, membership: { role: d.membership.role } };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function runHandler(fn, arg) {
    try { return { ok: true, value: fn(arg) }; } catch (e) { return { ok: false, err: e }; }
  }
  function handleFunction(name, method, body, headers) {
    var rid = uid(), d = D();
    if (!d || !d.dash || !d.hub) return json(errBody('demo_not_ready', 'The demo data is still loading. Please retry.', rid), 503);
    var auth = headers.authorization;
    if (!/^Bearer\s+\S+/i.test(auth || '')) return json(errBody('unauthorized', 'Authentication required.', rid), 401);
    var res, action = body && body.action != null ? String(body.action) : '';
    if (name === 'overview') { res = runHandler(d.dash.routes.overview); if (res.ok) return json(envelope(rid, res.value)); }
    else if (name === 'automation-activity') { res = runHandler(d.dash.routes.automation); if (res.ok) return json(envelope(rid, res.value)); }
    else if (name === 'inventory-status') { res = runHandler(d.dash.routes.inventory_status); if (res.ok) { var o = { request_id: rid }; for (var k in res.value) o[k] = res.value[k]; return json(o); } }
    else if (name === 'sourcing-profiles') { res = runHandler(d.dash.routes.sourcing_profiles, body || {}); if (res.ok) return json(envelope(rid, res.value || {})); }
    else if (name === 'stock-on-hand') { res = runHandler(d.dash.routes.stock_on_hand, body || {}); if (res.ok) { var o2 = { request_id: rid }; for (var k2 in (res.value || {})) o2[k2] = res.value[k2]; return json(o2); } }
    else if (name === 'dashboard') {
      var f = d.dash.actions[action];
      if (!f) return json(envelope(rid, {}));
      res = runHandler(f, body || {});
      if (res.ok) return json(envelope(rid, res.value || {}));
    }
    else if (name === 'seller-hub') {
      var h = d.hub.actions[action];
      if (!h) return json({ request_id: rid });
      res = runHandler(h, body || {});
      if (res.ok) {
        var v = res.value, out = { request_id: rid };
        if (v && typeof v === 'object' && !Array.isArray(v)) { for (var k3 in v) out[k3] = v[k3]; } else out.result = v;
        return json(out);
      }
    }
    else return json({ request_id: rid });
    // error path
    var e = res.err;
    if (e && e.userError) return json(errBody(e.code || 'invalid_request', e.message, rid), e.status || 400);
    try { console.warn('[demo-backend] handler failed', name, action, e && e.message ? e.message : e, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : ''); } catch (x) { /* ignore */ }
    return json(errBody('demo_backend_error', 'The demo could not complete that request.', rid), 500);
  }

  /* ---------------- fetch patch ---------------- */
  function headerMap(h) {
    var m = {};
    if (!h) return m;
    if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach(function (v, k) { m[k.toLowerCase()] = v; }); return m; }
    if (Array.isArray(h)) { h.forEach(function (p) { m[String(p[0]).toLowerCase()] = p[1]; }); return m; }
    Object.keys(h).forEach(function (k) { m[k.toLowerCase()] = h[k]; });
    return m;
  }
  window.fetch = function (input, init) {
    var url, method, headers, rawBody, signal;
    try {
      var isReq = typeof Request !== 'undefined' && input instanceof Request;
      url = new URL(isReq ? input.url : String(input && input.href ? input.href : input), location.href);
      init = init || {};
      method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
      headers = headerMap(init.headers || (isReq ? input.headers : null));
      rawBody = init.body != null ? init.body : null;
      signal = init.signal || (isReq ? input.signal : null);
      var intercept = url.hostname === HOST || (url.origin === location.origin && url.pathname.indexOf('/.netlify/functions/') === 0);
      if (!intercept) {
        if (/\.invalid$/.test(url.hostname)) return delay(signal).then(function () { return json({}); });
        return nativeFetch(input, init);
      }
      var bodyPromise = Promise.resolve(rawBody);
      if (rawBody == null && isReq && method !== 'GET' && method !== 'HEAD') bodyPromise = input.clone().text();
      return Promise.all([bodyPromise, delay(signal)]).then(function (r) {
        var body = r[0];
        if (body != null && typeof body !== 'string') {
          if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) { var o = {}; body.forEach(function (v, k) { o[k] = v; }); body = o; }
          else body = null;
        } else if (typeof body === 'string' && body) { try { body = JSON.parse(body); } catch (e) { body = null; } }
        else body = null;
        try {
          if (url.hostname === HOST) {
            if (url.pathname.indexOf('/auth/v1/') === 0) return handleAuth(url.pathname, method, body, headers);
            if (url.pathname.indexOf('/rest/v1/') === 0) return handleRest(url.pathname, url, method, body, headers);
            return json({});
          }
          var name = url.pathname.replace('/.netlify/functions/', '').replace(/\/+$/, '');
          return handleFunction(name, method, body, headers);
        } catch (e) {
          try { console.warn('[demo-backend] request failed', url.pathname, e && e.message); } catch (x) { /* ignore */ }
          return json({ error: { code: 'demo_backend_error', message: 'The demo could not complete that request.' } }, 500);
        }
      });
    } catch (e) {
      return nativeFetch ? nativeFetch(input, init) : Promise.reject(e);
    }
  };

  /* ---------------- realtime websocket stand-in ---------------- */
  function FakeSocket(url) {
    var self = this;
    this.url = String(url); this.readyState = 0; this.binaryType = 'arraybuffer'; this.protocol = ''; this.extensions = ''; this.bufferedAmount = 0;
    this.onopen = null; this.onclose = null; this.onerror = null; this.onmessage = null; this._l = {};
    setTimeout(function () { if (self.readyState !== 0) return; self.readyState = 1; self._emit('open', {}); }, 20);
  }
  FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;
  FakeSocket.prototype.CONNECTING = 0; FakeSocket.prototype.OPEN = 1; FakeSocket.prototype.CLOSING = 2; FakeSocket.prototype.CLOSED = 3;
  FakeSocket.prototype._emit = function (type, ev) {
    ev = ev || {}; ev.type = type; ev.target = this;
    var h = this['on' + type]; if (typeof h === 'function') { try { h.call(this, ev); } catch (e) { /* ignore */ } }
    (this._l[type] || []).slice().forEach(function (f) { try { f.call(this, ev); } catch (e) { /* ignore */ } }, this);
  };
  FakeSocket.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  FakeSocket.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (x) { return x !== f; }); };
  FakeSocket.prototype.send = function (data) {
    var self = this, msg;
    try { msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch (e) { return; }
    var topic = msg.topic, ev = msg.event, ref = msg.ref, payload = msg.payload || {}, resp = { status: 'ok', response: {} };
    if (ev === 'phx_join') {
      var cfg = (payload && payload.config) || {};
      var pcs = (cfg.postgres_changes || []).map(function (p, i) { var o = { id: i + 1 }; for (var k in p) o[k] = p[k]; return o; });
      resp.response = { postgres_changes: pcs };
    }
    var reply = { topic: topic, event: 'phx_reply', payload: resp, ref: ref, join_ref: msg.join_ref };
    setTimeout(function () { if (self.readyState === 1) self._emit('message', { data: JSON.stringify(reply) }); }, 15);
  };
  FakeSocket.prototype.close = function (code, reason) {
    var self = this; if (this.readyState >= 2) return;
    this.readyState = 3;
    setTimeout(function () { self._emit('close', { code: code || 1000, reason: reason || '', wasClean: true }); }, 0);
  };
  if (nativeWS) {
    var Wrapped = function (url, protocols) {
      var u = String(url);
      if (u.indexOf(HOST) >= 0 || /\.invalid[:\/]/.test(u)) return new FakeSocket(u);
      return protocols !== undefined ? new nativeWS(url, protocols) : new nativeWS(url);
    };
    Wrapped.CONNECTING = 0; Wrapped.OPEN = 1; Wrapped.CLOSING = 2; Wrapped.CLOSED = 3;
    Wrapped.prototype = nativeWS.prototype;
    window.WebSocket = Wrapped;
  } else {
    window.WebSocket = FakeSocket;
  }
})();

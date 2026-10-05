/* SELLINTEL demo: persistent "demo mode" notice. Pure DOM, no dependencies, safe to load before the app mounts. */
(function () {
  'use strict';
  if (window.__sellintelDemoBar) return;
  window.__sellintelDemoBar = true;

  var css = [
    '#demo-mode-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;',
    'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 24px);padding:8px 8px 8px 14px;',
    'border-radius:999px;background:rgba(15,23,42,.94);color:#e8eefc;font:600 12.5px/1.25 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;',
    'box-shadow:0 8px 28px rgba(15,23,42,.32);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
    '#demo-mode-bar .dmb-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.22)}',
    '#demo-mode-bar .dmb-text{min-width:0;white-space:nowrap}',
    '#demo-mode-bar .dmb-text span{color:#9fb0d0;font-weight:500}',
    '#demo-mode-bar a{flex:none;padding:6px 12px;border-radius:999px;background:#2f62f2;color:#fff;text-decoration:none;font-weight:700;white-space:nowrap}',
    '#demo-mode-bar a:hover{background:#4a76f5}',
    '@media (max-width:520px){#demo-mode-bar{bottom:8px;gap:8px;padding:7px 7px 7px 12px;font-size:12px}',
    '#demo-mode-bar .dmb-text span{display:none}}',
    'body{padding-bottom:56px}'
  ].join('');

  function mount() {
    if (document.getElementById('demo-mode-bar')) return;
    var st = document.createElement('style');
    st.id = 'demo-mode-bar-css';
    st.textContent = css;
    document.head.appendChild(st);

    var bar = document.createElement('div');
    bar.id = 'demo-mode-bar';
    bar.setAttribute('role', 'note');
    bar.setAttribute('aria-label', 'Demo mode');
    bar.innerHTML =
      '<i class="dmb-dot" aria-hidden="true"></i>' +
      '<div class="dmb-text">Demo mode <span>· sample data only, nothing is saved</span></div>' +
      '<a href="/#contact">Get yours built</a>';
    document.body.appendChild(bar);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

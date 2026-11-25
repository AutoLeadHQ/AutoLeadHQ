/* AutoLeadHQ first-party analytics + A/B tests. No cookies, no third parties.
   window.alhq.track(event, props) records an event; window.alhq.ready resolves
   with this visitor's test variants (home page only). */
(function () {
  var API = 'https://qgwbrwqyeyvrilwemtvy.supabase.co/functions/v1/alhq-site';
  function rid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
  var vid, sid, ref = '';
  try { vid = localStorage.getItem('alhq_v'); if (!vid) { vid = rid(); localStorage.setItem('alhq_v', vid); } } catch (e) { vid = rid(); }
  try { sid = sessionStorage.getItem('alhq_s'); if (!sid) { sid = rid(); sessionStorage.setItem('alhq_s', sid); } } catch (e) { sid = rid(); }
  var qs = new URLSearchParams(location.search);
  ref = qs.get('r') || '';
  try { if (ref) localStorage.setItem('alhq_r', ref); else ref = localStorage.getItem('alhq_r') || ''; } catch (e) {}

  var internal = false;  // visit autoleadhq.com/?internal=1 once on your own devices so your visits don't count
  try { if (qs.get('internal') === '1') localStorage.setItem('alhq_internal', '1'); if (qs.get('internal') === '0') localStorage.removeItem('alhq_internal'); internal = localStorage.getItem('alhq_internal') === '1'; } catch (e) {}
  var queue = [], arms = {}, timer = null;
  function flush() {
    if (!queue.length) return;
    var body = JSON.stringify({ visitor_id: vid, session_id: sid, ref: ref || null, path: location.pathname,
      referrer: document.referrer || null, events: queue.splice(0, 25) });
    var sent = false;
    try { sent = navigator.sendBeacon && navigator.sendBeacon(API + '?route=track', new Blob([body], { type: 'text/plain' })); } catch (e) {}
    if (!sent) { try { fetch(API + '?route=track', { method: 'POST', body: body, keepalive: true, headers: { 'content-type': 'text/plain' } }); } catch (e) {} }
  }
  function track(event, props) {
    if (internal) return;
    var p = {}; props = props || {};
    for (var k in props) p[k] = props[k];
    for (var a in arms) p['ab_' + a] = arms[a].name;
    queue.push({ event: event, props: p });
    clearTimeout(timer);
    if (queue.length >= 10) flush(); else timer = setTimeout(flush, 1200);
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });

  var wantsArms = document.documentElement.hasAttribute('data-ab');
  var ready = !wantsArms ? Promise.resolve({}) : new Promise(function (resolve) {
    var done = false;
    function finish(x) { if (done) return; done = true; document.documentElement.classList.remove('ab-wait'); resolve(x || {}); }
    // Show the page after 1.2s at most; a slow answer is still applied up to 3s so the stats match what was shown.
    setTimeout(function () { document.documentElement.classList.remove('ab-wait'); }, 1200);
    setTimeout(function () { finish({}); }, 3000);
    fetch(API + '?route=arms&v=' + encodeURIComponent(vid)).then(function (r) { return r.json(); })
      .then(function (j) { var x = (j && j.arms) || {}; for (var k in x) arms[k] = x[k]; finish(x); })
      .catch(function () { finish({}); });
  });
  window.alhq = { track: track, vid: vid, ref: ref, arms: arms, ready: ready, flush: flush };

  ready.then(function () {
    track('pageview', { utm_source: qs.get('utm_source'), utm_campaign: qs.get('utm_campaign'), promo: qs.get('promo') ? 1 : 0,
      w: window.innerWidth, from_email: ref ? 1 : 0 });
  });

  // Scroll depth, time on page, sections seen, button clicks, FAQ opens.
  var marks = {};
  addEventListener('scroll', function () {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h <= 0) return;
    var pct = Math.round(scrollY / h * 100);
    [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !marks[m]) { marks[m] = 1; track('scroll', { depth: m }); } });
  }, { passive: true });
  [15, 60, 180].forEach(function (s) { setTimeout(function () { if (document.visibilityState === 'visible') track('time', { seconds: s }); }, s * 1000); });
  document.addEventListener('DOMContentLoaded', function () {
    if ('IntersectionObserver' in window) {
      var seen = {};
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { var id = e.target.id; if (e.isIntersecting && id && !seen[id]) { seen[id] = 1; track('section_view', { section: id }); } });
      }, { threshold: 0.35 });
      document.querySelectorAll('section[id]').forEach(function (s) { io.observe(s); });
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a,button');
      if (!a || a.closest('form')) return;
      track('cta_click', { text: (a.textContent || '').trim().slice(0, 40), href: (a.getAttribute('href') || '').slice(0, 80) });
    });
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) track('faq_open', { q: (d.querySelector('summary') || {}).textContent }); });
    });
  });
})();

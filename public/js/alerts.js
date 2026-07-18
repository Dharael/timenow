/* TimeNow — centro de alertas: badge, sonido de sirena (WebAudio) y notificaciones */
TN.alerts = (function () {

  var active = {};   // key → { icon, text, t, critical }
  var history = [];
  var raisedKeys = {}; // para no repetir la misma alerta en la sesión

  /* ── Sirena sintetizada (no necesita archivo de audio) ── */
  function siren() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.05);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.connect(gain);
      // barrido tipo sirena: sube y baja 3 veces
      var t = ctx.currentTime;
      for (var i = 0; i < 3; i++) {
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.linearRampToValueAtTime(980, t + 0.45);
        osc.frequency.linearRampToValueAtTime(520, t + 0.9);
        t += 0.9;
      }
      gain.gain.setValueAtTime(0.35, t - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.start();
      osc.stop(t + 0.35);
      osc.onended = function () { ctx.close(); };
    } catch (e) { console.error('siren', e); }
  }

  function notify(text) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { new Notification('TimeNow — ALERTA', { body: text }); } catch (e) {}
    }
  }

  function renderBadge() {
    const n = Object.keys(active).length;
    const b = TN.$('alert-badge');
    b.hidden = n === 0;
    b.textContent = n;
  }

  function itemHtml(a) {
    return '<div class="alert-item' + (a.critical ? ' sismo' : '') + '">' +
      '<span class="alert-ico">' + a.icon + '</span>' +
      '<span class="alert-txt">' + TN.esc(a.text) +
      '<span class="alert-when">' + new Date(a.t).toLocaleTimeString('es-DO') + '</span></span>' +
      '</div>';
  }

  function renderPanels() {
    const act = TN.$('alerts-active');
    const keys = Object.keys(active);
    act.innerHTML = keys.length
      ? keys.map(function (k) { return itemHtml(active[k]); }).join('')
      : '<div class="empty-note">Sin alertas activas. Todo en calma. ✦</div>';

    const his = TN.$('alerts-history');
    his.innerHTML = history.length
      ? history.slice().reverse().map(itemHtml).join('')
      : '<div class="empty-note">Aún no se ha registrado ninguna alerta.</div>';
  }

  /*
    raise(key, icon, text, critical)
    - key repetida en la sesión no vuelve a sonar/notificar (evita spam),
      excepto las de prueba, que siempre suenan.
  */
  function raise(key, icon, text, critical) {
    const isTest = text.indexOf('PRUEBA') === 0 || text.indexOf('simulacro') >= 0;
    const already = raisedKeys[key + '|' + text];
    const a = { icon: icon, text: text, t: Date.now(), critical: !!critical };

    active[key] = a;
    if (!already || isTest) {
      history.push(a);
      if (history.length > 50) history.shift();
      if (critical) { siren(); notify(text); }
    }
    raisedKeys[key + '|' + text] = true;

    renderBadge();
    renderPanels();

    // las alertas activas expiran solas a los 60 min
    setTimeout(function () {
      if (active[key] === a) { delete active[key]; renderBadge(); renderPanels(); }
    }, 60 * 60 * 1000);
  }

  function refreshNotifState() {
    const el = TN.$('notif-state');
    if (!('Notification' in window)) { el.textContent = 'Este navegador no soporta notificaciones.'; return; }
    const p = Notification.permission;
    el.textContent = p === 'granted' ? '✓ Notificaciones activadas'
      : (p === 'denied' ? '✕ Bloqueadas por el navegador (revisa los permisos del sitio)' : 'Pendiente de activar');
  }

  function init() {
    renderPanels();
    refreshNotifState();
    TN.$('btn-notif').addEventListener('click', function () {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(refreshNotifState);
    });
  }

  return { init: init, raise: raise };
})();

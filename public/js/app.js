/* TimeNow — núcleo: estado, navegación, ubicación, buscador, iconos */
window.TN = {
  state: {
    lat: 18.4861, lon: -69.9312,
    name: 'Santo Domingo', country: 'República Dominicana',
    located: false
  },
  viewInits: {},   // callbacks al abrir cada pestaña por primera vez
  viewShows: {},   // callbacks cada vez que se muestra una pestaña
  refreshers: []   // funciones que se re-ejecutan al cambiar de ubicación
};

TN.$ = function (id) { return document.getElementById(id); };

/* ───────── Utilidades de formato ───────── */
TN.fmtTime = function (iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
};
TN.fmtAgo = function (t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'hace ' + s + ' s';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
  return 'hace ' + Math.floor(s / 86400) + ' d';
};
TN.km = function (lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
TN.esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

TN.api = function (path) {
  return fetch(path).then(function (r) {
    if (!r.ok) throw new Error('API ' + r.status);
    return r.json();
  });
};

/* ───────── Códigos WMO → texto + icono ───────── */
TN.wmo = function (code, isDay) {
  const day = isDay !== 0;
  const map = {
    0: [day ? 'Despejado' : 'Noche despejada', day ? 'sun' : 'moon'],
    1: [day ? 'Mayormente despejado' : 'Mayormente despejado', day ? 'partly' : 'moonCloud'],
    2: ['Parcialmente nublado', day ? 'partly' : 'moonCloud'],
    3: ['Nublado', 'cloud'],
    45: ['Niebla', 'fog'], 48: ['Niebla con escarcha', 'fog'],
    51: ['Llovizna ligera', 'drizzle'], 53: ['Llovizna', 'drizzle'], 55: ['Llovizna intensa', 'drizzle'],
    56: ['Llovizna helada', 'drizzle'], 57: ['Llovizna helada', 'drizzle'],
    61: ['Lluvia ligera', 'rain'], 63: ['Lluvia', 'rain'], 65: ['Lluvia fuerte', 'rain'],
    66: ['Lluvia helada', 'rain'], 67: ['Lluvia helada', 'rain'],
    71: ['Nieve ligera', 'snow'], 73: ['Nieve', 'snow'], 75: ['Nieve intensa', 'snow'], 77: ['Cristales de nieve', 'snow'],
    80: ['Chubascos ligeros', 'rain'], 81: ['Chubascos', 'rain'], 82: ['Chubascos violentos', 'rain'],
    85: ['Chubascos de nieve', 'snow'], 86: ['Chubascos de nieve', 'snow'],
    95: ['Tormenta eléctrica', 'storm'], 96: ['Tormenta con granizo', 'storm'], 99: ['Tormenta con granizo', 'storm']
  };
  return map[code] || ['—', 'cloud'];
};

/* ───────── Iconos SVG (arte de línea cian/violeta) ───────── */
TN.icon = function (key) {
  const C = '#3de0ff', V = '#8b7cff', A = '#ffb454', W = '#e8eef9';
  const svgs = {
    sun: '<circle cx="32" cy="32" r="13" fill="none" stroke="' + A + '" stroke-width="3"/><g stroke="' + A + '" stroke-width="3" stroke-linecap="round">' +
      [0,45,90,135,180,225,270,315].map(function(a){var r=a*Math.PI/180;return '<line x1="'+(32+Math.cos(r)*19)+'" y1="'+(32+Math.sin(r)*19)+'" x2="'+(32+Math.cos(r)*25)+'" y2="'+(32+Math.sin(r)*25)+'"/>';}).join('') + '</g>',
    moon: '<path d="M40 12 A 20 20 0 1 0 52 36 A 16 16 0 0 1 40 12 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><circle cx="20" cy="20" r="1.5" fill="' + W + '"/><circle cx="14" cy="32" r="1" fill="' + W + '"/>',
    partly: '<circle cx="24" cy="24" r="10" fill="none" stroke="' + A + '" stroke-width="3"/><g stroke="' + A + '" stroke-width="2.5" stroke-linecap="round"><line x1="24" y1="8" x2="24" y2="4"/><line x1="8" y1="24" x2="4" y2="24"/><line x1="12.7" y1="12.7" x2="9.9" y2="9.9"/><line x1="35.3" y1="12.7" x2="38.1" y2="9.9"/></g><path d="M22 46 h24 a8 8 0 0 0 0 -16 a12 12 0 0 0 -23 3 a7 7 0 0 0 -1 13 Z" fill="#0a1020" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/>',
    moonCloud: '<path d="M34 10 A 13 13 0 1 0 44 26 A 10 10 0 0 1 34 10 Z" fill="none" stroke="' + C + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 50 h26 a8 8 0 0 0 0 -16 a12 12 0 0 0 -23 3 a7 7 0 0 0 -1 13 Z" fill="#0a1020" stroke="' + V + '" stroke-width="3" stroke-linejoin="round"/>',
    cloud: '<path d="M16 44 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><path d="M14 52 h22" stroke="' + V + '" stroke-width="3" stroke-linecap="round" opacity="0.6"/>',
    fog: '<path d="M16 30 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><g stroke="' + W + '" stroke-width="2.5" stroke-linecap="round" opacity="0.7"><line x1="14" y1="40" x2="50" y2="40"/><line x1="18" y1="47" x2="46" y2="47"/><line x1="22" y1="54" x2="42" y2="54"/></g>',
    drizzle: '<path d="M16 36 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><g stroke="' + C + '" stroke-width="2.5" stroke-linecap="round" opacity="0.8"><line x1="24" y1="44" x2="23" y2="48"/><line x1="34" y1="44" x2="33" y2="48"/><line x1="44" y1="44" x2="43" y2="48"/><line x1="29" y1="52" x2="28" y2="56"/><line x1="39" y1="52" x2="38" y2="56"/></g>',
    rain: '<path d="M16 36 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><g stroke="' + C + '" stroke-width="3" stroke-linecap="round"><line x1="24" y1="43" x2="21" y2="53"/><line x1="34" y1="43" x2="31" y2="53"/><line x1="44" y1="43" x2="41" y2="53"/></g>',
    storm: '<path d="M16 34 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + V + '" stroke-width="3" stroke-linejoin="round"/><path d="M34 38 l-8 10 h7 l-4 10 12 -13 h-7 l5 -7 Z" fill="' + A + '" stroke="' + A + '" stroke-width="1" stroke-linejoin="round"/>',
    snow: '<path d="M16 36 h30 a9 9 0 0 0 0 -18 a13 13 0 0 0 -25 3 a8 8 0 0 0 -3 15 Z" fill="none" stroke="' + C + '" stroke-width="3" stroke-linejoin="round"/><g fill="' + W + '"><circle cx="24" cy="46" r="2"/><circle cx="34" cy="52" r="2"/><circle cx="44" cy="46" r="2"/></g>'
  };
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + (svgs[key] || svgs.cloud) + '</svg>';
};

/* ───────── Pestañas ───────── */
TN.setView = function (name) {
  const tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.view === name);
  const views = document.querySelectorAll('.view');
  for (var j = 0; j < views.length; j++) views[j].classList.toggle('active', views[j].id === 'view-' + name);
  if (TN.viewInits[name]) { TN.viewInits[name](); delete TN.viewInits[name]; }
  if (TN.viewShows[name]) TN.viewShows[name]();
  window.scrollTo(0, 0);
};

/* ───────── Telemetría ───────── */
TN.tickClock = function () {
  TN.$('tele-time').textContent = new Date().toLocaleTimeString('es-DO', { hour12: false });
};

/* ───────── Ubicación ───────── */
TN.setLocation = function (lat, lon, name, country, fromUser) {
  TN.state.lat = lat; TN.state.lon = lon;
  TN.state.name = name || (lat.toFixed(2) + ', ' + lon.toFixed(2));
  TN.state.country = country || '';
  TN.state.located = true;
  try {
    localStorage.setItem('tn.loc', JSON.stringify({ lat: lat, lon: lon, name: TN.state.name, country: TN.state.country }));
  } catch (e) {}
  TN.$('tele-pos').textContent = lat.toFixed(4) + ' / ' + lon.toFixed(4);
  TN.$('hero-city').textContent = TN.state.name + (TN.state.country ? ' · ' + TN.state.country : '');
  TN.$('hero-coords').textContent = 'LAT ' + lat.toFixed(4) + '  LON ' + lon.toFixed(4);
  for (var i = 0; i < TN.refreshers.length; i++) {
    try { TN.refreshers[i](); } catch (e) { console.error(e); }
  }
};

TN.geolocate = function () {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function (pos) {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    // Nombre aproximado por geocoding inverso simple: mostramos coordenadas y
    // dejamos "Mi ubicación" como etiqueta.
    TN.setLocation(lat, lon, 'Mi ubicación', '', false);
  }, function () { /* sin permiso: se queda el valor por defecto */ }, { timeout: 8000 });
};

/* ───────── Buscador de ciudades ───────── */
TN.initSearch = function () {
  const input = TN.$('city-search');
  const box = TN.$('search-results');
  var timer = null;

  input.addEventListener('input', function () {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { box.classList.remove('open'); return; }
    timer = setTimeout(function () {
      TN.api('/api/geocode?q=' + encodeURIComponent(q)).then(function (data) {
        const results = data.results || [];
        if (!results.length) { box.classList.remove('open'); return; }
        box.innerHTML = results.map(function (r, i) {
          const sub = [r.admin1, r.country].filter(Boolean).join(', ');
          return '<button type="button" class="search-item" data-i="' + i + '">' + TN.esc(r.name) +
            '<small>' + TN.esc(sub) + '</small></button>';
        }).join('');
        box.classList.add('open');
        const btns = box.querySelectorAll('.search-item');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function () {
            const r = results[Number(this.dataset.i)];
            box.classList.remove('open');
            input.value = '';
            TN.setLocation(r.latitude, r.longitude, r.name, r.country, true);
          });
        }
      }).catch(function () { box.classList.remove('open'); });
    }, 350);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) box.classList.remove('open');
  });

  TN.$('btn-locate').addEventListener('click', TN.geolocate);
};

/* ───────── Arranque ───────── */
TN.init = function () {
  // Pestañas
  TN.$('tabs').addEventListener('click', function (e) {
    const tab = e.target.closest('.tab');
    if (tab) TN.setView(tab.dataset.view);
  });

  // Logo = volver al inicio
  TN.$('btn-home').addEventListener('click', function () { TN.setView('now'); });

  // Reloj
  TN.tickClock();
  setInterval(TN.tickClock, 1000);

  TN.initSearch();

  // Módulos que dependen de ubicación
  TN.refreshers.push(TN.weather.load);
  TN.refreshers.push(TN.air.load);
  TN.refreshers.push(TN.quakes.onLocationChange);

  // Ubicación guardada o por defecto (Santo Domingo)
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('tn.loc')); } catch (e) {}
  if (saved && isFinite(saved.lat)) {
    TN.setLocation(saved.lat, saved.lon, saved.name, saved.country, false);
  } else {
    TN.setLocation(TN.state.lat, TN.state.lon, TN.state.name, TN.state.country, false);
    TN.geolocate();
  }

  // Datos globales (no dependen de ubicación)
  TN.quakes.start();
  TN.storms.loadStatus();
  TN.alerts.init();

  // Carga perezosa por pestaña
  TN.viewInits.quakes = TN.quakes.initMap;
  TN.viewInits.storms = TN.storms.initMap;
  TN.viewInits.news = TN.news.load;
  TN.viewShows.quakes = TN.quakes.invalidate;
  TN.viewShows.storms = TN.storms.invalidate;
};

/* TimeNow — sismos: feed USGS, mapa satelital, lista, alarma */
TN.quakes = (function () {

  var map = null;
  var markerLayer = null;
  var quakes = [];            // features filtrados y ordenados
  var period = 'day';
  var minMag = 0;
  var knownIds = {};          // ids ya vistos (para detectar sismos NUEVOS)
  var firstLoad = true;
  var selectedId = null;

  var settings = { on: true, km: 300, mag: 3 };
  try {
    var s = JSON.parse(localStorage.getItem('tn.alarm'));
    if (s) settings = s;
  } catch (e) {}

  function magColor(m) {
    if (m < 2.5) return '#3dffa8';
    if (m < 4) return '#3de0ff';
    if (m < 5.5) return '#ffb454';
    return '#ff5470';
  }

  /* ───────── Mapa ───────── */
  function initMap() {
    if (map) return;
    map = L.map('quake-map', { zoomControl: true, attributionControl: true, worldCopyJump: true })
      .setView([18.7, -70.4], 7);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri World Imagery'
    }).addTo(map);
    // etiquetas de lugares encima del satélite
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, opacity: 0.8
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    window.__tnQuakeMap = map; // acceso para depuracion
    renderMap();
    setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function quakeIcon(m, isNew) {
    const size = Math.max(10, Math.min(30, 6 + m * 3.2));
    const color = magColor(m);
    const rings = isNew
      ? '<span class="q-ring" style="border-color:' + color + '"></span><span class="q-ring" style="border-color:' + color + ';animation-delay:0.7s"></span><span class="q-ring" style="border-color:' + color + ';animation-delay:1.4s"></span>'
      : '<span class="q-ring" style="border-color:' + color + '"></span>';
    return L.divIcon({
      className: 'q-marker',
      iconSize: [64, 64],
      html: rings + '<span class="q-dot" style="width:' + size + 'px;height:' + size + 'px;background:' + color +
        ';box-shadow:0 0 ' + (size * 0.9) + 'px ' + color + '"></span>'
    });
  }

  function renderMap() {
    if (!map) return;
    markerLayer.clearLayers();
    const cutoffNew = Date.now() - 60 * 60 * 1000; // "nuevo" = última hora
    quakes.forEach(function (f) {
      const c = f.geometry.coordinates;
      const p = f.properties;
      const mk = L.marker([c[1], c[0]], { icon: quakeIcon(p.mag || 0, p.time > cutoffNew) });
      mk.on('click', function () { select(f.id, false); });
      mk._qid = f.id;
      markerLayer.addLayer(mk);
    });
  }

  /* ───────── Lista lateral ───────── */
  function renderList() {
    const box = TN.$('q-list');
    TN.$('q-count').textContent = quakes.length + ' EVENTOS';
    if (!quakes.length) {
      box.innerHTML = '<div class="empty-note">Sin sismos registrados con estos filtros. ✦</div>';
      return;
    }
    box.innerHTML = quakes.slice(0, 80).map(function (f) {
      const p = f.properties, c = f.geometry.coordinates;
      const dist = TN.km(TN.state.lat, TN.state.lon, c[1], c[0]);
      return '<button type="button" class="qitem' + (f.id === selectedId ? ' sel' : '') + '" data-id="' + TN.esc(f.id) + '">' +
        '<span class="qmag" style="background:' + magColor(p.mag || 0) + '22;border:2px solid ' + magColor(p.mag || 0) + ';color:' + magColor(p.mag || 0) + '">' + (p.mag == null ? '?' : p.mag.toFixed(1)) + '</span>' +
        '<span class="qinfo">' +
        '<span class="qplace">' + TN.esc(p.place || 'Sin ubicación') + '</span>' +
        '<span class="qmeta">' + TN.fmtAgo(p.time) + ' · <span class="qdist">a ' + Math.round(dist) + ' km de ti</span></span>' +
        '</span></button>';
    }).join('');
    const items = box.querySelectorAll('.qitem');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function () { select(this.dataset.id, true); });
    }
  }

  /* ───────── Selección + panel de detalle ───────── */
  function select(id, fly) {
    selectedId = id;
    const f = quakes.find(function (q) { return q.id === id; });
    if (!f) return;
    const p = f.properties, c = f.geometry.coordinates;
    const dist = TN.km(TN.state.lat, TN.state.lon, c[1], c[0]);

    if (map && fly) {
      // ojo: no llamar aqui a TN.setView — su invalidateSize cancela el flyTo
      map.flyTo([c[1], c[0]], Math.max(map.getZoom(), 8), { duration: 1.2 });
    }

    const d = TN.$('q-detail');
    d.innerHTML =
      '<button type="button" class="qdetail-close" id="qd-close">✕</button>' +
      '<h3>' + TN.esc(p.place || 'Sismo') + '</h3>' +
      '<div class="qdetail-row"><span>MAGNITUD</span><span style="color:' + magColor(p.mag || 0) + '">M ' + (p.mag == null ? '?' : p.mag.toFixed(1)) + '</span></div>' +
      '<div class="qdetail-row"><span>PROFUNDIDAD</span><span>' + (c[2] == null ? '--' : c[2].toFixed(1)) + ' km</span></div>' +
      '<div class="qdetail-row"><span>DISTANCIA</span><span>' + Math.round(dist) + ' km de ti</span></div>' +
      '<div class="qdetail-row"><span>HORA</span><span>' + new Date(p.time).toLocaleString('es-DO') + '</span></div>' +
      '<div class="qdetail-row"><span>COORDS</span><span>' + c[1].toFixed(3) + ', ' + c[0].toFixed(3) + '</span></div>' +
      (p.tsunami ? '<div class="qdetail-row"><span>TSUNAMI</span><span style="color:#ff5470">⚠ POSIBLE</span></div>' : '') +
      (p.url ? '<div class="qdetail-row"><span>FUENTE</span><span><a href="' + TN.esc(p.url) + '" target="_blank" rel="noopener" style="color:#3de0ff">USGS ↗</a></span></div>' : '');
    d.hidden = false;
    TN.$('qd-close').addEventListener('click', function () { d.hidden = true; selectedId = null; renderList(); });
    renderList();
  }

  /* ───────── Telemetría sísmica ───────── */
  function updateTelemetry() {
    const near = quakes.filter(function (f) {
      const c = f.geometry.coordinates;
      return TN.km(TN.state.lat, TN.state.lon, c[1], c[0]) <= 500 && (f.properties.mag || 0) >= 4;
    });
    const el = TN.$('tele-seis');
    if (near.length) {
      el.innerHTML = '<span class="led led-warn"></span> M' + near[0].properties.mag.toFixed(1) + ' CERCA';
    } else {
      el.innerHTML = '<span class="led led-ok"></span> EN CALMA';
    }
  }

  /* ───────── Carga + detección de sismos nuevos ───────── */
  function load() {
    TN.api('/api/quakes?period=' + period).then(function (geo) {
      const feats = (geo.features || []).filter(function (f) {
        return (f.properties.mag || 0) >= minMag;
      });
      feats.sort(function (a, b) { return b.properties.time - a.properties.time; });

      // Detectar nuevos para la alarma (no en la primera carga)
      if (!firstLoad) {
        feats.forEach(function (f) {
          if (knownIds[f.id]) return;
          const c = f.geometry.coordinates, p = f.properties;
          const dist = TN.km(TN.state.lat, TN.state.lon, c[1], c[0]);
          if (settings.on && dist <= settings.km && (p.mag || 0) >= settings.mag) {
            TN.alerts.raise('sismo', '🔴',
              '¡SISMO M' + (p.mag || 0).toFixed(1) + ' a ' + Math.round(dist) + ' km de ti! ' + (p.place || ''), true);
          }
        });
      }
      feats.forEach(function (f) { knownIds[f.id] = true; });
      firstLoad = false;

      quakes = feats;
      renderList();
      renderMap();
      updateTelemetry();
    }).catch(function (e) {
      console.error('quakes', e);
      TN.$('q-list').innerHTML = '<div class="empty-note">No se pudo conectar con el USGS. Reintentando…</div>';
    });
  }

  /* ───────── Controles ───────── */
  function bindControls() {
    TN.$('q-period').addEventListener('click', function (e) {
      const chip = e.target.closest('.chip'); if (!chip) return;
      period = chip.dataset.p;
      var chips = this.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i] === chip);
      firstLoad = true; // no disparar alarma por el cambio de filtro
      load();
    });
    TN.$('q-mag').addEventListener('click', function (e) {
      const chip = e.target.closest('.chip'); if (!chip) return;
      minMag = Number(chip.dataset.m);
      var chips = this.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i] === chip);
      firstLoad = true;
      load();
    });

    // Alarma
    const on = TN.$('alarm-on'), km = TN.$('alarm-km'), mag = TN.$('alarm-mag');
    on.checked = settings.on; km.value = settings.km; mag.value = settings.mag;
    TN.$('alarm-km-val').textContent = settings.km;
    TN.$('alarm-mag-val').textContent = Number(settings.mag).toFixed(1);
    function save() {
      settings = { on: on.checked, km: Number(km.value), mag: Number(mag.value) };
      TN.$('alarm-km-val').textContent = settings.km;
      TN.$('alarm-mag-val').textContent = settings.mag.toFixed(1);
      try { localStorage.setItem('tn.alarm', JSON.stringify(settings)); } catch (e) {}
    }
    on.addEventListener('change', save);
    km.addEventListener('input', save);
    mag.addEventListener('input', save);

    TN.$('btn-test-quake').addEventListener('click', function () {
      TN.alerts.raise('sismo', '🔴', 'PRUEBA: ¡Sismo M5.2 a 42 km de ti! (simulacro para probar la alarma)', true);
    });
  }

  function start() {
    bindControls();
    load();
    setInterval(load, 60 * 1000);
  }

  function onLocationChange() {
    renderList();
    updateTelemetry();
    if (map) map.setView([TN.state.lat, TN.state.lon], 7);
  }

  function invalidate() {
    if (map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  return { start: start, initMap: initMap, onLocationChange: onLocationChange, invalidate: invalidate };
})();

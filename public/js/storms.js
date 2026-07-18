/* TimeNow — ciclones (NOAA/NHC) + radar de lluvia (RainViewer) */
TN.storms = (function () {

  var map = null;
  var stormLayer = null;
  var radarLayer = null;
  var cloudLayer = null;
  var radarFrames = [];
  var radarHost = '';
  var radarIdx = 0;
  var radarTimer = null;
  var stormsData = [];

  function classText(code) {
    const m = {
      'HU': 'HURACÁN', 'MH': 'HURACÁN MAYOR', 'TS': 'TORMENTA TROPICAL',
      'TD': 'DEPRESIÓN TROPICAL', 'STD': 'DEPRESIÓN SUBTROPICAL',
      'SS': 'TORMENTA SUBTROPICAL', 'PTC': 'CICLÓN POST-TROPICAL', 'PC': 'CICLÓN POTENCIAL'
    };
    return m[code] || code || 'SISTEMA';
  }

  function ktToKmh(kt) { return Math.round(kt * 1.852); }

  /* ── Estado para telemetría y lista (corre al inicio, sin mapa) ── */
  function loadStatus() {
    TN.api('/api/storms').then(function (d) {
      stormsData = d.activeStorms || [];
      const tele = TN.$('tele-storm');
      if (stormsData.length) {
        tele.innerHTML = '<span class="led led-bad"></span> ' + stormsData.length + ' ACTIVO' + (stormsData.length > 1 ? 'S' : '');
        stormsData.forEach(function (s) {
          TN.alerts.raise('storm-' + s.id, '🌀',
            classText(s.classification) + ' "' + s.name + '" activo en el Atlántico — vientos de ' + ktToKmh(s.intensity) + ' km/h.', false);
        });
      } else {
        tele.innerHTML = '<span class="led led-ok"></span> TRANQUILO';
      }
      renderList();
      renderStorms();
    }).catch(function (e) {
      console.error('storms', e);
      TN.$('tele-storm').innerHTML = '<span class="led led-warn"></span> SIN DATOS';
    });
  }

  function renderList() {
    const box = TN.$('storm-list');
    if (!box) return;
    if (!stormsData.length) {
      const month = new Date().getMonth() + 1;
      const enTemporada = month >= 6 && month <= 11;
      box.innerHTML = '<div class="calm-card">✓ Atlántico tranquilo — sin ciclones activos.' +
        '<small>' + (enTemporada
          ? 'Estamos en temporada ciclónica (1 jun – 30 nov). Revisa a diario.'
          : 'Fuera de temporada ciclónica (1 jun – 30 nov).') + '</small></div>';
      return;
    }
    box.innerHTML = stormsData.map(function (s) {
      return '<div class="storm-card">' +
        '<h4>🌀 ' + TN.esc(s.name) + '</h4>' +
        '<span class="mono">' + classText(s.classification) + '</span>' +
        '<span class="mono">VIENTOS ' + ktToKmh(s.intensity) + ' km/h · PRESIÓN ' + TN.esc(s.pressure) + ' mb</span>' +
        '<span class="mono">MOVIMIENTO: ' + TN.esc(s.movementDir) + '° a ' + ktToKmh(s.movementSpeed) + ' km/h</span>' +
        '</div>';
    }).join('');
  }

  /* ── Mapa de ciclones ── */
  function initMap() {
    if (map) return;
    map = L.map('storm-map', { worldCopyJump: true }).setView([20, -60], 4);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: 'Esri World Imagery'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, opacity: 0.8
    }).addTo(map);
    stormLayer = L.layerGroup().addTo(map);

    TN.$('layer-radar').addEventListener('change', function () {
      if (this.checked) startRadar(); else stopRadar();
    });
    TN.$('layer-clouds').addEventListener('change', function () {
      if (this.checked) addClouds(); else removeClouds();
    });

    renderStorms();
    loadRadarCatalog();
    setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function renderStorms() {
    if (!map || !stormLayer) return;
    stormLayer.clearLayers();
    stormsData.forEach(function (s) {
      const lat = Number(s.latitudeNumeric != null ? s.latitudeNumeric : parseFloat(s.latitude));
      const lon = Number(s.longitudeNumeric != null ? s.longitudeNumeric : -Math.abs(parseFloat(s.longitude)));
      if (!isFinite(lat) || !isFinite(lon)) return;

      const icon = L.divIcon({
        className: 'q-marker',
        iconSize: [64, 64],
        html: '<span class="q-ring" style="border-color:#ff5470"></span>' +
          '<span class="q-ring" style="border-color:#ff5470;animation-delay:1.1s"></span>' +
          '<span class="q-dot" style="width:26px;height:26px;background:none;font-size:26px;line-height:26px;text-align:center">🌀</span>'
      });
      const mk = L.marker([lat, lon], { icon: icon }).addTo(stormLayer);
      mk.bindPopup('<b>' + TN.esc(s.name) + '</b><br>' + classText(s.classification) +
        '<br>Vientos: ' + ktToKmh(s.intensity) + ' km/h<br>Presión: ' + TN.esc(s.pressure) + ' mb');

      // Proyección simple de trayectoria (48 h con rumbo/velocidad actuales)
      const dir = Number(s.movementDir), spd = Number(s.movementSpeed); // kt
      if (isFinite(dir) && isFinite(spd) && spd > 0) {
        const pts = [[lat, lon]];
        for (var h = 12; h <= 48; h += 12) {
          const distKm = spd * 1.852 * h;
          const rad = dir * Math.PI / 180;
          const dLat = (distKm * Math.cos(rad)) / 111;
          const dLon = (distKm * Math.sin(rad)) / (111 * Math.cos(lat * Math.PI / 180));
          pts.push([lat + dLat, lon + dLon]);
        }
        L.polyline(pts, { color: '#ff5470', weight: 2.5, dashArray: '6 8', opacity: 0.85 }).addTo(stormLayer);
        L.circleMarker(pts[pts.length - 1], { radius: 5, color: '#ff5470', fillOpacity: 0.6 })
          .bindPopup('Posición estimada en 48 h (rumbo actual)').addTo(stormLayer);
      }
    });
  }

  /* ── Radar RainViewer ──
     Todas las capas de la animación se crean UNA vez (precargando sus
     tiles) y solo se alterna la opacidad: sin parcheos ni parpadeos.
     Antes se destruía/creaba una capa por frame cada 0.9s y los tiles
     a medio cargar se veían "bugueados". */
  var radarLayers = [];

  function loadRadarCatalog() {
    TN.api('/api/rainviewer').then(function (d) {
      radarHost = d.host || 'https://tilecache.rainviewer.com';
      radarFrames = (d.radar && d.radar.past) ? d.radar.past.slice(-7) : [];
      if (d.radar && d.radar.nowcast && d.radar.nowcast.length) {
        radarFrames = radarFrames.concat(d.radar.nowcast.slice(0, 2));
      }
      if (TN.$('layer-radar').checked) startRadar();
    }).catch(function (e) { console.error('rainviewer', e); });
  }

  function radarUrl(frame) {
    return radarHost + frame.path + '/256/{z}/{x}/{y}/2/1_1.png';
  }

  function radarLabel(frame) {
    const dt = new Date(frame.time * 1000);
    TN.$('radar-time').textContent = 'RADAR: ' + dt.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) +
      (frame.path.indexOf('nowcast') >= 0 ? ' (pronóstico)' : '');
  }

  function startRadar() {
    stopRadar();
    if (!map) return;
    if (!radarFrames.length) { loadRadarCatalog(); return; }
    radarLayers = radarFrames.map(function (f) {
      return L.tileLayer(radarUrl(f), { opacity: 0, zIndex: 200 }).addTo(map);
    });
    radarIdx = 0;
    radarLayers[0].setOpacity(0.75);
    radarLabel(radarFrames[0]);
    radarTimer = setInterval(function () {
      const prev = radarIdx;
      radarIdx = (radarIdx + 1) % radarLayers.length;
      radarLayers[prev].setOpacity(0);
      radarLayers[radarIdx].setOpacity(0.75);
      radarLabel(radarFrames[radarIdx]);
    }, 1200);
  }

  function stopRadar() {
    if (radarTimer) { clearInterval(radarTimer); radarTimer = null; }
    for (var i = 0; i < radarLayers.length; i++) {
      if (map) map.removeLayer(radarLayers[i]);
    }
    radarLayers = [];
    if (radarLayer && map) { map.removeLayer(radarLayer); radarLayer = null; }
    TN.$('radar-time').textContent = '';
  }

  /* ── Nubes: satélite GOES-East (NASA GIBS) ──
     RainViewer eliminó su capa de satélite (el catálogo llega vacío),
     por eso "Nubes" no mostraba nada. GIBS con time=default entrega
     siempre la imagen más reciente disponible, sin API key. */
  function addClouds() {
    if (!map) return;
    cloudLayer = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
      { opacity: 0.7, zIndex: 150, maxNativeZoom: 7, maxZoom: 18, attribution: 'NASA GIBS · GOES-East' }
    ).addTo(map);
    if (!TN.$('layer-radar').checked) {
      TN.$('radar-time').textContent = 'NUBES: satélite GOES-East (NASA), imagen más reciente';
    }
  }
  function removeClouds() {
    if (cloudLayer && map) { map.removeLayer(cloudLayer); cloudLayer = null; }
    if (!TN.$('layer-radar').checked) TN.$('radar-time').textContent = '';
  }

  // refresco del estado cada 15 min
  setInterval(loadStatus, 15 * 60 * 1000);

  function invalidate() {
    if (map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  return { loadStatus: loadStatus, initMap: initMap, invalidate: invalidate };
})();

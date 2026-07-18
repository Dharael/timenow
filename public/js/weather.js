/* TimeNow — clima actual y pronóstico (Open-Meteo) */
TN.weather = (function () {

  function uvText(v) {
    if (v == null) return '—';
    if (v < 3) return 'Bajo';
    if (v < 6) return 'Moderado';
    if (v < 8) return 'Alto';
    if (v < 11) return 'Muy alto · protégete';
    return 'Extremo · evita el sol';
  }

  function windDir(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function renderNow(d) {
    const c = d.current;
    const info = TN.wmo(c.weather_code, c.is_day);

    TN.$('hero-temp').textContent = Math.round(c.temperature_2m) + '°';
    TN.$('hero-cond').textContent = info[0];
    TN.$('hero-feels').textContent = 'SENSACIÓN ' + Math.round(c.apparent_temperature) + '°C · LLUVIA ' + (c.precipitation || 0) + ' mm';
    TN.$('hero-icon').innerHTML = TN.icon(info[1]);

    if (d.daily) {
      TN.$('hero-minmax').textContent =
        'HOY  MÁX ' + Math.round(d.daily.temperature_2m_max[0]) + '°  ·  MÍN ' + Math.round(d.daily.temperature_2m_min[0]) + '°';
    }

    TN.$('st-hum').textContent = Math.round(c.relative_humidity_2m) + '%';
    TN.$('bar-hum').style.width = Math.round(c.relative_humidity_2m) + '%';

    TN.$('st-wind').innerHTML = Math.round(c.wind_speed_10m) + ' <small>km/h</small>';
    TN.$('st-wind-dir').textContent = windDir(c.wind_direction_10m) + ' · RÁFAGAS ' + Math.round(c.wind_gusts_10m) + ' km/h';

    // UV actual: lo tomamos de la hora más cercana del hourly
    var uv = null;
    if (d.hourly && d.hourly.uv_index) {
      const nowIso = c.time.slice(0, 13);
      const idx = d.hourly.time.findIndex(function (t) { return t.slice(0, 13) === nowIso; });
      if (idx >= 0) uv = d.hourly.uv_index[idx];
    }
    TN.$('st-uv').textContent = uv == null ? '--' : uv.toFixed(1);
    TN.$('st-uv-txt').textContent = uvText(uv);
    if (uv != null && uv >= 8) {
      TN.alerts.raise('uv', '☀️', 'Índice UV ' + (uv >= 11 ? 'EXTREMO' : 'muy alto') + ' (' + uv.toFixed(1) + '). Evita el sol del mediodía y usa protector.', false);
    }

    TN.$('st-pres').innerHTML = Math.round(c.pressure_msl) + ' <small>hPa</small>';
    TN.$('st-pres-txt').textContent = c.pressure_msl < 1005 ? 'BAJA · inestable' : (c.pressure_msl > 1020 ? 'ALTA · estable' : 'NORMAL');

    TN.$('st-cloud').textContent = Math.round(c.cloud_cover) + '%';
    TN.$('bar-cloud').style.width = Math.round(c.cloud_cover) + '%';

    if (d.daily && d.daily.sunrise) {
      TN.$('st-sun').textContent = '↑ ' + TN.fmtTime(d.daily.sunrise[0]) + '   ↓ ' + TN.fmtTime(d.daily.sunset[0]);
      TN.$('st-sun-txt').textContent = c.is_day ? 'Es de día' : 'Es de noche';
    }

    // Alerta de lluvia próxima (siguientes 6 horas con prob >= 70%)
    if (d.hourly && d.hourly.precipitation_probability) {
      const nowIdx = d.hourly.time.findIndex(function (t) { return t.slice(0, 13) === c.time.slice(0, 13); });
      if (nowIdx >= 0) {
        for (var i = nowIdx; i < Math.min(nowIdx + 6, d.hourly.time.length); i++) {
          if (d.hourly.precipitation_probability[i] >= 70 && d.hourly.precipitation[i] >= 0.4) {
            TN.alerts.raise('rain', '🌧️', 'Lluvia probable (' + d.hourly.precipitation_probability[i] + '%) alrededor de las ' + TN.fmtTime(d.hourly.time[i]) + '.', false);
            break;
          }
        }
      }
    }
  }

  /* ── Gráfica SVG de 48 horas ── */
  function renderChart(d) {
    const svg = TN.$('hourly-chart');
    const H = 240, W = 1440, padL = 44, padR = 16, padT = 26, padB = 44;
    const nowIdx = Math.max(0, d.hourly.time.findIndex(function (t) { return t.slice(0, 13) === d.current.time.slice(0, 13); }));
    const N = 48;
    const temps = d.hourly.temperature_2m.slice(nowIdx, nowIdx + N);
    const probs = d.hourly.precipitation_probability.slice(nowIdx, nowIdx + N);
    const times = d.hourly.time.slice(nowIdx, nowIdx + N);
    if (!temps.length) return;

    const tMin = Math.min.apply(null, temps), tMax = Math.max.apply(null, temps);
    const span = Math.max(tMax - tMin, 4);
    const x = function (i) { return padL + i * (W - padL - padR) / (N - 1); };
    const y = function (t) { return padT + (1 - (t - tMin) / span) * (H - padT - padB); };

    var line = '', area = '';
    for (var i = 0; i < temps.length; i++) {
      line += (i ? ' L ' : 'M ') + x(i).toFixed(1) + ' ' + y(temps[i]).toFixed(1);
    }
    area = line + ' L ' + x(temps.length - 1).toFixed(1) + ' ' + (H - padB) + ' L ' + x(0).toFixed(1) + ' ' + (H - padB) + ' Z';

    var parts = [];
    parts.push('<defs><linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(61,224,255,0.35)"/><stop offset="100%" stop-color="rgba(61,224,255,0)"/></linearGradient></defs>');

    // rejilla horizontal
    for (var g = 0; g <= 4; g++) {
      const gy = padT + g * (H - padT - padB) / 4;
      const gv = (tMax - g * span / 4).toFixed(0);
      parts.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="rgba(90,140,220,0.12)" stroke-width="1"/>');
      parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" fill="#4a5670" font-size="11" font-family="JetBrains Mono,monospace" text-anchor="end">' + gv + '°</text>');
    }

    // barras de probabilidad de lluvia
    for (var b = 0; b < probs.length; b++) {
      const bh = (probs[b] / 100) * 52;
      if (bh > 1) parts.push('<rect x="' + (x(b) - 5) + '" y="' + (H - padB - bh) + '" width="10" height="' + bh + '" rx="2" fill="rgba(139,124,255,0.35)"/>');
    }

    parts.push('<path d="' + area + '" fill="url(#tgrad)"/>');
    parts.push('<path d="' + line + '" fill="none" stroke="#3de0ff" stroke-width="2.5" stroke-linejoin="round"/>');

    // puntos y etiquetas cada 4 horas
    for (var p = 0; p < temps.length; p += 4) {
      parts.push('<circle cx="' + x(p) + '" cy="' + y(temps[p]) + '" r="3.5" fill="#050810" stroke="#3de0ff" stroke-width="2"/>');
      parts.push('<text x="' + x(p) + '" y="' + (y(temps[p]) - 10) + '" fill="#e8eef9" font-size="12" font-family="JetBrains Mono,monospace" text-anchor="middle">' + Math.round(temps[p]) + '°</text>');
      const hh = times[p].slice(11, 16);
      const dd = new Date(times[p]).toLocaleDateString('es-DO', { weekday: 'short' });
      parts.push('<text x="' + x(p) + '" y="' + (H - padB + 18) + '" fill="#8291ad" font-size="10.5" font-family="JetBrains Mono,monospace" text-anchor="middle">' + hh + '</text>');
      parts.push('<text x="' + x(p) + '" y="' + (H - padB + 32) + '" fill="#4a5670" font-size="9.5" font-family="JetBrains Mono,monospace" text-anchor="middle">' + dd + '</text>');
    }

    svg.innerHTML = parts.join('');
  }

  /* ── Tarjetas de 14 días ── */
  function renderDays(d) {
    const grid = TN.$('days-grid');
    const dl = d.daily;
    var html = '';
    for (var i = 0; i < dl.time.length; i++) {
      const date = new Date(dl.time[i] + 'T12:00:00');
      const name = i === 0 ? 'HOY' : date.toLocaleDateString('es-DO', { weekday: 'short' });
      const info = TN.wmo(dl.weather_code[i], 1);
      html += '<div class="day-card" title="' + TN.esc(info[0]) + '">' +
        '<span class="day-name">' + name + '</span>' +
        '<span class="day-date">' + date.getDate() + '/' + (date.getMonth() + 1) + '</span>' +
        '<span class="day-icon">' + TN.icon(info[1]) + '</span>' +
        '<span class="day-temps">' + Math.round(dl.temperature_2m_max[i]) + '° <span class="min">' + Math.round(dl.temperature_2m_min[i]) + '°</span></span>' +
        '<span class="day-rain">☂ ' + (dl.precipitation_probability_max[i] == null ? '--' : dl.precipitation_probability_max[i]) + '%</span>' +
        '<span class="day-wind">≋ ' + Math.round(dl.wind_speed_10m_max[i]) + ' km/h</span>' +
        '</div>';
    }
    grid.innerHTML = html;
  }

  function load() {
    TN.api('/api/weather?lat=' + TN.state.lat + '&lon=' + TN.state.lon).then(function (d) {
      renderNow(d);
      renderChart(d);
      renderDays(d);
    }).catch(function (e) {
      console.error('weather', e);
      TN.$('hero-cond').textContent = 'Sin conexión con el servicio de clima';
    });
  }

  // refresco periódico cada 10 minutos
  setInterval(function () { load(); }, 10 * 60 * 1000);

  return { load: load };
})();

/* TimeNow — atmósfera: polvo del Sahara y calidad del aire (Open-Meteo Air Quality) */
TN.air = (function () {

  function aqiText(v) {
    if (v == null) return ['--', ''];
    if (v <= 50) return [v, 'BUENA'];
    if (v <= 100) return [v, 'MODERADA'];
    if (v <= 150) return [v, 'DAÑINA (sensibles)'];
    if (v <= 200) return [v, 'DAÑINA'];
    return [v, 'MUY DAÑINA'];
  }

  function load() {
    TN.api('/api/air?lat=' + TN.state.lat + '&lon=' + TN.state.lon).then(function (d) {
      const c = d.current || {};
      const dust = c.dust, pm10 = c.pm10, pm25 = c.pm2_5;

      TN.$('air-dust').textContent = dust == null ? '--' : Math.round(dust);
      TN.$('air-pm10').textContent = pm10 == null ? '--' : Math.round(pm10);
      TN.$('air-pm25').textContent = pm25 == null ? '--' : Math.round(pm25);

      const aqi = aqiText(c.us_aqi);
      TN.$('air-aqi').textContent = 'AQI ' + aqi[0] + (aqi[1] ? ' · ' + aqi[1] : '');

      // Semáforo de polvo del Sahara (µg/m³ de dust)
      const box = TN.$('air-alert');
      if (dust != null && dust >= 15) {
        var nivel, clase = '', icono = '🌫️';
        if (dust >= 60) { nivel = 'ALTO'; clase = 'rojo'; }
        else if (dust >= 30) { nivel = 'MODERADO'; }
        else { nivel = 'LEVE'; }
        box.className = 'air-alert ' + clase;
        box.innerHTML = icono + ' <b>Polvo del Sahara en tu zona — nivel ' + nivel + '</b> (' + Math.round(dust) +
          ' µg/m³). ' + (dust >= 30 ? 'Personas asmáticas o alérgicas: limita actividades al aire libre.' : 'Concentración baja, sin riesgo para la mayoría.');
        box.hidden = false;
        if (dust >= 30) {
          TN.alerts.raise('dust', '🌫️', 'Polvo del Sahara nivel ' + nivel + ' (' + Math.round(dust) + ' µg/m³) en ' + TN.state.name + '.', false);
        }
      } else {
        box.hidden = true;
      }

      // Colorear el número de dust según nivel
      const el = TN.$('air-dust');
      el.style.color = dust >= 60 ? '#ff5470' : (dust >= 30 ? '#ffb454' : (dust >= 15 ? '#ffe08a' : '#3dffa8'));
    }).catch(function (e) { console.error('air', e); });
  }

  setInterval(function () { load(); }, 30 * 60 * 1000);

  return { load: load };
})();

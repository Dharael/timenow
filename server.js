/*
  TimeNow — Centro Total del Clima y Sismos
  Servidor local: sirve la app (public/) y hace de proxy con caché
  hacia las APIs públicas (Open-Meteo, USGS, NHC, RainViewer, Google News).
  Node puro, sin dependencias. Puerto 4800.
*/
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4800; // Render asigna su propio puerto
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2'
};

/* ---------- Descarga con redirecciones ---------- */
function fetchUrl(url, redirects, browserUA) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http:') ? http : https;
    const req = mod.get(url, {
      headers: {
        // Los sitios de noticias suelen bloquear agentes desconocidos:
        // para artículos nos presentamos como un navegador normal.
        'User-Agent': browserUA
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
          : 'TimeNow/1.0 (app personal de clima)',
        'Accept': browserUA ? 'text/html,application/xhtml+xml,*/*;q=0.8' : '*/*',
        'Accept-Language': 'es-419,es;q=0.9,en;q=0.6'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 4) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(fetchUrl(next, redirects + 1, browserUA));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' en ' + url));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout en ' + url)));
  });
}

/* ---------- POST (para resolver enlaces de Google News) ---------- */
function postUrl(url, body, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': contentType || 'application/x-www-form-urlencoded;charset=UTF-8',
        'Content-Length': data.length
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout POST ' + url)));
    req.write(data);
    req.end();
  });
}

/* ---------- Caché en memoria ---------- */
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.data;
  const data = await fn();
  cache.set(key, { t: Date.now(), data });
  return data;
}

/* ---------- Parser mínimo de RSS (Google News) ---------- */
function stripCdata(s) {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag) => {
      const mm = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      return mm ? decodeEntities(stripCdata(mm[1])) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pubDate = pick('pubDate');
    const source = pick('source');
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

/* ---------- Lector de noticias: resolver enlace real + extraer texto ---------- */

// Los enlaces del RSS de Google News son redirecciones. Los IDs viejos (CBMi…)
// llevan la URL real codificada en base64; los nuevos requieren una llamada
// al endpoint batchexecute de Google.
function decodeGnewsId(id) {
  try {
    const buf = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const txt = buf.toString('latin1');
    const m = txt.match(/https?:\/\/[\x20-\x7e]+/);
    if (m) {
      // cortar en el primer byte raro que se coló en el match
      const clean = m[0].split(/[\x00-\x1f"\\]/)[0];
      if (clean.startsWith('http') && clean.length > 12 && !clean.includes('news.google.com')) return clean;
    }
  } catch (e) {}
  return null;
}

async function resolveGnewsUrl(link) {
  const idMatch = link.match(/articles\/([^?/]+)/);
  if (!idMatch) return link;
  const id = idMatch[1];

  const direct = decodeGnewsId(id);
  if (direct) return direct;

  // Método nuevo: pedir la página para sacar firma+timestamp y llamar a batchexecute
  const html = await fetchUrl('https://news.google.com/rss/articles/' + id);
  const sg = (html.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  const ts = (html.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  if (!sg || !ts) throw new Error('No se pudo resolver el enlace de Google News');

  const inner = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id, Number(ts), sg
  ]);
  const freq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]]);
  const body = 'f.req=' + encodeURIComponent(freq);
  const resp = await postUrl('https://news.google.com/_/DotsSplashUi/data/batchexecute', body);

  const parts = resp.split('\n\n');
  if (parts.length < 2) throw new Error('Respuesta inesperada de Google News');
  const arr = JSON.parse(parts[1]);
  const payload = JSON.parse(arr[0][2]);
  const url = payload[1];
  if (!url || !String(url).startsWith('http')) throw new Error('Google News no devolvió la URL');
  return url;
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractArticle(html, url) {
  const meta = (prop) => {
    const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)', 'i');
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', 'i');
    const m = html.match(re1) || html.match(re2);
    return m ? decodeEntities(m[1]) : '';
  };

  let title = meta('og:title');
  if (!title) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = t ? stripTags(t[1]) : '';
  }
  const image = meta('og:image');
  let site = meta('og:site_name');
  if (!site) { try { site = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {} }

  // limpiar bloques que no son contenido
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(header|footer|nav|aside|form)[\s\S]*?<\/\1>/gi, ' ');

  // si hay <article>, quedarnos con eso (suele ser el cuerpo real)
  const art = body.match(/<article[\s\S]*?<\/article>/i);
  if (art) body = art[0];

  const paragraphs = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m, total = 0;
  while ((m = re.exec(body)) !== null && paragraphs.length < 45 && total < 16000) {
    const txt = stripTags(m[1]);
    if (txt.length < 45) continue;                    // migas, créditos, botones
    if (/cookies|suscríbete|newsletter|copyright/i.test(txt) && txt.length < 160) continue;
    paragraphs.push(txt);
    total += txt.length;
  }

  return { title, image, site, url, paragraphs };
}

/* ---------- Rutas de la API ---------- */
const routes = {
  async weather(q) {
    const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
    if (!isFinite(lat) || !isFinite(lon)) throw new Error('lat/lon inválidos');
    const key = 'weather:' + lat.toFixed(2) + ',' + lon.toFixed(2);
    return cached(key, 10 * 60 * 1000, async () => {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
        '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,relative_humidity_2m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max' +
        '&forecast_days=14&timezone=auto';
      return JSON.parse(await fetchUrl(url));
    });
  },

  async air(q) {
    const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
    if (!isFinite(lat) || !isFinite(lon)) throw new Error('lat/lon inválidos');
    const key = 'air:' + lat.toFixed(2) + ',' + lon.toFixed(2);
    return cached(key, 30 * 60 * 1000, async () => {
      const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
        '&current=dust,pm10,pm2_5,us_aqi,uv_index' +
        '&hourly=dust,pm10,pm2_5&forecast_days=3&timezone=auto';
      return JSON.parse(await fetchUrl(url));
    });
  },

  async quakes(q) {
    const period = ['hour', 'day', 'week'].includes(q.get('period')) ? q.get('period') : 'day';
    return cached('quakes:' + period, 60 * 1000, async () => {
      const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_' + period + '.geojson';
      return JSON.parse(await fetchUrl(url));
    });
  },

  async storms() {
    return cached('storms', 15 * 60 * 1000, async () => {
      try {
        return JSON.parse(await fetchUrl('https://www.nhc.noaa.gov/CurrentStorms.json'));
      } catch (e) {
        return { activeStorms: [], error: String(e.message || e) };
      }
    });
  },

  async rainviewer() {
    return cached('rainviewer', 5 * 60 * 1000, async () => {
      return JSON.parse(await fetchUrl('https://api.rainviewer.com/public/weather-maps.json'));
    });
  },

  async geocode(q) {
    const name = (q.get('q') || '').trim();
    if (name.length < 2) return { results: [] };
    return cached('geo:' + name.toLowerCase(), 24 * 60 * 60 * 1000, async () => {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) +
        '&count=8&language=es&format=json';
      return JSON.parse(await fetchUrl(url));
    });
  },

  async article(q) {
    const link = q.get('u') || '';
    // solo enlaces del feed de Google News: evita que el endpoint
    // se use como proxy abierto ahora que la app tiene link publico
    if (!/^https:\/\/news\.google\.com\//.test(link)) throw new Error('URL inválida');
    return cached('article:' + link, 24 * 60 * 60 * 1000, async () => {
      let real = link;
      if (link.includes('news.google.com')) {
        real = await resolveGnewsUrl(link);
      }
      const html = await fetchUrl(real, 0, true);
      const art = extractArticle(html, real);
      art.ok = art.paragraphs.length >= 2;
      return art;
    });
  },

  async news() {
    return cached('news', 30 * 60 * 1000, async () => {
      const queries = [
        { tag: 'RD', q: 'sismo OR temblor OR terremoto "República Dominicana"' },
        { tag: 'RD', q: 'clima OR lluvias OR onamet "República Dominicana"' },
        { tag: 'Caribe', q: 'huracán OR "tormenta tropical" Caribe OR Atlántico' },
        { tag: 'Atmósfera', q: '"polvo del Sahara"' },
        { tag: 'Mundo', q: 'terremoto OR sismo' }
      ];
      const seen = new Set();
      const all = [];
      for (const item of queries) {
        try {
          const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(item.q) +
            '&hl=es-419&gl=DO&ceid=DO:es';
          const xml = await fetchUrl(url);
          for (const n of parseRss(xml).slice(0, 12)) {
            const k = n.title.toLowerCase().slice(0, 70);
            if (seen.has(k)) continue;
            seen.add(k);
            n.tag = item.tag;
            n.time = Date.parse(n.pubDate) || 0;
            all.push(n);
          }
        } catch (e) { /* una consulta fallida no tumba el feed */ }
      }
      all.sort((a, b) => b.time - a.time);
      return { items: all.slice(0, 60), generated: Date.now() };
    });
  }
};

/* ---------- Servidor ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(u.pathname);

  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/\/+$/, '');
    const handler = routes[name];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
    }
    try {
      const data = await handler(u.searchParams);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      console.error('[API]', name, e.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }

  // Archivos estáticos
  let file = p === '/' ? '/index.html' : p;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

/* Keep-alive en Render (plan Free): el servicio se auto-visita cada 10 min
   a traves de su URL publica para que Render no lo duerma por inactividad.
   RENDER_EXTERNAL_URL solo existe en Render, asi que en local no hace nada. */
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    https.get(process.env.RENDER_EXTERNAL_URL, (res) => res.resume())
      .on('error', () => {});
  }, 10 * 60 * 1000);
}

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   TimeNow — Clima y Sismos               ║');
  console.log('  ║   http://localhost:' + PORT + '                 ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});

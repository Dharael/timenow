/* TimeNow — noticias de clima y sismos (Google News RSS vía el servidor) */
TN.news = (function () {

  var items = [];
  var filter = '*';
  var loaded = false;

  function render() {
    const box = TN.$('news-list');
    const list = filter === '*' ? items : items.filter(function (n) { return n.tag === filter; });
    if (!list.length) {
      box.innerHTML = '<div class="empty-note">No hay noticias en esta categoría ahora mismo.</div>';
      return;
    }
    box.innerHTML = list.map(function (n, i) {
      const tagClass = n.tag === 'Atmósfera' ? 'Atmosfera' : n.tag;
      return '<a class="news-item" href="' + TN.esc(n.link) + '" data-i="' + i + '" target="_blank" rel="noopener">' +
        '<span class="news-tag ' + TN.esc(tagClass) + '">' + TN.esc(n.tag.toUpperCase()) + '</span>' +
        '<span class="news-body">' +
        '<span class="news-title">' + TN.esc(n.title) + '</span>' +
        '<span class="news-meta">' + (n.source ? TN.esc(n.source) + ' · ' : '') + (n.time ? TN.fmtAgo(n.time) : '') + '</span>' +
        '</span></a>';
    }).join('');
    // clic → lector integrado (sin salir de la app)
    const links = box.querySelectorAll('.news-item');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        e.preventDefault();
        const n = list[Number(this.dataset.i)];
        if (n) openReader(n);
      });
    }
  }

  /* ── Lector integrado ── */
  function openReader(n) {
    const overlay = TN.$('reader');
    const body = TN.$('reader-body');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    body.scrollTop = 0;
    body.innerHTML = '<span class="reader-tag">' + TN.esc(n.tag.toUpperCase()) + ' · LECTOR TIMENOW</span>' +
      '<h2 class="reader-title">' + TN.esc(n.title) + '</h2>' +
      '<div class="reader-meta">' + (n.source ? TN.esc(n.source) + ' · ' : '') + (n.time ? TN.fmtAgo(n.time) : '') + '</div>' +
      '<div class="loading">Descargando artículo…</div>';

    TN.api('/api/article?u=' + encodeURIComponent(n.link)).then(function (a) {
      if (overlay.hidden) return; // el usuario cerró mientras cargaba
      var html = '<span class="reader-tag">' + TN.esc(n.tag.toUpperCase()) + ' · LECTOR TIMENOW</span>' +
        '<h2 class="reader-title">' + TN.esc(a.title || n.title) + '</h2>' +
        '<div class="reader-meta">' + TN.esc(a.site || n.source || '') + (n.time ? ' · ' + TN.fmtAgo(n.time) : '') + '</div>';
      if (a.image && /^https?:\/\//.test(a.image)) {
        html += '<img class="reader-img" src="' + TN.esc(a.image) + '" alt="" onerror="this.remove()">';
      }
      if (a.ok) {
        html += a.paragraphs.map(function (p) { return '<p class="reader-p">' + TN.esc(p) + '</p>'; }).join('');
      } else {
        html += '<p class="reader-error">Este medio no permite extraer el texto completo del artículo. Puedes leerlo en su página original:</p>';
      }
      html += '<div class="reader-foot"><a class="reader-src" href="' + TN.esc(a.url || n.link) + '" target="_blank" rel="noopener">VER ORIGINAL EN ' + TN.esc((a.site || 'LA FUENTE').toUpperCase()) + ' ↗</a></div>';
      body.innerHTML = html;
      body.scrollTop = 0;
    }).catch(function () {
      if (overlay.hidden) return;
      body.innerHTML += '<p class="reader-error" style="margin-top:12px">No se pudo descargar el artículo. Puedes intentar abrir el original:</p>' +
        '<div class="reader-foot"><a class="reader-src" href="' + TN.esc(n.link) + '" target="_blank" rel="noopener">VER ORIGINAL ↗</a></div>';
    });
  }

  function closeReader() {
    TN.$('reader').hidden = true;
    document.body.style.overflow = '';
  }

  function load() {
    if (loaded) return;
    TN.api('/api/news').then(function (d) {
      items = d.items || [];
      loaded = true;
      render();
      // refresco cada 30 min mientras la app esté abierta
      setInterval(function () {
        TN.api('/api/news').then(function (d2) { items = d2.items || []; render(); }).catch(function () {});
      }, 30 * 60 * 1000);
    }).catch(function (e) {
      console.error('news', e);
      TN.$('news-list').innerHTML = '<div class="empty-note">No se pudieron cargar las noticias. Revisa tu conexión.</div>';
    });

    TN.$('reader-close').addEventListener('click', closeReader);
    TN.$('reader').addEventListener('click', function (e) {
      if (e.target === this) closeReader(); // clic fuera del panel = cerrar
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeReader();
    });

    TN.$('news-filter').addEventListener('click', function (e) {
      const chip = e.target.closest('.chip'); if (!chip) return;
      filter = chip.dataset.tag;
      var chips = this.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i] === chip);
      render();
    });
  }

  return { load: load };
})();

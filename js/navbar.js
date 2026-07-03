/* ============================================================
   navbar.js — Web Component <site-navbar> Fikya.id
   Self-contained: render navbar + inisialisasi semua fitur
   (dark mode, jam/tanggal hijri, search, pagefind) di sini.
   main.js hanya mengurus fitur yang tidak butuh navbar
   (progress bar, footer tahun).
   ============================================================ */

class SiteNavbar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <nav class="navbar">
        <a href="/" class="logo">Fikya.id</a>
        <div class="nav-datetime" aria-label="Tanggal dan waktu">
          <span class="tgl-nav" id="nav-tgl" aria-live="polite">—</span>
          <span class="sep" aria-hidden="true">•</span>
          <span class="jam-nav" id="nav-jam" aria-live="polite">--:--:--</span>
          <span class="sep" aria-hidden="true">•</span>
          <span class="hijri-nav" id="nav-hijri" aria-live="polite">—</span>
        </div>
        <div class="nav-actions">
          <button class="nav-btn" id="btn-darkmode" title="Dark / Light mode" aria-label="Toggle dark mode">
            <span aria-hidden="true">🌙</span>
          </button>
          <button class="nav-btn" id="btn-search" title="Cari" aria-label="Buka pencarian">
            <span aria-hidden="true">🔍</span>
          </button>
        </div>
      </nav>

      <div class="search-overlay" id="search-overlay" role="dialog" aria-modal="true" aria-label="Pencarian">
        <div class="search-box">
          <span style="font-size:16px;color:var(--text-muted);" aria-hidden="true">🔍</span>
          <label for="search-input" class="sr-only">Cari artikel atau proyek</label>
          <input
            type="search"
            id="search-input"
            placeholder="Cari artikel, proyek..."
            autocomplete="off"
            aria-autocomplete="list"
            aria-controls="search-results"
          >
          <button class="search-close" id="search-close" aria-label="Tutup pencarian">✕</button>
        </div>
        <div class="search-results" id="search-results" role="listbox" aria-live="polite" aria-label="Hasil pencarian"></div>
      </div>
    `;

    this._initDarkMode();
    this._initWaktu();
    this._initSearch();
  }

  /* FIX: bersihkan resource yang hidup di luar elemen navbar itu
     sendiri (interval jam & listener keydown di document). Spesifikasi
     Custom Elements mengizinkan connectedCallback terpanggil lebih
     dari sekali kalau elemen ini sampai dilepas lalu dipasang ulang
     ke DOM — tanpa disconnectedCallback ini, setiap siklus itu akan
     menumpuk satu interval dan satu listener keydown baru yang tidak
     pernah dibuang. */
  disconnectedCallback() {
    if (this._clockInterval) {
      clearInterval(this._clockInterval);
      this._clockInterval = null;
    }
    if (this._searchKeydownHandler) {
      document.removeEventListener('keydown', this._searchKeydownHandler);
      this._searchKeydownHandler = null;
    }
  }

  /* ===== DARK MODE ===== */
  _initDarkMode() {
    const btn = document.getElementById('btn-darkmode');
    if (!btn) return;

    const applyDark = (isDark) => {
      document.documentElement.classList.toggle('dark', isDark);
      btn.querySelector('span').textContent = isDark ? '☀️' : '🌙';
    };

    /*
      Inline script di <head> sudah menangani first paint.
      Di sini kita cukup sinkronkan ikon tombol dengan state
      yang sudah ada di <html> tanpa memanggil applyDark()
      (yang akan mentrigger classList.toggle tidak perlu).
    */
    const alreadyDark = document.documentElement.classList.contains('dark');
    btn.querySelector('span').textContent = alreadyDark ? '☀️' : '🌙';

    btn.addEventListener('click', () => {
      const isDark = !document.documentElement.classList.contains('dark');
      applyDark(isDark);
      /* FIX: bungkus try/catch — localStorage bisa throw di beberapa
         pengaturan privasi browser (mis. Safari "Block All Cookies").
         Tanpa ini, tampilan sudah berubah tapi exception yang tak
         tertangani membuat preferensi gagal tersimpan secara diam-diam. */
      try {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      } catch (e) {
        console.warn('navbar.js: gagal menyimpan preferensi tema.', e);
      }
    });
  }

  /* ===== JAM, TANGGAL MASEHI & HIJRI ===== */
  _initWaktu() {
    const elTgl   = document.getElementById('nav-tgl');
    const elJam   = document.getElementById('nav-jam');
    const elHijri = document.getElementById('nav-hijri');

    const formatTanggal = (now) => now.toLocaleDateString('id-ID', {
      weekday : 'short',
      day     : 'numeric',
      month   : 'short',
      year    : 'numeric',
    });

    const formatJam = (now) => now.toLocaleTimeString('id-ID', {
      hour   : '2-digit',
      minute : '2-digit',
      second : '2-digit',
      hour12 : false,
    });

    /*
      formatHijri menggunakan window.HijriCalendar dari hijri.js —
      satu sumber kebenaran untuk semua format tanggal Hijriah.
      Offset dan nama bulan diatur di hijri.js saja.
    */
    const formatHijri = (now) => {
      if (window.HijriCalendar) return window.HijriCalendar.formatShort(now);
      return '';
    };

    const update = () => {
      const now = new Date();
      if (elTgl)   elTgl.textContent   = formatTanggal(now);
      if (elJam)   elJam.textContent   = formatJam(now);
      if (elHijri) elHijri.textContent = formatHijri(now);
    };

    update();
    /* FIX: simpan id interval di instance (this), bukan dibuang begitu
       saja, supaya disconnectedCallback() bisa memanggil clearInterval(). */
    this._clockInterval = setInterval(update, 1000);
  }

  /* ===== SEARCH OVERLAY + PAGEFIND ===== */
  _initSearch() {
    const overlay       = document.getElementById('search-overlay');
    const btnSearch     = document.getElementById('btn-search');
    const btnClose      = document.getElementById('search-close');
    const searchInput   = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    /* PERBAIKAN: debounce timer agar search tidak trigger tiap ketukan */
    let debounceTimer = null;

    const openSearch = () => {
      overlay?.classList.add('active');
      searchInput?.focus();
    };

    /* PERBAIKAN: kembalikan fokus ke tombol search saat overlay ditutup */
    const closeSearch = () => {
      overlay?.classList.remove('active');
      if (searchResults) searchResults.innerHTML = '';
      if (searchInput)   searchInput.value = '';
      btnSearch?.focus();
    };

    btnSearch?.addEventListener('click', openSearch);
    btnClose?.addEventListener('click', closeSearch);

    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });

    /* FIX: simpan referensi handler ini (bukan fungsi anonim yang
       langsung dibuang) supaya disconnectedCallback() bisa memanggil
       document.removeEventListener() dengan referensi yang sama. */
    this._searchKeydownHandler = (e) => {
      if (e.key === 'Escape' && overlay?.classList.contains('active')) {
        closeSearch();
      }
      /* FIX: tambahkan e.metaKey supaya Cmd+K di macOS juga berfungsi,
         tidak cuma Ctrl+K (konvensi Windows/Linux). Shortcut "/" sudah
         berfungsi di semua platform sehingga tidak perlu diubah. */
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) && !overlay?.classList.contains('active')) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          openSearch();
        }
      }
    };
    document.addEventListener('keydown', this._searchKeydownHandler);

    /* PERBAIKAN: debounce 300ms — request ke PageFind hanya dikirim
       setelah user berhenti mengetik selama 300ms */
    /* FIX: helper escape HTML — dipakai untuk field yang TIDAK
       sengaja mengandung markup (title, url). item.excerpt sengaja
       DIBIARKAN mentah karena PageFind menyisipkan tag <mark> di
       dalamnya untuk highlight kata yang cocok; meng-escape excerpt
       akan merusak fitur highlight tersebut. */
    const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    searchInput?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const query = searchInput.value.trim();
        if (!searchResults) return;

        if (!query) { searchResults.innerHTML = ''; return; }

        if (!window.__pagefind__) {
          searchResults.innerHTML = `<div class="search-result-loading">Memuat mesin pencarian...</div>`;
          let waited = 0;
          while (!window.__pagefind__ && waited < 3000) {
            await new Promise(r => setTimeout(r, 100));
            waited += 100;
          }
        }

        if (window.__pagefind__) {
          try {
            const results = await window.__pagefind__.search(query);
            if (searchInput.value.trim() !== query) return;

            if (results.results.length === 0) {
              searchResults.innerHTML = `<div class="search-result-empty">Tidak ada hasil untuk "${query}"</div>`;
              return;
            }

            const items = await Promise.all(results.results.slice(0, 8).map(r => r.data()));
            searchResults.innerHTML = items.map(item => `
              <a href="${escapeHtml(item.url)}" class="search-result-item">
                <div class="search-result-title">${escapeHtml(item.meta?.title || 'Tanpa judul')}</div>
                <div class="search-result-excerpt">${item.excerpt}</div>
              </a>
            `).join('');
          } catch (e) {
            console.warn('navbar.js: PageFind error', e);
            searchResults.innerHTML = `<div class="search-result-empty">Gagal memuat hasil pencarian.</div>`;
          }
        } else {
          searchResults.innerHTML = `<div class="search-result-empty">Pencarian tidak tersedia.</div>`;
        }
      }, 300);
    });
  }
}

customElements.define('site-navbar', SiteNavbar);

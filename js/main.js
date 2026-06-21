/* ============================================================
   main.js — UI Global Fikya.id
   Covers: dark mode, jam & tanggal (Masehi + Hijri),
           search overlay, footer tahun
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. DARK MODE ===== */

  const btnDark = document.getElementById('btn-darkmode');

  const applyDark = (isDark) => {
    document.body.classList.toggle('dark', isDark);
    if (btnDark) {
      btnDark.querySelector('span').textContent = isDark ? '☀️' : '🌙';
    }
  };

  // Baca preferensi tersimpan, fallback ke preferensi sistem
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyDark(savedTheme ? savedTheme === 'dark' : prefersDark);

  btnDark?.addEventListener('click', () => {
    const isDark = !document.body.classList.contains('dark');
    applyDark(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  /* ===== 2. JAM, TANGGAL MASEHI & KALENDER HIJRI ===== */

  const elTgl   = document.getElementById('nav-tgl');
  const elJam   = document.getElementById('nav-jam');
  const elHijri = document.getElementById('nav-hijri');
  const elTahun = document.getElementById('tahun');

  // Update footer tahun sekali
  if (elTahun) {
    elTahun.textContent = new Date().getFullYear();
  }

  const formatTanggalMasehi = (now) => {
    return now.toLocaleDateString('id-ID', {
      weekday : 'short',
      day     : 'numeric',
      month   : 'short',
      year    : 'numeric',
    });
  };

  const formatJam = (now) => {
    return now.toLocaleTimeString('id-ID', {
      hour   : '2-digit',
      minute : '2-digit',
      second : '2-digit',
      hour12 : false,
    });
  };

  /*
    Konversi Masehi → Hijri menggunakan Intl.DateTimeFormat
    dengan calendar 'islamic-umalqura' (standar Arab Saudi).
    Tidak memerlukan library eksternal.
  */
  const formatHijri = (now) => {
    try {
      return new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
        day   : 'numeric',
        month : 'long',
        year  : 'numeric',
      }).format(now);
    } catch (e) {
      // Fallback jika browser tidak mendukung
      return '';
    }
  };

  const updateWaktu = () => {
    const now = new Date();
    if (elTgl)   elTgl.textContent   = formatTanggalMasehi(now);
    if (elJam)   elJam.textContent   = formatJam(now);
    if (elHijri) elHijri.textContent = formatHijri(now);
  };

  updateWaktu(); // langsung tampil tanpa delay
  setInterval(updateWaktu, 1000);

  /* ===== 3. READING PROGRESS BAR ===== */
  /*
    Hanya aktif di halaman yang memiliki elemen #progress-bar
    (halaman artikel/dzikir). Di index.html elemen ini tidak ada,
    jadi scroll listener tidak dipasang sama sekali.
  */

  const progressBar = document.getElementById('progress-bar');

  if (progressBar) {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct       = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = `${Math.min(pct, 100)}%`;
    };

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress(); // set posisi awal jika halaman di-refresh di tengah scroll
  }

  /* ===== 4. SEARCH OVERLAY ===== */

  const overlay     = document.getElementById('search-overlay');
  const btnSearch   = document.getElementById('btn-search');
  const btnClose    = document.getElementById('search-close');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  const openSearch = () => {
    overlay?.classList.add('active');
    searchInput?.focus();
  };

  const closeSearch = () => {
    overlay?.classList.remove('active');
    if (searchResults) searchResults.innerHTML = '';
    if (searchInput)   searchInput.value = '';
  };

  btnSearch?.addEventListener('click', openSearch);
  btnClose?.addEventListener('click', closeSearch);

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay?.classList.contains('active')) {
      closeSearch();
    }
    // Shortcut: '/' atau 'Ctrl+K' untuk buka search
    if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && !overlay?.classList.contains('active')) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        openSearch();
      }
    }
  });

  /*
    Integrasi PageFind (opsional):
    Jika PageFind tersedia (setelah build Cloudflare Pages),
    gunakan untuk mencari konten. Fallback ke pesan kosong.
  */
  searchInput?.addEventListener('input', async () => {
    const query = searchInput.value.trim();
    if (!searchResults) return;

    if (!query) {
      searchResults.innerHTML = '';
      return;
    }

    if (window.__pagefind__) {
      try {
        const results = await window.__pagefind__.search(query);
        if (results.results.length === 0) {
          searchResults.innerHTML = `<div class="search-result-empty">Tidak ada hasil untuk "${query}"</div>`;
          return;
        }

        const items = await Promise.all(results.results.slice(0, 8).map(r => r.data()));
        searchResults.innerHTML = items.map(item => `
          <a href="${item.url}" class="search-result-item">
            <div class="search-result-title">${item.meta?.title || 'Tanpa judul'}</div>
            <div class="search-result-excerpt">${item.excerpt}</div>
          </a>
        `).join('');
      } catch (e) {
        console.warn('main.js: PageFind error', e);
      }
    } else {
      searchResults.innerHTML = `<div class="search-result-loading">Pencarian belum tersedia di mode development.</div>`;
    }
  });

});

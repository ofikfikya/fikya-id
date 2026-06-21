/* ============================================================
   main.js — UI Global Fikya.id
   Covers: dark mode, jam & tanggal (Masehi + Hijri),
           search overlay, footer tahun

   Catatan arsitektur:
   Navbar dirender oleh Web Component <site-navbar> (navbar.js).
   Karena connectedCallback() bisa terjadi setelah DOMContentLoaded,
   main.js menunggu event 'navbar:ready' sebelum query elemen navbar.
   Ini menghindari race condition di mana getElementById() mengembalikan
   null karena navbar belum selesai dirender.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. DARK MODE — diterapkan segera, sebelum navbar siap ===== */
  /*
    Dark mode perlu diterapkan sesegera mungkin untuk mencegah
    flash of unstyled content (FOUC). Karena hanya toggle class
    di <body>, tidak perlu menunggu navbar.
  */

  const applyDark = (isDark) => {
    document.body.classList.toggle('dark', isDark);
    // Update ikon tombol jika sudah ada (setelah navbar:ready)
    const btnDark = document.getElementById('btn-darkmode');
    if (btnDark) {
      btnDark.querySelector('span').textContent = isDark ? '☀️' : '🌙';
    }
  };

  const savedTheme  = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyDark(savedTheme ? savedTheme === 'dark' : prefersDark);

  /* ===== 2. FOOTER TAHUN — tidak bergantung navbar ===== */

  const elTahun = document.getElementById('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== 3. READING PROGRESS BAR — tidak bergantung navbar ===== */
  /*
    Hanya aktif di halaman yang memiliki elemen #progress-bar
    (halaman artikel/dzikir). Di index.html elemen ini tidak ada.
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
    updateProgress();
  }

  /* ===== 4. INISIALISASI SETELAH NAVBAR SIAP ===== */
  /*
    Semua fitur yang bergantung pada elemen di dalam <site-navbar>
    (dark mode button, jam/tanggal, search) diinisialisasi di sini,
    setelah event 'navbar:ready' diterima dari navbar.js.
  */

  const initNavbarFeatures = () => {

    /* --- Dark Mode Button --- */
    const btnDark = document.getElementById('btn-darkmode');
    // Sinkronkan ikon sesuai state yang sudah diterapkan di atas
    if (btnDark) {
      const isDark = document.body.classList.contains('dark');
      btnDark.querySelector('span').textContent = isDark ? '☀️' : '🌙';

      btnDark.addEventListener('click', () => {
        const nowDark = !document.body.classList.contains('dark');
        applyDark(nowDark);
        localStorage.setItem('theme', nowDark ? 'dark' : 'light');
      });
    }

    /* --- Jam, Tanggal Masehi & Hijri --- */
    const elTgl   = document.getElementById('nav-tgl');
    const elJam   = document.getElementById('nav-jam');
    const elHijri = document.getElementById('nav-hijri');

    const formatTanggalMasehi = (now) => now.toLocaleDateString('id-ID', {
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

    const formatHijri = (now) => {
      try {
        return new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
          day   : 'numeric',
          month : 'long',
          year  : 'numeric',
        }).format(now);
      } catch (e) { return ''; }
    };

    const updateWaktu = () => {
      const now = new Date();
      if (elTgl)   elTgl.textContent   = formatTanggalMasehi(now);
      if (elJam)   elJam.textContent   = formatJam(now);
      if (elHijri) elHijri.textContent = formatHijri(now);
    };

    updateWaktu();
    setInterval(updateWaktu, 1000);

    /* --- Search Overlay --- */
    const overlay       = document.getElementById('search-overlay');
    const btnSearch     = document.getElementById('btn-search');
    const btnClose      = document.getElementById('search-close');
    const searchInput   = document.getElementById('search-input');
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
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && !overlay?.classList.contains('active')) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          openSearch();
        }
      }
    });

    /* --- PageFind Search --- */
    searchInput?.addEventListener('input', async () => {
      const query = searchInput.value.trim();
      if (!searchResults) return;

      if (!query) {
        searchResults.innerHTML = '';
        return;
      }

      // Tunggu sebentar jika PageFind belum siap (race condition saat pertama load)
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
          // Abaikan hasil jika query sudah berubah saat menunggu
          if (searchInput.value.trim() !== query) return;

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
          searchResults.innerHTML = `<div class="search-result-empty">Gagal memuat hasil pencarian.</div>`;
        }
      } else {
        searchResults.innerHTML = `<div class="search-result-empty">Pencarian tidak tersedia.</div>`;
      }
    });

  }; // end initNavbarFeatures

  /* ===== 5. TUNGGU NAVBAR SIAP ===== */
  /*
    navbar.js dispatch 'navbar:ready' di akhir connectedCallback().
    Jika karena alasan tertentu event sudah lewat sebelum listener
    ini terpasang (sangat unlikely karena script diload sebelum
    DOMContentLoaded selesai), fallback ke setTimeout 0 sebagai
    safety net.
  */
  document.addEventListener('navbar:ready', initNavbarFeatures, { once: true });

});

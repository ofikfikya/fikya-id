/* ============================================================
   main.js — Shared logic Fikya.id
   Covers: datetime/clock, Hijri calendar, dark mode, search,
           read time, reading progress bar
   Search: PageFind (dijalankan saat build di Cloudflare Pages)
           Index tersedia di /pagefind/pagefind.js
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. CONSTANTS ===== */

  const HARI = [
    'Minggu', 'Senin', 'Selasa', 'Rabu',
    'Kamis', 'Jumat', 'Sabtu'
  ];

  const BULAN = [
    'Januari', 'Februari', 'Maret', 'April',
    'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'
  ];

  const BULAN_HIJRI = [
    'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir',
    'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban",
    'Ramadan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah'
  ];

  // -------------------------------------------------------
  // KOREKSI OFFSET (hari): sesuaikan jika masih meleset.
  // +1 berarti tambah 1 hari, -1 kurangi 1 hari, 0 = tidak dikoreksi.
  // Ganti nilai ini jika rujukan resmi (BIMAS / ru'yat) berbeda.
  // -------------------------------------------------------
  const HIJRI_OFFSET_DAYS = 1; // <-- ubah di sini jika perlu

  /* ===== 2. HIJRI CALENDAR ===== */

  /**
   * Fallback: konversi Gregorian → Hijri via algoritma
   * Kuwaiti (lebih akurat dari JDN naif).
   */
  const getFallbackHijri = (date) => {
    try {
      // Gunakan tanggal lokal, bukan UTC
      let d = date.getDate();
      let m = date.getMonth() + 1;
      let y = date.getFullYear();

      // Algoritma Kuwaiti (dipakai Microsoft)
      const jd = Math.floor((14 - m) / 12);
      const yt = y + 4800 - jd;
      const mt = m + 12 * jd - 3;

      let jdn = d +
        Math.floor((153 * mt + 2) / 5) +
        365 * yt +
        Math.floor(yt / 4) -
        Math.floor(yt / 100) +
        Math.floor(yt / 400) -
        32045;

      // JDN → Hijri
      const l  = jdn - 1948440 + 10632;
      const n  = Math.floor((l - 1) / 10631);
      const l2 = l - 10631 * n + 354;
      const j  =
        Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
        Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
      const l3 =
        l2 -
        Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
        Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
        29;

      const hMonth = Math.floor((24 * l3) / 709);
      const hDay   = l3 - Math.floor((709 * hMonth) / 24);
      const hYear  = 30 * n + j - 30;

      return { d: hDay, m: hMonth - 1, y: hYear }; // m: 0-based index

    } catch {
      return null;
    }
  };

  /**
   * Coba pakai Intl API dulu; fallback ke algoritma Kuwaiti.
   * Terapkan HIJRI_OFFSET_DAYS setelah dapat hasilnya.
   */
  const getHijriDate = (date) => {
    try {
      let hDay, hMonthIndex, hYear;

      // --- Coba Intl ---
      try {
        const formatter = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
          day: 'numeric', month: 'long', year: 'numeric',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // timezone lokal
        });

        const parts = formatter.formatToParts(date);
        const dayStr   = parts.find(p => p.type === 'day')?.value;
        const monthStr = parts.find(p => p.type === 'month')?.value;
        const yearStr  = parts.find(p => p.type === 'year')?.value;

        // Cocokkan nama bulan Hijri ke index
        const monthIdx = BULAN_HIJRI.findIndex(
          bh => monthStr?.toLowerCase().includes(bh.toLowerCase())
        );

        if (dayStr && monthIdx !== -1 && yearStr) {
          hDay        = parseInt(dayStr, 10);
          hMonthIndex = monthIdx;         // 0-based
          hYear       = parseInt(yearStr, 10);
        } else {
          throw new Error('Intl parts tidak lengkap');
        }

      } catch {
        // --- Fallback algoritma ---
        const fb = getFallbackHijri(date);
        if (!fb) return '—';
        hDay        = fb.d;
        hMonthIndex = fb.m; // 0-based
        hYear       = fb.y;
      }

      // --- Terapkan offset hari ---
      if (HIJRI_OFFSET_DAYS !== 0) {
        // Hitung hari dalam siklus Hijri secara kasar untuk rolling tanggal
        hDay += HIJRI_OFFSET_DAYS;

        // Panjang bulan Hijri: 29 atau 30 hari (estimasi sederhana: ganjil=30, genap=29)
        const maxDay = (hMonthIndex % 2 === 0) ? 30 : 29;

        if (hDay > maxDay) {
          hDay -= maxDay;
          hMonthIndex++;
          if (hMonthIndex > 11) {
            hMonthIndex = 0;
            hYear++;
          }
        } else if (hDay < 1) {
          hMonthIndex--;
          if (hMonthIndex < 0) {
            hMonthIndex = 11;
            hYear--;
          }
          const prevMax = (hMonthIndex % 2 === 0) ? 30 : 29;
          hDay += prevMax;
        }
      }

      return `${hDay} ${BULAN_HIJRI[hMonthIndex]} ${hYear} H`;

    } catch {
      return '—';
    }
  };

  /* ===== 3. ELEMENT REFERENCES ===== */

  const elJam   = document.getElementById('nav-jam');
  const elTgl   = document.getElementById('nav-tgl');
  const elHijri = document.getElementById('nav-hijri');

  /* ===== 4. CLOCK ===== */

  const updateClock = () => {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    const ss  = String(now.getSeconds()).padStart(2, '0');
    if (elJam) elJam.textContent = `${hh}:${mm}:${ss}`;
  };

  const updateDate = () => {
    const now = new Date();
    if (elTgl) {
      elTgl.textContent =
        `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    }
    if (elHijri) elHijri.textContent = getHijriDate(now);
  };

  updateClock();
  updateDate();
  setInterval(updateClock, 1000);
  setInterval(updateDate, 60000);

  /* ===== 5. FOOTER YEAR ===== */

  const elTahun = document.getElementById('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== 6. DARK MODE ===== */

  const btnDark = document.getElementById('btn-darkmode');

  const applyDark = (isDark) => {
    document.body.classList.toggle('dark', isDark);
    if (btnDark) btnDark.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkmode', isDark ? '1' : '0');
  };

  applyDark(localStorage.getItem('darkmode') === '1');

  if (btnDark) {
    btnDark.addEventListener('click', () => {
      applyDark(!document.body.classList.contains('dark'));
    });
  }

  /* ===== 7. SEARCH (PageFind) ===== */
  /*
    PageFind di-load secara lazy — hanya saat search overlay dibuka
    untuk pertama kali. Ini menghindari network request yang tidak
    perlu di halaman yang tidak menggunakan search.

    PageFind men-generate /pagefind/pagefind.js saat build.
    Di local development file ini belum ada, sehingga search
    tidak akan berfungsi — ini normal. Jalankan build dulu:
      npx pagefind --site .
    atau biarkan Cloudflare Pages yang menjalankannya.
  */

  const overlay      = document.getElementById('search-overlay');
  const searchInput  = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const btnSearch    = document.getElementById('btn-search');
  const searchClose  = document.getElementById('search-close');

  let pagefind      = null;  // instance PageFind, di-load sekali
  let searchTimer   = null;  // debounce timer
  let pagefindReady = false; // apakah PageFind sudah berhasil di-load

  /* --- Load PageFind secara lazy --- */
  const loadPagefind = async () => {
    if (pagefind || pagefindReady) return;
    try {
      // Path relatif ke root site — PageFind selalu generate di /pagefind/
      pagefind = await import('/pagefind/pagefind.js');
      await pagefind.options({ excerptLength: 20 });
      pagefindReady = true;
    } catch {
      // PageFind belum di-generate (misalnya di local dev) — gagal diam-diam
      pagefindReady = false;
    }
  };

  /* --- Render hasil pencarian --- */
  const renderResults = (results) => {
    if (!searchResults) return;
    searchResults.innerHTML = '';

    if (!results || results.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-result-empty';
      empty.textContent = 'Tidak ada hasil ditemukan.';
      searchResults.appendChild(empty);
      return;
    }

    results.forEach((result) => {
      const a = document.createElement('a');
      a.className = 'search-result-item';
      a.href = result.url;

      // Tutup overlay saat hasil diklik
      a.addEventListener('click', () => closeSearch());

      const title = document.createElement('div');
      title.className = 'search-result-title';
      title.textContent = result.meta?.title || 'Tanpa Judul';

      const excerpt = document.createElement('div');
      excerpt.className = 'search-result-excerpt';
      // PageFind mengembalikan excerpt dengan <mark> untuk highlight —
      // ini aman karena hanya berisi tag <mark> dan teks, bukan script
      excerpt.innerHTML = result.excerpt || '';

      a.appendChild(title);
      a.appendChild(excerpt);
      searchResults.appendChild(a);
    });
  };

  /* --- Jalankan pencarian dengan debounce 300ms --- */
  const runSearch = async (query) => {
    if (!searchResults) return;

    const q = query.trim();

    // Kosongkan hasil jika query kurang dari 2 karakter
    if (q.length < 2) {
      searchResults.innerHTML = '';
      return;
    }

    // Tampilkan loading
    searchResults.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'search-result-loading';
    loading.textContent = 'Mencari...';
    searchResults.appendChild(loading);

    // PageFind belum siap (local dev atau gagal load)
    if (!pagefindReady) {
      searchResults.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'search-result-empty';
      empty.textContent = 'Search belum tersedia. Build proyek terlebih dahulu.';
      searchResults.appendChild(empty);
      return;
    }

    try {
      const search = await pagefind.search(q);
      // Ambil maksimal 8 hasil teratas, load data setiap hasil secara paralel
      const top     = search.results.slice(0, 8);
      const details = await Promise.all(top.map(r => r.data()));
      renderResults(details);
    } catch {
      searchResults.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'search-result-empty';
      empty.textContent = 'Gagal memuat hasil pencarian.';
      searchResults.appendChild(empty);
    }
  };

  /* --- Buka / tutup overlay --- */
  const openSearch = async () => {
    if (!overlay || !searchInput) return;
    overlay.classList.add('active');
    setTimeout(() => searchInput.focus(), 50);
    // Mulai load PageFind saat overlay dibuka pertama kali
    await loadPagefind();
  };

  const closeSearch = () => {
    if (!overlay || !searchInput) return;
    overlay.classList.remove('active');
    searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';
    clearTimeout(searchTimer);
  };

  /* --- Event listeners --- */
  if (btnSearch)   btnSearch.addEventListener('click', openSearch);
  if (searchClose) searchClose.addEventListener('click', closeSearch);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(searchInput.value), 300);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

  /* ===== 8. READ TIME ===== */
  // Hitung estimasi waktu baca dari konten <main>
  // Hanya aktif jika elemen #read-time ada di halaman

  const elReadTime = document.getElementById('read-time');
  const elMain     = document.querySelector('main');

  if (elReadTime && elMain) {
    const words = (elMain.innerText || '').trim().split(/\s+/).length;
    const mins  = Math.max(1, Math.round(words / 200));
    elReadTime.textContent = mins;
  }

  /* ===== 9. READING PROGRESS BAR ===== */
  // Hanya aktif jika elemen #progress-bar ada di halaman

  const elBar = document.getElementById('progress-bar');

  if (elBar) {
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress  = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      elBar.style.width = progress + '%';
    }, { passive: true });
  }

});

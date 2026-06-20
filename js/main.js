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

  // Panjang bulan Hijri dalam siklus 30 tahun (indeks 0-based, bulan ke-1..12).
  // Ini jauh lebih akurat dari rumus genap/ganjil.
  const HIJRI_MONTH_LENGTHS = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];

  // -------------------------------------------------------
  // KOREKSI OFFSET (hari): sesuaikan jika masih meleset.
  // +1 berarti tambah 1 hari, -1 kurangi 1 hari, 0 = tidak dikoreksi.
  // Ganti nilai ini jika rujukan resmi (BIMAS / ru'yat) berbeda.
  // -------------------------------------------------------
  const HIJRI_OFFSET_DAYS = 1; // <-- ubah di sini jika perlu

  /* ===== UTILS ===== */

  /** Shorthand querySelector dengan guard null */
  const qs = (sel) => document.querySelector(sel);
  const qid = (id)  => document.getElementById(id);

  /* ===== 2. HIJRI CALENDAR ===== */

  /**
   * Fallback: konversi Gregorian → Hijri via algoritma
   * Kuwaiti (lebih akurat dari JDN naif).
   */
  const getFallbackHijri = (date) => {
    try {
      const d = date.getDate();
      const m = date.getMonth() + 1;
      const y = date.getFullYear();

      // Algoritma Kuwaiti (dipakai Microsoft)
      const jd = Math.floor((14 - m) / 12);
      const yt = y + 4800 - jd;
      const mt = m + 12 * jd - 3;

      const jdn =
        d +
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
   * Terapkan offset hari ke hasil Hijri, dengan roll-over bulan/tahun.
   * Menggunakan HIJRI_MONTH_LENGTHS yang lebih akurat daripada rumus genap/ganjil.
   */
  const applyHijriOffset = (hDay, hMonthIndex, hYear, offset) => {
    if (offset === 0) return { hDay, hMonthIndex, hYear };

    hDay += offset;

    const maxDay = HIJRI_MONTH_LENGTHS[hMonthIndex] ?? 30;

    if (hDay > maxDay) {
      hDay -= maxDay;
      hMonthIndex++;
      if (hMonthIndex > 11) { hMonthIndex = 0; hYear++; }
    } else if (hDay < 1) {
      hMonthIndex--;
      if (hMonthIndex < 0) { hMonthIndex = 11; hYear--; }
      hDay += HIJRI_MONTH_LENGTHS[hMonthIndex] ?? 30;
    }

    return { hDay, hMonthIndex, hYear };
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
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });

        const parts    = formatter.formatToParts(date);
        const dayStr   = parts.find(p => p.type === 'day')?.value;
        const monthStr = parts.find(p => p.type === 'month')?.value;
        const yearStr  = parts.find(p => p.type === 'year')?.value;

        const monthIdx = BULAN_HIJRI.findIndex(
          bh => monthStr?.toLowerCase().includes(bh.toLowerCase())
        );

        if (!dayStr || monthIdx === -1 || !yearStr) {
          throw new Error('Intl parts tidak lengkap');
        }

        hDay        = parseInt(dayStr, 10);
        hMonthIndex = monthIdx;
        hYear       = parseInt(yearStr, 10);

      } catch {
        // --- Fallback algoritma ---
        const fb = getFallbackHijri(date);
        if (!fb) return '—';
        hDay        = fb.d;
        hMonthIndex = fb.m;
        hYear       = fb.y;
      }

      // --- Terapkan offset hari ---
      ({ hDay, hMonthIndex, hYear } =
        applyHijriOffset(hDay, hMonthIndex, hYear, HIJRI_OFFSET_DAYS));

      return `${hDay} ${BULAN_HIJRI[hMonthIndex]} ${hYear} H`;

    } catch {
      return '—';
    }
  };

  /* ===== 3. ELEMENT REFERENCES ===== */

  const elJam   = qid('nav-jam');
  const elTgl   = qid('nav-tgl');
  const elHijri = qid('nav-hijri');

  /* ===== 4. CLOCK ===== */

  const updateClock = () => {
    if (!elJam) return;
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    const ss  = String(now.getSeconds()).padStart(2, '0');
    elJam.textContent = `${hh}:${mm}:${ss}`;
  };

  const updateDate = () => {
    const now = new Date();
    if (elTgl) {
      elTgl.textContent =
        `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    }
    if (elHijri) elHijri.textContent = getHijriDate(now);
  };

  /**
   * Jadwalkan update tanggal agar sinkron dengan pergantian menit sistem,
   * bukan sekadar interval 60 detik dari waktu load halaman.
   */
  const scheduleDateUpdate = () => {
    updateDate();
    const now          = new Date();
    const msUntilNext  = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
      updateDate();
      setInterval(updateDate, 60_000);
    }, msUntilNext);
  };

  updateClock();
  scheduleDateUpdate();
  setInterval(updateClock, 1000);

  /* ===== 5. FOOTER YEAR ===== */

  const elTahun = qid('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== 6. DARK MODE ===== */

  const btnDark = qid('btn-darkmode');

  const applyDark = (isDark) => {
    document.body.classList.toggle('dark', isDark);
    if (btnDark) btnDark.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkmode', isDark ? '1' : '0');
  };

  // Prioritas: localStorage → prefers-color-scheme sistem
  const storedDark = localStorage.getItem('darkmode');
  const prefersDark =
    storedDark !== null
      ? storedDark === '1'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;

  applyDark(prefersDark);

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

  const overlay       = qid('search-overlay');
  const searchInput   = qid('search-input');
  const searchResults = qid('search-results');
  const btnSearch     = qid('btn-search');
  const searchClose   = qid('search-close');

  // Tiga state untuk mencegah race condition:
  // idle → loading → ready | failed
  let pagefind        = null;
  let pagefindState   = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed'
  let searchTimer     = null;

  /* --- Load PageFind secara lazy, hanya sekali --- */
  const loadPagefind = async () => {
    if (pagefindState !== 'idle') return;
    pagefindState = 'loading';
    try {
      pagefind = await import('/pagefind/pagefind.js');
      await pagefind.options({ excerptLength: 20 });
      pagefindState = 'ready';
    } catch {
      pagefindState = 'failed';
      pagefind      = null;
    }
  };

  /* --- Buat elemen pesan sederhana --- */
  const makeMsg = (className, text) => {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
  };

  /* --- Sanitasi HTML sederhana untuk excerpt PageFind --- */
  const sanitizeExcerpt = (raw) => {
    // Hanya izinkan tag <mark> untuk highlight; buang semua tag lain
    const temp = document.createElement('div');
    temp.textContent = raw; // encode semua HTML sebagai teks mentah
    // Kembalikan <mark>…</mark> yang sudah di-encode oleh textContent
    return temp.innerHTML
      .replace(/&lt;mark&gt;/g, '<mark>')
      .replace(/&lt;\/mark&gt;/g, '</mark>');
  };

  /* --- Render hasil pencarian --- */
  const renderResults = (results) => {
    if (!searchResults) return;
    searchResults.innerHTML = '';

    if (!results || results.length === 0) {
      searchResults.appendChild(
        makeMsg('search-result-empty', 'Tidak ada hasil ditemukan.')
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    results.forEach((result) => {
      const a = document.createElement('a');
      a.className = 'search-result-item';
      a.href      = result.url;
      a.addEventListener('click', closeSearch);

      const title = document.createElement('div');
      title.className   = 'search-result-title';
      title.textContent = result.meta?.title || 'Tanpa Judul';

      const excerpt = document.createElement('div');
      excerpt.className = 'search-result-excerpt';
      // Sanitasi: hanya tag <mark> yang diizinkan
      excerpt.innerHTML = sanitizeExcerpt(result.excerpt || '');

      a.append(title, excerpt);
      fragment.appendChild(a);
    });

    searchResults.appendChild(fragment);
  };

  /* --- Jalankan pencarian dengan debounce 300ms --- */
  const runSearch = async (query) => {
    if (!searchResults) return;

    const q = query.trim();

    if (q.length < 2) {
      searchResults.innerHTML = '';
      return;
    }

    searchResults.innerHTML = '';
    searchResults.appendChild(makeMsg('search-result-loading', 'Mencari…'));

    if (pagefindState === 'loading') {
      // Tunggu sebentar lalu coba lagi (module sedang dimuat)
      setTimeout(() => runSearch(query), 200);
      return;
    }

    if (pagefindState !== 'ready') {
      searchResults.innerHTML = '';
      searchResults.appendChild(
        makeMsg('search-result-empty', 'Search belum tersedia. Build proyek terlebih dahulu.')
      );
      return;
    }

    try {
      const search  = await pagefind.search(q);
      const top     = search.results.slice(0, 8);
      const details = await Promise.all(top.map(r => r.data()));
      renderResults(details);
    } catch {
      searchResults.innerHTML = '';
      searchResults.appendChild(
        makeMsg('search-result-empty', 'Gagal memuat hasil pencarian.')
      );
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
  btnSearch?.addEventListener('click', openSearch);
  searchClose?.addEventListener('click', closeSearch);

  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch();
  });

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 300);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

  /* ===== 8. READ TIME ===== */
  // Hitung estimasi waktu baca dari konten artikel.
  // Prioritas selector: article → .content → main
  // Hanya aktif jika elemen #read-time ada di halaman.

  const elReadTime = qid('read-time');

  if (elReadTime) {
    const elContent = qs('article') ?? qs('.content') ?? qs('main');
    if (elContent) {
      const words = (elContent.innerText || '').trim().split(/\s+/).filter(Boolean).length;
      const mins  = Math.max(1, Math.round(words / 200));
      elReadTime.textContent = mins;
    }
  }

  /* ===== 9. READING PROGRESS BAR ===== */
  // Hanya aktif jika elemen #progress-bar ada di halaman.

  const elBar = qid('progress-bar');

  if (elBar) {
    window.addEventListener('scroll', () => {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      const progress   = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      elBar.style.width = `${progress}%`;
    }, { passive: true });
  }

});

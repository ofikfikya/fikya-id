/* ============================================================
   main.js — Shared logic Fikya.id
   Covers: datetime/clock, Hijri calendar, dark mode, search
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
  const HIJRI_OFFSET_DAYS = 2; // <-- ubah di sini jika perlu

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

  /* ===== 7. SEARCH ===== */

  const overlay     = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');
  const btnSearch   = document.getElementById('btn-search');
  const searchClose = document.getElementById('search-close');

  const openSearch = () => {
    if (!overlay || !searchInput) return;
    overlay.classList.add('active');
    setTimeout(() => searchInput.focus(), 50);
  };

  const closeSearch = () => {
    if (!overlay || !searchInput) return;
    overlay.classList.remove('active');
    searchInput.value = '';
  };

  if (btnSearch)   btnSearch.addEventListener('click', openSearch);
  if (searchClose) searchClose.addEventListener('click', closeSearch);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

});

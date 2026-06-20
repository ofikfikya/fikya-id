/* ============================================================
   main.js — Shared logic Fikya.id
   Covers: datetime/clock, Hijri calendar, dark mode, search
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. CONSTANTS ===== */

  const HARI = [
    'Minggu',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu'
  ];

  const BULAN = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];

  const BULAN_HIJRI = [
    'Muharram',
    'Safar',
    'Rabiul Awal',
    'Rabiul Akhir',
    'Jumadil Awal',
    'Jumadil Akhir',
    'Rajab',
    "Sya'ban",
    'Ramadan',
    'Syawal',
    'Dzulqaidah',
    'Dzulhijjah'
  ];

  /* ===== 2. HIJRI CALENDAR ===== */

  const getFallbackHijri = (date) => {
    try {
      let y = date.getFullYear();
      let m = date.getMonth() + 1;
      let d = date.getDate();

      if (m < 3) {
        y--;
        m += 12;
      }

      const A = Math.floor(y / 100);
      const B = 2 - A + Math.floor(A / 4);

      const JD =
        Math.floor(365.25 * (y + 4716)) +
        Math.floor(30.6001 * (m + 1)) +
        d +
        B -
        1524.5;

      let l = JD - 1948440 + 10632;

      const n = Math.floor((l - 1) / 10631);

      l = l - (10631 * n) + 354;

      const J = Math.floor((10985 - l) / 5316) *
                Math.floor((50 * l) / 17719) +
                Math.floor(l / 5670) *
                Math.floor((43 * l) / 15238);

      l =
        l -
        Math.floor(
          (30 - J) / 15
        ) *
        Math.floor(
          (17719 * J) / 50
        ) -
        Math.floor(
          J / 16
        ) *
        Math.floor(
          (15238 * J) / 43
        ) +
        29;

      const mm = Math.floor((24 * l) / 709);
      const dd = l - Math.floor((709 * mm) / 24);
      const yy = 30 * n + J - 30;

      return `${dd} ${BULAN_HIJRI[mm - 1]} ${yy} H`;

    } catch {
      return '—';
    }
  };


  const getHijriDate = (date) => {
    try {

      const formatter = new Intl.DateTimeFormat(
        'id-ID-u-ca-islamic-umalqura',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }
      );

      const parts = formatter.formatToParts(date);

      const day =
        parts.find(p => p.type === 'day')?.value;

      const month =
        parts.find(p => p.type === 'month')?.value;

      const year =
        parts.find(p => p.type === 'year')?.value;

      const validMonth = BULAN_HIJRI.some(
        m =>
          month
            ?.toLowerCase()
            .includes(m.toLowerCase())
      );

      if (
        !day ||
        !month ||
        !year ||
        !validMonth
      ) {
        return getFallbackHijri(date);
      }

      return `${day} ${month} ${year} H`;

    } catch {
      return getFallbackHijri(date);
    }
  };

  /* ===== 3. ELEMENT REFERENCES ===== */

  const elJam = document.getElementById('nav-jam');
  const elTgl = document.getElementById('nav-tgl');
  const elHijri = document.getElementById('nav-hijri');

  /* ===== 4. CLOCK ===== */

  const updateClock = () => {
    const now = new Date();

    const hh = String(
      now.getHours()
    ).padStart(2, '0');

    const mm = String(
      now.getMinutes()
    ).padStart(2, '0');

    const ss = String(
      now.getSeconds()
    ).padStart(2, '0');

    if (elJam) {
      elJam.textContent =
        `${hh}:${mm}:${ss}`;
    }
  };


  const updateDate = () => {
    const now = new Date();

    if (elTgl) {
      elTgl.textContent =
        `${HARI[now.getDay()]}, ` +
        `${now.getDate()} ` +
        `${BULAN[now.getMonth()]} ` +
        `${now.getFullYear()}`;
    }

    if (elHijri) {
      elHijri.textContent =
        getHijriDate(now);
    }
  };

  updateClock();
  updateDate();

  setInterval(updateClock, 1000);

  // update tanggal & hijriah tiap menit
  setInterval(updateDate, 60000);


  /* ===== 5. FOOTER YEAR ===== */

  const elTahun =
    document.getElementById('tahun');

  if (elTahun) {
    elTahun.textContent =
      new Date().getFullYear();
  }


  /* ===== 6. DARK MODE ===== */

  const btnDark =
    document.getElementById(
      'btn-darkmode'
    );

  const applyDark = (isDark) => {

    document.body.classList.toggle(
      'dark',
      isDark
    );

    if (btnDark) {
      btnDark.textContent =
        isDark ? '☀️' : '🌙';
    }

    localStorage.setItem(
      'darkmode',
      isDark ? '1' : '0'
    );
  };

  applyDark(
    localStorage.getItem(
      'darkmode'
    ) === '1'
  );

  if (btnDark) {
    btnDark.addEventListener(
      'click',
      () => {
        applyDark(
          !document.body.classList.contains(
            'dark'
          )
        );
      }
    );
  }


  /* ===== 7. SEARCH ===== */

  const overlay =
    document.getElementById(
      'search-overlay'
    );

  const searchInput =
    document.getElementById(
      'search-input'
    );

  const btnSearch =
    document.getElementById(
      'btn-search'
    );

  const searchClose =
    document.getElementById(
      'search-close'
    );

  const openSearch = () => {

    if (!overlay || !searchInput)
      return;

    overlay.classList.add(
      'active'
    );

    setTimeout(() => {
      searchInput.focus();
    }, 50);

  };

  const closeSearch = () => {

    if (!overlay || !searchInput)
      return;

    overlay.classList.remove(
      'active'
    );

    searchInput.value = '';
  };


  if (btnSearch) {
    btnSearch.addEventListener(
      'click',
      openSearch
    );
  }

  if (searchClose) {
    searchClose.addEventListener(
      'click',
      closeSearch
    );
  }

  if (overlay) {
    overlay.addEventListener(
      'click',
      (e) => {
        if (
          e.target === overlay
        ) {
          closeSearch();
        }
      }
    );
  }


  document.addEventListener(
    'keydown',
    (e) => {

      if (
        e.key === 'Escape'
      ) {
        closeSearch();
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'k'
      ) {
        e.preventDefault();
        openSearch();
      }

    }
  );

});

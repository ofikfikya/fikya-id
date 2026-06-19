/* ============================================================
   main.js — Shared logic Fikya.id (Refactored & Professional)
   Covers: datetime/clock, Hijri calendar, dark mode, search
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== 1. CONSTANTS & DATA ===== */
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BULAN_HIJRI = ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban", 'Ramadan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah'];

  /* ===== 2. HIJRI CALENDAR LOGIC ===== */
  const isLatin = (str) => /[a-zA-Z]/.test(str);

  const getFallbackHijri = (date) => {
    try {
      let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
      if (m < 3) { y--; m += 12; }
      const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
      const JD = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
      let l = JD - 1948440 + 10632;
      const n = Math.floor((l - 1) / 10631);
      l = l - 10631 * n + 354;
      const J = Math.floor((10985 - l) / 5965);
      l = l - Math.floor((Math.min(J, 1) * (-6 + J * (-10632 + J * ((J + J + 1) * 5519 + 366 * 10631)))) / 10631);
      const i = Math.floor(l / 30);
      const dd = l - Math.floor(i * 29.5001 + 0.99);
      const mm = ((i + 1) % 12) || 12;
      const yy = n * 30 + J + Math.floor((i + 1) / 13);
      return `${dd} ${BULAN_HIJRI[mm - 1]} ${yy} H`;
    } catch (e) {
      return '—';
    }
  };

  const getHijriDate = (date) => {
    try {
      const fmt = new Intl.DateTimeFormat('id-ID', { calendar: 'islamic-umalqura', day: 'numeric', month: 'long', year: 'numeric' });
      const parts = fmt.formatToParts(date);
      const day = parts.find(p => p.type === 'day')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const year = parts.find(p => p.type === 'year')?.value;
      
      if (!day || !month || !year || !isLatin(month)) return getFallbackHijri(date);
      return `${day} ${month} ${year} H`;
    } catch (e) {
      return getFallbackHijri(date);
    }
  };

  /* ===== 3. CLOCK & DATETIME ===== */
  const elJam = document.getElementById('nav-jam');
  const elTgl = document.getElementById('nav-tgl');
  const elHijri = document.getElementById('nav-hijri');

  const updateClock = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    if (elJam) elJam.textContent = `${hh}:${mm}:${ss}`;
    if (elTgl) elTgl.textContent = `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    
    // Pembaruan Hijriah cukup dilakukan sekali atau saat pergantian hari saja sebenarnya, 
    // tapi karena dieksekusi ringan, dibiarkan di sini tetap aman.
    if (elHijri) elHijri.textContent = getHijriDate(now);
  };

  if (elJam || elTgl || elHijri) {
    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ===== 4. FOOTER YEAR ===== */
  const elTahun = document.getElementById('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== 5. DARK MODE LOGIC ===== */
  const btnDark = document.getElementById('btn-darkmode');
  
  const applyDark = (isDark) => {
    document.body.classList.toggle('dark', isDark);
    if (btnDark) btnDark.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('darkmode', isDark ? '1' : '0');
  };

  // Inisialisasi tema saat pertama kali dimuat
  applyDark(localStorage.getItem('darkmode') === '1');

  if (btnDark) {
    btnDark.addEventListener('click', () => {
      applyDark(!document.body.classList.contains('dark'));
    });
  }

  /* ===== 6. SEARCH OVERLAY LOGIC ===== */
  const overlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');
  const btnSearch = document.getElementById('btn-search');
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

  if (btnSearch) btnSearch.addEventListener('click', openSearch);
  if (searchClose) searchClose.addEventListener('click', closeSearch);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
  }

  // Keyboard Shortcuts (Escape untuk tutup, Ctrl+K / Cmd+K untuk buka)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

});

/* ============================================================
   dzikir-counter.js — Fitur counter ketuk interaktif
   Fikya.id — 2026

   Cara kerja:
   - Script membaca setiap .dzikir-count yang berisi angka
   - Mengubahnya menjadi tombol ketuk dengan hitungan mundur
   - State disimpan di localStorage dengan session ID unik
     per kunjungan halaman. Saat user refresh / buka tab baru,
     counter OTOMATIS RESET ke nilai awal.

   FIX v2:
   - Session ID kini disimpan di window (in-memory), BUKAN
     sessionStorage. sessionStorage bertahan selama tab hidup
     (termasuk refresh), sehingga ID tidak pernah berubah dan
     counter tidak pernah reset. Dengan window, ID di-generate
     ulang setiap kali halaman dimuat — termasuk saat refresh.
   - Key localStorage lama dibersihkan otomatis saat init.

   Pola teks .dzikir-count yang ditangani:
   "Dibaca 1 x"                             → countdown dari 1
   "Dibaca 3 x" / "Dibaca 4 x" / dst       → countdown dari angka tersebut
   "Dibaca 100 x"                           → countdown dari 100
   "Masing-masing dibaca 3 x"              → 3 counter terpisah per sub-surat
   "Dibaca 1 x setelah salam dari shalat…" → countdown dari 1

   Tidak ada dependency — vanilla JS murni.
   Pasang di HTML SETELAH main.js dan comments.js:
     <script src="../js/dzikir-counter.js"></script>
   ============================================================ */

(function () {
  'use strict';

  /* ===== AMBIL ANGKA DARI TEKS .dzikir-count ===== */
  const parseCount = (text) => {
    const match = text.match(/(\d+)\s*x/i);
    return match ? parseInt(match[1], 10) : null;
  };

  /* ===== SESSION ID UNIK PER PAGE LOAD (IN-MEMORY) ===== */
  /*
    PERBAIKAN UTAMA:
    Sebelumnya session ID disimpan di sessionStorage, yang
    TIDAK bersih saat refresh — hanya bersih saat tab ditutup.
    Akibatnya counter tidak pernah reset saat user refresh.

    Solusi: simpan session ID di window (in-memory).
    - Setiap kali halaman dimuat (termasuk refresh), window
      kosong dan ID di-generate ulang dari nol.
    - localStorage key menyertakan ID ini, sehingga data dari
      sesi sebelumnya tidak pernah terbaca lagi.
    - Key lama dibersihkan saat init agar localStorage tidak
      menumpuk seiring waktu.
  */
  const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ===== CLEANUP KEY LOCALSTORAGE LAMA ===== */
  const cleanupOldStorage = () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('dzikir_counter_') && !k.includes(SESSION_ID))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  };

  /* ===== STORAGE KEY PER HALAMAN + SESI ===== */
  const pageKey = () => {
    const path = window.location.pathname.split('/').pop().replace(/\.html?$/i, '');
    return `dzikir_counter_${path}_${SESSION_ID}`;
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(pageKey());
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(pageKey(), JSON.stringify(state));
    } catch (e) {}
  };

  /* ===== HAPTIC FEEDBACK ===== */
  const vibrate = (pattern) => {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  };

  /* ===== BUAT COUNTER UNTUK SATU KARTU ===== */
  const buildCounter = (cardIdx, total, isSub, subLabel) => {
    const state    = loadState();
    const stateKey = isSub ? `${cardIdx}_${subLabel}` : `${cardIdx}`;
    let current    = state[stateKey] !== undefined ? state[stateKey] : total;

    const wrapper = document.createElement('div');
    wrapper.className = 'dzikir-counter-wrapper' + (isSub ? ' dzikir-counter-wrapper--sub' : '');

    /* Label sub-surat (Al-Ikhlas, Al-Falaq, An-Naas) */
    if (isSub && subLabel) {
      const label = document.createElement('div');
      label.className = 'dzikir-counter-sublabel';
      label.textContent = subLabel;
      wrapper.appendChild(label);
    }

    /* Baris tombol + angka */
    const row = document.createElement('div');
    row.className = 'dzikir-counter-row';

    /* Tombol reset */
    const btnReset = document.createElement('button');
    btnReset.className = 'dzikir-counter-btn dzikir-counter-btn--reset';
    btnReset.setAttribute('aria-label', 'Reset counter');
    btnReset.setAttribute('title', 'Reset');
    btnReset.textContent = '↺';

    /* Display angka */
    const display = document.createElement('div');
    display.className = 'dzikir-counter-display';
    display.setAttribute('aria-live', 'polite');
    display.setAttribute('aria-atomic', 'true');

    /* Tombol ketuk */
    const btnTap = document.createElement('button');
    btnTap.className = 'dzikir-counter-btn dzikir-counter-btn--tap';

    /* Ring SVG — hanya untuk total > 1 */
    const RADIUS = 22;
    const CIRCUM = 2 * Math.PI * RADIUS;
    let circle   = null;

    if (total > 1) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'dzikir-counter-ring');
      svg.setAttribute('viewBox', '0 0 54 54');
      svg.setAttribute('aria-hidden', 'true');

      const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      track.setAttribute('cx', '27');
      track.setAttribute('cy', '27');
      track.setAttribute('r', String(RADIUS));
      track.setAttribute('class', 'dzikir-ring-track');

      circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '27');
      circle.setAttribute('cy', '27');
      circle.setAttribute('r', String(RADIUS));
      circle.setAttribute('class', 'dzikir-ring-progress');
      circle.style.strokeDasharray  = String(CIRCUM);
      circle.style.strokeDashoffset = String(CIRCUM);

      svg.appendChild(track);
      svg.appendChild(circle);
      row.appendChild(btnReset);
      row.appendChild(svg);
    } else {
      row.appendChild(btnReset);
    }

    row.appendChild(display);
    row.appendChild(btnTap);
    wrapper.appendChild(row);

    /* ===== UPDATE TAMPILAN ===== */
    const updateDisplay = (val, animate) => {
      const done = val <= 0;

      display.textContent = done ? '✓' : String(val);
      display.setAttribute('aria-label', done ? 'Selesai' : `Sisa ${val} dari ${total}`);
      btnTap.setAttribute('aria-label', done ? 'Selesai' : `Ketuk — sisa ${val}`);
      btnTap.disabled = done;
      btnTap.classList.toggle('dzikir-counter-btn--done', done);
      wrapper.classList.toggle('dzikir-counter-wrapper--done', done);

      if (circle) {
        const ratio  = Math.max(0, Math.min(1, 1 - val / total));
        circle.style.strokeDashoffset = String(CIRCUM * (1 - ratio));
      }

      if (animate) {
        display.classList.remove('dzikir-counter-pop');
        void display.offsetWidth;
        display.classList.add('dzikir-counter-pop');
      }
    };

    /* ===== HANDLER KETUK ===== */
    btnTap.addEventListener('click', () => {
      if (current <= 0) return;
      current--;
      if (current <= 0) {
        current = 0;
        vibrate([20, 30, 60]);
      } else {
        vibrate(10);
      }
      const s = loadState();
      s[stateKey] = current;
      saveState(s);
      updateDisplay(current, true);
    });

    /* ===== HANDLER RESET ===== */
    btnReset.addEventListener('click', () => {
      current = total;
      const s = loadState();
      s[stateKey] = current;
      saveState(s);
      updateDisplay(current, false);
      vibrate(5);
    });

    /* Render awal */
    updateDisplay(current, false);
    return wrapper;
  };

  /* ===== PROSES SETIAP KARTU ===== */
  const initCounters = () => {

    cleanupOldStorage();

    const cards = document.querySelectorAll('.dzikir-card');

    cards.forEach((card, cardIdx) => {
      const countEl = card.querySelector('.dzikir-count');
      if (!countEl) return;

      const rawText  = countEl.textContent.trim();
      const isMasing = rawText.toLowerCase().includes('masing-masing');
      const total    = parseCount(rawText);

      if (total === null) return;

      if (isMasing) {
        const subLabels = ['Al-Ikhlas', 'Al-Falaq', 'An-Naas'];

        const group = document.createElement('div');
        group.className = 'dzikir-counter-group';

        const groupTitle = document.createElement('div');
        groupTitle.className = 'dzikir-counter-group-title';
        groupTitle.textContent = `Masing-masing dibaca ${total}×`;
        group.appendChild(groupTitle);

        const subRow = document.createElement('div');
        subRow.className = 'dzikir-counter-subrow';

        subLabels.forEach((label) => {
          subRow.appendChild(buildCounter(cardIdx, total, true, label));
        });

        group.appendChild(subRow);
        countEl.replaceWith(group);

      } else {
        countEl.replaceWith(buildCounter(cardIdx, total, false, ''));
      }
    });
  };

  /* ===== INIT ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCounters);
  } else {
    initCounters();
  }

})();

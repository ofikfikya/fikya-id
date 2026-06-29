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

   FIX v3:
   - [BUG 1] setTimeout "done" tidak di-cancel saat reset cepat.
     Ditambahkan doneTimer per-counter; btnReset kini memanggil
     clearTimeout(doneTimer) sebelum memulihkan tampilan, sehingga
     fade-out yang sedang berjalan dibatalkan dan tidak menghapus
     ring/angka yang baru saja di-restore.
   - [BUG 2] aria-label pada elemen display tidak diperbarui saat
     state selesai (done). Screen reader membacakan "Sisa 1 dari N"
     alih-alih sesuatu yang bermakna. Sekarang display diberi
     aria-label "Selesai" saat done, dan dikosongkan saat reset
     (konten textContent yang berbicara).
   - [BUG 3] cleanupOldStorage() menghapus key dari tab lain yang
     masih aktif di halaman yang sama, karena setiap tab punya
     SESSION_ID berbeda dan saling menganggap key lawan sebagai
     "lama". Diperbaiki dengan menambahkan PAGE_SLUG ke prefix key
     cleanup — hanya key dari halaman & slug yang sama yang
     dihapus, bukan seluruh key dzikir_counter_*.

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
    Setiap kali halaman dimuat (termasuk refresh), window kosong
    dan ID di-generate ulang dari nol. localStorage key menyertakan
    ID ini sehingga data sesi sebelumnya tidak pernah terbaca lagi.
  */
  const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ===== PAGE SLUG — bagian nama halaman dari pathname ===== */
  /*
    Diekstrak sekali dan dipakai di PAGE_KEY maupun CLEANUP_PREFIX.
    Contoh: "/blog/dzikir-pagi.html" → "dzikir-pagi"
  */
  const PAGE_SLUG = window.location.pathname.split('/').pop().replace(/\.html?$/i, '');

  /* ===== CLEANUP KEY LOCALSTORAGE LAMA ===== */
  /*
    FIX v3 [BUG 3]:
    Versi sebelumnya memfilter dengan prefix umum "dzikir_counter_",
    sehingga cleanup di tab A menghapus key tab B yang masih aktif
    di halaman yang sama (kedua tab punya SESSION_ID berbeda, dan
    keduanya menganggap key lawan sebagai "lama").

    Solusi: sertakan PAGE_SLUG dalam prefix cleanup.
    Dengan begitu, tab A hanya membersihkan key dari halaman yang
    sama (dzikir-pagi) dengan SESSION_ID berbeda — key halaman lain
    (dzikir-petang) atau tab lain dengan PAGE_SLUG berbeda tidak
    tersentuh.
  */
  const CLEANUP_PREFIX = `dzikir_counter_${PAGE_SLUG}_`;

  const cleanupOldStorage = () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CLEANUP_PREFIX) && !k.includes(SESSION_ID))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  };

  /* ===== STORAGE KEY PER HALAMAN + SESI ===== */
  /*
    PAGE_KEY dihoist menjadi konstanta — nilainya tidak pernah
    berubah selama sesi, jadi tidak perlu dihitung ulang setiap
    kali loadState() atau saveState() dipanggil (setiap ketukan).
  */
  const PAGE_KEY = `${CLEANUP_PREFIX}${SESSION_ID}`;

  const loadState = () => {
    try {
      const raw = localStorage.getItem(PAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(PAGE_KEY, JSON.stringify(state));
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

    /*
      FIX v3 [BUG 1]:
      Timer fade-out "done" kini disimpan per-counter sehingga
      btnReset bisa membatalkannya (clearTimeout) sebelum memulihkan
      tampilan. Tanpa ini, jika user reset dalam 400ms setelah counter
      selesai, callback setTimeout tetap berjalan dan meng-hide ring
      serta angka yang baru saja di-restore.
    */
    let doneTimer = null;

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

    /* Ring SVG — selalu ditampilkan untuk semua counter agar tampilan konsisten */
    const RADIUS = 22;
    const CIRCUM = 2 * Math.PI * RADIUS;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dzikir-counter-ring');
    svg.setAttribute('viewBox', '0 0 54 54');
    svg.setAttribute('aria-hidden', 'true');

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', '27');
    track.setAttribute('cy', '27');
    track.setAttribute('r', String(RADIUS));
    track.setAttribute('class', 'dzikir-ring-track');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
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

    row.appendChild(display);
    row.appendChild(btnTap);
    wrapper.appendChild(row);

    /* ===== SETUP TRANSISI SMOOTH ===== */
    /*
      Gunakan opacity + max-width + overflow:hidden agar ring dan
      angka memudar & menyempit smooth saat selesai, sebaliknya
      muncul kembali smooth saat reset. Hindari display:none
      karena tidak bisa di-transisi.
    */
    const TRANSITION = 'opacity 0.35s ease, max-width 0.35s ease, margin 0.35s ease';

    svg.style.transition      = TRANSITION;
    svg.style.overflow        = 'hidden';
    svg.style.maxWidth        = '54px';
    svg.style.opacity         = '1';

    display.style.transition  = TRANSITION;
    display.style.overflow    = 'hidden';
    display.style.maxWidth    = '48px';
    display.style.opacity     = '1';

    /* ===== UPDATE TAMPILAN ===== */
    const updateDisplay = (val, animate) => {
      const done = val <= 0;

      if (done) {
        /*
          Saat selesai: ring diisi penuh dulu (hijau),
          tunggu animasi circle selesai (~350ms),
          baru fade out ring dan angka secara smooth.
          Ini memastikan counter 1x tidak langsung geser
          melainkan menampilkan circle penuh terlebih dahulu.
        */
        circle.style.strokeDashoffset = '0'; /* ring penuh */

        btnTap.setAttribute('aria-label', 'Selesai');
        btnTap.disabled = true;
        btnTap.classList.add('dzikir-counter-btn--done');
        wrapper.classList.add('dzikir-counter-wrapper--done');

        /*
          FIX v3 [BUG 2]:
          display diberi aria-label "Selesai" agar screen reader
          tidak membacakan nilai teks terakhir ("1") atau aria-label
          lama ("Sisa 1 dari N") yang tertinggal dari ketukan sebelumnya.
          Nilai textContent tetap dipertahankan (tidak dikosongkan) karena
          elemen akan di-fade-out oleh setTimeout di bawah — mengosongkan
          teks saat masih visible akan terlihat janggal secara visual.
        */
        display.setAttribute('aria-label', 'Selesai');

        /* FIX v3 [BUG 1]: simpan timer ID agar bisa di-cancel saat reset */
        doneTimer = setTimeout(() => {
          doneTimer = null;
          svg.style.opacity     = '0';
          svg.style.maxWidth    = '0';
          svg.style.marginRight = '0';
          display.style.opacity  = '0';
          display.style.maxWidth = '0';
        }, 400); /* 400ms = durasi ring progress (0.35s) + sedikit jeda */

      } else {
        /* Fade in + expand ring dan angka */
        svg.style.opacity     = '1';
        svg.style.maxWidth    = '54px';
        svg.style.marginRight = '';
        display.style.opacity  = '1';
        display.style.maxWidth = '48px';

        display.textContent = String(val);
        display.setAttribute('aria-label', `Sisa ${val} dari ${total}`);
        const ratio = Math.max(0, Math.min(1, 1 - val / total));
        circle.style.strokeDashoffset = String(CIRCUM * (1 - ratio));

        btnTap.setAttribute('aria-label', `Ketuk — sisa ${val}`);
        btnTap.disabled = false;
        btnTap.classList.remove('dzikir-counter-btn--done');
        wrapper.classList.remove('dzikir-counter-wrapper--done');
      }

      if (animate && !done) {
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
      /*
        FIX v3 [BUG 1]:
        Batalkan fade-out yang mungkin sedang berjalan (doneTimer)
        sebelum memulihkan tampilan. Tanpa clearTimeout ini, jika
        user reset dalam 400ms setelah counter selesai, callback
        setTimeout akan tetap berjalan setelah updateDisplay(total)
        dan kembali meng-hide ring serta angka yang baru di-restore.
      */
      if (doneTimer !== null) {
        clearTimeout(doneTimer);
        doneTimer = null;
      }
      /*
        FIX v3 [BUG 2] — sisi reset:
        Hapus aria-label override "Selesai" yang dipasang saat done.
        Setelah ini updateDisplay() akan menulis aria-label baru
        ("Sisa N dari total") lewat branch else-nya, tapi jika tidak
        dihapus dulu, ada window singkat di mana label lama masih
        terbaca oleh screen reader sebelum updateDisplay selesai.
        removeAttribute memastikan label lama benar-benar hilang
        sebelum teks baru ditulis.
      */
      display.removeAttribute('aria-label');
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
        /*
          Counter per surat disisipkan tepat SEBELUM .dzikir-arabic
          masing-masing, sehingga counter Al-Ikhlas ada di atas
          Al-Ikhlas, counter Al-Falaq di atas Al-Falaq, dst.
        */
        const subLabels  = ['Al-Ikhlas', 'Al-Falaq', 'An-Naas'];
        const arabicEls  = card.querySelectorAll('.dzikir-arabic');

        subLabels.forEach((label, i) => {
          const arabicEl = arabicEls[i];
          if (!arabicEl) return;
          arabicEl.parentNode.insertBefore(
            buildCounter(cardIdx, total, true, label),
            arabicEl
          );
        });

        /* Hapus elemen .dzikir-count asli setelah counter disisipkan */
        countEl.remove();

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

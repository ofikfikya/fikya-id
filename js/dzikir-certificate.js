/* ============================================================
   dzikir-certificate.js — Fitur Sertifikat Istiqomah
   Fikya.id — 2026

   Alur:
   1. Deteksi otomatis semua counter selesai
   2. Cek localStorage — jika ID sudah ada, langsung generate
      sertifikat. Jika belum, tampilkan modal pilihan.
   3. Modal: pilih User Baru (nama + email) atau User Lama (ID)
   4. Kirim ke Google Apps Script via JSONP
   5. Gambar sertifikat di Canvas API (vanilla, tanpa library)
   6. Tombol download PNG dan share WhatsApp

   Tidak ada dependency eksternal — vanilla JS murni.

   CHANGELOG v4:
   - FIX: Komentar DPR canvas dikoreksi dari "maksimal 2" menjadi "maksimal 3"
     sesuai nilai aktual Math.min(..., 3) yang sudah benar di kode.
   - FIX: openModal() — race condition diperbaiki. Sebelumnya resetData=true
     bisa meng-wipe certData yang baru diisi init() jika debug btn di-klik
     saat init() sedang await waitForCounters(). Sekarang reset hanya terjadi
     jika modal belum aktif (overlay tidak mengandung class 'active').
   - FIX: showStepGenerate() — setStatus('Menghubungi server...') dipindah
     ke SEBELUM Promise.all agar status tampil saat proses dimulai, bukan
     setelah selesai. Sebelumnya urutan terbalik — user hanya melihat status
     sesaat sebelum UI berganti ke step berikutnya.
   - FIX: waitForCounters() — polling 800ms sekarang berhenti segera jika
     tidak ada elemen .dzikir-count di halaman. Sebelumnya polling berjalan
     selamanya karena isAllDone() selalu false tanpa counter.
   - FIX: buildModal() / destroyModal() — Escape listener kini disimpan
     sebagai overlay._escHandler dan di-remove via destroyModal(). Sebelumnya
     listener anonim tidak bisa di-remove dan terus bocor ke document.

   - FIX: isWaktuValid() — kondisi waktu petang diperjelas: hanya
     15:00–23:59 yang valid. Komentar lama "hingga tengah malam"
     dikoreksi karena getHours() mengembalikan 0 di jam 00:xx,
     bukan nilai > 23.
   - FIX: waitForCounters() — click handler disimpan sebagai named
     function sehingga bisa di-removeEventListener setelah resolved.
     Sebelumnya listener global bocor dan tryResolve terus dipanggil
     setiap ada klik di halaman meski Promise sudah selesai.
   - FIX: apiCall() — parameter action sekarang di-encodeURIComponent
     sama seperti semua parameter lainnya.
   - FIX: drawTrophyBadge() — rumus arah sinar matahari ditulis ulang
     dengan variabel eksplisit (sunX, sunY) agar mudah dimodifikasi
     dan tidak rawan salah hitung jika posisi matahari berubah.
   - FIX: openModal() — certData di-reset setiap kali modal dibuka
     untuk alur baru, agar data sesi sebelumnya tidak terbawa.
   - FIX: injectLoginBtn() — retry setTimeout dibatasi maksimal 20x
     (10 detik) untuk mencegah timer berjalan selamanya jika
     dzikir-tools.js gagal load.

   CHANGELOG v2:
   - FIX: waitForCounters() — hapus duplikasi logika, interval
     dijamin di-clear di semua jalur resolve, tidak ada bocor.
   - FIX: injectLoginBtn() menggunakan pola retry internal sehingga
     tombol debug muncul segera tanpa menunggu counter selesai,
     sekaligus tetap aman dari race condition dengan dzikir-tools.js.
   - FIX: DPR canvas dibatasi maksimal 3 agar tidak crash di
     layar 4x saat memanggil toDataURL().
   - FIX: innerHTML dinamis dengan e.message dan info.pesan/saran
     diganti DOM API untuk mencegah potensi XSS.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     KONFIGURASI
     ============================================================ */

  const CFG = {
    APPS_SCRIPT_URL : 'https://script.google.com/macros/s/AKfycbwhc8NArp7jqycJV-GnZvOb6TmFKdWtVGPfNPAx6-LxXlWalGq18iY3cEKMmOkQmc3N/exec',
    SECRET_KEY      : '280526',
    LS_USER_ID      : 'fikya_user_id',
    LS_USER_NAMA    : 'fikya_user_nama',
    TIMEOUT_MS      : 12000,

    /* Deteksi jenis halaman dari path */
    JENIS : window.location.pathname.includes('petang') ? 'petang' : 'pagi',

    /* Tanggal dihitung dinamis saat sertifikat dibuat */
    get TGL_HIJRI()  { return formatTglHijri(new Date());  },
    get TGL_MASEHI() { return formatTglMasehi(new Date()); },
  };

  /* ============================================================
     FORMAT TANGGAL DINAMIS
     ============================================================ */

  /*
    formatTglHijri menggunakan window.HijriCalendar dari hijri.js —
    satu sumber kebenaran untuk semua format tanggal Hijriah.
    Offset dan nama bulan diatur di hijri.js saja.
  */
  const formatTglHijri = (date) => {
    if (window.HijriCalendar) return window.HijriCalendar.format(date);
    return '';
  };

  /* Format tanggal Masehi: "Jum'at, 19 Juni 2026" */
  const formatTglMasehi = (date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day    : 'numeric',
      month  : 'long',
      year   : 'numeric',
    });
  };

  /* ============================================================
     JSONP HELPER
     ============================================================ */

  const jsonp = (url) => new Promise((resolve, reject) => {
    const cbName  = `_cert_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script  = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Server lambat merespons. Coba lagi.'));
    }, CFG.TIMEOUT_MS);

    const cleanup = () => {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timeout);
    };

    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.src     = `${url}&callback=${cbName}`;

    /*
      PENTING: onerror pada JSONP ke Google Apps Script TIDAK
      dipakai sebagai rejection karena Apps Script melakukan
      302 redirect yang kadang memicu onerror di browser meski
      request sebenarnya berhasil. Biarkan timeout yang menangani
      kegagalan — persis seperti pola di comments.js.
    */
    script.onerror = () => { console.warn('cert: script error, menunggu callback...'); };
    document.head.appendChild(script);
  });

  const apiCall = (params) => {
    const { action, ...rest } = params;
    /* FIX v3: action di-encode sama seperti parameter lain */
    const base  = `action=${encodeURIComponent(action)}`;
    const extra = Object.entries({ ...rest, key: CFG.SECRET_KEY })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return jsonp(`${CFG.APPS_SCRIPT_URL}?${base}&${extra}`);
  };

  /* ============================================================
     LOCAL STORAGE HELPER
     ============================================================ */

  const ls = {
    get  : (k)    => { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set  : (k, v) => { try { localStorage.setItem(k, v); }    catch(e) {} },
    clear: (k)    => { try { localStorage.removeItem(k); }    catch(e) {} },
  };

  /* ============================================================
     CEK SEMUA COUNTER SELESAI
     ============================================================ */

  /*
    FIX v3: Versi sebelumnya tidak menyimpan referensi click handler,
    sehingga document.removeEventListener tidak bisa dipanggil dan
    listener bocor — tryResolve() terus terpanggil setiap klik di
    halaman meski Promise sudah lama resolve.

    Versi baru:
    - clickHandler disimpan sebagai named function agar bisa di-remove.
    - removeEventListener dipanggil di dalam tryResolve() bersamaan
      dengan clearInterval(), sehingga keduanya bersih di satu tempat.
  */
  const waitForCounters = () => new Promise((resolve) => {
    let resolved = false;
    let interval = null;

    const isAllDone = () => {
      const allBtns = document.querySelectorAll('.dzikir-counter-btn--tap');
      if (allBtns.length === 0) return false;
      return [...allBtns].every(btn => btn.classList.contains('dzikir-counter-btn--done'));
    };

    /* FIX v3: named function agar bisa di-removeEventListener.
       Dideklarasikan sebelum tryResolve agar referensi ke clickHandler
       di dalam tryResolve tidak menyebabkan kebingungan urutan deklarasi. */
    const clickHandler = () => setTimeout(tryResolve, 400);

    const tryResolve = () => {
      if (resolved) return;
      if (!isAllDone()) return;
      resolved = true;
      clearInterval(interval);
      document.removeEventListener('click', clickHandler); /* FIX v3: hapus listener */
      resolve();
    };

    /*
      FIX v4: Jika tidak ada .dzikir-counter-btn--tap di halaman sama
      sekali (mis. dzikir-counter.js belum inject counter), polling
      800ms akan berjalan selamanya karena isAllDone() selalu false.
      Solusi: cek dulu apakah ada .dzikir-count di halaman — jika tidak
      ada, resolve segera karena halaman ini tidak memerlukan counter.
      Jika ada, polling menunggu counter selesai di-inject oleh JS.
    */
    const hasCounterElements =
      document.querySelectorAll('.dzikir-counter-wrapper').length > 0 ||
      document.querySelectorAll('.dzikir-count').length > 0;
    if (!hasCounterElements) {
      resolve();
      return;
    }

    /* Polling setiap 800ms untuk mendeteksi setelah counter di-inject */
    interval = setInterval(tryResolve, 800);

    /* Deteksi real-time setelah setiap klik — lebih responsif */
    document.addEventListener('click', clickHandler, { passive: true });
  });

  /* ============================================================
     MODAL
     ============================================================ */

  let overlay, modal, certData = {};

  /*
    fontsReady — diinisialisasi null di sini, lalu di-assign di init()
    agar waitForFonts() baru dipanggil setelah DOM siap (DOMContentLoaded).
    Memanggil waitForFonts() di level modul (sebelum DOM siap) menyebabkan
    Promise pertama tidak bisa di-clear jika init() menimpa variabel ini,
    sehingga polling interval di dalam waitForFonts() bocor selamanya.
    showStepGenerate() dan showStepSertifikat() cukup await Promise ini.
  */
  let fontsReady = null;

  const buildModal = () => {
    overlay = document.createElement('div');
    overlay.className = 'cert-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Sertifikat Istiqomah');

    modal = document.createElement('div');
    modal.className = 'cert-modal';
    modal.innerHTML = `<div class="cert-modal-inner" id="cert-modal-inner"></div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    /* Tutup saat klik overlay */
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    /* FIX v4: Simpan referensi escHandler agar bisa di-removeEventListener
       di closeModal(). Sebelumnya listener anonim tidak bisa di-remove dan
       terus hidup bahkan setelah overlay dihapus dari DOM. */
    overlay._escHandler = (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
    };
    document.addEventListener('keydown', overlay._escHandler);
  };

  const openModal = (resetData = true) => {
    /* FIX v3: reset certData setiap kali modal dibuka untuk alur baru,
       sehingga data sesi sebelumnya tidak ikut terbawa jika user
       menutup modal lalu membukanya kembali.
       Parameter resetData = false dipakai oleh init() saat savedId
       sudah ada dan certData sudah diisi sebelum openModal dipanggil.

       FIX v4: Perbaiki race condition — jika init() sedang menunggu
       await waitForCounters() dan debug btn memanggil openModal()
       (resetData=true default) di saat yang sama, certData yang sudah
       diisi oleh init() akan ter-reset. Solusi: resetData hanya berlaku
       jika modal belum aktif (overlay.classList tidak mengandung 'active').
       Jika modal sudah terbuka, biarkan certData apa adanya. */
    if (resetData && !overlay.classList.contains('active')) certData = {};
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  /*
    destroyModal — hapus overlay dari DOM dan bersihkan Escape listener.
    FIX v4: escHandler yang sebelumnya bocor kini di-remove di sini.
    Panggil destroyModal() jika modal perlu dihapus sepenuhnya dari DOM
    (mis. saat navigasi SPA atau pembersihan komponen).
  */
  const destroyModal = () => {
    if (overlay._escHandler) {
      document.removeEventListener('keydown', overlay._escHandler);
      overlay._escHandler = null;
    }
    overlay.remove();
  };

  const getInner = () => document.getElementById('cert-modal-inner');

  /* ============================================================
     STEP 1 — PILIHAN USER BARU / LAMA
     ============================================================ */

  const showStepPilihan = () => {
    getInner().innerHTML = `
      <div class="cert-steps">
        <div class="cert-step-dot active"></div>
        <div class="cert-step-dot"></div>
        <div class="cert-step-dot"></div>
      </div>

      <div class="cert-modal-icon">🎉</div>
      <div class="cert-modal-title">Dzikir Selesai!</div>
      <div class="cert-modal-desc">
        Alhamdulillah, Anda telah menyelesaikan
        <strong>Dzikir ${CFG.JENIS === 'pagi' ? 'Pagi' : 'Petang'}</strong>.<br>
        Dapatkan sertifikat istiqomah Anda.
      </div>

      <div class="cert-choice-row">
        <button class="cert-choice-btn" id="cert-btn-baru">
          <span class="cert-choice-icon">✨</span>
          <span class="cert-choice-label">Saya Baru</span>
          <span class="cert-choice-sub">Daftar & dapatkan ID unik</span>
        </button>
        <button class="cert-choice-btn" id="cert-btn-lama">
          <span class="cert-choice-icon">🔑</span>
          <span class="cert-choice-label">Saya Punya ID</span>
          <span class="cert-choice-sub">Masuk dengan ID yang ada</span>
        </button>
      </div>

      <div class="cert-btn-row" style="margin-top:16px;">
        <button class="cert-btn cert-btn--secondary" id="cert-btn-skip">Lewati</button>
      </div>
    `;

    document.getElementById('cert-btn-baru').addEventListener('click', () => showStepFormBaru());
    document.getElementById('cert-btn-lama').addEventListener('click', () => showStepFormLama());
    document.getElementById('cert-btn-skip').addEventListener('click', closeModal);
  };

  /* ============================================================
     STEP 2A — FORM USER BARU
     ============================================================ */

  const showStepFormBaru = () => {
    getInner().innerHTML = `
      <div class="cert-steps">
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot active"></div>
        <div class="cert-step-dot"></div>
      </div>

      <div class="cert-modal-icon">📝</div>
      <div class="cert-modal-title">Daftar Akun</div>
      <div class="cert-modal-desc">Masukkan nama dan email Anda untuk mendapatkan ID unik.</div>

      <div class="cert-form">
        <div class="cert-form-group">
          <label for="cert-input-nama">Nama Lengkap</label>
          <input type="text" id="cert-input-nama" placeholder="Contoh: Rahmat Taufik"
            maxlength="80" autocomplete="name" />
        </div>
        <div class="cert-form-group">
          <label for="cert-input-email">Alamat Email</label>
          <input type="email" id="cert-input-email" placeholder="contoh@email.com"
            maxlength="100" autocomplete="email" />
          <span class="cert-form-hint">Email digunakan untuk memulihkan ID Anda.</span>
        </div>
        <div class="cert-message" id="cert-msg-baru"></div>
      </div>

      <div class="cert-btn-row">
        <button class="cert-btn cert-btn--secondary" id="cert-back-baru">← Kembali</button>
        <button class="cert-btn cert-btn--primary" id="cert-submit-baru">Daftar & Buat Sertifikat</button>
      </div>
    `;

    document.getElementById('cert-back-baru').addEventListener('click', showStepPilihan);
    document.getElementById('cert-submit-baru').addEventListener('click', submitUserBaru);

    /* Enter submit */
    ['cert-input-nama', 'cert-input-email'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitUserBaru();
      });
    });

    document.getElementById('cert-input-nama')?.focus();
  };

  /*
    sanitizeNama — normalisasi string nama dari sumber eksternal
    (respons server atau localStorage) sebelum disimpan ke certData.

    Tiga titik yang memanggil ini:
    1. submitUserBaru() — res.nama dari server saat registrasi
    2. submitUserLama() — res.nama dari server saat verifikasi ID
    3. init()           — savedNama dari localStorage sesi sebelumnya

    Tanpa sanitasi, nama yang dikembalikan server bisa berisi string
    panjang, karakter kontrol, atau konten tak terduga yang kemudian
    dirender di canvas (drawCertificate) dan dikirim via WhatsApp share.
  */
  const sanitizeNama = (raw) =>
    String(raw || '').trim().replace(/[\r\n\t]/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 80);

  const submitUserBaru = async () => {
    const nama  = document.getElementById('cert-input-nama')?.value.trim()  || '';
    const email = document.getElementById('cert-input-email')?.value.trim() || '';
    const msgEl = document.getElementById('cert-msg-baru');
    const btn   = document.getElementById('cert-submit-baru');

    const showMsg = (tipe, teks) => {
      msgEl.className   = `cert-message ${tipe}`;
      msgEl.textContent = teks;
    };

    if (!nama)  return showMsg('error', 'Nama tidak boleh kosong.');
    if (!email) return showMsg('error', 'Email tidak boleh kosong.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return showMsg('error', 'Format email tidak valid.');

    btn.disabled    = true;
    btn.textContent = 'Memproses...';
    showMsg('info', 'Menghubungi server...');

    try {
      const res = await apiCall({ action: 'registerUser', nama, email });

      if (res.status === 'ok' || res.status === 'exists') {
        const namaBersih = sanitizeNama(res.nama);
        ls.set(CFG.LS_USER_ID,   res.userId);
        ls.set(CFG.LS_USER_NAMA, namaBersih);
        certData = { userId: res.userId, nama: namaBersih };

        if (res.status === 'exists') {
          showMsg('info', `Email sudah terdaftar. ID Anda: ${res.userId}`);
          await delay(1200);
        }

        await showStepGenerate();
      } else {
        showMsg('error', res.message || 'Gagal mendaftar. Coba lagi.');
        btn.disabled    = false;
        btn.textContent = 'Daftar & Buat Sertifikat';
      }
    } catch (e) {
      showMsg('error', 'Gagal terhubung ke server. Periksa koneksi internet.');
      btn.disabled    = false;
      btn.textContent = 'Daftar & Buat Sertifikat';
    }
  };

  /* ============================================================
     STEP 2B — FORM USER LAMA
     ============================================================ */

  const showStepFormLama = () => {
    getInner().innerHTML = `
      <div class="cert-steps">
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot active"></div>
        <div class="cert-step-dot"></div>
      </div>

      <div class="cert-modal-icon">🔑</div>
      <div class="cert-modal-title">Masuk dengan ID</div>
      <div class="cert-modal-desc">Masukkan ID unik Anda untuk melanjutkan.</div>

      <div class="cert-form">
        <div class="cert-form-group">
          <label for="cert-input-id">ID User</label>
          <input type="text" id="cert-input-id" placeholder="Contoh: USR-26001"
            maxlength="20" autocomplete="off" style="text-transform:uppercase;" />
          <span class="cert-form-hint">ID terdiri dari format USR-XXYYYY</span>
        </div>
        <div class="cert-message" id="cert-msg-lama"></div>
      </div>

      <div class="cert-btn-row">
        <button class="cert-btn cert-btn--secondary" id="cert-back-lama">← Kembali</button>
        <button class="cert-btn cert-btn--primary" id="cert-submit-lama">Verifikasi & Buat Sertifikat</button>
      </div>
    `;

    document.getElementById('cert-back-lama').addEventListener('click', showStepPilihan);
    document.getElementById('cert-submit-lama').addEventListener('click', submitUserLama);

    const inputId = document.getElementById('cert-input-id');
    inputId?.addEventListener('input', () => {
      inputId.value = inputId.value.toUpperCase();
    });
    inputId?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitUserLama();
    });
    inputId?.focus();
  };

  const submitUserLama = async () => {
    const userId = document.getElementById('cert-input-id')?.value.trim().toUpperCase() || '';
    const msgEl  = document.getElementById('cert-msg-lama');
    const btn    = document.getElementById('cert-submit-lama');

    const showMsg = (tipe, teks) => {
      msgEl.className   = `cert-message ${tipe}`;
      msgEl.textContent = teks;
    };

    if (!userId) return showMsg('error', 'ID tidak boleh kosong.');

    btn.disabled    = true;
    btn.textContent = 'Memverifikasi...';
    showMsg('info', 'Menghubungi server...');

    try {
      const res = await apiCall({ action: 'verifyUser', userId });

      if (res.status === 'ok') {
        const namaBersih = sanitizeNama(res.nama);
        ls.set(CFG.LS_USER_ID,   res.userId);
        ls.set(CFG.LS_USER_NAMA, namaBersih);
        certData = { userId: res.userId, nama: namaBersih };
        await showStepGenerate();
      } else {
        showMsg('error', res.message || 'ID tidak ditemukan.');
        btn.disabled    = false;
        btn.textContent = 'Verifikasi & Buat Sertifikat';
      }
    } catch (e) {
      showMsg('error', 'Gagal terhubung ke server. Periksa koneksi internet.');
      btn.disabled    = false;
      btn.textContent = 'Verifikasi & Buat Sertifikat';
    }
  };

  /* ============================================================
     STEP 3 — GENERATE & TAMPIL SERTIFIKAT
     ============================================================ */

  const showStepGenerate = async () => {
    getInner().innerHTML = `
      <div class="cert-steps">
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot active"></div>
      </div>
      <div class="cert-loading">
        <div class="cert-spinner"></div>
        <div class="cert-loading-text" id="cert-loading-text">Menghubungi server...</div>
      </div>
    `;

    const setStatus = (teks) => {
      const el = document.getElementById('cert-loading-text');
      if (el) el.textContent = teks;
    };

    try {
      /*
        Jalankan apiCall dan waitForFonts secara PARALEL.
        Keduanya bisa memakan waktu (network), jadi tidak ada alasan
        menunggu satu selesai dulu sebelum memulai yang lain.

        fontsReady sudah dimulai sejak init() — di sini kita hanya
        membuat fallback jika entah bagaimana belum dimulai.

        FIX v4: setStatus('Menghubungi server...') dipindah ke SEBELUM
        Promise.all agar status tampil saat request dimulai — bukan sesudah
        selesai. setStatus('Menggambar sertifikat...') dipanggil di dalam
        .then() setelah fontsReady resolve, yang masih paralel dengan
        apiCall. Urutan sebelumnya (status dipanggil setelah await) berarti
        user hanya melihat status saat proses sudah selesai — terbalik.
      */
      if (!fontsReady) fontsReady = waitForFonts();

      setStatus('Menghubungi server...');

      const [res] = await Promise.all([
        apiCall({ action: 'generateCert', userId: certData.userId, jenis: CFG.JENIS }),
        fontsReady.then(() => setStatus('Menggambar sertifikat...')),
      ]);
      if (res.status !== 'ok') throw new Error(res.message || 'Gagal generate sertifikat');

      certData.nomorSertifikat = res.nomorSertifikat;
      certData.tanggal         = res.tanggal;
      certData.streak          = res.streak || 1;

      /* Font sudah pasti siap di sini karena fontsReady sudah di-await
         di dalam Promise.all di atas */
      await showStepSertifikat();
    } catch (e) {
      /*
        FIX v2: e.message dimasukkan via textContent, bukan innerHTML,
        untuk mencegah potensi XSS jika pesan error mengandung HTML.
      */
      const inner = getInner();
      inner.innerHTML = `
        <div class="cert-modal-icon">⚠️</div>
        <div class="cert-modal-title">Gagal Membuat Sertifikat</div>
        <div class="cert-modal-desc" id="cert-err-desc"></div>
        <div class="cert-btn-row">
          <button class="cert-btn cert-btn--secondary" id="cert-retry">Coba Lagi</button>
          <button class="cert-btn cert-btn--primary" id="cert-close-err">Tutup</button>
        </div>
      `;
      document.getElementById('cert-err-desc').textContent = e.message;
      document.getElementById('cert-retry')?.addEventListener('click', showStepGenerate);
      document.getElementById('cert-close-err')?.addEventListener('click', closeModal);
    }
  };

  /* ============================================================
     STEP 3 — TAMPIL SERTIFIKAT + CANVAS
     ============================================================ */

  const showStepSertifikat = async () => {
    const canvas = document.createElement('canvas');

    /*
      DPR dibatasi maksimal 3.
      devicePixelRatio bisa bernilai 4 di perangkat modern.
      Canvas 700×680 dengan DPR=4 menjadi 2800×2720px (7.6 megapiksel)
      yang bisa menyebabkan lag atau crash saat toDataURL() dipanggil.
      Kualitas sertifikat tetap tajam di DPR=3 (retina Plus).

      Fallback ke 1 (bukan 3) jika devicePixelRatio undefined atau 0
      — misalnya di SSR, WebView tertentu, atau lingkungan non-browser.
      Fallback ke 3 sebelumnya menyebabkan canvas dibuat 3× lebih besar
      dari perlu tanpa benefit visual apapun, membuang memori dan CPU.
    */
    const DPR     = Math.min(window.devicePixelRatio || 1, 3);
    const CW      = 700;
    const CH      = 680;
    canvas.width  = CW * DPR;
    canvas.height = CH * DPR;
    canvas.style.width  = CW + 'px';
    canvas.style.height = CH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    getInner().innerHTML = `
      <div class="cert-steps">
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot done"></div>
        <div class="cert-step-dot done"></div>
      </div>
      <div class="cert-modal-icon">🏅</div>
      <div class="cert-modal-title">Sertifikat Siap!</div>
      <div class="cert-canvas-section">
        <div class="cert-canvas-wrap" id="cert-canvas-wrap"></div>
        <div class="cert-info-box">
          <div class="cert-info-item">
            <span class="cert-info-label">ID User</span>
            <span class="cert-info-value" id="cert-info-userid"></span>
          </div>
          <div class="cert-info-item">
            <span class="cert-info-label">No. Sertifikat</span>
            <span class="cert-info-value" id="cert-info-nomor"></span>
          </div>
        </div>
        <div class="cert-action-row">
          <button class="cert-action-btn cert-action-btn--download" id="cert-download">
            ⬇️ Download PNG
          </button>
          <button class="cert-action-btn cert-action-btn--whatsapp" id="cert-whatsapp">
            💬 Share WhatsApp
          </button>
          <button class="cert-action-btn cert-action-btn--close" id="cert-close-final">✕</button>
        </div>
      </div>
    `;

    /*
      FIX v2: certData.userId dan certData.nomorSertifikat dimasukkan
      via textContent, bukan interpolasi string di innerHTML,
      untuk mencegah potensi XSS.
    */
    document.getElementById('cert-info-userid').textContent = certData.userId        || '-';
    document.getElementById('cert-info-nomor').textContent  = certData.nomorSertifikat || '-';

    /* Font dijamin sudah siap karena fontsReady di-await di showStepGenerate()
       sebelum fungsi ini dipanggil. Tidak perlu waitForFonts() lagi. */
    document.getElementById('cert-canvas-wrap').appendChild(canvas);
    drawCertificate(ctx, certData);

    /* Download PNG */
    document.getElementById('cert-download').addEventListener('click', () => {
      const btn = document.getElementById('cert-download');

      btn.disabled    = true;
      btn.textContent = '⏳ Menyiapkan...';

      /* toDataURL bisa memakan waktu untuk canvas besar — beri jeda agar
         browser sempat render perubahan tombol sebelum proses berat dimulai */
      setTimeout(() => {
        try {
          const link    = document.createElement('a');
          link.download = `sertifikat-dzikir-${CFG.JENIS}-${certData.nomorSertifikat}.png`;
          link.href     = canvas.toDataURL('image/png');
          link.click();

          btn.textContent = '✅ Tersimpan!';
          setTimeout(() => {
            btn.textContent = '⬇️ Download PNG';
            btn.disabled    = false;
          }, 2500);
        } catch (e) {
          btn.textContent = '❌ Gagal';
          setTimeout(() => {
            btn.textContent = '⬇️ Download PNG';
            btn.disabled    = false;
          }, 2000);
        }
      }, 80);
    });

    /* Share WhatsApp */
    document.getElementById('cert-whatsapp').addEventListener('click', () => {
      const jenis = CFG.JENIS === 'pagi' ? 'Dzikir Pagi 🌤️' : 'Dzikir Petang 🌆';
      const teks  = encodeURIComponent(
        `Alhamdulillah, saya telah menyelesaikan ${jenis} hari ini!\n\n` +
        `🏅 Sertifikat Istiqomah\n` +
        `👤 ${certData.nama}\n` +
        `🌙 ${CFG.TGL_HIJRI}\n` +
        `📅 ${CFG.TGL_MASEHI}\n` +
        `🔖 ${certData.nomorSertifikat}\n\n` +
        `Yuk semangat berdzikir bersama di fikya.id`
      );
      window.open(`https://wa.me/?text=${teks}`, '_blank');
    });

    document.getElementById('cert-close-final').addEventListener('click', closeModal);
  };

  /* ============================================================
     CANVAS — GAMBAR SERTIFIKAT
     ============================================================ */

  const drawCertificate = (ctx, data) => {
    const W   = 700;
    const H   = 680;

    const GOLD      = '#b8860b';
    const GOLD_LITE = '#d4a843';
    const CREAM     = '#fdf8f0';
    const DARK      = '#4a3000';
    const MUTED     = '#8a6820';
    const JENIS_STR = CFG.JENIS === 'pagi' ? 'Dzikir Pagi' : 'Dzikir Petang';

    /* ── Background ── */
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, W, H);

    /* ── Border luar ── */
    ctx.strokeStyle = GOLD;
    ctx.lineWidth   = 4;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    /* ── Border dalam ── */
    ctx.strokeStyle = GOLD_LITE;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    /* ── Corner ornaments ── */
    drawCorners(ctx, W, H, GOLD, GOLD_LITE);

    /* ── Ornamen tengah atas ── */
    drawTopOrnament(ctx, W, GOLD, GOLD_LITE);

    /* ── Bismillah ── */
    ctx.fillStyle  = '#7c5c10';
    ctx.font       = '18px "Times New Roman", serif';
    ctx.textAlign  = 'center';
    ctx.fillText('بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ', W / 2, 72);

    /* ── Fikya.id ── */
    ctx.fillStyle     = MUTED;
    ctx.font          = '600 10px Inter, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('FIKYA.ID', W / 2, 90);
    ctx.letterSpacing = '0px';

    /* ── Garis divider ── */
    drawDivider(ctx, W, 100, GOLD_LITE, GOLD);

    /* ── Judul ── */
    ctx.fillStyle = '#6b4c0e';
    ctx.font      = '600 11px Inter, sans-serif';
    ctx.fillText('SERTIFIKAT ISTIQOMAH', W / 2, 122);

    /* ── Diberikan kepada ── */
    ctx.fillStyle = MUTED;
    ctx.font      = 'italic 13px Georgia, serif';
    ctx.fillText('Dengan penuh syukur, diberikan kepada', W / 2, 142);

    /* ── Nama ── */
    ctx.fillStyle = DARK;

    let displayNama = data.nama || 'Nama User';
    let nameFontSize = 34;
    const maxNameW = W - 120;

    ctx.font = `bold ${nameFontSize}px Georgia, serif`;
    while (nameFontSize > 18 && ctx.measureText(displayNama).width > maxNameW) {
      nameFontSize -= 2;
      ctx.font = `bold ${nameFontSize}px Georgia, serif`;
    }

    if (ctx.measureText(displayNama).width > maxNameW) {
      while (ctx.measureText(displayNama + '…').width > maxNameW && displayNama.length > 0) {
        displayNama = displayNama.slice(0, -1);
      }
      displayNama += '…';
    }

    ctx.fillText(displayNama, W / 2, 182);

    /* ── Subtitle ── */
    ctx.fillStyle = '#7a5a10';
    ctx.font      = '13px Inter, sans-serif';
    ctx.fillText(`Telah menyelesaikan ${JENIS_STR}`, W / 2, 202);

    /* ── Kalimat harapan ── */
    ctx.fillStyle = MUTED;
    ctx.font      = 'italic 11.5px Georgia, serif';
    wrapText(ctx, '"Semoga Allah menerima amal ibadah ini serta menjadikannya', W / 2, 220, 560, 17);
    wrapText(ctx, 'sebab keberkahan dan penjagaan sepanjang hari"', W / 2, 237, 560, 17);

    /* ── Divider tengah ── */
    drawThinDivider(ctx, W, 255, GOLD_LITE);

    /* ── Badge api & piala ── */
    drawBadges(ctx, W, 284, CFG.JENIS, data.streak || 1, GOLD, GOLD_LITE, DARK);

    /* ── Divider ── */
    drawThinDivider(ctx, W, 328, GOLD_LITE);

    /* ── Do'a box ── */
    drawDoaBox(ctx, W, 343, GOLD, GOLD_LITE, DARK, MUTED);

    /* ── Footer ── */
    drawFooter(ctx, W, H, data, GOLD, GOLD_LITE, DARK, MUTED);
  };

  /* ── Helper: corner ornaments ── */
  const drawCorners = (ctx, W, H, gold, lite) => {
    const corners = [
      [24, 24, false, false],
      [W - 24, 24, true, false],
      [24, H - 24, false, true],
      [W - 24, H - 24, true, true],
    ];
    corners.forEach(([x, y, flipX, flipY]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.strokeStyle = gold;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke();
      ctx.strokeStyle = lite;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.arc(7, 7, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(7, 7, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  };

  /* ── Helper: ornamen atas ── */
  const drawTopOrnament = (ctx, W, gold, lite) => {
    const cx = W / 2;
    const y  = 48;

    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(cx - 90, y); ctx.lineTo(cx - 18, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 18, y); ctx.lineTo(cx + 90, y); ctx.stroke();

    /* Diamond */
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx, y - 10); ctx.lineTo(cx + 8, y);
    ctx.lineTo(cx, y + 10); ctx.lineTo(cx - 8, y);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = lite;
    ctx.beginPath();
    ctx.moveTo(cx, y - 6); ctx.lineTo(cx + 5, y);
    ctx.lineTo(cx, y + 6); ctx.lineTo(cx - 5, y);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx, y - 3); ctx.lineTo(cx + 3, y);
    ctx.lineTo(cx, y + 3); ctx.lineTo(cx - 3, y);
    ctx.closePath(); ctx.fill();

    [cx - 18, cx + 18].forEach(px => {
      ctx.fillStyle = lite;
      ctx.beginPath(); ctx.arc(px, y, 2, 0, Math.PI * 2); ctx.fill();
    });
  };

  /* ── Helper: divider dengan diamond ── */
  const drawDivider = (ctx, W, y, lite, gold) => {
    const cx = W / 2;
    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(cx - 10, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 10, y); ctx.lineTo(W - 30, y); ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(cx, y - 5); ctx.lineTo(cx + 5, y);
    ctx.lineTo(cx, y + 5); ctx.lineTo(cx - 5, y);
    ctx.closePath(); ctx.fill();
  };

  /* ── Helper: divider tipis ── */
  const drawThinDivider = (ctx, W, y, lite) => {
    const grad = ctx.createLinearGradient(W * 0.2, y, W * 0.8, y);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, lite);
    grad.addColorStop(1, 'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.2, y); ctx.lineTo(W * 0.8, y); ctx.stroke();
  };

  /* ── Helper: badge api & piala ── */
  const drawBadges = (ctx, W, y, jenis, streak, gold, lite, dark) => {
    const cx = W / 2;

    const ax = cx - 60;
    drawFireBadge(ctx, ax, y, streak, gold, lite);
    ctx.fillStyle   = '#8a6820';
    ctx.font        = '600 9px Inter, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(`${streak} HARI BERTURUT`, ax, y + 32);

    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, y - 14); ctx.lineTo(cx, y + 28); ctx.stroke();
    ctx.globalAlpha = 1;

    const px = cx + 60;
    drawTrophyBadge(ctx, px, y, jenis, gold, lite);
    ctx.fillStyle = '#8a6820';
    ctx.font      = '600 9px Inter, sans-serif';
    ctx.fillText(jenis === 'pagi' ? 'DZIKIR PAGI' : 'DZIKIR PETANG', px, y + 32);
  };

  const drawFireBadge = (ctx, cx, cy, streak, gold, lite) => {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle   = '#fff7e6';
    ctx.strokeStyle = gold;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(0, 14); ctx.bezierCurveTo(-8, 14, -12, 8, -12, 3);
    ctx.bezierCurveTo(-12, -3, -7, -7, -5, -11);
    ctx.bezierCurveTo(-5, -5, -3, -3, -1, -5);
    ctx.bezierCurveTo(-1, -9, 1, -13, 4, -16);
    ctx.bezierCurveTo(4, -9, 2, -6, 4, -4);
    ctx.bezierCurveTo(7, -8, 7, -3, 7, 0);
    ctx.bezierCurveTo(9, -2, 9, -6, 8, -8);
    ctx.bezierCurveTo(12, -4, 12, 3, 10, 7);
    ctx.bezierCurveTo(12, 5, 12, 10, 8, 13);
    ctx.bezierCurveTo(6, 14, 3, 14, 0, 14);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, 12); ctx.bezierCurveTo(-5, 12, -8, 8, -8, 4);
    ctx.bezierCurveTo(-8, 0, -5, -3, -4, -6);
    ctx.bezierCurveTo(-4, -2, -2, -1, -1, -3);
    ctx.bezierCurveTo(-1, -6, 1, -9, 3, -11);
    ctx.bezierCurveTo(3, -7, 2, -5, 3, -3);
    ctx.bezierCurveTo(5, -6, 6, -2, 6, 1);
    ctx.bezierCurveTo(8, -1, 8, 3, 6, 7);
    ctx.bezierCurveTo(8, 5, 8, 9, 5, 11);
    ctx.bezierCurveTo(4, 12, 2, 12, 0, 12);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#92400e';
    /* Font adaptif agar angka streak tidak overflow lingkaran (r=18):
       1-9  → 10px, 10-99 → 8px, 100+ → 7px */
    ctx.font      = streak >= 100 ? 'bold 7px Inter, sans-serif'
                  : streak >= 10  ? 'bold 8px Inter, sans-serif'
                  : 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(streak), 0, 10);

    ctx.restore();
  };

  const drawTrophyBadge = (ctx, cx, cy, jenis, gold, lite) => {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle   = '#fffbeb';
    ctx.strokeStyle = gold;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.lineTo(8, -10);
    ctx.lineTo(6, 2); ctx.bezierCurveTo(6, 6, 3, 8, 0, 8);
    ctx.bezierCurveTo(-3, 8, -6, 6, -6, 2);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-12, -10);
    ctx.lineTo(-12, -6); ctx.bezierCurveTo(-12, -2, -9, -1, -6, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(12, -10);
    ctx.lineTo(12, -6); ctx.bezierCurveTo(12, -2, 9, -1, 6, -1); ctx.stroke();

    ctx.fillStyle = '#b8860b';
    ctx.fillRect(-2, 8, 4, 4);
    ctx.fillRect(-5, 12, 10, 2);

    ctx.fillStyle = '#fef9c3';
    ctx.font      = '9px serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, -2);

    if (jenis === 'pagi') {
      /* Matahari kecil di pojok kanan atas piala */
      const sunX = 10;
      const sunY = -12;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(sunX, sunY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 1;
      /* FIX v3: rumus sinar menjauhi pusat matahari (sunX, sunY).
         dx = x - sunX, dy = y - sunY — arah dari pusat ke titik ujung sinar.
         Sebelumnya ditulis (y + 12) yang secara kebetulan sama dengan
         (y - sunY) = (y - (-12)) = (y + 12), tapi tidak eksplisit dan
         rawan salah jika posisi matahari berubah. */
      [[sunX, sunY - 6], [sunX, sunY + 6], [sunX - 6, sunY], [sunX + 6, sunY]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (x - sunX) * 0.3, y + (y - sunY) * 0.3);
        ctx.stroke();
      });
    }

    ctx.restore();
  };

  /* ── Helper: do'a box ── */
  const drawDoaBox = (ctx, W, y, gold, lite, dark, muted) => {
    ctx.fillStyle   = 'rgba(184,134,11,0.06)';
    ctx.strokeStyle = lite;
    ctx.lineWidth   = 1;
    roundRect(ctx, 40, y, W - 80, 160, 6);
    ctx.fill(); ctx.stroke();

    const cx = W / 2;

    ctx.fillStyle = dark;
    ctx.font      = '16px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('اللَّهُمَّ تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ', cx, y + 26);

    ctx.fillStyle = muted;
    ctx.font      = 'italic 10px Inter, sans-serif';
    ctx.fillText('Allāhumma taqabbal minnā innaka antas-samī\'ul-\'alīm', cx, y + 42);

    ctx.fillStyle = '#6b4c0e';
    ctx.font      = '10.5px Inter, sans-serif';
    ctx.fillText('"Ya Allah, terimalah amal dari kami. Sesungguhnya Engkau Maha Mendengar lagi Maha Mengetahui."', cx, y + 58);

    ctx.strokeStyle = 'rgba(184,134,11,0.25)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(W * 0.3, y + 72); ctx.lineTo(W * 0.7, y + 72); ctx.stroke();

    ctx.fillStyle = dark;
    ctx.font      = '16px "Times New Roman", serif';
    ctx.fillText('اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ', cx, y + 96);

    ctx.fillStyle = muted;
    ctx.font      = 'italic 10px Inter, sans-serif';
    ctx.fillText('Allāhumma a\'innī \'alā dzikrika wa syukrika wa husni \'ibādatik', cx, y + 112);

    ctx.fillStyle = '#6b4c0e';
    ctx.font      = '10.5px Inter, sans-serif';
    ctx.fillText('"Ya Allah, tolonglah aku untuk selalu mengingat-Mu, bersyukur,', cx, y + 128);
    ctx.fillText('dan beribadah kepada-Mu dengan sebaik-baiknya."', cx, y + 143);
  };

  /* ── Helper: footer ── */
  const drawFooter = (ctx, W, H, data, gold, lite, dark, muted) => {
    const y  = H - 90;
    const cx = W / 2;

    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(40, y - 8); ctx.lineTo(W - 40, y - 8); ctx.stroke();

    ctx.fillStyle = '#a07820';
    ctx.font      = '600 9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TANGGAL', 50, y + 8);

    ctx.fillStyle = dark;
    ctx.font      = 'bold 13px Georgia, serif';
    ctx.fillText(CFG.TGL_HIJRI, 50, y + 24);

    ctx.fillStyle = muted;
    ctx.font      = '10px Inter, sans-serif';
    ctx.fillText(CFG.TGL_MASEHI, 50, y + 38);

    drawSeal(ctx, cx, y + 16, gold, lite, muted);

    ctx.fillStyle = '#a07820';
    ctx.font      = '600 9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ID USER', W - 50, y + 8);

    ctx.fillStyle = dark;
    ctx.font      = 'bold 12px Inter, sans-serif';
    ctx.fillText(data.userId || '-', W - 50, y + 24);

    ctx.fillStyle = '#a07820';
    ctx.font      = '600 9px Inter, sans-serif';
    ctx.fillText('NO. SERTIFIKAT', W - 50, y + 38);

    ctx.fillStyle = dark;
    ctx.font      = 'bold 11px Inter, sans-serif';
    ctx.fillText(data.nomorSertifikat || '-', W - 50, y + 52);
  };

  /* ── Helper: stempel ── */
  const drawSeal = (ctx, cx, cy, gold, lite, muted) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = gold;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const r   = i % 2 === 0 ? 26 : 20;
      const ang = (i * Math.PI) / 6 - Math.PI / 2;
      i === 0 ? ctx.moveTo(r * Math.cos(ang), r * Math.sin(ang))
              : ctx.lineTo(r * Math.cos(ang), r * Math.sin(ang));
    }
    ctx.closePath(); ctx.stroke();

    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = gold;
    ctx.font      = '700 6.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIKYA.ID', 0, -4);

    ctx.fillStyle = muted;
    ctx.font      = '5px Inter, sans-serif';
    ctx.fillText('ISTIQOMAH', 0, 4);
    ctx.fillText('DZIKIR', 0, 11);

    ctx.restore();
  };

  /* ── Helper: roundRect ── */
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  /* ── Helper: wrap text ── */
  const wrapText = (ctx, text, x, y, maxW, lineH) => {
    const words = text.split(' ');
    let   line  = '';
    let   cy    = y;
    words.forEach((word, i) => {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxW && line !== '') {
        ctx.fillText(line.trim(), x, cy);
        line = word + ' ';
        cy  += lineH;
      } else {
        line = test;
      }
    });
    ctx.fillText(line.trim(), x, cy);
  };

  /* ── Helper: delay ── */
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  /* ============================================================
     FONT LOADER — menjamin font benar-benar terunduh sebelum
     canvas digambar.

     Masalah dengan pendekatan lama (Promise.all + fonts.load):
     1. fonts.load() mengembalikan array kosong [] tanpa error jika
        @font-face rules belum di-parse (race condition di mode debug).
     2. Promise tetap resolve meski hasil kosong — tidak ada yang
        mendeteksi bahwa font sebenarnya belum termuat.
     3. Georgia adalah system font, tidak ada di document.fonts —
        fonts.load() untuk Georgia selalu resolve [] dan tidak ada
        yang perlu ditunggu.

     Solusi: waitForFonts() melakukan dua lapis pengecekan:
     1. Coba fonts.load() terlebih dahulu — jika hasilnya tidak kosong,
        berarti font sudah ada dan berhasil dimuat.
     2. Jika hasilnya kosong (font belum ada di @font-face / belum
        di-parse), polling fonts.check() setiap 100ms sampai font
        benar-benar terdeteksi atau timeout tercapai.
     3. Timeout 5 detik — jika Google Fonts gagal diunduh (offline /
        lambat), canvas tetap digambar dengan fallback font daripada
        hang selamanya.
     ============================================================ */

  const waitForFonts = async () => {
     await document.fonts.ready;
    /* Daftar font web yang dipakai canvas. Georgia tidak disertakan
       karena merupakan system font — tidak ada di document.fonts
       dan tidak perlu ditunggu. */
    const webFonts = [
      { spec: '400 16px Inter',  check: '400 1em Inter'  },
      { spec: '600 16px Inter',  check: '600 1em Inter'  },
      { spec: '700 16px Inter',  check: '700 1em Inter'  },
      { spec: '800 16px Inter',  check: '800 1em Inter'  },
    ];

    const POLL_INTERVAL = 100;  /* ms antar polling */
    const TIMEOUT_FONT  = 5000; /* ms batas maksimal menunggu */

    /* Tunggu satu font: coba load(), jika gagal polling check() */
    const waitOne = ({ spec, check }) => new Promise((resolve) => {
      /* Coba melalui fonts.load() — akan berhasil jika @font-face
         sudah di-parse dan file font sudah atau sedang diunduh */
      document.fonts.load(spec).then((loaded) => {
        if (loaded.length > 0) {
          /* Font berhasil dimuat via fonts.load() */
          resolve();
          return;
        }
        /* Hasil kosong: @font-face belum di-parse saat load() dipanggil.
           Alihkan ke polling fonts.check() */
        const start   = Date.now();
        const interval = setInterval(() => {
          if (document.fonts.check(check)) {
            clearInterval(interval);
            resolve();
          } else if (Date.now() - start >= TIMEOUT_FONT) {
            /* Timeout — lanjutkan dengan fallback font */
            clearInterval(interval);
            console.warn(`cert: font timeout — "${spec}" tidak terunduh, menggunakan fallback.`);
            resolve();
          }
        }, POLL_INTERVAL);
      }).catch(() => {
        /* fonts.load() tidak tersedia atau error — resolve langsung */
        resolve();
      });
    });

    await Promise.all(webFonts.map(waitOne));
  };

  /* ============================================================
     TOMBOL MASUK DENGAN ID (di halaman)
     Tampil di samping back-to-top, berguna jika localStorage
     terhapus dan user ingin masuk kembali dengan ID lama.
     ============================================================ */

  const injectLoginBtn = () => {
    /*
      Tombol "Masuk dengan ID" hanya ditampilkan dalam mode debug.
      Tambahkan ?debug=1 di URL untuk mengaktifkan.
      Contoh: dzikir-pagi.html?debug=1
    */
    const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
    if (!isDebug) return;

    /*
      .dzikir-stats-row dibuat oleh dzikir-tools.js secara async —
      belum tentu ada saat injectLoginBtn() pertama dipanggil.
      Solusi: coba inject segera, jika elemen belum ada, ulangi setiap
      500ms sampai berhasil — tanpa harus menunggu waitForCounters().

      FIX v3: retry dibatasi maksimal 20x (10 detik). Sebelumnya
      setTimeout rekursif tidak terbatas sehingga timer bisa berjalan
      selamanya jika dzikir-tools.js gagal load.
    */
    let retryCount = 0;
    const MAX_RETRY = 20; /* 20 × 500ms = 10 detik */

    const tryInject = () => {
      const statsRow = document.querySelector('.dzikir-stats-row');
      if (!statsRow) {
        retryCount++;
        if (retryCount < MAX_RETRY) setTimeout(tryInject, 500);
        return;
      }

      /* Cegah inject ganda jika tryInject dipanggil ulang */
      if (statsRow.querySelector('.cert-login-btn')) return;

      const btn = document.createElement('button');
      btn.className   = 'cert-login-btn';
      btn.textContent = '🔑 [DEBUG] Masuk dengan ID';
      btn.setAttribute('title', 'Mode debug — masuk dengan ID tanpa menyelesaikan dzikir');
      btn.style.outline = '2px dashed #f97316';
      statsRow.appendChild(btn);

      btn.addEventListener('click', () => {
        openModal();
        showStepFormLama();
      });
    };

    tryInject();
  };

  /* ============================================================
     CEK WAKTU — sertifikat hanya bisa dibuat sesuai waktunya
     Menggunakan waktu lokal perangkat user masing-masing.
     Dzikir Pagi  : 04:00 — 11:59 (setelah Shubuh s/d siang)
     Dzikir Petang: 15:00 — 23:59 (setelah Ashar s/d sebelum tengah malam)
     ============================================================ */

  const isWaktuValid = () => {
    const isDebug = new URLSearchParams(window.location.search).get('debug') === '1';
    if (isDebug) return { valid: true };

    const jam = new Date().getHours();

    if (CFG.JENIS === 'pagi') {
      if (jam >= 4 && jam < 12) return { valid: true };
      return {
        valid : false,
        pesan : 'Sertifikat Dzikir Pagi hanya tersedia mulai setelah Shubuh (04.00) hingga pukul 12.00 siang.',
        saran : 'Jazakallahu khairan telah berdzikir. Sampai jumpa besok pagi! 🌤️',
      };
    } else {
      /* FIX v3: getHours() mengembalikan 0–23.
         jam <= 23 selalu true untuk semua jam, sehingga jam 00:00–14:59
         ikut dianggap valid. Perbaikan: batasi secara eksplisit 15–23. */
      if (jam >= 15 && jam <= 23) return { valid: true };
      return {
        valid : false,
        pesan : 'Sertifikat Dzikir Petang hanya tersedia mulai setelah Ashar (15.00) hingga pukul 23.59.',
        saran : 'Jazakallahu khairan telah berdzikir. Sampai jumpa nanti petang! 🌆',
      };
    }
  };

  const showWaktuTidakValid = (info) => {
    /*
      FIX v2: info.pesan dan info.saran dimasukkan via textContent
      untuk mencegah potensi XSS.
    */
    const inner = getInner();
    inner.innerHTML = `
      <div class="cert-modal-icon">⏰</div>
      <div class="cert-modal-title">Belum Waktunya</div>
      <div class="cert-modal-desc" id="cert-waktu-pesan"></div>
      <div class="cert-modal-desc" style="margin-top:8px;font-style:italic;" id="cert-waktu-saran"></div>
      <div class="cert-btn-row" style="margin-top:24px;">
        <button class="cert-btn cert-btn--primary" id="cert-close-waktu">Tutup</button>
      </div>
    `;
    document.getElementById('cert-waktu-pesan').textContent = info.pesan;
    document.getElementById('cert-waktu-saran').textContent = info.saran;
    document.getElementById('cert-close-waktu')?.addEventListener('click', closeModal);
  };

  /* ============================================================
     INIT
     ============================================================ */

  const init = async () => {
    buildModal();

    /*
      Mulai prefetch font SEGERA setelah DOM siap — paralel dengan
      waitForCounters() dan semua langkah lain sebelum canvas digambar.
      Dengan ini, font punya waktu maksimal untuk diunduh; saat
      showStepGenerate() dipanggil, fontsReady sudah berjalan lama.

      PENTING: fontsReady di-assign di sini (bukan di level modul) karena
      waitForFonts() menggunakan document.fonts yang butuh DOM siap.
      Memanggil waitForFonts() sebelum DOMContentLoaded menyebabkan
      polling interval bocor jika init() menimpa variabel tersebut.
    */
    fontsReady = waitForFonts();

    /*
      injectLoginBtn() dipanggil segera — fungsi ini sudah menangani
      race condition secara internal dengan pola retry (setTimeout).
      Tidak perlu menunggu waitForCounters() selesai.
    */
    injectLoginBtn();

    await waitForCounters();

    const waktu = isWaktuValid();
    if (!waktu.valid) {
      openModal();
      showWaktuTidakValid(waktu);
      return;
    }

    const savedId   = ls.get(CFG.LS_USER_ID);
    const savedNama = ls.get(CFG.LS_USER_NAMA);

    if (savedId && savedNama) {
      certData = { userId: savedId, nama: sanitizeNama(savedNama) };
      openModal(false); /* FIX v3: jangan reset certData yang baru saja diisi */
      await showStepGenerate();
    } else {
      openModal();
      showStepPilihan();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

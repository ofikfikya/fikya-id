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
    get TGL_HIJRI() { return formatTglHijri(new Date()); },
    get TGL_MASEHI() { return formatTglMasehi(new Date()); },
  };

  /* ============================================================
     FORMAT TANGGAL DINAMIS
     ============================================================ */

  /*
    OFFSET KALENDER HIJRIAH
    Nilai 0  = gunakan hasil Intl (default)
    Nilai +1 = geser 1 hari ke depan (jika Intl terlalu cepat)
    Nilai -1 = geser 1 hari ke belakang (jika Intl terlalu lambat)
    Sesuaikan apabila tanggal Hijriah tidak sesuai dengan
    penetapan hilal resmi di lokasi Anda (Abu Dhabi - UAE).
  */
  const HIJRI_OFFSET_DAYS = 0;

  /* Format tanggal Hijriah: "Jum'at, 4 Muharram 1448 H" */
  /* Nama hari Islam (index 0=Ahad sesuai getDay() 0=Minggu) */
  const HARI_ISLAM = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

  /* Nama bulan Hijriah */
  const BULAN_HIJRI = [
    'Muharram', 'Safar', "Rabi'ul Awwal", "Rabi'ul Akhir",
    'Jumadal Ula', 'Jumadal Akhirah', 'Rajab', "Sya'ban",
    'Ramadhan', 'Syawwal', "Dzulqa'dah", 'Dzulhijjah',
  ];

  const formatTglHijri = (date) => {
    try {
      /* Terapkan offset jika diperlukan */
      const adjusted = new Date(date);
      adjusted.setDate(adjusted.getDate() + HIJRI_OFFSET_DAYS);

      /* Nama hari Islam dari getDay() */
      const hari = HARI_ISLAM[date.getDay()];

      /* Ambil komponen Hijriah via Intl — parse bagian angka saja */
      const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
        day  : 'numeric',
        month: 'numeric',
        year : 'numeric',
      }).formatToParts(adjusted);

      const parts = {};
      fmt.forEach(p => { parts[p.type] = p.value; });

      const tgl   = parts.day   || '';
      const bln   = parseInt(parts.month || '1', 10) - 1;
      const thn   = (parts.year || '').replace(/[^0-9]/g, ''); /* hapus SM/AH/dll */
      const bulan = BULAN_HIJRI[bln] || '';

      return `${hari}, ${tgl} ${bulan} ${thn} H`;
    } catch (e) {
      return '';
    }
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

    window[cbName]  = (data) => { cleanup(); resolve(data); };
    script.src      = `${url}&callback=${cbName}`;

    /*
      PENTING: onerror pada JSONP ke Google Apps Script TIDAK
      dipakai sebagai rejection karena Apps Script melakukan
      302 redirect yang kadang memicu onerror di browser meski
      request sebenarnya berhasil. Biarkan timeout yang menangani
      kegagalan — persis seperti pola di comments.js.
    */
    script.onerror  = () => { console.warn('cert: script error, menunggu callback...'); };
    document.head.appendChild(script);
  });

  const apiCall = (params) => {
    /*
      Bangun query string manual agar action selalu di depan
      dan tidak ada encoding ganda. Pola sama dengan comments.js.
    */
    const { action, ...rest } = params;
    const base = `action=${action}`;
    const extra = Object.entries({ ...rest, key: CFG.SECRET_KEY })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return jsonp(`${CFG.APPS_SCRIPT_URL}?${base}&${extra}`);
  };

  /* ============================================================
     LOCAL STORAGE HELPER
     ============================================================ */

  const ls = {
    get  : (k)    => { try { return localStorage.getItem(k); }      catch(e) { return null; } },
    set  : (k, v) => { try { localStorage.setItem(k, v); }          catch(e) {} },
    clear: (k)    => { try { localStorage.removeItem(k); }          catch(e) {} },
  };

  /* ============================================================
     CEK SEMUA COUNTER SELESAI
     ============================================================ */

  /*
    Counter selesai ketika tombol tap punya class
    'dzikir-counter-btn--done'. Polling setiap 1 detik
    karena counter di-inject oleh dzikir-counter.js secara
    async dan jumlahnya bisa berubah-ubah per halaman.
  */
  const waitForCounters = () => new Promise((resolve) => {
    const check = () => {
      const allBtns  = document.querySelectorAll('.dzikir-counter-btn--tap');
      if (allBtns.length === 0) return; /* Belum ada counter, tunggu lagi */

      const allDone = [...allBtns].every(btn =>
        btn.classList.contains('dzikir-counter-btn--done')
      );

      if (allDone) resolve();
    };

    const interval = setInterval(() => {
      check();
      /* Cek apakah semua sudah selesai */
      const allBtns = document.querySelectorAll('.dzikir-counter-btn--tap');
      if (allBtns.length > 0) {
        const allDone = [...allBtns].every(btn =>
          btn.classList.contains('dzikir-counter-btn--done')
        );
        if (allDone) {
          clearInterval(interval);
          resolve();
        }
      }
    }, 800);

    /* Observer untuk deteksi klik real-time lebih responsif */
    document.addEventListener('click', () => {
      setTimeout(() => {
        const allBtns = document.querySelectorAll('.dzikir-counter-btn--tap');
        if (allBtns.length === 0) return;
        const allDone = [...allBtns].every(btn =>
          btn.classList.contains('dzikir-counter-btn--done')
        );
        if (allDone) {
          clearInterval(interval);
          resolve();
        }
      }, 400);
    }, { passive: true });
  });

  /* ============================================================
     MODAL
     ============================================================ */

  let overlay, modal, certData = {};

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

    /* Tutup dengan Escape */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
    });
  };

  const openModal = () => {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
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

  const submitUserBaru = async () => {
    const nama  = document.getElementById('cert-input-nama')?.value.trim()  || '';
    const email = document.getElementById('cert-input-email')?.value.trim() || '';
    const msgEl = document.getElementById('cert-msg-baru');
    const btn   = document.getElementById('cert-submit-baru');

    const showMsg = (tipe, teks) => {
      msgEl.className = `cert-message ${tipe}`;
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
        /* Simpan ke localStorage */
        ls.set(CFG.LS_USER_ID,   res.userId);
        ls.set(CFG.LS_USER_NAMA, res.nama);
        certData = { userId: res.userId, nama: res.nama };

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
      msgEl.className = `cert-message ${tipe}`;
      msgEl.textContent = teks;
    };

    if (!userId) return showMsg('error', 'ID tidak boleh kosong.');

    btn.disabled    = true;
    btn.textContent = 'Memverifikasi...';
    showMsg('info', 'Menghubungi server...');

    try {
      const res = await apiCall({ action: 'verifyUser', userId });

      if (res.status === 'ok') {
        ls.set(CFG.LS_USER_ID,   res.userId);
        ls.set(CFG.LS_USER_NAMA, res.nama);
        certData = { userId: res.userId, nama: res.nama };
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
        <div class="cert-loading-text">Membuat sertifikat Anda...</div>
      </div>
    `;

    try {
      /* Generate nomor sertifikat dari backend */
      const res = await apiCall({
        action : 'generateCert',
        userId : certData.userId,
        jenis  : CFG.JENIS,
      });

      if (res.status !== 'ok') throw new Error(res.message || 'Gagal generate sertifikat');

      certData.nomorSertifikat = res.nomorSertifikat;
      certData.tanggal         = res.tanggal;

      showStepSertifikat();
    } catch (e) {
      getInner().innerHTML = `
        <div class="cert-modal-icon">⚠️</div>
        <div class="cert-modal-title">Gagal Membuat Sertifikat</div>
        <div class="cert-modal-desc">${e.message}</div>
        <div class="cert-btn-row">
          <button class="cert-btn cert-btn--secondary" id="cert-retry">Coba Lagi</button>
          <button class="cert-btn cert-btn--primary" id="cert-close-err">Tutup</button>
        </div>
      `;
      document.getElementById('cert-retry')?.addEventListener('click', showStepGenerate);
      document.getElementById('cert-close-err')?.addEventListener('click', closeModal);
    }
  };

  /* ============================================================
     STEP 3 — TAMPIL SERTIFIKAT + CANVAS
     ============================================================ */

  const showStepSertifikat = () => {
    const canvas = document.createElement('canvas');
    /* Fix 6: Tingkatkan resolusi dengan devicePixelRatio */
    const DPR     = window.devicePixelRatio || 2;
    const CW      = 700;
    const CH      = 680;
    canvas.width  = CW * DPR;
    canvas.height = CH * DPR;
    canvas.style.width  = CW + 'px';
    canvas.style.height = CH + 'px';

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
            <span class="cert-info-value">${certData.userId}</span>
          </div>
          <div class="cert-info-item">
            <span class="cert-info-label">No. Sertifikat</span>
            <span class="cert-info-value">${certData.nomorSertifikat}</span>
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

    /* Render canvas */
    document.getElementById('cert-canvas-wrap').appendChild(canvas);
    drawCertificate(canvas, certData);

    /* Download PNG */
    document.getElementById('cert-download').addEventListener('click', () => {
      const link    = document.createElement('a');
      link.download = `sertifikat-dzikir-${CFG.JENIS}-${certData.nomorSertifikat}.png`;
      link.href     = canvas.toDataURL('image/png');
      link.click();
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

  const drawCertificate = (canvas, data) => {
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 2;
    ctx.scale(DPR, DPR);
    const W   = 700;  /* ukuran logis — bukan canvas.width yang sudah di-scale */
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
    ctx.fillStyle   = MUTED;
    ctx.font        = '600 10px Inter, sans-serif';
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
    ctx.font      = 'bold 34px Georgia, serif';
    ctx.fillText(data.nama || 'Nama User', W / 2, 182);

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
    /* Garis atas y=255, garis bawah y=328 → center=(255+328)/2=291
       Badge y=280: atas=262 (7px dari garis), label y=312 (16px dari garis bawah) */
    drawBadges(ctx, W, 284, CFG.JENIS, GOLD, GOLD_LITE, DARK);

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
  const drawBadges = (ctx, W, y, jenis, gold, lite, dark) => {
    const cx = W / 2;

    /* Badge api — kiri tengah */
    const ax = cx - 60;
    drawFireBadge(ctx, ax, y, gold, lite);
    ctx.fillStyle   = '#8a6820';
    ctx.font        = '600 9px Inter, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText('1 HARI BERTURUT', ax, y + 32);

    /* Garis pemisah vertikal */
    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, y - 14); ctx.lineTo(cx, y + 28); ctx.stroke();
    ctx.globalAlpha = 1;

    /* Badge piala — kanan tengah */
    const px = cx + 60;
    drawTrophyBadge(ctx, px, y, jenis, gold, lite);
    ctx.fillStyle = '#8a6820';
    ctx.font      = '600 9px Inter, sans-serif';
    ctx.fillText(jenis === 'pagi' ? 'DZIKIR PAGI' : 'DZIKIR PETANG', px, y + 32);
  };

  const drawFireBadge = (ctx, cx, cy, gold, lite) => {
    ctx.save();
    ctx.translate(cx, cy);

    /* Lingkaran latar */
    ctx.fillStyle   = '#fff7e6';
    ctx.strokeStyle = gold;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    /* Api */
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

    /* Angka 1 */
    ctx.fillStyle = '#92400e';
    ctx.font      = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1', 0, 10);

    ctx.restore();
  };

  const drawTrophyBadge = (ctx, cx, cy, jenis, gold, lite) => {
    ctx.save();
    ctx.translate(cx, cy);

    /* Lingkaran latar */
    ctx.fillStyle   = '#fffbeb';
    ctx.strokeStyle = gold;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    /* Piala */
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(-8, -10); ctx.lineTo(8, -10);
    ctx.lineTo(6, 2); ctx.bezierCurveTo(6, 6, 3, 8, 0, 8);
    ctx.bezierCurveTo(-3, 8, -6, 6, -6, 2);
    ctx.closePath(); ctx.fill();

    /* Gagang kiri kanan */
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-12, -10);
    ctx.lineTo(-12, -6); ctx.bezierCurveTo(-12, -2, -9, -1, -6, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(12, -10);
    ctx.lineTo(12, -6); ctx.bezierCurveTo(12, -2, 9, -1, 6, -1); ctx.stroke();

    /* Kaki piala */
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(-2, 8, 4, 4);
    ctx.fillRect(-5, 12, 10, 2);

    /* Bintang di piala */
    ctx.fillStyle = '#fef9c3';
    ctx.font      = '9px serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 0, -2);

    /* Ikon matahari pagi (hanya dzikir pagi) */
    if (jenis === 'pagi') {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(10, -12, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 1;
      [[10, -18], [10, -6], [4, -12], [16, -12]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - 10) * 0.3, y + (y + 12) * 0.3); ctx.stroke();
      });
    }

    ctx.restore();
  };

  /* ── Helper: do'a box ── */
  const drawDoaBox = (ctx, W, y, gold, lite, dark, muted) => {
    /* Box background — tinggi 160 agar teks tidak menyentuh tepi bawah */
    ctx.fillStyle   = 'rgba(184,134,11,0.06)';
    ctx.strokeStyle = lite;
    ctx.lineWidth   = 1;
    roundRect(ctx, 40, y, W - 80, 160, 6);
    ctx.fill(); ctx.stroke();

    const cx = W / 2;

    /* Do'a 1 */
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

    /* Separator */
    ctx.strokeStyle = 'rgba(184,134,11,0.25)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(W * 0.3, y + 72); ctx.lineTo(W * 0.7, y + 72); ctx.stroke();

    /* Do'a 2 */
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

    /* Garis footer */
    ctx.strokeStyle = lite;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(40, y - 8); ctx.lineTo(W - 40, y - 8); ctx.stroke();

    /* Kiri — Tanggal Hijriah (menonjol) + Masehi */
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

    /* Tengah — stempel */
    drawSeal(ctx, cx, y + 16, gold, lite, muted);

    /* Kanan — ID User + No. Sertifikat */
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
    /* Bintang 12 sudut */
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
      if (ctx.measureText(test).width > maxW && i > 0) {
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
     TOMBOL MASUK DENGAN ID (di halaman)
     Tampil di samping back-to-top, berguna jika localStorage
     terhapus dan user ingin masuk kembali dengan ID lama.
     ============================================================ */

  const injectLoginBtn = () => {
    const statsRow = document.querySelector('.dzikir-stats-row');
    if (!statsRow) return;

    const btn = document.createElement('button');
    btn.className   = 'cert-login-btn';
    btn.textContent = '🔑 Masuk dengan ID';
    btn.setAttribute('title', 'Masuk jika localStorage terhapus');
    statsRow.appendChild(btn);

    btn.addEventListener('click', () => {
      openModal();
      showStepFormLama();
    });
  };

  /* ============================================================
     INIT
     ============================================================ */

  const init = async () => {
    buildModal();
    injectLoginBtn();

    /* Tunggu semua counter selesai */
    await waitForCounters();

    /* Cek localStorage */
    const savedId   = ls.get(CFG.LS_USER_ID);
    const savedNama = ls.get(CFG.LS_USER_NAMA);

    if (savedId && savedNama) {
      /* User sudah dikenal — langsung generate sertifikat */
      certData = { userId: savedId, nama: savedNama };
      openModal();
      await showStepGenerate();
    } else {
      /* User belum dikenal — tampilkan pilihan */
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

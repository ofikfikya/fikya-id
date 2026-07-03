/* ============================================================
   main.js — UI Global Fikya.id
   Covers: progress bar, footer tahun.

   Dark mode, jam/tanggal, dan search diurus oleh navbar.js
   karena elemen-elemen tersebut hidup di dalam <site-navbar>.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ===== FOOTER TAHUN ===== */
  const elTahun = document.getElementById('tahun');
  if (elTahun) elTahun.textContent = new Date().getFullYear();

  /* ===== READING PROGRESS BAR ===== */
  /*
    Hanya aktif di halaman artikel/dzikir yang punya #progress-bar.
    Di index.html elemen ini tidak ada, listener tidak dipasang.
  */
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    /* FIX: atribut ARIA supaya progress bar juga bermakna untuk
       pembaca layar (screen reader), bukan cuma indikator visual. */
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.setAttribute('aria-label', 'Progres membaca artikel');

    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pctRaw    = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      /* FIX: clamp di KEDUA batas (dulu cuma batas atas). Di iOS,
         efek "bounce" saat scroll di atas batas halaman bisa membuat
         window.scrollY sesaat negatif, yang tanpa clamp bawah akan
         menghasilkan style.width bernilai negatif (mis. "-3%"). */
      const pct = Math.max(0, Math.min(pctRaw, 100));
      progressBar.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    };

    /* FIX: throttle lewat requestAnimationFrame — event scroll bisa
       terpicu jauh lebih sering daripada refresh rate layar (apalagi
       saat momentum-scroll di HP). Tanpa ini, updateProgress() (baca
       scrollHeight/innerHeight lalu tulis style.width) bisa jalan
       berkali-kali dalam satu frame yang sama dan berkontribusi ke
       jank. Dengan rAF, update dibatasi maksimal satu kali per frame. */
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateProgress();
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateProgress();
  }

  /* ===== READING TIME ===== */         // ← TAMBAHKAN DI SINI
  const elReadTime = document.getElementById('read-time');
  if (elReadTime) {
    /* FIX: hitung kata hanya dari terjemahan (.dzikir-arti /
       .dzikir-faedah), bukan dari seluruh .dzikir-container yang
       menggabungkan teks Arab + transliterasi Latin + terjemahan
       sekaligus. Menghitung ketiganya sebagai "kata yang dibaca di
       200 wpm" melebih-lebihkan waktu baca — kebanyakan pembaca
       cuma membaca terjemahan Indonesianya. */
    const artiEls = document.querySelectorAll('.dzikir-arti, .dzikir-faedah');
    if (artiEls.length > 0) {
      const text      = Array.from(artiEls).map(el => el.textContent).join(' ');
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      /* FIX: minimal 1 menit — Math.ceil(0/200) sebelumnya bisa
         menghasilkan "0 menit baca" untuk halaman dengan sedikit
         konten, yang terlihat janggal. */
      const minutes = Math.max(1, Math.ceil(wordCount / 200));
      elReadTime.textContent = minutes;
    }
  }

});

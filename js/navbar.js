/* ============================================================
   navbar.js — Web Component <site-navbar> Fikya.id
   Penggunaan:
     <site-navbar></site-navbar>

   Setelah render selesai, dispatch custom event 'navbar:ready'
   ke document agar main.js bisa query elemen navbar dengan aman.

   Logo menggunakan absolute path '/' sehingga benar di semua
   kedalaman folder (/blog/dzikir-pagi.html, dll.)
   ============================================================ */

class SiteNavbar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <nav class="navbar">
        <a href="/" class="logo">Fikya.id</a>
        <div class="nav-datetime" aria-label="Tanggal dan waktu">
          <span class="tgl-nav" id="nav-tgl" aria-live="polite">—</span>
          <span class="sep" aria-hidden="true">•</span>
          <span class="jam-nav" id="nav-jam" aria-live="polite">--:--:--</span>
          <span class="sep" aria-hidden="true">•</span>
          <span class="hijri-nav" id="nav-hijri" aria-live="polite">—</span>
        </div>
        <div class="nav-actions">
          <button class="nav-btn" id="btn-darkmode" title="Dark / Light mode" aria-label="Toggle dark mode">
            <span aria-hidden="true">🌙</span>
          </button>
          <button class="nav-btn" id="btn-search" title="Cari" aria-label="Buka pencarian">
            <span aria-hidden="true">🔍</span>
          </button>
        </div>
      </nav>

      <div class="search-overlay" id="search-overlay" role="dialog" aria-modal="true" aria-label="Pencarian">
        <div class="search-box">
          <span style="font-size:16px;color:var(--text-muted);" aria-hidden="true">🔍</span>
          <label for="search-input" class="sr-only">Cari artikel atau proyek</label>
          <input
            type="search"
            id="search-input"
            placeholder="Cari artikel, proyek..."
            autocomplete="off"
            aria-autocomplete="list"
            aria-controls="search-results"
          >
          <button class="search-close" id="search-close" aria-label="Tutup pencarian">✕</button>
        </div>
        <div class="search-results" id="search-results" role="listbox" aria-live="polite" aria-label="Hasil pencarian"></div>
      </div>
    `;

    // Beritahu main.js bahwa elemen navbar sudah ada di DOM dan siap di-query
    document.dispatchEvent(new CustomEvent('navbar:ready'));
  }
}

customElements.define('site-navbar', SiteNavbar);

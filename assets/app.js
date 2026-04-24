// ══════════════════════════════════════════════════════════════
//  BiblioEscolar — app.js
//  Logica completa de la SPA con Firebase
// ══════════════════════════════════════════════════════════════

import {
  auth, db, secondaryAuth,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, increment, writeBatch, runTransaction,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  AUDIT LOG — Registro de eventos
// ══════════════════════════════════════════════════════════════

const AuditLog = {
  coleccion: "audit_log",
  _page: 1,
  _perPage: 25,
  _sortBy: "timestamp",
  _sortDir: "desc",
  _filtroEntidad: "",
  _filtroAccion: "",
  _filtroTexto: "",

  async registrar(accion, entidad, entidadId, detalles) {
    try {
      await addDoc(collection(db, this.coleccion), {
        userId: Roles.usuarioDocId || null,
        userNombre: Roles.usuarioNombre || (auth.currentUser?.email || "Sistema"),
        userRol: Roles.actual || "desconocido",
        accion,        // crear, editar, eliminar, devolver, configurar, registro
        entidad,       // libro, usuario, prestamo, config
        entidadId: entidadId || null,
        detalles,      // descripción legible del evento
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error al registrar audit log:", e);
    }
  },

  async render() {
    Utils.loading(true);
    try {
      let q = collection(db, this.coleccion);

      // Construir query con filtros
      const constraints = [];

      // Orden principal
      const sortField = "timestamp";
      constraints.push(orderBy(sortField, this._sortDir));

      // Filtros opcionales
      if (this._filtroEntidad) constraints.unshift(where("entidad", "==", this._filtroEntidad));
      if (this._filtroAccion) constraints.unshift(where("accion", "==", this._filtroAccion));

      const querySnap = await getDocs(query(q, ...constraints));

      let datos = [];
      querySnap.forEach(d => datos.push({ id: d.id, ...d.data() }));

      // Filtro de texto (client-side)
      if (this._filtroTexto) {
        const txt = this._filtroTexto.toLowerCase();
        datos = datos.filter(e =>
          (e.userNombre || "").toLowerCase().includes(txt) ||
          (e.detalles || "").toLowerCase().includes(txt) ||
          (e.entidad || "").toLowerCase().includes(txt) ||
          (e.accion || "").toLowerCase().includes(txt)
        );
      }

      // Paginación
      const total = datos.length;
      const totalPages = Math.max(1, Math.ceil(total / this._perPage));
      if (this._page > totalPages) this._page = totalPages;
      const start = (this._page - 1) * this._perPage;
      const datosPaginados = datos.slice(start, start + this._perPage);

      // Renderizar tabla
      const tbody = document.getElementById("tabla-auditlog");
      if (!tbody) return;

      if (datosPaginados.length === 0) {
        tbody.innerHTML = UI.emptyState("list", "No hay eventos registrados", 5);
        document.getElementById("pagination-auditlog").innerHTML = "";
        return;
      }

      tbody.innerHTML = datosPaginados.map(e => {
        const fecha = this._formatTimestamp(e.timestamp);
        const badgeAccion = this._badgeAccion(e.accion);
        const badgeEntidad = this._badgeEntidad(e.entidad);
        return `<tr>
          <td>${fecha}</td>
          <td>${Utils._esc(e.userNombre)}</td>
          <td>${badgeAccion}</td>
          <td>${badgeEntidad}</td>
          <td>${Utils._esc(e.detalles)}</td>
        </tr>`;
      }).join("");

      Utils.renderPagination("pagination-auditlog", total, this._page, this._perPage, (p) => { this._page = p; this.render(); });
      Utils.initSortableHeaders("tabla-auditlog-wrapper", (col, dir) => { this._sortBy = col; this._sortDir = dir; this._page = 1; this.render(); });

    } catch (err) {
      console.error("Error al cargar audit log:", err);
    } finally {
      Utils.loading(false);
    }
  },

  _formatTimestamp(ts) {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  },

  _badgeAccion(accion) {
    const colores = {
      crear:    "badge-verde",
      editar:   "badge-amarillo",
      eliminar: "badge-rojo",
      devolver: "badge-azul",
      configurar: "badge-amarillo",
      registro: "badge-verde"
    };
    const cls = colores[accion] || "";
    return `<span class="badge ${cls}" style="text-transform:capitalize">${Utils._esc(accion)}</span>`;
  },

  _badgeEntidad(entidad) {
    const etiquetas = { libro: "Libro", usuario: "Usuario", prestamo: "Préstamo", config: "Configuración" };
    return `<span style="font-size:12px;color:var(--texto-muted)">${etiquetas[entidad] || Utils._esc(entidad)}</span>`;
  }
};

// ══════════════════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════════════════

const Utils = {
  formatDate(fecha) {
    if (!fecha) return "—";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  },

  today() {
    return new Date().toISOString().split("T")[0];
  },

  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  daysDiff(fechaFin) {
    const fin = new Date(fechaFin.toDate ? fechaFin.toDate() : new Date(fechaFin));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fin.setHours(0, 0, 0, 0);
    return Math.ceil((hoy - fin) / (1000 * 60 * 60 * 24));
  },

  _loadingCount: 0,
  loading(show) {
    const el = document.getElementById("loading-overlay");
    if (show) {
      this._loadingCount++;
      el.style.display = "flex";
    } else {
      this._loadingCount = Math.max(0, this._loadingCount - 1);
      if (this._loadingCount === 0) {
        el.style.display = "none";
      }
    }
  },

  toDate(fecha) {
    if (!fecha) return null;
    if (fecha.toDate) return new Date(fecha.toDate().getTime());
    if (fecha instanceof Date) return new Date(fecha.getTime());
    if (typeof fecha === "string" || typeof fecha === "number") return new Date(fecha);
    return new Date(fecha);
  },

  limpiarFechas(idDesde, idHasta) {
    const d = document.getElementById(idDesde);
    const h = document.getElementById(idHasta);
    if (d) d.value = "";
    if (h) h.value = "";
  },

  filtrarPorFecha(idDesde, idHasta, fechaItem) {
    const desdeVal = document.getElementById(idDesde)?.value;
    const hastaVal = document.getElementById(idHasta)?.value;
    if (!desdeVal && !hastaVal) return true; // no filter
    const fecha = this.toDate(fechaItem);
    if (!fecha) return !desdeVal && !hastaVal; // item has no date, include only if no filter
    if (desdeVal) {
      const desde = new Date(desdeVal + "T00:00:00");
      if (fecha < desde) return false;
    }
    if (hastaVal) {
      const hasta = new Date(hastaVal + "T23:59:59");
      if (fecha > hasta) return false;
    }
    return true;
  },

  async cargarNombres() {
    if (this._nombresCache) return this._nombresCache;
    if (this._nombresPromise) return this._nombresPromise;
    this._nombresPromise = this._fetchNombres();
    try {
      return await this._nombresPromise;
    } finally {
      this._nombresPromise = null;
    }
  },

  async _fetchNombres() {
    const [librosSnap, usuariosSnap] = await Promise.all([
      getDocs(collection(db, "libros")),
      getDocs(collection(db, "usuarios"))
    ]);
    const mapLibros = {};
    const mapUsuarios = {};
    librosSnap.forEach(d => { mapLibros[d.id] = d.data().titulo || "—"; });
    usuariosSnap.forEach(d => { mapUsuarios[d.id] = d.data().nombre || "—"; });
    this._nombresCache = { mapLibros, mapUsuarios };
    return this._nombresCache;
  },

  /** Obtiene todos los préstamos (cacheado). */
  async cargarPrestamos() {
    if (this._prestamosCache) return this._prestamosCache;
    if (this._prestamosPromise) return this._prestamosPromise;
    this._prestamosPromise = this._fetchPrestamos();
    try {
      return await this._prestamosPromise;
    } finally {
      this._prestamosPromise = null;
    }
  },

  async _fetchPrestamos() {
    const snap = await getDocs(collection(db, "prestamos"));
    const prestamos = [];
    snap.forEach(d => prestamos.push({ id: d.id, ...d.data() }));
    this._prestamosCache = prestamos;
    return prestamos;
  },

  /** Invalida el cache de datos Firestore (llamar después de mutations). */
  invalidarCache() {
    this._nombresCache = null;
    this._prestamosCache = null;
  },

  // ── Carga dinámica de CDN ──────────────────────────────

  _loadedScripts: {},

  /** Carga un script externo dinámicamente (solo una vez). */
  loadScript(src) {
    if (this._loadedScripts[src]) return this._loadedScripts[src];
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Error cargando " + src));
      document.head.appendChild(s);
    });
    this._loadedScripts[src] = p;
    return p;
  },

  /** Carga SheetJS (XLSX) bajo demanda. */
  loadXLSX() {
    return this.loadScript("https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js");
  },

  /** Carga jsPDF + autoTable bajo demanda. */
  async loadJsPDF() {
    await this.loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    await this.loadScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js");
  },

  /** Carga Chart.js bajo demanda. */
  loadChartJS() {
    return this.loadScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js");
  },

  nombreLibro(data, map) {
    if (data.libroTitulo) return data.libroTitulo;
    if (data.libroId && map && map[data.libroId]) return map[data.libroId];
    return "—";
  },

  nombreUsuario(data, map) {
    if (data.usuarioNombre) return data.usuarioNombre;
    if (data.usuarioId && map && map[data.usuarioId]) return map[data.usuarioId];
    return "—";
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  _escAttr(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  _debounceTimers: {},
  debounce(key, fn, delay = 300) {
    if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key]);
    this._debounceTimers[key] = setTimeout(fn, delay);
  },

  // ══════════════════════════════════════════════════════════════
  //  UTILIDADES PARA ORDENAMIENTO Y PAGINACION (Feature 3 & 5)
  // ══════════════════════════════════════════════════════════════

  sortData(data, column, direction, getValue) {
    return [...data].sort((a, b) => {
      let valA = getValue(a, column);
      let valB = getValue(b, column);
      if (valA == null) valA = '';
      if (valB == null) valB = '';
      if (typeof valA === 'string') { valA = valA.toLowerCase(); }
      if (typeof valB === 'string') { valB = valB.toLowerCase(); }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  },

  initSortableHeaders(tableId, onSort) {
    const table = document.getElementById(tableId);
    if (!table) return;

    // Evitar registrar listeners duplicados en cada render
    if (table._sortableInitialized) return;
    table._sortableInitialized = true;

    table.querySelectorAll('th.sortable').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const column = th.dataset.sort;
        const isAsc = th.classList.contains('asc');
        const newDir = isAsc ? 'desc' : 'asc';
        table.querySelectorAll('th').forEach(t => {
          t.classList.remove('asc', 'desc');
          const arrow = t.querySelector('.sort-arrow');
          if (arrow) arrow.textContent = '';
        });
        th.classList.add(newDir);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = newDir === 'asc' ? ' \u2191' : ' \u2193';
        onSort(column, newDir);
      });
    });
  },

  renderPagination(containerId, totalItems, currentPage, perPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(totalItems / perPage);
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const start = (currentPage - 1) * perPage + 1;
    const end = Math.min(currentPage * perPage, totalItems);

    let html = '<div class="pagination">';
    html += `<span class="pagination-info">${start}-${end} de ${totalItems}</span>`;
    html += '<div class="pagination-buttons">';
    html += `<button class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Anterior</button>`;

    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Siguiente</button>`;
    html += '</div></div>';
    container.innerHTML = html;

    container.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page)));
    });
  }
};


// ══════════════════════════════════════════════════════════════
//  UI — Navegacion, modales, alertas
// ══════════════════════════════════════════════════════════════

const UI = {
  navigate(el, seccion) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    if (el) el.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    const target = document.getElementById("sec-" + seccion);
    if (target) target.classList.add("active");

    // Cerrar sidebar drawer en mobile al navegar
    this.cerrarSidebar();

    switch (seccion) {
      case "inicio":      Dashboard.render(); break;
      case "catalogo":    Catalogo.render(); break;
      case "prestamos":   Prestamos.render(); break;
      case "usuarios":    Usuarios.render(); break;
      case "vencidos":    Vencidos.render(); break;
      case "reportes":    Reportes.render(); break;
      case "config":      Config.cargar(); break;
      case "mihistorial": MiHistorial.render(); break;
      case "auditlog":    AuditLog.render(); break;
    }

    // Feature 1: Close notification dropdown on navigation
    Notificaciones.cerrar();
  },

  /**
   * Toggle del sidebar drawer (mobile).
   * Abre o cierra el menú lateral con overlay.
   */
  toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains("open");
    if (isOpen) {
      sidebar.classList.remove("open");
      overlay?.classList.remove("visible");
    } else {
      sidebar.classList.add("open");
      overlay?.classList.add("visible");
    }
  },

  /**
   * Cierra el sidebar drawer (mobile).
   */
  cerrarSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("visible");
  },

  abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("open");
      if (id === "modal-prestamo") {
        Prestamos.cargarSelects();
      }
    }
  },

  cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("open");
  },

  mostrarAlerta(mensaje, tipo = "success", duracion = 3000) {
    UI.toast(mensaje, tipo, duracion);
  },

  /**
   * Muestra una notificacion toast.
   * @param {string} mensaje  - Texto del toast
   * @param {"success"|"danger"|"warning"|"info"} tipo - Tipo de toast
   * @param {number} duracion - Duracion en ms (default 3000)
   */
  toast(mensaje, tipo = "success", duracion = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const icons = {
      success: "\u2713",  // ✓
      danger:  "\u2717",  // ✗
      warning: "\u26A0",  // ⚠
      info:    "\u2139"   // ℹ
    };

    const el = document.createElement("div");
    el.className = "toast toast-" + tipo;
    el.style.position = "relative";
    el.style.setProperty("--toast-dur", duracion + "ms");
    el.innerHTML = `
      <span class="toast-icon">${icons[tipo] || icons.info}</span>
      <span class="toast-msg">${mensaje}</span>
      <button class="toast-close" aria-label="Cerrar">\u00D7</button>
      <div class="toast-progress"></div>
    `;

    const closeBtn = el.querySelector(".toast-close");
    let timer = null;

    function dismiss() {
      if (timer) clearTimeout(timer);
      el.classList.add("toast-out");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }

    closeBtn.addEventListener("click", dismiss);
    timer = setTimeout(dismiss, duracion);

    container.appendChild(el);
  },

  /**
   * Genera un estado vacío ilustrado para tablas.
   * @param {"book"|"user"|"loan"|"overdue"|"history"|"chart"|"list"|"bell"|"search"|"box"|"warning"} icon
   * @param {string} msg - Mensaje principal
   * @param {number} [colspan=6] - colspan del <td>
   * @returns {string} HTML de la fila
   */
  emptyState(icon, msg, colspan = 6) {
    const svgs = {
      book: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8v48h48V8"/><path d="M32 8v48"/><path d="M8 8h48"/><path d="M15 18h10M15 26h7M15 34h9"/><path d="M39 18h10M39 26h7M39 34h9"/></svg>`,
      user: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="22" r="10"/><path d="M12 56c0-11 9-20 20-20s20 9 20 20"/></svg>`,
      loan: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="6" width="40" height="52" rx="3"/><path d="M22 20h20M22 28h20M22 36h14"/><circle cx="44" cy="44" r="8" fill="var(--fondo-card)" stroke="var(--primary)" stroke-width="1.5"/><path d="M44 40v8M40 44h8"/></svg>`,
      overdue: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="24"/><path d="M32 14v18l12 8"/><path d="M20 8l4 4M44 8l-4 4" stroke-width="2"/></svg>`,
      history: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="24"/><path d="M32 14v18l12 8"/><path d="M14 32h8M42 32h8"/></svg>`,
      chart: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="40" width="10" height="16" rx="1"/><rect x="22" y="28" width="10" height="28" rx="1"/><rect x="36" y="18" width="10" height="38" rx="1"/><rect x="50" y="8" width="10" height="48" rx="1"/></svg>`,
      list: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="8" width="44" height="48" rx="3"/><path d="M22 22h20M22 32h20M22 42h20"/><circle cx="16" cy="22" r="2" fill="currentColor"/><circle cx="16" cy="32" r="2" fill="currentColor"/><circle cx="16" cy="42" r="2" fill="currentColor"/></svg>`,
      bell: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6a18 18 0 0 1 18 18v14l4 6H10l4-6V24A18 18 0 0 1 32 6z"/><path d="M24 52a8 8 0 0 0 16 0"/><line x1="50" y1="18" x2="58" y2="10" stroke-width="2"/><path d="M56 10h4v4"/></svg>`,
      search: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="28" cy="28" r="16"/><path d="M40 40l14 14" stroke-width="2.5"/><path d="M21 24h14M21 30h10" stroke-dasharray="3 3"/></svg>`,
      box: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="14" width="44" height="40" rx="3"/><path d="M10 22h44"/><path d="M32 14v-4"/><path d="M24 32h16M28 38h8"/></svg>`,
      warning: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="24"/><path d="M32 20v14"/><circle cx="32" cy="42" r="2" fill="currentColor"/></svg>`
    };
    return `<tr><td colspan="${colspan}" class="empty-state-td"><div class="empty-state"><div class="empty-state-icon">${svgs[icon] || svgs.box}</div><div class="empty-state-msg">${msg}</div></div></td></tr>`;
  },

  /** Retorna solo el SVG de un icono de empty state (para contextos fuera de tablas). */
  emptyIcon(icon) {
    const tmp = document.createElement("div");
    tmp.innerHTML = this.emptyState(icon, "");
    const svg = tmp.querySelector("svg");
    return svg ? svg.outerHTML : "";
  },

  /**
   * Alterna entre modo claro y oscuro.
   * Persiste la preferencia en localStorage.
   */
  toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    html.setAttribute("data-theme", newTheme);
    localStorage.setItem("biblioescolar-theme", newTheme);
    // Re-render charts if on Reportes page
    if (document.getElementById("sec-reportes")?.classList.contains("active")) {
      Reportes.render();
    }
  },

  /**
   * Aplica el tema guardado en localStorage.
   * Se llama al inicio para mantener la preferencia del usuario.
   */
  aplicarTemaGuardado() {
    const guardado = localStorage.getItem("biblioescolar-theme");
    if (guardado) {
      document.documentElement.setAttribute("data-theme", guardado);
    }
  },

  /**
   * Responsive: cerrar sidebar drawer si se agranda la ventana a desktop.
   */
  _responsiveInitialized: false,
  initResponsive() {
    if (this._responsiveInitialized) return;
    this._responsiveInitialized = true;
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        this.cerrarSidebar();
      }
    });
  }
};


// ══════════════════════════════════════════════════════════════
//  ROLES — Sistema de permisos
// ══════════════════════════════════════════════════════════════
//  Roles disponibles:
//    "administrativo"  — acceso total (admin). Puede gestionar
//                        usuarios, libros, prestamos, config, etc.
//    "docente"         — ve inicio, catalogo, prestamos, vencidos,
//                        reportes. Puede registrar/devolver prestamos.
//                        No puede gestionar usuarios ni config.
//    "alumno"          — ve inicio, catalogo, reportes.
//                        Solo lectura en todo momento.
//
//  El rol se determina por el campo "tipo" del documento del
//  usuario en la coleccion "usuarios" de Firestore.
//  Se busca por authUid (el UID de Firebase Auth).
// ══════════════════════════════════════════════════════════════

const Roles = {
  // Rol actual del usuario logueado (en minusculas)
  actual: "administrativo",
  // Firestore document ID del usuario actual
  usuarioDocId: null,
  // Nombre del usuario actual
  usuarioNombre: null,

  // Permisos de visibilidad en el sidebar
  permisosSidebar: {
    administrativo: { inicio: true, catalogo: true, prestamos: true, usuarios: true, vencidos: true, reportes: true, config: true, mihistorial: true, auditlog: true },
    docente:        { inicio: true, catalogo: true, prestamos: true, usuarios: false, vencidos: true, reportes: true, config: false, mihistorial: true, auditlog: false },
    alumno:         { inicio: true, catalogo: true, prestamos: false, usuarios: false, vencidos: false, reportes: true, config: false, mihistorial: true, auditlog: false }
  },

  // Permisos de escritura (acciones)
  permisosAccion: {
    administrativo: { agregarLibro: true, editarLibro: true, eliminarLibro: true, agregarUsuario: true, editarUsuario: true, eliminarUsuario: true, registrarPrestamo: true, devolverPrestamo: true, guardarConfig: true },
    docente:        { agregarLibro: false, editarLibro: false, eliminarLibro: false, agregarUsuario: false, editarUsuario: false, eliminarUsuario: false, registrarPrestamo: true, devolverPrestamo: true, guardarConfig: false },
    alumno:         { agregarLibro: false, editarLibro: false, eliminarLibro: false, agregarUsuario: false, editarUsuario: false, eliminarUsuario: false, registrarPrestamo: false, devolverPrestamo: false, guardarConfig: false }
  },

  // Etiquetas legibles para mostrar en la UI
  etiquetas: {
    administrativo: "Administrativo",
    docente:        "Docente",
    alumno:         "Alumno"
  },

  /**
   * Carga el rol del usuario buscando su documento en "usuarios"
   * por el campo authUid (que coincide con el UID de Firebase Auth).
   * Si no encuentra documento (ej: primer usuario legacy),
   * asigna "administrativo" por defecto.
   */
  async cargar(authUid) {
    try {
      const q = query(collection(db, "usuarios"), where("authUid", "==", authUid));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        // El campo "tipo" define el rol
        this.actual = (data.tipo || "alumno").toLowerCase();
        this.usuarioDocId = docSnap.id;
        this.usuarioNombre = data.nombre || "";
      } else {
        // Sin documento en "usuarios" → administrativo por defecto
        // (compatibilidad con usuarios creados antes de este sistema)
        this.actual = "administrativo";
        this.usuarioDocId = null;
        this.usuarioNombre = null;
      }
    } catch (error) {
      console.error("Error al cargar rol:", error);
      this.actual = "administrativo";
    }
  },

  puede(accion) {
    return this.permisosAccion[this.actual]?.[accion] ?? false;
  },

  puedeVer(seccion) {
    return this.permisosSidebar[this.actual]?.[seccion] ?? false;
  },

  aplicarSidebar() {
    // 1) Ocultar/mostrar cada nav-item segun permisos
    document.querySelectorAll(".nav-item[data-sec]").forEach(item => {
      const sec = item.dataset.sec;
      item.style.display = this.puedeVer(sec) ? "" : "none";
    });

    // 2) Ocultar secciones vacias y su divider siguiente
    document.querySelectorAll(".nav-section").forEach(section => {
      const visibleItems = Array.from(section.querySelectorAll(".nav-item")).filter(i => i.style.display !== "none");
      const divider = section.nextElementSibling;
      if (visibleItems.length === 0) {
        section.style.display = "none";
        if (divider && divider.classList.contains("nav-divider")) divider.style.display = "none";
      } else {
        section.style.display = "";
        if (divider && divider.classList.contains("nav-divider")) divider.style.display = "";
      }
    });

    // 3) Ocultar sidebar-bottom si no hay items visibles en Administración
    const sidebarBottom = document.querySelector(".sidebar-bottom");
    if (sidebarBottom) {
      const hasVisible = Array.from(sidebarBottom.querySelectorAll(".nav-item")).some(i => i.style.display !== "none");
      sidebarBottom.style.display = hasVisible ? "" : "none";
    }
  },

  aplicarBotones(seccion) {
    switch (seccion) {
      case "catalogo": {
        const puedeEliminar = this.puede("eliminarLibro");
        const btnAgregarLibro = document.querySelector("#sec-catalogo .search-bar .btn-primary");
        if (btnAgregarLibro) btnAgregarLibro.style.display = this.puede("agregarLibro") ? "" : "none";
        // Ocultar columna de checkboxes si no puede eliminar
        const thBulk = document.querySelector("#tabla-catalogo-wrapper .th-bulk");
        if (thBulk) thBulk.style.display = puedeEliminar ? "" : "none";
        document.querySelectorAll("#tabla-catalogo td:first-child").forEach(td => {
          if (td.querySelector("input[type=checkbox]")) td.style.display = puedeEliminar ? "" : "none";
        });
        break;
      }

      case "usuarios": {
        const btnAgregarUsu = document.querySelector("#sec-usuarios .search-bar .btn-primary");
        if (btnAgregarUsu) btnAgregarUsu.style.display = this.puede("agregarUsuario") ? "" : "none";
        document.querySelectorAll("#tabla-usuarios .btn-sm, #tabla-usuarios .btn-danger").forEach(btn => {
          if (btn.title === "Editar" || btn.title === "Eliminar") {
            btn.style.display = this.puede("editarUsuario") ? "" : "none";
          }
        });
        break;
      }

      case "prestamos": {
        const btnAgregarPres = document.querySelector("#sec-prestamos .search-bar .btn-primary");
        if (btnAgregarPres) btnAgregarPres.style.display = this.puede("registrarPrestamo") ? "" : "none";
        document.querySelectorAll("#tabla-prestamos .btn-sm.btn-primary").forEach(btn => {
          btn.style.display = this.puede("devolverPrestamo") ? "" : "none";
        });
        break;
      }
    }
  }
};


// ══════════════════════════════════════════════════════════════
//  AUTH — Autenticacion con Firebase
// ══════════════════════════════════════════════════════════════

const Auth = {

  /**
   * Cierra la sesión del usuario actual y redirige a login.html
   */
  async logout() {
    Utils.loading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesion:", error);
    } finally {
      Utils.loading(false);
      window.location.href = "login.html";
    }
  },

  /**
   * Configura el listener de estado de autenticación.
   * Si hay usuario → carga la app. Si no → redirige a login.html.
   */
  init() {
    onAuthStateChanged(auth, async (user) => {
      const splash = document.getElementById("auth-splash");
      const appScreen = document.getElementById("app");

      if (user) {
        // Cargar rol del usuario desde su documento en "usuarios"
        await Roles.cargar(user.uid);
        // Aplicar permisos al sidebar
        Roles.aplicarSidebar();

        // Ocultar splash y mostrar app
        if (splash) splash.style.display = "none";
        appScreen.classList.remove("app-hidden");
        appScreen.classList.add("app-visible");

        // Datos del usuario en el header
        const nombreMostrar = Roles.usuarioNombre || user.email || "";
        const initials = nombreMostrar.substring(0, 2).toUpperCase();
        const rolEtiqueta = Roles.etiquetas[Roles.actual] || Roles.actual;
        document.getElementById("avatar-initials").textContent = initials;
        document.getElementById("header-username").textContent = `${nombreMostrar} (${rolEtiqueta})`;

        // Mostrar fecha de hoy
        document.getElementById("fecha-hoy").textContent =
          new Date().toLocaleDateString("es-AR", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
          });

        // Cargar datos iniciales
        Dashboard.render();
        Vencidos.actualizarBadge();
        // Feature 1: Load notifications on login
        Notificaciones.cargar();
        // Responsive: init sidebar drawer listener
        UI.initResponsive();
      } else {
        // Sin autenticación → redirigir a login
        window.location.href = "login.html";
      }
    });
  }
};


// ══════════════════════════════════════════════════════════════
//  CATALOGO — CRUD de Libros (with filter, sort, pagination)
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  OPEN LIBRARY API — Covers & ISBN search
// ══════════════════════════════════════════════════════════════

const OpenLibraryAPI = {
  _baseUrl: "https://openlibrary.org",

  /**
   * Builds the cover URL for a given ISBN.
   * Returns empty string if no ISBN.
   */
  coverURL(isbn, size = "M") {
    if (!isbn) return "";
    return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`;
  },

  /**
   * Checks if a cover exists for the given ISBN.
   * Returns the cover URL or empty string.
   */
  async buscarPortada(isbn) {
    if (!isbn) return "";
    try {
      const url = this.coverURL(isbn, "S");
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        return this.coverURL(isbn, "M");
      }
      return "";
    } catch {
      return "";
    }
  },

  /**
   * Searches Open Library for ISBN by title and author.
   * Returns the first ISBN found, or empty string.
   */
  async buscarISBN(titulo, autor) {
    if (!titulo) return "";
    try {
      const params = new URLSearchParams({
        title: titulo,
        limit: "5"
      });
      if (autor) params.set("author", autor);

      const response = await fetch(`${this._baseUrl}/search.json?${params}`);
      if (!response.ok) return "";

      const data = await response.json();
      if (!data.docs || data.docs.length === 0) return "";

      // Try to find a result with ISBN
      for (const doc of data.docs) {
        const isbn = doc.isbn?.[0] || doc.isbn_13?.[0] || doc.isbn_10?.[0] || "";
        if (isbn) return isbn;
      }

      return "";
    } catch {
      return "";
    }
  },

  /**
   * Sleep utility for rate limiting (Open Library asks 1 req/sec).
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Searches ISBN and cover for a batch of books.
   * Returns an object mapping row index -> { isbn, coverURL }.
   * Respects Open Library rate limit (1 req/sec).
   */
  async buscarLote(libros) {
    const resultados = {};
    for (let i = 0; i < libros.length; i++) {
      const libro = libros[i];
      if (!libro.isbn) {
        // Search ISBN by title/author
        const isbn = await this.buscarISBN(libro.titulo, libro.autor);
        if (isbn) {
          resultados[i] = { isbn };
          // Now search for cover
          await this._sleep(1100); // rate limit
          const coverURL = await this.buscarPortada(isbn);
          if (coverURL) {
            resultados[i].coverURL = coverURL;
          }
        }
      } else {
        // ISBN already provided, just search for cover
        const coverURL = await this.buscarPortada(libro.isbn);
        if (coverURL) {
          resultados[i] = { coverURL };
        }
      }
      // Rate limit between requests
      if (i < libros.length - 1) {
        await this._sleep(1100);
      }
    }
    return resultados;
  }
};


// ══════════════════════════════════════════════════════════════
//  CATALOGO — CRUD de Libros (with filter, sort, pagination)
// ══════════════════════════════════════════════════════════════

const Catalogo = {
  coleccion: "libros",
  _data: [],
  _sortColumn: null,
  _sortDirection: 'asc',
  _page: 1,
  _perPage: 20,
  _filtroGenero: "",
  _selectedIds: new Set(),

  async render() {
    const tbody = document.getElementById("tabla-catalogo");
    const filtro = (document.getElementById("buscar-libro")?.value || "").toLowerCase();
    const filtroGenero = document.getElementById("filtro-genero")?.value || "";

    try {
      let q = query(collection(db, this.coleccion), orderBy("titulo", "asc"));
      const snapshot = await getDocs(q);

      // Build data array
      this._data = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const disponibles = (data.disponibles ?? data.ejemplares ?? 0);

        if (filtro) {
          const texto = `${data.titulo} ${data.autor} ${data.isbn}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }
        if (filtroGenero && (data.genero || "") !== filtroGenero) return;

        this._data.push({ id, ...data, disponibles });
      });

      // Sort
      let sorted = [...this._data];
      if (this._sortColumn) {
        sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
          if (col === 'titulo') return item.titulo || '';
          if (col === 'autor') return item.autor || '';
          if (col === 'genero') return item.genero || '';
          if (col === 'ejemplares') return item.ejemplares || 0;
          if (col === 'disponibles') return item.disponibles || 0;
          return '';
        });
      }

      // Pagination
      const totalPages = Math.ceil(sorted.length / this._perPage);
      if (this._page > totalPages) this._page = 1;
      const start = (this._page - 1) * this._perPage;
      const pageData = sorted.slice(start, start + this._perPage);

      // Reset select-all checkbox
      const selectAllCb = document.getElementById("catalogo-select-all");
      if (selectAllCb) selectAllCb.checked = false;

      let html = "";
      pageData.forEach((item) => {
        let badgeHTML;
        if (item.disponibles <= 0) {
          badgeHTML = '<span class="badge badge-rojo">Sin stock</span>';
        } else if (item.disponibles < (item.ejemplares || 1)) {
          badgeHTML = `<span class="badge badge-amarillo">${item.disponibles}</span>`;
        } else {
          badgeHTML = `<span class="badge badge-verde">${item.disponibles}</span>`;
        }

        const checked = this._selectedIds.has(item.id) ? "checked" : "";
        const puedeEliminar = Roles.puede("eliminarLibro");
        const tdCheck = puedeEliminar ? `<td style="text-align:center" onclick="event.stopPropagation()"><label class="checkbox-wrap"><input type="checkbox" data-id="${item.id}" ${checked} onchange="Catalogo.toggleSeleccion('${item.id}', this.checked)"><span class="checkmark"></span></label></td>` : "";
        html += `
          <tr onclick="Catalogo.verDetalle('${item.id}')">
            ${tdCheck}
            <td><strong>${Utils._esc(item.titulo)}</strong></td>
            <td>${Utils._esc(item.autor)}</td>
            <td>${Utils._esc(item.genero || "—")}</td>
            <td>${item.ejemplares || 0}</td>
            <td style="text-align:center">${badgeHTML}</td>
          </tr>`;
      });

      if (!html) {
        html = UI.emptyState(
          filtro || filtroGenero ? "search" : "book",
          filtro || filtroGenero ? "No se encontraron resultados." : "Aún no hay libros en el catálogo.",
          Roles.puede("eliminarLibro") ? 6 : 5
        );
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("catalogo");
      this._updateBulkBar();

      // Pagination controls
      Utils.renderPagination("pagination-catalogo", sorted.length, this._page, this._perPage, (page) => {
        this._page = page;
        this.render();
      });

      // Init sortable headers
      Utils.initSortableHeaders("tabla-catalogo-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._page = 1;
        this.render();
      });
    } catch (error) {
      console.error("Error al cargar catalogo:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos. Verifica la conexion con Firebase.
      </td></tr>`;
    }
  },

  async agregar() {
    const titulo = document.getElementById("nuevo-libro-titulo").value.trim();
    const autor = document.getElementById("nuevo-libro-autor").value.trim();
    const isbn = document.getElementById("nuevo-libro-isbn").value.trim();
    const genero = document.getElementById("nuevo-libro-genero").value;
    const ejemplares = parseInt(document.getElementById("nuevo-libro-ejemplares").value) || 1;

    if (!titulo) {
      UI.toast("El titulo es obligatorio.", "danger");
      return;
    }
    if (!autor) {
      UI.toast("El autor es obligatorio.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      // If ISBN provided, try to get cover from Open Library
      let coverURL = "";
      if (isbn) {
        coverURL = await OpenLibraryAPI.buscarPortada(isbn);
      }

      await addDoc(collection(db, this.coleccion), {
        titulo, autor,
        isbn: isbn || "",
        genero, ejemplares,
        disponibles: ejemplares,
        coverURL,
        createdAt: serverTimestamp()
      });

      Utils.invalidarCache();
      AuditLog.registrar("crear", "libro", null, `Libro "${titulo}" creado (${ejemplares} ejemplares, género: ${genero})`);

      document.getElementById("nuevo-libro-titulo").value = "";
      document.getElementById("nuevo-libro-autor").value = "";
      document.getElementById("nuevo-libro-isbn").value = "";
      document.getElementById("nuevo-libro-genero").selectedIndex = 0;
      document.getElementById("nuevo-libro-ejemplares").value = "1";
      UI.cerrarModal("modal-agregar-libro");
      UI.toast(`Libro "${titulo}" agregado correctamente.`);
      this.render();
    } catch (error) {
      console.error("Error al agregar libro:", error);
      UI.toast("Error al guardar el libro. Intenta de nuevo.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  // ── Detail Modal ──

  _currentDetailId: null,

  async verDetalle(id) {
    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      this._currentDetailId = id;

      // Fill view mode
      document.getElementById("libro-det-titulo").textContent = data.titulo || "—";
      document.getElementById("libro-det-autor").textContent = data.autor || "—";
      document.getElementById("libro-det-isbn").textContent = data.isbn || "—";
      document.getElementById("libro-det-genero").textContent = data.genero || "—";
      document.getElementById("libro-det-ejemplares").textContent = data.ejemplares || 0;

      const disponibles = data.disponibles ?? data.ejemplares ?? 0;
      const dispEl = document.getElementById("libro-det-disponibles");
      dispEl.textContent = disponibles;
      // Reuse badge styles for availability
      if (disponibles <= 0) {
        dispEl.innerHTML = `<span class="badge badge-rojo">Sin stock</span>`;
      } else if (disponibles < (data.ejemplares || 1)) {
        dispEl.innerHTML = `<span class="badge badge-amarillo">${disponibles}</span>`;
      } else {
        dispEl.innerHTML = `<span class="badge badge-verde">${disponibles}</span>`;
      }

      // Cover
      this._renderCover(data.coverURL || "", "libro-cover-container");

      // Show/hide action buttons based on permissions
      const actionsDiv = document.getElementById("libro-det-actions");
      actionsDiv.style.display = Roles.puede("editarLibro") ? "flex" : "none";

      // Show view mode, hide edit mode
      document.getElementById("libro-view-mode").style.display = "";
      document.getElementById("libro-edit-mode").style.display = "none";

      UI.abrirModal("modal-libro");
    } catch (error) {
      console.error("Error al cargar detalle:", error);
      UI.toast("Error al cargar el libro.", "danger");
    }
  },

  _renderCover(coverURL, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (coverURL) {
      // Use direct URL — CSS object-fit: cover handles resizing
      container.innerHTML = `<div class="libro-cover-wrap"><img src="${Utils._escAttr(coverURL)}" alt="Portada" onerror="this.parentElement.innerHTML=Catalogo._placeholderHTML()"></div>`;
    } else {
      container.innerHTML = `<div class="libro-cover-wrap">${this._placeholderHTML()}</div>`;
    }
  },

  _placeholderHTML() {
    return `<div class="libro-cover-placeholder">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      <span>Sin portada</span>
    </div>`;
  },

  async activarModoEdicion() {
    if (!this._currentDetailId) return;

    try {
      const docSnap = await getDoc(doc(db, this.coleccion, this._currentDetailId));
      if (!docSnap.exists()) return;

      const data = docSnap.data();

      // Fill edit form
      document.getElementById("libro-titulo").value = data.titulo || "";
      document.getElementById("libro-autor").value = data.autor || "";
      document.getElementById("libro-isbn").value = data.isbn || "";
      document.getElementById("libro-genero").value = data.genero || "Otro";
      document.getElementById("libro-ejemplares").value = data.ejemplares || 1;
      document.getElementById("libro-cover-url").value = data.coverURL || "";

      // Show/hide eliminar portada button
      document.getElementById("btn-eliminar-portada").disabled = !data.coverURL;

      // Preview if cover exists
      if (data.coverURL) {
        this.previewCoverURL();
      } else {
        document.getElementById("libro-cover-edit-preview").style.display = "none";
      }

      // Wire save button
      const btnGuardar = document.getElementById("btn-guardar-edicion");
      btnGuardar.onclick = () => Catalogo.guardarEdicion(this._currentDetailId);

      // Switch modes
      document.getElementById("libro-view-mode").style.display = "none";
      document.getElementById("libro-edit-mode").style.display = "";
    } catch (error) {
      console.error("Error al cargar libro para editar:", error);
      UI.toast("Error al cargar el libro.", "danger");
    }
  },

  cancelarEdicion() {
    if (!this._currentDetailId) {
      UI.cerrarModal("modal-libro");
      return;
    }
    // Go back to view mode
    document.getElementById("libro-view-mode").style.display = "";
    document.getElementById("libro-edit-mode").style.display = "none";
  },

  async eliminarDesdeModal() {
    if (!this._currentDetailId) return;
    const titulo = document.getElementById("libro-det-titulo").textContent;
    await this.eliminar(this._currentDetailId, titulo);
    // If elimination succeeded, modal would have been closed by eliminar()
    // But just in case:
    UI.cerrarModal("modal-libro");
  },

  async guardarEdicion(id) {
    const titulo = document.getElementById("libro-titulo").value.trim();
    const autor = document.getElementById("libro-autor").value.trim();
    const isbn = document.getElementById("libro-isbn").value.trim();
    const genero = document.getElementById("libro-genero").value;
    const ejemplaresNuevos = parseInt(document.getElementById("libro-ejemplares").value) || 1;
    const coverURL = document.getElementById("libro-cover-url").value.trim();

    if (!titulo || !autor) {
      UI.toast("Titulo y autor son obligatorios.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const dataActual = docSnap.data();
      const ejemplaresAnteriores = dataActual.ejemplares || 0;
      const prestados = ejemplaresAnteriores - (dataActual.disponibles ?? 0);
      const nuevosDisponibles = Math.max(0, ejemplaresNuevos - prestados);

      await updateDoc(doc(db, this.coleccion, id), {
        titulo, autor,
        isbn: isbn || "",
        genero, ejemplares: ejemplaresNuevos,
        disponibles: nuevosDisponibles,
        coverURL
      });

      Utils.invalidarCache();
      AuditLog.registrar("editar", "libro", id, `Libro "${titulo}" editado`);

      // Go back to view mode and refresh
      this._currentDetailId = id;
      this.verDetalle(id);
      UI.toast(`Libro "${titulo}" actualizado correctamente.`);
      // Also refresh catalog in background
      this.render();
    } catch (error) {
      console.error("Error al actualizar libro:", error);
      UI.toast("Error al actualizar el libro.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async guardarCoverURL() {
    const url = document.getElementById("libro-cover-url").value.trim();
    if (!url) {
      UI.toast("Ingresá una URL de imagen.", "warning");
      return;
    }

    if (!this._currentDetailId) {
      UI.toast("No se pudo guardar la portada.", "danger");
      return;
    }

    // Quick validation - try loading the image
    const img = new Image();
    img.onload = async () => {
      try {
        // Save to Firestore immediately
        await updateDoc(doc(db, this.coleccion, this._currentDetailId), { coverURL: url });
        UI.toast("Portada guardada correctamente.", "success");
        document.getElementById("btn-eliminar-portada").disabled = false;
        // Update cover in view mode
        this._renderCover(url, "libro-cover-container");
      } catch (err) {
        console.error("Error al guardar coverURL:", err);
        UI.toast("Error al guardar la portada.", "danger");
      }
    };
    img.onerror = () => {
      UI.toast("No se pudo cargar la imagen. Verificá la URL.", "danger");
    };
    img.src = url;
  },

  previewCoverURL() {
    const url = document.getElementById("libro-cover-url").value.trim();
    const preview = document.getElementById("libro-cover-edit-preview");
    if (!url) {
      preview.style.display = "none";
      return;
    }
    // Use direct URL — CSS object-fit: cover handles resizing
    preview.innerHTML = `<img src="${Utils._escAttr(url)}" alt="Preview" onerror="document.getElementById('libro-cover-edit-preview').style.display='none'">`;
    preview.style.display = "";
  },

  async eliminarPortada() {
    document.getElementById("libro-cover-url").value = "";
    document.getElementById("libro-cover-edit-preview").style.display = "none";
    document.getElementById("btn-eliminar-portada").disabled = true;

    if (!this._currentDetailId) return;

    try {
      // Remove from Firestore immediately
      await updateDoc(doc(db, this.coleccion, this._currentDetailId), { coverURL: "" });
      UI.toast("Portada eliminada.", "info");
      // Update cover in view mode
      this._renderCover("", "libro-cover-container");
    } catch (err) {
      console.error("Error al eliminar coverURL:", err);
      UI.toast("Error al eliminar la portada.", "danger");
    }
  },

  // ══════════════════════════════════════════════════════════════
  //  SELECCIÓN MASIVA — Checkbox bulk operations
  // ══════════════════════════════════════════════════════════════

  toggleSeleccion(id, checked) {
    if (checked) {
      this._selectedIds.add(id);
    } else {
      this._selectedIds.delete(id);
    }
    this._syncSelectAll();
    this._updateBulkBar();
  },

  toggleSeleccionarTodos(checked) {
    const checkboxes = document.querySelectorAll("#tabla-catalogo input[type=checkbox][data-id]");
    checkboxes.forEach(cb => {
      cb.checked = checked;
      if (checked) {
        this._selectedIds.add(cb.dataset.id);
      } else {
        this._selectedIds.delete(cb.dataset.id);
      }
    });
    this._updateBulkBar();
  },

  deseleccionarTodos() {
    this._selectedIds.clear();
    const checkboxes = document.querySelectorAll("#tabla-catalogo input[type=checkbox][data-id]");
    checkboxes.forEach(cb => { cb.checked = false; });
    const selectAllCb = document.getElementById("catalogo-select-all");
    if (selectAllCb) selectAllCb.checked = false;
    this._updateBulkBar();
  },

  _syncSelectAll() {
    const checkboxes = document.querySelectorAll("#tabla-catalogo input[type=checkbox][data-id]");
    const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    const selectAllCb = document.getElementById("catalogo-select-all");
    if (selectAllCb) selectAllCb.checked = allChecked;
  },

  _updateBulkBar() {
    const bar = document.getElementById("catalogo-bulk-bar");
    const count = document.getElementById("catalogo-bulk-count");
    if (!bar || !count) return;

    if (Roles.puede("eliminarLibro") && this._selectedIds.size > 0) {
      count.textContent = `${this._selectedIds.size} seleccionados`;
      bar.style.display = "flex";
    } else {
      bar.style.display = "none";
    }
  },

  async eliminarSeleccionados() {
    const count = this._selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Estas seguro de eliminar ${count} libro${count > 1 ? "s" : ""}?`)) return;

    Utils.loading(true);
    let eliminados = 0;
    let conPrestamos = 0;
    const ids = [...this._selectedIds];

    try {
      // Check for active loans first
      for (const id of ids) {
        const q = query(
          collection(db, "prestamos"),
          where("libroId", "==", id),
          where("estado", "==", "activo")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          conPrestamos++;
          continue;
        }
        await deleteDoc(doc(db, this.coleccion, id));
        AuditLog.registrar("eliminar", "libro", id, "Libro eliminado (selección masiva)");
        eliminados++;
      }

      Utils.invalidarCache();
      this._selectedIds.clear();
      this.render();

      if (conPrestamos > 0) {
        UI.toast(`${eliminados} eliminado${eliminados !== 1 ? "s" : ""}. ${conPrestamos} no se pudo${conPrestamos !== 1 ? "ron" : ""} eliminar (tienen préstamos activos).`, "warning");
      } else {
        UI.toast(`${eliminados} libro${eliminados !== 1 ? "s" : ""} eliminado${eliminados !== 1 ? "s" : ""}.`);
      }
    } catch (error) {
      console.error("Error al eliminar en masa:", error);
      UI.toast("Error al eliminar los libros.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async eliminar(id, titulo) {
    if (!confirm(`Estas seguro de eliminar "${titulo}"?`)) return;

    Utils.loading(true);

    try {
      const q = query(
        collection(db, "prestamos"),
        where("libroId", "==", id),
        where("estado", "==", "activo")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        UI.mostrarAlerta( "No se puede eliminar: tiene prestamos activos.", "danger", 4000);
        Utils.loading(false);
        return;
      }

      await deleteDoc(doc(db, this.coleccion, id));
      Utils.invalidarCache();
      AuditLog.registrar("eliminar", "libro", id, `Libro "${titulo}" eliminado del catálogo`);
      UI.mostrarAlerta( `"${titulo}" eliminado del catalogo.`);
      this.render();
    } catch (error) {
      console.error("Error al eliminar libro:", error);
      UI.mostrarAlerta( "Error al eliminar el libro.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async obtenerTodos() {
    const q = query(collection(db, this.coleccion), orderBy("titulo", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

};


// ══════════════════════════════════════════════════════════════
//  USUARIOS — CRUD de Usuarios (with filter, sort, pagination)
// ══════════════════════════════════════════════════════════════

const Usuarios = {
  coleccion: "usuarios",
  _data: [],
  _sortColumn: null,
  _sortDirection: 'asc',
  _page: 1,
  _perPage: 20,
  _filtroTipo: "",

  /**
   * Lee todos los usuarios y renderiza la tabla
   */
  async render() {
    const tbody = document.getElementById("tabla-usuarios");
    const filtro = (document.getElementById("buscar-usuario")?.value || "").toLowerCase();
    const filtroTipo = document.getElementById("filtro-tipo")?.value || "";

    try {
      const q = query(collection(db, this.coleccion), orderBy("nombre", "asc"));
      const snapshot = await getDocs(q);

      // Precalcular prestamos activos por usuario
      const prestamosSnap = await getDocs(
        query(collection(db, "prestamos"), where("estado", "==", "activo"))
      );
      const prestamosPorUsuario = {};
      prestamosSnap.forEach(d => {
        const uid = d.data().usuarioId;
        prestamosPorUsuario[uid] = (prestamosPorUsuario[uid] || 0) + 1;
      });

      // Build data array
      this._data = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const activos = prestamosPorUsuario[id] || 0;

        // Text filter
        if (filtro) {
          const texto = `${data.nombre} ${data.dni || ""} ${data.tipo} ${data.email || ""}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }
        // Type filter
        if (filtroTipo && (data.tipo || "") !== filtroTipo) return;

        this._data.push({ id, ...data, activos });
      });

      // Sort
      let sorted = [...this._data];
      if (this._sortColumn) {
        sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
          if (col === 'nombre') return item.nombre || '';
          if (col === 'tipo') return item.tipo || '';
          if (col === 'dni') return item.dni || '';
          if (col === 'cuenta') return item.email || '';
          if (col === 'prestamos') return item.activos || 0;
          return '';
        });
      }

      // Pagination
      const totalPages = Math.ceil(sorted.length / this._perPage);
      if (this._page > totalPages) this._page = 1;
      const start = (this._page - 1) * this._perPage;
      const pageData = sorted.slice(start, start + this._perPage);

      let html = "";
      pageData.forEach((item) => {
        // Badge de tipo
        const tipoBadge = {
          "Alumno": "badge-azul",
          "Docente": "badge-verde",
          "Administrativo": "badge-amarillo"
        }[item.tipo] || "badge-azul";

        // Cuenta de acceso
        const tieneCuenta = item.authUid ? true : false;
        const cuentaHTML = tieneCuenta
          ? `<span style="color:var(--verde);font-size:12px">${Utils._esc(item.email || "—")}</span>`
          : `<span style="color:var(--texto-muted);font-size:12px">Sin cuenta</span>`;

        html += `
          <tr>
            <td><strong>${Utils._esc(item.nombre)}</strong></td>
            <td><span class="badge ${tipoBadge}">${Utils._esc(item.tipo)}</span></td>
            <td>${Utils._esc(item.dni || "—")}</td>
            <td>${cuentaHTML}</td>
            <td>${item.activos > 0 ? `<span class="badge badge-amarillo">${item.activos}</span>` : "0"}</td>
            <td>
              <button class="btn btn-sm" onclick="Usuarios.editar('${item.id}')" title="Editar">&#9998;</button>
              <button class="btn btn-sm btn-danger" onclick="Usuarios.eliminar('${item.id}', '${Utils._escAttr(item.nombre)}')" title="Eliminar">&#10005;</button>
            </td>
          </tr>`;
      });

      if (!html) {
        html = UI.emptyState(
          filtro || filtroTipo ? "search" : "user",
          filtro || filtroTipo ? "No se encontraron resultados." : "Aún no hay usuarios registrados."
        );
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("usuarios");

      // Pagination controls
      Utils.renderPagination("pagination-usuarios", sorted.length, this._page, this._perPage, (page) => {
        this._page = page;
        this.render();
      });

      // Init sortable headers
      Utils.initSortableHeaders("tabla-usuarios-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._page = 1;
        this.render();
      });
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  /**
   * Limpia el modal de usuario y lo prepara para "agregar"
   */
  _prepararModalAgregar() {
    document.getElementById("modal-usuario-titulo").textContent = "👤 Agregar usuario";
    document.getElementById("usu-nombre").value = "";
    document.getElementById("usu-tipo").value = "Alumno";
    document.getElementById("usu-dni").value = "";
    document.getElementById("usu-email").value = "";
    document.getElementById("usu-email").removeAttribute("readonly");
    document.getElementById("usu-email-label").textContent = "Email";
    document.getElementById("usu-email-hint").style.display = "none";
    document.getElementById("usu-password").value = "";
    document.getElementById("usu-password").removeAttribute("readonly");
    document.getElementById("usu-password-label").textContent = "Contraseña";
    document.getElementById("usu-password-hint").style.display = "none";
    document.getElementById("usu-password-group").style.display = "";

    const btnGuardar = document.getElementById("btn-guardar-usuario");
    btnGuardar.textContent = "Guardar usuario";
    btnGuardar.onclick = () => Usuarios.agregar();

    const modal = document.getElementById("modal-usuario");
    delete modal.dataset.editId;
  },

  /**
   * Intenta vincular una cuenta Auth existente usando secondaryAuth.
   * Si el email ya existe en Auth, inicia sesión con esa cuenta para obtener el UID.
   * Retorna { authUid } o lanza error.
   */
  async _vincularCuentaExistente(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, password);
      const authUid = userCredential.user.uid;
      await signOut(secondaryAuth);
      return { authUid };
    } catch (error) {
      await signOut(secondaryAuth).catch(() => {});
      throw error;
    }
  },

  /**
   * Agrega un nuevo usuario.
   * Si se completa email + contraseña, crea la cuenta en Firebase Auth
   * usando una app secundaria (el admin no se desloguea).
   * Si el email ya existe en Auth, intenta vincular la cuenta existente.
   */
  async agregar() {
    const nombre   = document.getElementById("usu-nombre").value.trim();
    const tipo     = document.getElementById("usu-tipo").value;
    const dni      = document.getElementById("usu-dni").value.trim();
    const email    = document.getElementById("usu-email").value.trim();
    const password = document.getElementById("usu-password").value;

    // Validaciones obligatorias
    if (!nombre) {
      UI.toast("El nombre es obligatorio.", "danger");
      return;
    }
    if (!dni) {
      UI.toast("El DNI es obligatorio.", "danger");
      return;
    }

    // Validaciones de cuenta de acceso (opcional)
    if (email && !password) {
      UI.toast("Si ingresas un email, también debes ingresar una contraseña.", "danger");
      return;
    }
    if (!email && password) {
      UI.toast("Si ingresas una contraseña, también debes ingresar un email.", "danger");
      return;
    }
    if (password && password.length < 6) {
      UI.toast("La contraseña debe tener al menos 6 caracteres.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      let authUid = null;

      // Si tiene email + contraseña, crear cuenta en Auth (app secundaria)
      if (email && password) {
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          authUid = userCredential.user.uid;
          // Limpiar la sesion de la app secundaria
          await signOut(secondaryAuth);
        } catch (authError) {
          if (authError.code === "auth/email-already-in-use") {
            // La cuenta Auth ya existe: intentar vincularla con la contraseña ingresada
            try {
              const result = await this._vincularCuentaExistente(email, password);
              authUid = result.authUid;
            } catch (linkError) {
              if (linkError.code === "auth/wrong-password" || linkError.code === "auth/invalid-credential") {
                UI.toast("El email ya existe en Firebase Auth pero la contraseña no coincide. Verificá los datos o consultá al administrador del proyecto.", "danger");
              } else {
                UI.toast("No se pudo vincular la cuenta existente. Error: " + (linkError.code || linkError.message), "danger");
              }
              Utils.loading(false);
              return;
            }
          } else {
            let msg = "Error al crear la cuenta de acceso.";
            switch (authError.code) {
              case "auth/invalid-email":
                msg = "El formato del email no es valido.";
                break;
              case "auth/weak-password":
                msg = "La contraseña es demasiado debil (minimo 6 caracteres).";
                break;
            }
            UI.toast(msg, "danger");
            Utils.loading(false);
            return;
          }
        }
      }

      // Crear documento en Firestore
      const docData = {
        nombre,
        tipo,
        dni,
        createdAt: serverTimestamp()
      };
      if (authUid) docData.authUid = authUid;
      if (email)   docData.email = email;

      const linkMsg = authUid ? " (cuenta vinculada)" : "";

      await addDoc(collection(db, this.coleccion), docData);

      Utils.invalidarCache();
      AuditLog.registrar("crear", "usuario", null, `Usuario "${nombre}" creado (tipo: ${tipo})`);

      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta( `Usuario "${nombre}" registrado correctamente.${linkMsg}`);
      this.render();
    } catch (error) {
      console.error("Error al agregar usuario:", error);
      UI.mostrarAlerta( "Error al guardar el usuario.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Abre el modal con datos para editar un usuario.
   * - Si tiene authUid: email es solo lectura, no se muestra contraseña.
   * - Si no tiene authUid: se pueden agregar email y contraseña.
   */
  async editar(id) {
    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      const tieneCuenta = !!data.authUid;

      // Preparar modal en modo edicion
      document.getElementById("modal-usuario-titulo").textContent = "👤 Modificar usuario";
      document.getElementById("usu-nombre").value = data.nombre || "";
      document.getElementById("usu-tipo").value = data.tipo || "Alumno";
      document.getElementById("usu-dni").value = data.dni || "";

      // Configurar campos de email/contraseña segun si tiene cuenta
      if (tieneCuenta) {
        // Tiene cuenta Auth: email de solo lectura, sin campo de contraseña
        document.getElementById("usu-email").value = data.email || "";
        document.getElementById("usu-email").setAttribute("readonly", "readonly");
        document.getElementById("usu-email-label").textContent = "Email (cuenta de acceso)";
        document.getElementById("usu-email-hint").textContent = "El email no se puede modificar desde aquí.";
        document.getElementById("usu-email-hint").style.display = "";
        document.getElementById("usu-password-group").style.display = "none";
      } else {
        // No tiene cuenta Auth: puede agregar email y contraseña
        document.getElementById("usu-email").value = "";
        document.getElementById("usu-email").removeAttribute("readonly");
        document.getElementById("usu-email-label").textContent = "Email";
        document.getElementById("usu-email-hint").textContent = "Opcional. Si completás email + contraseña, se creará o vinculará una cuenta de acceso existente.";
        document.getElementById("usu-email-hint").style.display = "";
        document.getElementById("usu-password").value = "";
        document.getElementById("usu-password").removeAttribute("readonly");
        document.getElementById("usu-password-label").textContent = "Contraseña";
        document.getElementById("usu-password-hint").textContent = "Opcional. Mínimo 6 caracteres. Si el email ya existe en Auth, se vinculará la cuenta.";
        document.getElementById("usu-password-hint").style.display = "";
        document.getElementById("usu-password-group").style.display = "";
      }

      // Cambiar boton a modo edicion
      const modal = document.getElementById("modal-usuario");
      modal.dataset.editId = id;
      const btnGuardar = document.getElementById("btn-guardar-usuario");
      btnGuardar.textContent = "Actualizar usuario";
      btnGuardar.onclick = () => Usuarios.guardarEdicion(id);

      UI.abrirModal("modal-usuario");
    } catch (error) {
      console.error("Error al editar usuario:", error);
    }
  },

  /**
   * Guarda la edicion de un usuario.
   * Puede cambiar nombre, tipo y DNI.
   * Si el usuario no tiene cuenta Auth y se ingresan email + contraseña,
   * se le crea una cuenta de acceso.
   */
  async guardarEdicion(id) {
    const nombre   = document.getElementById("usu-nombre").value.trim();
    const tipo     = document.getElementById("usu-tipo").value;
    const dni      = document.getElementById("usu-dni").value.trim();
    const email    = document.getElementById("usu-email").value.trim();
    const password = document.getElementById("usu-password").value;

    if (!nombre) {
      UI.toast("El nombre es obligatorio.", "danger");
      return;
    }
    if (!dni) {
      UI.toast("El DNI es obligatorio.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      // Obtener datos actuales del documento
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const dataActual = docSnap.data();
      const tieneCuenta = !!dataActual.authUid;

      // Preparar datos a actualizar
      const datosActualizar = { nombre, tipo, dni };

      // Si NO tiene cuenta y se ingresaron email + contraseña, crear cuenta Auth
      if (!tieneCuenta && email && password) {
        if (password.length < 6) {
          UI.toast("La contraseña debe tener al menos 6 caracteres.", "danger");
          Utils.loading(false);
          return;
        }

        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          datosActualizar.authUid = userCredential.user.uid;
          datosActualizar.email = email;
          await signOut(secondaryAuth);
        } catch (authError) {
          if (authError.code === "auth/email-already-in-use") {
            // La cuenta Auth ya existe: intentar vincularla
            try {
              const result = await this._vincularCuentaExistente(email, password);
              datosActualizar.authUid = result.authUid;
              datosActualizar.email = email;
            } catch (linkError) {
              if (linkError.code === "auth/wrong-password" || linkError.code === "auth/invalid-credential") {
                UI.toast("El email ya existe en Firebase Auth pero la contraseña no coincide. Verificá los datos o consultá al administrador del proyecto.", "danger");
              } else {
                UI.toast("No se pudo vincular la cuenta existente. Error: " + (linkError.code || linkError.message), "danger");
              }
              Utils.loading(false);
              return;
            }
          } else {
            let msg = "Error al crear la cuenta de acceso.";
            switch (authError.code) {
              case "auth/invalid-email":
                msg = "El formato del email no es valido.";
                break;
              case "auth/weak-password":
                msg = "La contraseña es demasiado debil.";
                break;
            }
            UI.toast(msg, "danger");
            Utils.loading(false);
            return;
          }
        }
      } else if (!tieneCuenta && email && !password) {
        // Solo email sin contraseña: guardar el email en Firestore (sin cuenta Auth)
        datosActualizar.email = email;
      }

      await updateDoc(doc(db, this.coleccion, id), datosActualizar);

      Utils.invalidarCache();
      AuditLog.registrar("editar", "usuario", id, `Usuario "${nombre}" editado (tipo: ${tipo})`);

      this._prepararModalAgregar();
      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta( `Usuario "${nombre}" actualizado.`);

      // Si se cambio el rol del usuario logueado, recargar permisos
      if (Roles.usuarioDocId === id) {
        await Roles.cargar(auth.currentUser.uid);
        Roles.aplicarSidebar();
        const nombreMostrar = Roles.usuarioNombre || auth.currentUser.email || "";
        const rolEtiqueta = Roles.etiquetas[Roles.actual] || Roles.actual;
        document.getElementById("avatar-initials").textContent = nombreMostrar.substring(0, 2).toUpperCase();
        document.getElementById("header-username").textContent = `${nombreMostrar} (${rolEtiqueta})`;
      }

      this.render();
    } catch (error) {
      console.error("Error al actualizar usuario:", error);
      UI.mostrarAlerta( "Error al actualizar.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Elimina un usuario (solo si no tiene prestamos activos).
   * Nota: la cuenta de Auth no se puede eliminar desde el cliente.
   */
  async eliminar(id, nombre) {
    if (!confirm(`Estas seguro de eliminar a "${nombre}"?`)) return;

    Utils.loading(true);

    try {
      const q = query(
        collection(db, "prestamos"),
        where("usuarioId", "==", id),
        where("estado", "==", "activo")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        UI.mostrarAlerta( "No se puede eliminar: tiene prestamos activos.", "danger", 4000);
        Utils.loading(false);
        return;
      }

      await deleteDoc(doc(db, this.coleccion, id));
      Utils.invalidarCache();
      AuditLog.registrar("eliminar", "usuario", id, `Usuario "${nombre}" eliminado`);
      UI.mostrarAlerta( `"${nombre}" eliminado.`);
      this.render();
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      UI.mostrarAlerta( "Error al eliminar.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Obtiene todos los usuarios como array
   */
  async obtenerTodos() {
    const q = query(collection(db, this.coleccion), orderBy("nombre", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};


// ══════════════════════════════════════════════════════════════
//  COMPROBANTE — Constancia de préstamo / devolución
// ══════════════════════════════════════════════════════════════

const Comprobante = {
  _datos: null,

  /**
   * Muestra el modal con el comprobante.
   * @param {"prestamo"|"devolucion"} tipo
   * @param {Object} datos — { libroTitulo, usuarioNombre, fechaPrestamo, fechaDevolucion, fechaRealDevolucion?, dni? }
   */
  mostrar(tipo, datos) {
    this._datos = { tipo, ...datos };

    const esPrestamo = tipo === "prestamo";
    const badgeClass = esPrestamo ? "prestamo" : "devolucion";
    const badgeTexto = esPrestamo ? "Constancia de Préstamo" : "Constancia de Devolución";

    const fechaPrest = datos.fechaPrestamo
      ? Utils.formatDate(datos.fechaPrestamo)
      : "—";
    const fechaDev = datos.fechaDevolucion
      ? Utils.formatDate(datos.fechaDevolucion)
      : "—";
    const fechaRealDev = datos.fechaRealDevolucion
      ? Utils.formatDate(datos.fechaRealDevolucion)
      : null;

    let camposHTML = `
      <div class="comprobante-field">
        <span class="comprobante-label">Libro</span>
        <span class="comprobante-value"><strong>${Utils._esc(datos.libroTitulo)}</strong></span>
      </div>
      <div class="comprobante-field">
        <span class="comprobante-label">Alumno / Usuario</span>
        <span class="comprobante-value">${Utils._esc(datos.usuarioNombre)}</span>
      </div>`;

    if (datos.dni) {
      camposHTML += `
      <div class="comprobante-field">
        <span class="comprobante-label">DNI</span>
        <span class="comprobante-value">${Utils._esc(datos.dni)}</span>
      </div>`;
    }

    camposHTML += `
      <div class="comprobante-field">
        <span class="comprobante-label">Fecha de préstamo</span>
        <span class="comprobante-value">${fechaPrest}</span>
      </div>
      <div class="comprobante-field">
        <span class="comprobante-label">Fecha de devolución</span>
        <span class="comprobante-value">${fechaDev}</span>
      </div>`;

    if (fechaRealDev) {
      camposHTML += `
      <div class="comprobante-field">
        <span class="comprobante-label">Devolución real</span>
        <span class="comprobante-value">${fechaRealDev}</span>
      </div>`;
    }

    const html = `
      <div class="comprobante">
        <div class="comprobante-header">
          <img class="comprobante-logo" src="assets/logo-cebas48.png" alt="CEBAS">
          <div class="comprobante-titulo">Biblioteca CEBAS</div>
          <div class="comprobante-subtitulo">Centro Especial de Bachillerato para Adultos en Salud</div>
          <div style="margin-top:0.75rem">
            <span class="comprobante-tipo-badge ${badgeClass}">${badgeTexto}</span>
          </div>
        </div>
        <div class="comprobante-body">
          ${camposHTML}
        </div>
        <div class="comprobante-footer">
          <div class="comprobante-firma">
            <div class="comprobante-firma-col">
              <div class="comprobante-firma-linea"></div>
              <div class="comprobante-firma-texto">Firma del Bibliotecario</div>
            </div>
            <div class="comprobante-firma-col">
              <div class="comprobante-firma-linea"></div>
              <div class="comprobante-firma-texto">Firma del Alumno / Usuario</div>
            </div>
          </div>
          <div class="comprobante-fecha-impresion">
            Generado el ${new Date().toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>`;

    document.getElementById("comprobante-contenido").innerHTML = html;
    UI.abrirModal("modal-comprobante");
  },

  /**
   * Imprime el comprobante usando window.print()
   */
  imprimir() {
    window.print();
  }
};


// ══════════════════════════════════════════════════════════════
//  PRESTAMOS — Gestion de prestamos y devoluciones (with filter, sort, pagination)
// ══════════════════════════════════════════════════════════════

const Prestamos = {
  coleccion: "prestamos",
  _data: [],
  _sortColumn: null,
  _sortDirection: 'asc',
  _page: 1,
  _perPage: 20,

  async render() {
    const tbody = document.getElementById("tabla-prestamos");
    const filtroEstado = document.getElementById("filtro-estado")?.value || "";
    const filtro = (document.getElementById("buscar-prestamo")?.value || "").toLowerCase();

    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();
      const q = query(collection(db, this.coleccion), orderBy("fechaPrestamo", "desc"));
      const snapshot = await getDocs(q);

      // Build data array
      this._data = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        let estado, badge;
        if (data.estado === "devuelto") {
          estado = "Devuelto";
          badge = "badge-verde";
        } else {
          if (data.fechaDevolucion && Utils.daysDiff(data.fechaDevolucion) > 0) {
            estado = "Vencido";
            badge = "badge-rojo";
          } else {
            estado = "Activo";
            badge = "badge-azul";
          }
        }

        // Filter by status
        if (filtroEstado === "activo" && estado !== "Activo") return;
        if (filtroEstado === "devuelto" && estado !== "Devuelto") return;
        if (filtroEstado === "vencido" && estado !== "Vencido") return;

        const nombreLibro = Utils.nombreLibro(data, mapLibros);
        const nombreUsu = Utils.nombreUsuario(data, mapUsuarios);

        if (filtro) {
          const texto = `${nombreLibro} ${nombreUsu}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }

        // Filter by date range (based on fechaPrestamo)
        if (!Utils.filtrarPorFecha("filtro-prestamos-desde", "filtro-prestamos-hasta", data.fechaPrestamo)) return;

        this._data.push({ id, ...data, estado, badge, nombreLibro, nombreUsu });
      });

      // Sort
      let sorted = [...this._data];
      if (this._sortColumn) {
        sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
          if (col === 'libro') return item.nombreLibro || '';
          if (col === 'usuario') return item.nombreUsu || '';
          if (col === 'fechaPrestamo') return item.fechaPrestamo ? Utils.toDate(item.fechaPrestamo).getTime() : 0;
          if (col === 'fechaDevolucion') return item.fechaDevolucion ? Utils.toDate(item.fechaDevolucion).getTime() : 0;
          if (col === 'estado') return item.estado || '';
          return '';
        });
      }

      // Pagination
      const totalPages = Math.ceil(sorted.length / this._perPage);
      if (this._page > totalPages) this._page = 1;
      const start = (this._page - 1) * this._perPage;
      const pageData = sorted.slice(start, start + this._perPage);

      let html = "";
      pageData.forEach((item) => {
        html += `
          <tr>
            <td><strong>${Utils._esc(item.nombreLibro)}</strong></td>
            <td>${Utils._esc(item.nombreUsu)}</td>
            <td>${Utils.formatDate(item.fechaPrestamo)}</td>
            <td>${Utils.formatDate(item.fechaDevolucion)}</td>
            <td><span class="badge ${item.badge}">${item.estado}</span></td>
            <td>
              ${item.estado !== "Devuelto"
                ? `<div style="display:flex;gap:4px;flex-wrap:wrap">
                     ${(item.estado === "Activo" && (item.renovaciones || 0) < 1)
                       ? `<button class="btn btn-sm" style="background:var(--badge-amarillo-bg);color:var(--badge-amarillo-txt);border:1px solid var(--badge-amarillo-txt)" onclick="Prestamos.renovar('${item.id}')" title="Extender devolucion">Renovar</button>`
                       : ""}
                     <button class="btn btn-sm btn-primary" onclick="Prestamos.devolver('${item.id}')">Devolver</button>
                   </div>`
                : '<span style="color:var(--texto-muted);font-size:11px">Finalizado</span>'}
            </td>
          </tr>`;
      });

      if (!html) {
        const hayFiltro = filtro || filtroEstado || document.getElementById("filtro-prestamos-desde")?.value || document.getElementById("filtro-prestamos-hasta")?.value;
        html = UI.emptyState(
          hayFiltro ? "search" : "loan",
          hayFiltro ? "No se encontraron resultados." : "No hay préstamos registrados."
        );
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("prestamos");

      // Pagination controls
      Utils.renderPagination("pagination-prestamos", sorted.length, this._page, this._perPage, (page) => {
        this._page = page;
        this.render();
      });

      // Init sortable headers
      Utils.initSortableHeaders("tabla-prestamos-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._page = 1;
        this.render();
      });
    } catch (error) {
      console.error("Error al cargar prestamos:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  async cargarSelects() {
    try {
      const libros = await Catalogo.obtenerTodos();
      const usuarios = await Usuarios.obtenerTodos();

      const libroItems = libros.filter(l => l.disponibles > 0).map(l => ({
        value: l.id,
        title: l.titulo,
        meta: `${l.autor} · ${l.disponibles} disp.`,
        searchText: `${l.titulo} ${l.autor}`
      }));

      const usuarioItems = usuarios.map(u => ({
        value: u.id,
        title: u.nombre,
        meta: `${u.tipo}${u.dni ? ' · DNI: ' + u.dni : ''}`,
        searchText: `${u.nombre} ${u.dni || ''} ${u.tipo}`
      }));

      // Feature 4: Use SearchSelect combobox instead of plain selects
      SearchSelect.init('pres-libro-input', 'dropdown-libro', 'pres-libro', libroItems);
      SearchSelect.init('pres-usuario-input', 'dropdown-usuario', 'pres-usuario', usuarioItems);

      // Keep date defaults
      const hoy = Utils.today();
      document.getElementById("pres-fecha").value = hoy;
      const diasDefault = await Config.obtenerDias();
      const fechaDevolucion = Utils.addDays(hoy, diasDefault);
      document.getElementById("pres-devolucion").value = fechaDevolucion.toISOString().split("T")[0];
    } catch (error) {
      console.error("Error al cargar selects de prestamo:", error);
    }
  },

  async registrar() {
    // Feature 4: Get values from hidden inputs (SearchSelect)
    const libroId = document.getElementById("pres-libro").value;
    const usuarioId = document.getElementById("pres-usuario").value;
    const libroTitulo = document.getElementById("pres-libro-input").value;
    const usuarioNombre = document.getElementById("pres-usuario-input").value;
    const fechaPrestamo = document.getElementById("pres-fecha").value;
    const fechaDevolucion = document.getElementById("pres-devolucion").value;

    if (!libroId || !usuarioId) {
      UI.mostrarAlerta( "Selecciona un libro y un usuario.", "danger");
      return;
    }
    if (!fechaPrestamo || !fechaDevolucion) {
      UI.mostrarAlerta( "Completá las fechas de prestamo y devolucion.", "danger");
      return;
    }
    if (new Date(fechaDevolucion) <= new Date(fechaPrestamo)) {
      UI.mostrarAlerta( "La devolucion debe ser posterior al prestamo.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      // Transacción: verificar stock disponible y descontar en una sola operación
      const libroRef = doc(db, "libros", libroId);
      await runTransaction(db, async (transaction) => {
        const libroSnap = await transaction.get(libroRef);
        if (!libroSnap.exists()) throw new Error("El libro no existe.");
        const actuales = libroSnap.data().disponibles ?? 0;
        if (actuales <= 0) {
          throw new Error("NO_STOCK");
        }
        // Crear el préstamo dentro de la transacción
        const prestamoRef = doc(collection(db, this.coleccion));
        transaction.set(prestamoRef, {
          libroId, libroTitulo, usuarioId, usuarioNombre,
          fechaPrestamo: new Date(fechaPrestamo + "T12:00:00"),
          fechaDevolucion: new Date(fechaDevolucion + "T12:00:00"),
          estado: "activo",
          renovaciones: 0,
          createdAt: serverTimestamp()
        });
        transaction.update(libroRef, { disponibles: increment(-1) });
      });

      Utils.invalidarCache();
      AuditLog.registrar("crear", "prestamo", null, `Préstamo: "${libroTitulo}" → ${usuarioNombre}`);

      UI.cerrarModal("modal-prestamo");
      UI.mostrarAlerta( `Prestamo de "${libroTitulo}" registrado.`);
      this.render();
      Vencidos.actualizarBadge();
      Notificaciones.cargar();

      // Feature 4: Reset search selects after successful registration
      SearchSelect.reset('pres-libro-input');
      SearchSelect.reset('pres-usuario-input');

      // Mostrar comprobante de préstamo
      let usuarioDni = null;
      try {
        const usuarioSnap = await getDoc(doc(db, "usuarios", usuarioId));
        if (usuarioSnap.exists()) usuarioDni = usuarioSnap.data().dni || null;
      } catch (e) { /* ignorar si no se puede obtener el DNI */ }
      Comprobante.mostrar("prestamo", {
        libroTitulo,
        usuarioNombre,
        fechaPrestamo: new Date(fechaPrestamo + "T12:00:00"),
        fechaDevolucion: new Date(fechaDevolucion + "T12:00:00"),
        dni: usuarioDni
      });
    } catch (error) {
      console.error("Error al registrar prestamo:", error);
      if (error.message === "NO_STOCK") {
        UI.mostrarAlerta( "No hay stock disponible para este libro. Recargá el catalogo e intentá de nuevo.", "danger");
        Prestamos.cargarSelects();
      } else {
        UI.mostrarAlerta( "Error al registrar el prestamo.", "danger");
      }
    } finally {
      Utils.loading(false);
    }
  },

  async devolver(id) {
    if (!confirm("Registrar devolucion de este libro?")) return;

    Utils.loading(true);

    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const data = docSnap.data();

      const fechaRealDevolucion = new Date();

      await updateDoc(doc(db, this.coleccion, id), {
        estado: "devuelto",
        fechaRealDevolucion
      });

      await updateDoc(doc(db, "libros", data.libroId), {
        disponibles: increment(1)
      });

      Utils.invalidarCache();
      AuditLog.registrar("devolver", "prestamo", id, `Devolución: "${data.libroTitulo}" (${data.usuarioNombre})`);

      UI.mostrarAlerta( `"${data.libroTitulo}" devuelto correctamente.`);
      this.render();
      Vencidos.actualizarBadge();
      Notificaciones.cargar();

      // Mostrar comprobante de devolución
      let usuarioDni = null;
      try {
        const usuarioSnap = await getDoc(doc(db, "usuarios", data.usuarioId));
        if (usuarioSnap.exists()) usuarioDni = usuarioSnap.data().dni || null;
      } catch (e) { /* ignorar si no se puede obtener el DNI */ }
      Comprobante.mostrar("devolucion", {
        libroTitulo: data.libroTitulo,
        usuarioNombre: data.usuarioNombre,
        fechaPrestamo: data.fechaPrestamo,
        fechaDevolucion: data.fechaDevolucion,
        fechaRealDevolucion,
        dni: usuarioDni
      });
    } catch (error) {
      console.error("Error al registrar devolucion:", error);
      UI.mostrarAlerta( "Error al registrar devolucion.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async renovar(id) {
    if (!confirm("Renovar este prestamo por 7 dias mas?")) return;

    Utils.loading(true);

    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const data = docSnap.data();

      if (!data) {
        UI.mostrarAlerta( "Prestamo no encontrado.", "danger");
        return;
      }
      if (data.estado !== "activo") {
        UI.mostrarAlerta( "Solo se pueden renovar prestamos activos.", "danger");
        return;
      }
      if ((data.renovaciones || 0) >= 1) {
        UI.mostrarAlerta( "Este prestamo ya fue renovado. No se permite mas de una renovacion.", "danger", 4000);
        return;
      }

      // Obtener dias de prestamo desde config
      const dias = await Config.obtenerDias() || 7;
      const fechaDevActual = data.fechaDevolucion.toDate ? data.fechaDevolucion.toDate() : new Date(data.fechaDevolucion);
      const nuevaFechaDev = new Date(fechaDevActual);
      nuevaFechaDev.setDate(nuevaFechaDev.getDate() + dias);

      await updateDoc(doc(db, this.coleccion, id), {
        fechaDevolucion: nuevaFechaDev,
        renovaciones: (data.renovaciones || 0) + 1
      });

      Utils.invalidarCache();
      AuditLog.registrar("editar", "prestamo", id, `Renovacion: "${data.libroTitulo}" (${data.usuarioNombre}) - nueva devolucion: ${nuevaFechaDev.toLocaleDateString("es-AR")}`);

      UI.mostrarAlerta( `"${data.libroTitulo}" renovado. Nueva devolucion: ${nuevaFechaDev.toLocaleDateString("es-AR")}`);
      this.render();
      Vencidos.actualizarBadge();
      Notificaciones.cargar();
    } catch (error) {
      console.error("Error al renovar prestamo:", error);
      UI.mostrarAlerta( "Error al renovar el prestamo.", "danger");
    } finally {
      Utils.loading(false);
    }
  }
};


// ══════════════════════════════════════════════════════════════
//  VENCIDOS — Prestamos que pasaron la fecha de devolucion (with sort)
// ══════════════════════════════════════════════════════════════

const Vencidos = {
  _data: [],
  _sortColumn: null,
  _sortDirection: 'asc',

  async render() {
    const tbody = document.getElementById("tabla-vencidos");
    const filtro = (document.getElementById("buscar-vencido")?.value || "").toLowerCase();

    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();
      const prestamosSnap = await getDocs(collection(db, "prestamos"));

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      this._data = [];

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        if (data.estado === "devuelto") return;

        const fechaDev = Utils.toDate(data.fechaDevolucion);
        if (!fechaDev) return;
        fechaDev.setHours(0, 0, 0, 0);

        if (fechaDev < hoy) {
          const diasAtraso = Utils.daysDiff(data.fechaDevolucion);
          const nombreLibro = Utils.nombreLibro(data, mapLibros);
          const nombreUsu = Utils.nombreUsuario(data, mapUsuarios);

          // Search filter
          if (filtro) {
            const texto = `${nombreLibro} ${nombreUsu}`.toLowerCase();
            if (!texto.includes(filtro)) return;
          }

          this._data.push({
            id,
            libro: nombreLibro,
            usuario: nombreUsu,
            fecha: fechaDev,
            fechaRaw: data.fechaDevolucion,
            dias: diasAtraso
          });
        }
      });

      // Sort
      let sorted = [...this._data];
      if (this._sortColumn) {
        sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
          if (col === 'libro') return item.libro || '';
          if (col === 'usuario') return item.usuario || '';
          if (col === 'fecha') return item.fecha ? item.fecha.getTime() : 0;
          if (col === 'dias') return item.dias || 0;
          return '';
        });
      }

      let html = "";
      if (sorted.length === 0) {
        html = UI.emptyState(
          filtro ? "search" : "overdue",
          filtro ? "No se encontraron resultados." : "No hay préstamos vencidos. ¡Todo al día!"
        , 5);
      } else {
        sorted.forEach((item) => {
          html += `
            <tr>
              <td><strong>${Utils._esc(item.libro)}</strong></td>
              <td>${Utils._esc(item.usuario)}</td>
              <td>${Utils.formatDate(item.fechaRaw)}</td>
              <td><span class="badge badge-rojo">${item.dias} dias</span></td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="Prestamos.devolver('${item.id}')">Devolver</button>
              </td>
            </tr>`;
        });
      }

      tbody.innerHTML = html;

      // Init sortable headers
      Utils.initSortableHeaders("tabla-vencidos-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._renderSorted();
      });
    } catch (error) {
      console.error("Error al cargar vencidos:", error);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  _renderSorted() {
    const tbody = document.getElementById("tabla-vencidos");
    let sorted = [...this._data];
    if (this._sortColumn) {
      sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
        if (col === 'libro') return item.libro || '';
        if (col === 'usuario') return item.usuario || '';
        if (col === 'fecha') return item.fecha ? item.fecha.getTime() : 0;
        if (col === 'dias') return item.dias || 0;
        return '';
      });
    }
    let html = "";
    sorted.forEach((item) => {
      html += `
        <tr>
          <td><strong>${Utils._esc(item.libro)}</strong></td>
          <td>${Utils._esc(item.usuario)}</td>
          <td>${Utils.formatDate(item.fechaRaw)}</td>
          <td><span class="badge badge-rojo">${item.dias} dias</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="Prestamos.devolver('${item.id}')">Devolver</button>
          </td>
        </tr>`;
    });
    if (!html) {
      html = UI.emptyState("overdue", "No hay préstamos vencidos.", 5);
    }
    tbody.innerHTML = html;
  },

  async actualizarBadge() {
    try {
      const prestamos = await Utils.cargarPrestamos();

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      let count = 0;

      prestamos.forEach((data) => {
        if (data.estado === "devuelto") return;

        const fechaDev = Utils.toDate(data.fechaDevolucion);
        if (!fechaDev) return;
        fechaDev.setHours(0, 0, 0, 0);

        if (fechaDev < hoy) count++;
      });

      const badge = document.getElementById("badge-vencidos");
      if (badge) {
        badge.textContent = count > 0 ? count : "";
      }
    } catch (error) {
      console.error("Error al actualizar badge vencidos:", error);
    }
  }
};


// ══════════════════════════════════════════════════════════════
//  FEATURE 2: MI HISTORIAL — Historial de prestamos del alumno
// ══════════════════════════════════════════════════════════════

const MiHistorial = {
  _data: [],
  _sortColumn: null,
  _sortDirection: 'asc',
  _page: 1,
  _perPage: 15,

  async render() {
    const tbody = document.getElementById("tabla-mihistorial");
    if (!tbody) return;
    if (!Roles.usuarioDocId) {
      tbody.innerHTML = UI.emptyState("warning", "No se pudo identificar tu usuario.");
      return;
    }

    try {
      const { mapLibros } = await Utils.cargarNombres();
      const q = query(collection(db, "prestamos"), where("usuarioId", "==", Roles.usuarioDocId), orderBy("fechaPrestamo", "desc"));
      const snapshot = await getDocs(q);

      this._data = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const estado = data.estado === "devuelto" ? "Devuelto" :
          (data.fechaDevolucion && Utils.daysDiff(data.fechaDevolucion) > 0 ? "Vencido" : "Activo");

        let diasAtraso = 0;
        if (data.estado !== "devuelto" && data.fechaDevolucion) {
          diasAtraso = Math.max(0, Utils.daysDiff(data.fechaDevolucion));
        } else if (data.estado === "devuelto" && data.fechaRealDevolucion && data.fechaDevolucion) {
          const fechaReal = Utils.toDate(data.fechaRealDevolucion);
          const fechaDev = Utils.toDate(data.fechaDevolucion);
          if (fechaReal && fechaDev) {
            diasAtraso = Math.max(0, Math.ceil((fechaReal - fechaDev) / (1000 * 60 * 60 * 24)));
          }
        }

        // Filter by date range (based on fechaPrestamo)
        if (!Utils.filtrarPorFecha("filtro-historial-desde", "filtro-historial-hasta", data.fechaPrestamo)) return;

        this._data.push({
          id: docSnap.id,
          libro: data.libroTitulo || mapLibros[data.libroId] || "—",
          fechaPrestamo: data.fechaPrestamo ? Utils.toDate(data.fechaPrestamo) : null,
          fechaDevolucion: data.fechaDevolucion ? Utils.toDate(data.fechaDevolucion) : null,
          fechaRealDevolucion: data.fechaRealDevolucion ? Utils.toDate(data.fechaRealDevolucion) : null,
          estado,
          devuelto: data.fechaRealDevolucion ? Utils.formatDate(data.fechaRealDevolucion) : "—",
          diasAtraso,
          renovaciones: data.renovaciones || 0
        });
      });

      // Apply sort
      let sorted = [...this._data];
      if (this._sortColumn) {
        sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
          if (col === 'libro') return item.libro || '';
          if (col === 'fechaPrestamo') return item.fechaPrestamo ? item.fechaPrestamo.getTime() : 0;
          if (col === 'fechaDevolucion') return item.fechaDevolucion ? item.fechaDevolucion.getTime() : 0;
          if (col === 'devuelto') return item.devuelto;
          if (col === 'estado') return item.estado;
          if (col === 'diasAtraso') return item.diasAtraso || 0;
          return '';
        });
      }

      // Pagination
      const totalPages = Math.ceil(sorted.length / this._perPage);
      if (this._page > totalPages) this._page = 1;
      const start = (this._page - 1) * this._perPage;
      const pageData = sorted.slice(start, start + this._perPage);

      let html = "";
      if (pageData.length === 0) {
        html = UI.emptyState("history", "No tenés préstamos registrados.");
      } else {
        pageData.forEach(item => {
          const badge = item.estado === "Devuelto" ? "badge-verde" : item.estado === "Vencido" ? "badge-rojo" : "badge-azul";
          const atraso = item.diasAtraso > 0 ? `<span class="badge badge-rojo">${item.diasAtraso} dias</span>` : `<span style="color:var(--texto-muted)">—</span>`;
          html += `<tr>
            <td><strong>${Utils._esc(item.libro)}</strong></td>
            <td>${Utils.formatDate(item.fechaPrestamo)}</td>
            <td>${Utils.formatDate(item.fechaDevolucion)}</td>
            <td>${Utils._esc(item.devuelto)}</td>
            <td><span class="badge ${badge}">${item.estado}</span></td>
            <td>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                ${atraso}
                ${item.estado === "Activo" && item.renovaciones < 1
                  ? `<button class="btn btn-sm" style="background:var(--badge-amarillo-bg);color:var(--badge-amarillo-txt);border:1px solid var(--badge-amarillo-txt)" onclick="Prestamos.renovar('${item.id}')">Renovar</button>`
                  : ""}
              </div>
            </td>
          </tr>`;
        });
      }
      tbody.innerHTML = html;

      // Pagination controls
      Utils.renderPagination("pagination-mihistorial", sorted.length, this._page, this._perPage, (page) => {
        this._page = page;
        this.render();
      });

      // Init sortable
      Utils.initSortableHeaders("tabla-mihistorial-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._page = 1;
        this.render();
      });
    } catch (error) {
      console.error("Error al cargar historial:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">Error al cargar datos.</td></tr>`;
    }
  }
};


// ══════════════════════════════════════════════════════════════
//  FEATURE 1: NOTIFICACIONES — Bell icon with dropdown
// ══════════════════════════════════════════════════════════════

const Notificaciones = {
  data: [],

  async cargar() {
    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();
      const prestamos = await Utils.cargarPrestamos();
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const dosDias = new Date(hoy);
      dosDias.setDate(dosDias.getDate() + 2);

      this.data = [];
      prestamos.forEach(p => {
        const data = p;
        if (data.estado === "devuelto") return;
        const fechaDev = Utils.toDate(data.fechaDevolucion);
        if (!fechaDev) return;
        fechaDev.setHours(0, 0, 0, 0);

        if (fechaDev <= hoy) {
          // Already expired
          this.data.push({
            id: p.id,
            libroTitulo: data.libroTitulo || mapLibros[data.libroId] || "—",
            usuarioNombre: data.usuarioNombre || mapUsuarios[data.usuarioId] || "—",
            fechaDevolucion: fechaDev,
            diasAtraso: Utils.daysDiff(data.fechaDevolucion),
            tipo: "vencido"
          });
        } else if (fechaDev <= dosDias) {
          // Expiring within 2 days
          const diasRestantes = Math.ceil((fechaDev - hoy) / (1000 * 60 * 60 * 24));
          this.data.push({
            id: p.id,
            libroTitulo: data.libroTitulo || mapLibros[data.libroId] || "—",
            usuarioNombre: data.usuarioNombre || mapUsuarios[data.usuarioId] || "—",
            fechaDevolucion: fechaDev,
            diasRestantes,
            tipo: "por-vencer"
          });
        }
      });

      // Sort: expired first, then by days
      this.data.sort((a, b) => {
        if (a.tipo === "vencido" && b.tipo !== "vencido") return -1;
        if (a.tipo !== "vencido" && b.tipo === "vencido") return 1;
        return (b.diasAtraso || b.diasRestantes || 0) - (a.diasAtraso || a.diasRestantes || 0);
      });

      this.actualizarBadge();
    } catch (error) {
      console.error("Error al cargar notificaciones:", error);
    }
  },

  actualizarBadge() {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    const count = this.data.length;
    badge.textContent = count > 0 ? count : "";
    badge.style.display = count > 0 ? "block" : "none";
  },

  toggle() {
    const dropdown = document.getElementById("notif-dropdown");
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains("open");
    if (isOpen) {
      dropdown.classList.remove("open");
    } else {
      this.renderDropdown();
      dropdown.classList.add("open");
    }
  },

  cerrar() {
    const dropdown = document.getElementById("notif-dropdown");
    if (dropdown) dropdown.classList.remove("open");
  },

  renderDropdown() {
    const dropdown = document.getElementById("notif-dropdown");
    if (!dropdown) return;

    if (this.data.length === 0) {
      dropdown.innerHTML = `
        <div class="notif-header">
          <span>Notificaciones</span>
        </div>
        <div class="notif-empty"><div class="empty-state" style="padding:1.5rem 0.5rem 1rem"><div class="empty-state-icon" style="width:40px;height:40px">${UI.emptyIcon("bell")}</div><div class="empty-state-msg" style="font-size:0.8rem">Todo al día. Sin alertas.</div></div></div>
      `;
      return;
    }

    let html = `
      <div class="notif-header">
        <span>Notificaciones</span>
        <span style="font-size:12px;color:var(--texto-muted)">${this.data.length} alerta${this.data.length > 1 ? 's' : ''}</span>
      </div>
    `;

    this.data.forEach(item => {
      const badgeClass = item.tipo === "vencido" ? "badge-rojo" : "badge-amarillo";
      const badgeText = item.tipo === "vencido" ? `${item.diasAtraso} dias de atraso` : `Vence en ${item.diasRestantes} dia${item.diasRestantes > 1 ? 's' : ''}`;
      html += `
        <div class="notif-item">
          <div class="notif-item-info">
            <div class="notif-item-title">${Utils._esc(item.libroTitulo)}</div>
            <div class="notif-item-meta">${Utils._esc(item.usuarioNombre)} · Dev: ${Utils.formatDate(item.fechaDevolucion)}</div>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      `;
    });

    dropdown.innerHTML = html;
  }
};


// ══════════════════════════════════════════════════════════════
//  FEATURE 4: SEARCHSELECT — Buscador en selects del modal
// ══════════════════════════════════════════════════════════════

const SearchSelect = {
  _instances: {},

  init(inputId, dropdownId, hiddenId, items, onChange) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    // If already initialized, just update items and reset
    if (this._instances[inputId]) {
      this._instances[inputId].items = items;
      this._instances[inputId].onChange = onChange;
      this._instances[inputId].highlightedIndex = -1;
      this.reset(inputId);
      return;
    }

    this._instances[inputId] = { items, onChange, hiddenId, highlightedIndex: -1 };

    input.addEventListener('input', () => {
      const query = input.value.toLowerCase().trim();
      const filtered = query ? items.filter(item => item.searchText.toLowerCase().includes(query)) : items.slice(0, 50);
      this._render(dropdownId, filtered, inputId);
      dropdown.classList.add('open');
    });

    input.addEventListener('focus', () => {
      if (!input.value) {
        const filtered = items.slice(0, 50);
        this._render(dropdownId, filtered, inputId);
        dropdown.classList.add('open');
      }
    });

    input.addEventListener('keydown', (e) => {
      const inst = this._instances[inputId];
      const options = dropdown.querySelectorAll('.combobox-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        inst.highlightedIndex = Math.min(inst.highlightedIndex + 1, options.length - 1);
        this._updateHighlight(options, inst.highlightedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        inst.highlightedIndex = Math.max(inst.highlightedIndex - 1, 0);
        this._updateHighlight(options, inst.highlightedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (inst.highlightedIndex >= 0 && options[inst.highlightedIndex]) {
          options[inst.highlightedIndex].click();
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      const combobox = input.closest('.combobox');
      if (combobox && !combobox.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  },

  _render(dropdownId, items, inputId) {
    const dropdown = document.getElementById(dropdownId);
    const inst = this._instances[inputId];
    inst.highlightedIndex = -1;

    if (items.length === 0) {
      dropdown.innerHTML = `<div class="combobox-option" style="color:var(--texto-muted);cursor:default;display:flex;align-items:center;gap:8px;justify-content:center;padding:1rem">${UI.emptyIcon("search")}<span>Sin resultados</span></div>`;
      return;
    }

    let html = '';
    items.forEach((item, index) => {
      html += `<div class="combobox-option" data-index="${index}" data-value="${item.value}" data-title="${Utils._escAttr(item.title)}">
        <div class="combobox-option-text">${Utils._esc(item.title)}</div>
        ${item.meta ? `<div class="combobox-option-meta">${Utils._esc(item.meta)}</div>` : ''}
      </div>`;
    });
    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.combobox-option[data-value]').forEach(opt => {
      opt.addEventListener('click', () => {
        const input = document.getElementById(inputId);
        const hidden = document.getElementById(inst.hiddenId);
        input.value = opt.dataset.title;
        hidden.value = opt.dataset.value;
        dropdown.classList.remove('open');
        if (inst.onChange) inst.onChange(opt.dataset.value, opt.dataset.title);
      });
    });
  },

  _updateHighlight(options, index) {
    options.forEach((opt, i) => {
      opt.classList.toggle('highlighted', i === index);
    });
    if (options[index]) options[index].scrollIntoView({ block: 'nearest' });
  },

  reset(inputId) {
    const input = document.getElementById(inputId);
    const inst = this._instances[inputId];
    if (input) input.value = '';
    if (inst) {
      const hidden = document.getElementById(inst.hiddenId);
      if (hidden) hidden.value = '';
    }
    const dropdownId = inputId.replace('pres-', 'dropdown-');
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) dropdown.classList.remove('open');
  }
};


// ══════════════════════════════════════════════════════════════
//  DASHBOARD — Panel principal con estadisticas (with sort)
// ══════════════════════════════════════════════════════════════

const Dashboard = {
  _ultimosPrestamos: [],
  _sortColumn: null,
  _sortDirection: 'asc',

  async render() {
    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();

      const totalLibros = Object.keys(mapLibros).length;
      const totalUsuarios = Object.keys(mapUsuarios).length;

      const prestamos = await Utils.cargarPrestamos();
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      this._ultimosPrestamos = [];

      prestamos.forEach((p) => {
        const data = p;

        const esDevuelto = (data.estado === "devuelto");
        const esActivo = !esDevuelto;

        if (esActivo) {
          activos++;
          const fechaDev = Utils.toDate(data.fechaDevolucion);
          if (fechaDev) {
            fechaDev.setHours(0, 0, 0, 0);
            if (fechaDev < hoy) vencidos++;
          }
        }

        const fechaP = Utils.toDate(data.fechaPrestamo);
        p._sortDate = fechaP ? fechaP.getTime() : 0;
        p._nombreLibro = Utils.nombreLibro(data, mapLibros);
        p._nombreUsu = Utils.nombreUsuario(data, mapUsuarios);
        this._ultimosPrestamos.push(p);
      });

      document.getElementById("stat-libros").textContent = totalLibros;
      document.getElementById("stat-activos").textContent = activos;
      document.getElementById("stat-vencidos").textContent = vencidos;
      document.getElementById("stat-usuarios").textContent = totalUsuarios;

      this._ultimosPrestamos.sort((a, b) => b._sortDate - a._sortDate);
      const ultimos5 = this._ultimosPrestamos.slice(0, 5);

      this._renderUltimos(ultimos5, hoy);

      // Init sortable headers for dashboard table
      Utils.initSortableHeaders("tabla-ultimos-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._renderUltimosSorted(hoy);
      });
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    }
  },

  _renderUltimos(ultimos5, hoy) {
    const tbody = document.getElementById("tabla-ultimos");
    let html = "";

    if (ultimos5.length === 0) {
      html = UI.emptyState("loan", "No hay préstamos registrados todavía.", 4);
    } else {
      ultimos5.forEach((p) => {
        let badge;
        if (p.estado === "devuelto") {
          badge = '<span class="badge badge-verde">Devuelto</span>';
        } else {
          const fechaDev = Utils.toDate(p.fechaDevolucion);
          const vencido = fechaDev && (fechaDev.setHours(0,0,0,0) < hoy.getTime());
          badge = vencido
            ? '<span class="badge badge-rojo">Vencido</span>'
            : '<span class="badge badge-azul">Activo</span>';
        }

        html += `
          <tr>
            <td><strong>${Utils._esc(p._nombreLibro)}</strong></td>
            <td>${Utils._esc(p._nombreUsu)}</td>
            <td>${Utils.formatDate(p.fechaDevolucion)}</td>
            <td>${badge}</td>
          </tr>`;
      });
    }

    tbody.innerHTML = html;
  },

  _renderUltimosSorted(hoy) {
    let sorted = [...this._ultimosPrestamos].slice(0, 5);
    if (this._sortColumn) {
      sorted = Utils.sortData(sorted, this._sortColumn, this._sortDirection, (item, col) => {
        if (col === 'libro') return item._nombreLibro || '';
        if (col === 'usuario') return item._nombreUsu || '';
        if (col === 'devolucion') return item._sortDate || 0;
        if (col === 'estado') return item.estado === 'devuelto' ? 'Devuelto' : (item.fechaDevolucion && Utils.daysDiff(item.fechaDevolucion) > 0 ? 'Vencido' : 'Activo');
        return '';
      });
    }
    this._renderUltimos(sorted, hoy);
  }
};


// ══════════════════════════════════════════════════════════════
//  REPORTES — Estadisticas de la biblioteca (with sort)
// ══════════════════════════════════════════════════════════════

const Reportes = {
  _ranking: [],

  async render() {
    const statsContainer = document.getElementById("stats-reportes");
    const tbody = document.getElementById("tabla-mas-prestados");

    try {
      const prestamosSnap = await getDocs(collection(db, "prestamos"));
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const librosSnap = await getDocs(collection(db, "libros"));

      let totalPrestamos = 0;
      let devueltos = 0;
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Check if date filter is active
      const filtroDesde = document.getElementById("filtro-reportes-desde")?.value;
      const filtroHasta = document.getElementById("filtro-reportes-hasta")?.value;
      const hayFiltroFecha = !!(filtroDesde || filtroHasta);

      const prestamosPorLibro = {};
      const prestamosPorUsuario = {};

      const mesActual = new Date();
      const primerDiaMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
      let prestamosMes = 0;

      let prestamosAlumnos = 0;
      let prestamosDocentes = 0;

      const usuariosMap = {};
      const usuariosNombres = {};
      usuariosSnap.forEach(d => {
        usuariosMap[d.id] = d.data();
        usuariosNombres[d.id] = d.data().nombre || "—";
      });

      const librosMap = {};
      librosSnap.forEach(d => {
        librosMap[d.id] = d.data();
      });

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();

        // Skip loans outside date range
        if (hayFiltroFecha && !Utils.filtrarPorFecha("filtro-reportes-desde", "filtro-reportes-hasta", data.fechaPrestamo)) return;

        totalPrestamos++;

        if (data.estado === "devuelto") devueltos++;
        else {
          activos++;
          const fechaDev = Utils.toDate(data.fechaDevolucion);
          if (fechaDev) {
            fechaDev.setHours(0, 0, 0, 0);
            if (fechaDev < hoy) vencidos++;
          }
        }

        const lid = data.libroId || data.libroTitulo;
        const tituloLibro = data.libroTitulo
          || (data.libroId && librosMap[data.libroId]?.titulo)
          || "—";
        const autorLibro = data.libroId && librosMap[data.libroId]?.autor
          ? librosMap[data.libroId].autor : "";
        if (!prestamosPorLibro[lid]) {
          prestamosPorLibro[lid] = { titulo: tituloLibro, autor: autorLibro, count: 0 };
        }
        prestamosPorLibro[lid].count++;

        if (data.usuarioId) {
          prestamosPorUsuario[data.usuarioId] = (prestamosPorUsuario[data.usuarioId] || 0) + 1;
        }

        const fechaP = Utils.toDate(data.fechaPrestamo);
        if (fechaP && fechaP >= primerDiaMes) prestamosMes++;

        const usu = usuariosMap[data.usuarioId];
        if (usu) {
          if (usu.tipo === "Alumno") prestamosAlumnos++;
          else prestamosDocentes++;
        }
      });

      this._ranking = Object.values(prestamosPorLibro)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((item, i) => ({ ...item, rank: i + 1 }));

      let topUsuario = { nombre: "—", cantidad: 0 };
      Object.entries(prestamosPorUsuario).forEach(([uid, cantidad]) => {
        if (cantidad > topUsuario.cantidad) {
          topUsuario = { nombre: usuariosNombres[uid] || "—", cantidad };
        }
      });

      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="label">Total prestamos</div>
          <div class="value">${totalPrestamos}</div>
          <div class="trend">${hayFiltroFecha ? "en el periodo seleccionado" : "historicos"}</div>
        </div>
        <div class="stat-card">
          <div class="label">Este mes</div>
          <div class="value" style="color:var(--verde)">${prestamosMes}</div>
          <div class="trend">nuevos prestamos</div>
        </div>
        <div class="stat-card">
          <div class="label">Devueltos</div>
          <div class="value">${devueltos}</div>
          <div class="trend">completados</div>
        </div>
        <div class="stat-card">
          <div class="label">Alumnos</div>
          <div class="value">${prestamosAlumnos}</div>
          <div class="trend">prestamos de alumnos</div>
        </div>
        <div class="stat-card">
          <div class="label">Docentes</div>
          <div class="value">${prestamosDocentes}</div>
          <div class="trend">prestamos de docentes</div>
        </div>
        <div class="stat-card">
          <div class="label">Usuario mas activo</div>
          <div class="value" style="font-size:18px;min-height:30px;display:flex;align-items:flex-end">${Utils._esc(topUsuario.nombre)}</div>
          <div class="trend">${topUsuario.cantidad} prestamos</div>
        </div>
      `;

      this._renderRanking();

      // Render charts
      this._renderCharts(prestamosSnap, usuariosMap, librosMap, hayFiltroFecha);

      // Init sortable headers for reportes table
      Utils.initSortableHeaders("tabla-reportes-wrapper", (column, direction) => {
        this._sortColumn = column;
        this._sortDirection = direction;
        this._renderRankingSorted();
      });
    } catch (error) {
      console.error("Error al cargar reportes:", error);
      statsContainer.innerHTML = `<p style="color:#B42318;padding:1rem">Error al cargar estadisticas.</p>`;
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:2rem;color:#B42318">Error.</td></tr>`;
    }
  },

  _renderRanking() {
    const tbody = document.getElementById("tabla-mas-prestados");
    let rankingHTML = "";
    if (this._ranking.length === 0) {
      rankingHTML = UI.emptyState("chart", "No hay datos suficientes.", 3);
    } else {
      this._ranking.forEach((libro, i) => {
        const medalla = libro.rank === 1 ? "🥇" : libro.rank === 2 ? "🥈" : libro.rank === 3 ? "🥉" : `${libro.rank}.`;
        rankingHTML += `
          <tr>
            <td>${medalla} <strong>${Utils._esc(libro.titulo)}</strong></td>
            <td>${Utils._esc(libro.autor)}</td>
            <td style="text-align:center"><span class="badge badge-azul">${libro.count}</span></td>
          </tr>`;
      });
    }
    tbody.innerHTML = rankingHTML;
  },

  _renderRankingSorted() {
    const tbody = document.getElementById("tabla-mas-prestados");
    let sorted = Utils.sortData(this._ranking, this._sortColumn, this._sortDirection, (item, col) => {
      if (col === 'titulo') return item.titulo || '';
      if (col === 'autor') return item.autor || '';
      if (col === 'count') return item.count || 0;
      return '';
    });
    let html = "";
    sorted.forEach((libro, i) => {
      const medalla = libro.rank === 1 ? "🥇" : libro.rank === 2 ? "🥈" : libro.rank === 3 ? "🥉" : `${libro.rank}.`;
      html += `
        <tr>
          <td>${medalla} <strong>${Utils._esc(libro.titulo)}</strong></td>
          <td>${Utils._esc(libro.autor)}</td>
          <td style="text-align:center"><span class="badge badge-azul">${libro.count}</span></td>
        </tr>`;
    });
    if (!html) {
      html = UI.emptyState("chart", "No hay datos suficientes.", 3);
    }
    tbody.innerHTML = html;
  },

  // ── Chart helpers ────────────────────────────────────────────
  _chartInstances: {},

  _chartColors() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const text = isDark ? "#cbd5e1" : "#374151";
    const grid = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";
    const tooltipBg = isDark ? "#1e293b" : "#fff";
    const tooltipText = isDark ? "#e2e8f0" : "#1f2937";
    return {
      text, grid, tooltipBg, tooltipText,
      primary: "#1c3e56",
      verde: "#1d9e75",
      rojo: "#A32D2D",
      azul: "#3b82f6",
      amarillo: "#d97706",
      verdeSoft: isDark ? "rgba(29,158,117,0.2)" : "rgba(29,158,117,0.15)",
      rojoSoft: isDark ? "rgba(163,45,45,0.2)" : "rgba(163,45,45,0.15)",
      azulSoft: isDark ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.15)",
    };
  },

  _chartDefaults() {
    const c = this._chartColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: c.text, font: { family: "'DM Sans','Montserrat',sans-serif", size: 12 }, padding: 14, usePointStyle: true, pointStyleWidth: 10 },
          position: "bottom",
        },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipText,
          bodyColor: c.tooltipText,
          borderColor: c.grid,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          titleFont: { family: "'DM Sans','Montserrat',sans-serif", weight: "600" },
          bodyFont: { family: "'DM Sans','Montserrat',sans-serif" },
        },
      },
    };
  },

  _destroyCharts() {
    Object.values(this._chartInstances).forEach(ch => ch.destroy());
    this._chartInstances = {};
  },

  _renderCharts(prestamosSnap, usuariosMap, librosMap, hayFiltroFecha) {
    this._destroyCharts();

    const filtroDesde = document.getElementById("filtro-reportes-desde")?.value;
    const filtroHasta = document.getElementById("filtro-reportes-hasta")?.value;

    // Gather filtered data
    const porMes = {};
    const porTipo = { Alumno: 0, Docente: 0, Administrativo: 0, "Sin tipo": 0 };
    const porEstado = { Activo: 0, Devuelto: 0, Vencido: 0 };
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    prestamosSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (hayFiltroFecha && !Utils.filtrarPorFecha("filtro-reportes-desde", "filtro-reportes-hasta", data.fechaPrestamo)) return;

      const fechaP = Utils.toDate(data.fechaPrestamo);

      // By month
      if (fechaP) {
        const key = `${fechaP.getFullYear()}-${String(fechaP.getMonth() + 1).padStart(2, "0")}`;
        porMes[key] = (porMes[key] || 0) + 1;
      }

      // By type
      const usu = usuariosMap[data.usuarioId];
      const tipo = usu?.tipo || "Sin tipo";
      if (porTipo[tipo] !== undefined) porTipo[tipo]++;
      else porTipo["Sin tipo"]++;

      // By status
      if (data.estado === "devuelto") porEstado.Devuelto++;
      else {
        const fechaDev = Utils.toDate(data.fechaDevolucion);
        if (fechaDev && fechaDev < hoy) porEstado.Vencido++;
        else porEstado.Activo++;
      }
    });

    // Sort months chronologically
    const sortedMonths = Object.keys(porMes).sort();

    // Determine x-axis range (last 6 months or filtered range)
    let labels;
    if (sortedMonths.length === 0) {
      labels = [];
    } else if (hayFiltroFecha && sortedMonths.length <= 12) {
      labels = sortedMonths;
    } else {
      // Show last 6 months
      labels = sortedMonths.slice(-6);
    }

    const data = labels.map(m => porMes[m] || 0);
    const displayLabels = labels.map(m => {
      const [y, mo] = m.split("-");
      const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      return `${meses[parseInt(mo) - 1]} ${y.slice(2)}`;
    });

    await Utils.loadChartJS();
    this._chartPrestamosMes(displayLabels, data);
    this._chartPorTipo(porTipo);
    this._chartEstado(porEstado);
  },

  // ── Chart: Préstamos por mes (line) ──────────────────────────
  _chartPrestamosMes(labels, data) {
    const ctx = document.getElementById("chart-prestamos-mes");
    if (!ctx) return;
    const c = this._chartColors();
    const defaults = this._chartDefaults();

    this._chartInstances.prestamosMes = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Prestamos",
          data,
          borderColor: c.primary,
          backgroundColor: c.azulSoft,
          fill: true,
          tension: 0.35,
          pointRadius: data.length > 12 ? 2 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: c.primary,
          borderWidth: 2.5,
        }],
      },
      options: {
        ...defaults,
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text, font: { size: 11 }, stepSize: 1 } },
        },
        plugins: {
          ...defaults.plugins,
          legend: { display: false },
        },
      },
    });
  },

  // ── Chart: Por tipo de usuario (doughnut) ────────────────────
  _chartPorTipo(porTipo) {
    const ctx = document.getElementById("chart-por-tipo");
    if (!ctx) return;
    const c = this._chartColors();
    const defaults = this._chartDefaults();

    // Filter out zero values
    const filtered = Object.entries(porTipo).filter(([, v]) => v > 0);
    if (filtered.length === 0) return;

    const colors = [c.primary, c.verde, c.amarillo, "#94a3b8"];
    const bgColors = filtered.map((_, i) => colors[i % colors.length]);

    this._chartInstances.porTipo = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: filtered.map(([k]) => k),
        datasets: [{
          data: filtered.map(([, v]) => v),
          backgroundColor: bgColors,
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        ...defaults,
        cutout: "60%",
        plugins: {
          ...defaults.plugins,
          legend: { ...defaults.plugins.legend, position: "bottom" },
        },
      },
    });
  },

  // ── Chart: Estado de préstamos (bar) ─────────────────────────
  _chartEstado(porEstado) {
    const ctx = document.getElementById("chart-estado");
    if (!ctx) return;
    const c = this._chartColors();
    const defaults = this._chartDefaults();

    this._chartInstances.estado = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Activos", "Devueltos", "Vencidos"],
        datasets: [{
          data: [porEstado.Activo, porEstado.Devuelto, porEstado.Vencido],
          backgroundColor: [c.azulSoft, c.verdeSoft, c.rojoSoft],
          borderColor: [c.azul, c.verde, c.rojo],
          borderWidth: 1.5,
          borderRadius: 6,
          maxBarThickness: 52,
        }],
      },
      options: {
        ...defaults,
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text, font: { size: 11 }, stepSize: 1 } },
        },
        plugins: {
          ...defaults.plugins,
          legend: { display: false },
        },
      },
    });
  },
};


// ══════════════════════════════════════════════════════════════
//  CONFIG — Configuracion general de la app
// ══════════════════════════════════════════════════════════════

const Config = {
  docId: "config-general",

  async cargar() {
    try {
      const docSnap = await getDoc(doc(db, "config", this.docId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById("cfg-nombre").value = data.nombreInstitucion || "";
        document.getElementById("cfg-dias").value = data.diasPrestamo || 7;
        document.getElementById("cfg-biblio").value = data.nombreBibliotecario || "";
      }
      // Ocultar/mostrar cards de carga masiva según rol
      const cardCargaMasiva = document.getElementById("card-carga-masiva");
      if (cardCargaMasiva) {
        cardCargaMasiva.style.display = Roles.puede("agregarLibro") ? "" : "none";
      }
      const cardCargaMasivaUsu = document.getElementById("card-carga-masiva-usuarios");
      if (cardCargaMasivaUsu) {
        cardCargaMasivaUsu.style.display = Roles.puede("agregarUsuario") ? "" : "none";
      }
    } catch (error) {
      console.error("Error al cargar configuracion:", error);
    }
  },

  async guardar() {
    const nombreInstitucion = document.getElementById("cfg-nombre").value.trim();
    const diasPrestamo = parseInt(document.getElementById("cfg-dias").value) || 7;
    const nombreBibliotecario = document.getElementById("cfg-biblio").value.trim();

    Utils.loading(true);

    try {
      await setDoc(doc(db, "config", this.docId), {
        nombreInstitucion, diasPrestamo, nombreBibliotecario,
        updatedAt: serverTimestamp()
      });

      AuditLog.registrar("configurar", "config", this.docId, `Configuración actualizada: ${diasPrestamo} días de préstamo`);

      UI.mostrarAlerta( "Configuracion guardada correctamente.");
    } catch (error) {
      console.error("Error al guardar configuracion:", error);
      UI.mostrarAlerta( "Error al guardar la configuracion.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async obtenerDias() {
    try {
      const docSnap = await getDoc(doc(db, "config", this.docId));
      if (docSnap.exists()) {
        return docSnap.data().diasPrestamo || 7;
      }
    } catch (error) {
      console.error("Error al obtener dias de prestamo:", error);
    }
    return 7;
  }
};


// ══════════════════════════════════════════════════════════════
//  INICIALIZACION
// ══════════════════════════════════════════════════════════════

// Hacer disponibles los objetos globalmente para los onclick del HTML
window.Utils = Utils;
window.Auth = Auth;
window.UI = UI;
window.Catalogo = Catalogo;
window.Usuarios = Usuarios;
window.Prestamos = Prestamos;
window.Config = Config;
window.Vencidos = Vencidos;
window.Notificaciones = Notificaciones;

// ══════════════════════════════════════════════════════════════
//  CARGA MASIVA — Importar libros desde Excel/CSV
// ══════════════════════════════════════════════════════════════

const CargaMasiva = {
  GENEROS_VALIDOS: ["Literatura", "Novela", "Texto escolar", "Historia", "Ciencias", "Matemática", "Arte", "Otro"],
  _datos: [],
  _errores: [],
  _archivo: null,
  _columnas: [],

  // ── Abrir / Cerrar modal ────────────────────────

  abrirModal() {
    this._resetState();
    UI.abrirModal("modal-carga-masiva");
    this._initDropzone();
    // Visibilidad según rol
    const card = document.getElementById("card-carga-masiva");
    if (card) card.style.display = Roles.puede("agregarLibro") ? "" : "none";
  },

  cerrarModal(event) {
    // Si se llama con event, solo cerrar si se hizo clic en el overlay (no en el modal)
    if (event && event.target && event.target.id !== "modal-carga-masiva") return;
    UI.cerrarModal("modal-carga-masiva");
    this._resetState();
  },

  _resetState() {
    this._datos = [];
    this._errores = [];
    this._archivo = [];
    this._columnas = [];

    document.getElementById("carga-paso-1").style.display = "";
    document.getElementById("carga-paso-2").style.display = "none";
    document.getElementById("carga-progreso").style.display = "none";
    document.getElementById("carga-resultado").style.display = "none";
    document.getElementById("carga-errores").style.display = "none";
    document.getElementById("carga-archivo").value = "";

    const dz = document.getElementById("carga-dropzone");
    if (dz) dz.classList.remove("drag-over");

    const btnImportar = document.getElementById("btn-importar-libros");
    if (btnImportar) {
      btnImportar.disabled = false;
      document.getElementById("btn-importar-texto").style.display = "";
      document.getElementById("btn-importar-spinner").style.display = "none";
    }

    document.getElementById("carga-progreso-bar").style.width = "0%";
  },

  volverPaso1() {
    this._archivo = null;
    this._datos = [];
    this._errores = [];
    this._columnas = [];
    document.getElementById("carga-paso-1").style.display = "";
    document.getElementById("carga-paso-2").style.display = "none";
    document.getElementById("carga-archivo").value = "";
  },

  // ── Descargar plantilla ─────────────────────────

  async descargarPlantilla() {
    await Utils.loadXLSX();
    const wsData = [
      ["titulo", "autor", "isbn", "genero", "ejemplares"],
      ["El principito", "Antoine de Saint-Exupéry", "978-987-01-0001-1", "Literatura", 3],
      ["Cien años de soledad", "Gabriel García Márquez", "978-987-01-0002-8", "Novela", 2],
      ["Matemática 1", "Autores Varios", "", "Matemática", 15],
      ["Historia Argentina", "José María Rosa", "", "Historia", 5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Ajustar anchos de columna
    ws["!cols"] = [
      { wch: 30 }, // titulo
      { wch: 30 }, // autor
      { wch: 22 }, // isbn
      { wch: 16 }, // genero
      { wch: 12 }, // ejemplares
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libros");
    XLSX.writeFile(wb, "plantilla_libros_biblioteca.xlsx");
  },

  // ── Dropzone (drag & drop + click) ──────────────

  _initDropzone() {
    const dz = document.getElementById("carga-dropzone");
    const input = document.getElementById("carga-archivo");
    if (!dz || !input) return;

    // Evitar listeners duplicados clonando el nodo
    const newDz = dz.cloneNode(true);
    dz.parentNode.replaceChild(newDz, dz);

    const dropzone = document.getElementById("carga-dropzone");
    const fileInput = document.getElementById("carga-archivo");

    // Click → abre selector
    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this._procesarArchivo(e.target.files[0]);
      }
    });

    // Drag & drop
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        this._procesarArchivo(e.dataTransfer.files[0]);
      }
    });
  },

  // ── Procesar archivo ────────────────────────────

  async _procesarArchivo(file) {
    const extensiones = [".xlsx", ".xls", ".csv"];
    const nombre = file.name.toLowerCase();
    if (!extensiones.some(ext => nombre.endsWith(ext))) {
      alert("Formato no soportado. Usá archivos .xlsx, .xls o .csv");
      return;
    }

    this._archivo = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

        if (filas.length === 0) {
          alert("El archivo está vacío o no tiene datos.");
          return;
        }

        this._parsearFilas(filas);
        this._mostrarPaso2();
      } catch (err) {
        console.error("Error al leer archivo:", err);
        alert("Error al procesar el archivo. Verificá que el formato sea correcto.");
      }
    };
    reader.readAsArrayBuffer(file);
  },

  _parsearFilas(filas) {
    this._datos = [];
    this._errores = [];

    filas.forEach((fila, idx) => {
      const titulo = String(fila.titulo || fila.Titulo || fila.TITULO || fila.title || fila.Title || "").trim();
      const autor = String(fila.autor || fila.Autor || fila.AUTOR || fila.author || fila.Author || "").trim();
      const isbn = String(fila.isbn || fila.ISBN || fila.Isbn || "").trim();
      const generoRaw = String(fila.genero || fila.Genero || fila.GENERO || fila.genre || "").trim();
      const ejemplaresRaw = parseInt(fila.ejemplares || fila.Ejemplares || fila.EJEMPLARES || fila.cantidad || 1) || 1;

      let genero = "Otro";
      if (generoRaw) {
        const match = this.GENEROS_VALIDOS.find(g =>
          g.toLowerCase() === generoRaw.toLowerCase() ||
          g.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === generoRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        );
        genero = match || "Otro";
      }

      if (!titulo || !autor) {
        this._errores.push(`Fila ${idx + 2}: falta titulo o autor`);
        return;
      }

      this._datos.push({ titulo, autor, isbn, genero, ejemplares: Math.max(1, ejemplaresRaw) });
    });

    // Definir columnas a mostrar en la vista previa
    this._columnas = ["titulo", "autor", "isbn", "genero", "ejemplares"];
  },

  // ── Paso 2: Vista previa ────────────────────────

  _mostrarPaso2() {
    // Cambiar de paso
    document.getElementById("carga-paso-1").style.display = "none";
    document.getElementById("carga-paso-2").style.display = "";

    // Nombre del archivo
    document.getElementById("carga-nombre-archivo").textContent =
      `${this._archivo.name} (${this._formatSize(this._archivo.size)})`;

    // Header de la tabla
    const head = document.getElementById("carga-previa-head");
    const etiquetas = { titulo: "Titulo", autor: "Autor", isbn: "ISBN", genero: "Genero", ejemplares: "Ejemplares" };
    head.innerHTML = `<tr>${this._columnas.map(col =>
      `<th${col === "ejemplares" ? ' style="text-align:center"' : ""}>${etiquetas[col] || col}</th>`
    ).join("")}</tr>`;

    // Body: máximo 100 filas de preview
    const preview = this._datos.slice(0, 100);
    const tbody = document.getElementById("carga-previa-body");
    tbody.innerHTML = preview.map(libro => `<tr>${this._columnas.map(col => {
      const val = libro[col];
      if (col === "ejemplares") return `<td style="text-align:center">${val}</td>`;
      if (col === "genero") return `<td><span class="badge badge-azul" style="font-size:0.7rem">${Utils._esc(val)}</span></td>`;
      return `<td>${Utils._esc(val || "—")}</td>`;
    }).join("")}</tr>`).join("");

    if (this._datos.length > 100) {
      tbody.innerHTML += `<tr><td colspan="${this._columnas.length}" style="text-align:center;padding:10px;color:var(--texto-muted);font-style:italic">... y ${this._datos.length - 100} filas más</td></tr>`;
    }

    // Contador
    document.getElementById("carga-contador").textContent = this._datos.length;

    // Errores
    const errBox = document.getElementById("carga-errores");
    if (this._errores.length > 0) {
      errBox.style.display = "";
      errBox.innerHTML = `<strong>${this._errores.length} fila${this._errores.length > 1 ? "s" : ""} ignorada${this._errores.length > 1 ? "s" : ""}:</strong><br>` +
        this._errores.slice(0, 5).join("<br>") +
        (this._errores.length > 5 ? `<br>... y ${this._errores.length - 5} más` : "");
    } else {
      errBox.style.display = "none";
    }

    // Resetear progreso y resultado
    document.getElementById("carga-progreso").style.display = "none";
    document.getElementById("carga-resultado").style.display = "none";
    document.getElementById("carga-progreso-bar").style.width = "0%";

    // Re-habilitar botón importar
    const btn = document.getElementById("btn-importar-libros");
    btn.disabled = false;
    document.getElementById("btn-importar-texto").style.display = "";
    document.getElementById("btn-importar-texto").textContent = "Importar Libros →";
    document.getElementById("btn-importar-spinner").style.display = "none";
  },

  // ── Importar (ejecutar) ────────────────────────

  async importar() {
    if (this._datos.length === 0) return;

    const btn = document.getElementById("btn-importar-libros");
    const progreso = document.getElementById("carga-progreso");
    const barra = document.getElementById("carga-progreso-bar");
    const label = document.getElementById("carga-progreso-label");
    const count = document.getElementById("carga-progreso-count");
    const resultado = document.getElementById("carga-resultado");

    // UI: estado importando
    btn.disabled = true;
    document.getElementById("btn-importar-texto").style.display = "none";
    document.getElementById("btn-importar-spinner").style.display = "";
    progreso.style.display = "";
    resultado.style.display = "none";

    try {
      // Check if ISBN auto-search is enabled
      const buscarISBNCheck = document.getElementById("carga-buscar-isbn");
      const librosAModificar = [...this._datos];
      
      if (buscarISBNCheck && buscarISBNCheck.checked) {
        // Show progress for ISBN search
        progreso.style.display = "";
        label.textContent = "Buscando ISBNs y portadas...";
        barra.style.width = "0%";

        const isbnResultados = await OpenLibraryAPI.buscarLote(librosAModificar);

        // Apply results
        for (const [idx, resultado] of Object.entries(isbnResultados)) {
          const i = parseInt(idx);
          if (resultado.isbn) {
            librosAModificar[i].isbn = resultado.isbn;
          }
          if (resultado.coverURL) {
            librosAModificar[i].coverURL = resultado.coverURL;
          }
        }

        barra.style.width = "30%";
        label.textContent = "Guardando en Firestore...";
      }

      const BATCH_SIZE = 500;
      const total = librosAModificar.length;
      let procesados = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const lote = librosAModificar.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        lote.forEach(libro => {
          const docRef = doc(collection(db, "libros"));
          batch.set(docRef, {
            titulo: libro.titulo,
            autor: libro.autor,
            isbn: libro.isbn || "",
            genero: libro.genero,
            ejemplares: libro.ejemplares,
            disponibles: libro.ejemplares,
            coverURL: libro.coverURL || "",
            createdAt: serverTimestamp()
          });
        });

        await batch.commit();
        procesados += lote.length;

        let pct;
        if (buscarISBNCheck && buscarISBNCheck.checked) {
          pct = 30 + Math.round((procesados / total) * 70);
        } else {
          pct = Math.round((procesados / total) * 100);
        }
        barra.style.width = pct + "%";
        label.textContent = "Procesando...";
        count.textContent = `${procesados}/${total}`;
      }

      Utils.invalidarCache();
      // Audit log
      AuditLog.registrar("crear", "libro", null,
        `Carga masiva: ${total} libros importados desde "${this._archivo?.name || "archivo"}"`);

      // UI: completado
      label.textContent = "Completado";
      barra.style.width = "100%";
      document.getElementById("btn-importar-texto").style.display = "";
      document.getElementById("btn-importar-texto").textContent = "Importado!";
      document.getElementById("btn-importar-spinner").style.display = "none";

      resultado.style.display = "";
      resultado.style.background = "var(--verde-claro)";
      resultado.style.color = "var(--verde-oscuro)";
      resultado.style.border = "1px solid var(--verde)";
      resultado.innerHTML = `<strong>${total} libros</strong> importados correctamente.`;

      // Cerrar modal y refrescar catálogo
      setTimeout(() => {
        this.cerrarModal();
        Catalogo.render();
        UI.mostrarAlerta( `${total} libros importados correctamente.`, "success", 4000);
      }, 1500);

    } catch (error) {
      console.error("Error en carga masiva:", error);
      label.textContent = "Error";
      document.getElementById("btn-importar-texto").style.display = "";
      document.getElementById("btn-importar-texto").textContent = "Reintentar →";
      document.getElementById("btn-importar-spinner").style.display = "none";
      btn.disabled = false;

      resultado.style.display = "";
      resultado.style.background = "#FEF3F2";
      resultado.style.color = "#A32D2D";
      resultado.style.border = "1px solid #FECDC9";
      resultado.innerHTML = `Error al importar: ${error.message || "Error desconocido"}. Intentá de nuevo.`;
    }
  },

  // ── Utilidad ────────────────────────────────────

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
};

window.CargaMasiva = CargaMasiva;

// ══════════════════════════════════════════════════════════════
//  CARGA MASIVA — Importar usuarios desde Excel/CSV
// ══════════════════════════════════════════════════════════════

const CargaMasivaUsuarios = {
  TIPOS_VALIDOS: ["Alumno", "Docente", "Administrativo"],
  _datos: [],
  _errores: [],
  _archivo: null,
  _columnas: [],

  abrirModal() {
    this._resetState();
    UI.abrirModal("modal-carga-masiva-usuarios");
    this._initDropzone();
  },

  cerrarModal(event) {
    if (event && event.target && event.target.id !== "modal-carga-masiva-usuarios") return;
    UI.cerrarModal("modal-carga-masiva-usuarios");
    this._resetState();
  },

  _resetState() {
    this._datos = [];
    this._errores = [];
    this._archivo = null;
    this._columnas = [];

    document.getElementById("carga-usuarios-paso-1").style.display = "";
    document.getElementById("carga-usuarios-paso-2").style.display = "none";
    document.getElementById("carga-usuarios-progreso").style.display = "none";
    document.getElementById("carga-usuarios-resultado").style.display = "none";
    document.getElementById("carga-usuarios-errores").style.display = "none";
    document.getElementById("carga-usuarios-archivo").value = "";

    const dz = document.getElementById("carga-usuarios-dropzone");
    if (dz) dz.classList.remove("drag-over");

    const btnImportar = document.getElementById("btn-importar-usuarios");
    if (btnImportar) {
      btnImportar.disabled = false;
      document.getElementById("btn-importar-usuarios-texto").style.display = "";
      document.getElementById("btn-importar-usuarios-spinner").style.display = "none";
    }
    document.getElementById("carga-usuarios-progreso-bar").style.width = "0%";
  },

  volverPaso1() {
    this._archivo = null;
    this._datos = [];
    this._errores = [];
    this._columnas = [];
    document.getElementById("carga-usuarios-paso-1").style.display = "";
    document.getElementById("carga-usuarios-paso-2").style.display = "none";
    document.getElementById("carga-usuarios-archivo").value = "";
  },

  async descargarPlantilla() {
    await Utils.loadXLSX();
    const wsData = [
      ["nombre", "dni", "email", "tipo"],
      ["Juan Pérez", "35123456", "", "Alumno"],
      ["María García", "30987654", "mgarcia@correo.com", "Docente"],
      ["Carlos López", "28111222", "clopez@correo.com", "Administrativo"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 28 },
      { wch: 14 },
      { wch: 28 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    XLSX.writeFile(wb, "plantilla_usuarios_biblioteca.xlsx");
  },

  _initDropzone() {
    const dz = document.getElementById("carga-usuarios-dropzone");
    const input = document.getElementById("carga-usuarios-archivo");
    if (!dz || !input) return;

    const newDz = dz.cloneNode(true);
    dz.parentNode.replaceChild(newDz, dz);

    const dropzone = document.getElementById("carga-usuarios-dropzone");
    const fileInput = document.getElementById("carga-usuarios-archivo");

    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) this._procesarArchivo(e.target.files[0]);
    });
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove("drag-over");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) this._procesarArchivo(e.dataTransfer.files[0]);
    });
  },

  async _procesarArchivo(file) {
    const extensiones = [".xlsx", ".xls", ".csv"];
    const nombre = file.name.toLowerCase();
    if (!extensiones.some(ext => nombre.endsWith(ext))) {
      UI.toast("Formato no soportado. Usá archivos .xlsx, .xls o .csv", "danger");
      return;
    }
    this._archivo = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

        if (filas.length === 0) {
          UI.toast("El archivo está vacío o no tiene datos.", "danger");
          return;
        }
        this._parsearFilas(filas);
        this._mostrarPaso2();
      } catch (err) {
        console.error("Error al leer archivo:", err);
        UI.toast("Error al procesar el archivo.", "danger");
      }
    };
    reader.readAsArrayBuffer(file);
  },

  _parsearFilas(filas) {
    this._datos = [];
    this._errores = [];

    filas.forEach((fila, idx) => {
      const nombre = String(fila.nombre || fila.Nombre || fila.NOMBRE || "").trim();
      const dni = String(fila.dni || fila.Dni || fila.DNI || "").trim();
      const email = String(fila.email || fila.Email || fila.EMAIL || fila.correo || "").trim();
      const tipoRaw = String(fila.tipo || fila.Tipo || fila.TIPO || "").trim();

      if (!nombre) {
        this._errores.push(`Fila ${idx + 2}: falta nombre`);
        return;
      }
      if (!dni) {
        this._errores.push(`Fila ${idx + 2}: falta DNI`);
        return;
      }

      let tipo = "Alumno";
      if (tipoRaw) {
        const match = this.TIPOS_VALIDOS.find(t =>
          t.toLowerCase() === tipoRaw.toLowerCase()
        );
        tipo = match || "Alumno";
      }

      this._datos.push({ nombre, dni, email, tipo });
    });

    this._columnas = ["nombre", "dni", "email", "tipo"];
  },

  _mostrarPaso2() {
    document.getElementById("carga-usuarios-paso-1").style.display = "none";
    document.getElementById("carga-usuarios-paso-2").style.display = "";

    document.getElementById("carga-usuarios-nombre-archivo").textContent =
      `${this._archivo.name} (${this._formatSize(this._archivo.size)})`;

    const head = document.getElementById("carga-usuarios-previa-head");
    const etiquetas = { nombre: "Nombre", dni: "DNI", email: "Email", tipo: "Tipo" };
    head.innerHTML = `<tr>${this._columnas.map(col =>
      `<th>${etiquetas[col] || col}</th>`
    ).join("")}</tr>`;

    const preview = this._datos.slice(0, 100);
    const tbody = document.getElementById("carga-usuarios-previa-body");
    tbody.innerHTML = preview.map(u => `<tr>${this._columnas.map(col => {
      const val = u[col];
      if (col === "tipo") {
        const cls = val === "Administrativo" ? "badge-amarillo" : val === "Docente" ? "badge-azul" : "badge-verde";
        return `<td><span class="badge ${cls}" style="font-size:0.7rem">${Utils._esc(val)}</span></td>`;
      }
      if (col === "email") return `<td>${val ? Utils._esc(val) : '<span style="color:var(--texto-muted)">—</span>'}</td>`;
      return `<td>${Utils._esc(val)}</td>`;
    }).join("")}</tr>`).join("");

    if (this._datos.length > 100) {
      tbody.innerHTML += `<tr><td colspan="${this._columnas.length}" style="text-align:center;padding:10px;color:var(--texto-muted);font-style:italic">... y ${this._datos.length - 100} filas más</td></tr>`;
    }

    document.getElementById("carga-usuarios-contador").textContent = this._datos.length;

    const errBox = document.getElementById("carga-usuarios-errores");
    if (this._errores.length > 0) {
      errBox.style.display = "";
      errBox.innerHTML = `<strong>${this._errores.length} fila${this._errores.length > 1 ? "s" : ""} ignorada${this._errores.length > 1 ? "s" : ""}:</strong><br>` +
        this._errores.slice(0, 5).join("<br>") +
        (this._errores.length > 5 ? `<br>... y ${this._errores.length - 5} más` : "");
    } else {
      errBox.style.display = "none";
    }

    document.getElementById("carga-usuarios-progreso").style.display = "none";
    document.getElementById("carga-usuarios-resultado").style.display = "none";
    document.getElementById("carga-usuarios-progreso-bar").style.width = "0%";

    const btn = document.getElementById("btn-importar-usuarios");
    btn.disabled = false;
    document.getElementById("btn-importar-usuarios-texto").style.display = "";
    document.getElementById("btn-importar-usuarios-texto").textContent = "Importar Usuarios →";
    document.getElementById("btn-importar-usuarios-spinner").style.display = "none";
  },

  async importar() {
    if (this._datos.length === 0) return;

    const btn = document.getElementById("btn-importar-usuarios");
    const progreso = document.getElementById("carga-usuarios-progreso");
    const barra = document.getElementById("carga-usuarios-progreso-bar");
    const label = document.getElementById("carga-usuarios-progreso-label");
    const count = document.getElementById("carga-usuarios-progreso-count");
    const resultado = document.getElementById("carga-usuarios-resultado");

    btn.disabled = true;
    document.getElementById("btn-importar-usuarios-texto").style.display = "none";
    document.getElementById("btn-importar-usuarios-spinner").style.display = "";
    progreso.style.display = "";
    resultado.style.display = "none";

    try {
      const BATCH_SIZE = 500;
      const total = this._datos.length;
      let procesados = 0;
      let conCuenta = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const lote = this._datos.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const usuario of lote) {
          const docRef = doc(collection(db, "usuarios"));
          const docData = {
            nombre: usuario.nombre,
            tipo: usuario.tipo,
            dni: usuario.dni,
            createdAt: serverTimestamp()
          };
          if (usuario.email) {
            docData.email = usuario.email;
            conCuenta++;
          }
          batch.set(docRef, docData);
        }

        await batch.commit();
        procesados += lote.length;

        const pct = Math.round((procesados / total) * 100);
        barra.style.width = pct + "%";
        label.textContent = "Procesando...";
        count.textContent = `${procesados}/${total}`;
      }

      Utils.invalidarCache();
      AuditLog.registrar("crear", "usuario", null,
        `Carga masiva: ${total} usuarios importados (${conCuenta} con cuenta) desde "${this._archivo?.name || "archivo"}"`);

      label.textContent = "Completado";
      barra.style.width = "100%";
      document.getElementById("btn-importar-usuarios-texto").style.display = "";
      document.getElementById("btn-importar-usuarios-texto").textContent = "Importado!";
      document.getElementById("btn-importar-usuarios-spinner").style.display = "none";

      resultado.style.display = "";
      resultado.style.background = "var(--verde-claro)";
      resultado.style.color = "var(--verde-oscuro)";
      resultado.style.border = "1px solid var(--verde)";
      resultado.innerHTML = `<strong>${total} usuarios</strong> importados correctamente.${conCuenta > 0 ? ` (${conCuenta} con email para cuenta de acceso)` : ""}`;

      setTimeout(() => {
        this.cerrarModal();
        Usuarios.render();
        UI.mostrarAlerta(`${total} usuarios importados correctamente.`, "success", 4000);
      }, 1500);

    } catch (error) {
      console.error("Error en carga masiva de usuarios:", error);
      label.textContent = "Error";
      document.getElementById("btn-importar-usuarios-texto").style.display = "";
      document.getElementById("btn-importar-usuarios-texto").textContent = "Reintentar →";
      document.getElementById("btn-importar-usuarios-spinner").style.display = "none";
      btn.disabled = false;

      resultado.style.display = "";
      resultado.style.background = "#FEF3F2";
      resultado.style.color = "#A32D2D";
      resultado.style.border = "1px solid #FECDC9";
      resultado.innerHTML = `Error al importar: ${error.message || "Error desconocido"}. Intentá de nuevo.`;
    }
  },

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
};

window.CargaMasivaUsuarios = CargaMasivaUsuarios;

// ══════════════════════════════════════════════════════════════
//  EXPORTAR — Exportacion a PDF y XLSX
// ══════════════════════════════════════════════════════════════

const Exportar = {
  _tipo: "", // 'catalogo' o 'prestamos'

  abrirModal(tipo) {
    this._tipo = tipo;
    const subtitulo = document.getElementById("exportar-subtitulo");
    if (tipo === "catalogo") {
      subtitulo.textContent = "Exporta el catalogo de libros respetando los filtros activos.";
    } else {
      subtitulo.textContent = "Exporta los prestamos respetando los filtros activos.";
    }
    UI.abrirModal("modal-exportar");
  },

  async ejecutar(formato) {
    Utils.loading(true);
    try {
      if (formato === "pdf") await Utils.loadJsPDF();
      else await Utils.loadXLSX();
      if (this._tipo === "catalogo") {
        if (formato === "pdf") await this._catalogoPDF();
        else await this._catalogoXLSX();
      } else {
        if (formato === "pdf") await this._prestamosPDF();
        else await this._prestamosXLSX();
      }
      UI.cerrarModal("modal-exportar");
      UI.toast("Exportacion exitosa", "success");
    } catch (error) {
      console.error("Error al exportar:", error);
      UI.toast(error.message || "Error al exportar los datos.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  // ── Helpers ──────────────────────────────────────────────────
  _hoy() {
    return new Date().toLocaleDateString("es-AR");
  },

  _fechaStr(fecha) {
    if (!fecha) return "";
    const d = Utils.toDate(fecha);
    return d ? d.toLocaleDateString("es-AR") : "";
  },

  // ── CATALOGO PDF ────────────────────────────────────────────
  async _catalogoPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const data = Catalogo._data;

    // Logo
    try {
      const logoImg = await this._loadImage("assets/logo-cebas48.png");
      doc.addImage(logoImg, "PNG", 14, 10, 12, 12);
    } catch (e) { /* no logo, skip */ }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(28, 62, 86); // #1c3e56
    doc.text("Biblioteca CEBAS 2", 29, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(107, 114, 128);
    doc.text("Catalogo de libros", 29, 21);

    // Date
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(`Fecha: ${this._hoy()}`, 195, 21, { align: "right" });

    // Line
    doc.setDrawColor(28, 62, 86);
    doc.setLineWidth(0.5);
    doc.line(14, 26, 195, 26);

    // Stats
    const totalEj = data.reduce((s, l) => s + (l.ejemplares || 0), 0);
    const totalDisp = data.reduce((s, l) => s + (l.disponibles || 0), 0);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 62, 86);
    doc.text(`${data.length} titulos  |  ${totalEj} ejemplares  |  ${totalDisp} disponibles  |  ${totalEj - totalDisp} prestados`, 14, 32);

    // Table
    const head = [["Titulo", "Autor", "ISBN", "Genero", "Ej.", "Disp."]];
    const body = data.map(l => [
      l.titulo || "",
      l.autor || "",
      l.isbn || "",
      l.genero || "",
      String(l.ejemplares || 0),
      String(l.disponibles || 0),
    ]);

    doc.autoTable({
      head, body,
      startY: 36,
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: [28, 62, 86],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: "bold",
        cellPadding: 3,
      },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 40 },
        2: { cellWidth: 38 },
        3: { cellWidth: 28 },
        4: { cellWidth: 12, halign: "center" },
        5: { cellWidth: 14, halign: "center" },
      },
      styles: { overflow: "linebreak" },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text("Biblioteca CEBAS 2 - Documento generado automaticamente", 14, 287);
      doc.text(`Pagina ${i} de ${pageCount}`, 195, 287, { align: "right" });
      doc.setDrawColor(28, 62, 86);
      doc.setLineWidth(0.3);
      doc.line(14, 283, 195, 283);
    }

    doc.save(`catalogo_biblioteca_${this._dateSlug()}.pdf`);
  },

  // ── CATALOGO XLSX ───────────────────────────────────────────
  async _catalogoXLSX() {
    const data = Catalogo._data;
    const rows = [["Titulo", "Autor", "ISBN", "Genero", "Ejemplares", "Disponibles"]];
    data.forEach(l => {
      rows.push([l.titulo || "", l.autor || "", l.isbn || "", l.genero || "", l.ejemplares || 0, l.disponibles || 0]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
    XLSX.writeFile(wb, `catalogo_biblioteca_${this._dateSlug()}.xlsx`);
  },

  // ── PRESTAMOS PDF ───────────────────────────────────────────
  async _prestamosPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const data = Prestamos._data;

    // Logo
    try {
      const logoImg = await this._loadImage("assets/logo-cebas48.png");
      doc.addImage(logoImg, "PNG", 14, 10, 12, 12);
    } catch (e) { /* no logo */ }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(28, 62, 86);
    doc.text("Biblioteca CEBAS 2", 29, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(107, 114, 128);
    doc.text("Registro de prestamos", 29, 21);

    // Date
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text(`Fecha: ${this._hoy()}`, 195, 21, { align: "right" });

    // Line
    doc.setDrawColor(28, 62, 86);
    doc.setLineWidth(0.5);
    doc.line(14, 26, 195, 26);

    // Stats
    const activos = data.filter(p => p.estado === "Activo").length;
    const vencidos = data.filter(p => p.estado === "Vencido").length;
    const devueltos = data.filter(p => p.estado === "Devuelto").length;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 62, 86);
    doc.text(`${data.length} total  |  ${activos} activos  |  ${vencidos} vencidos  |  ${devueltos} devueltos`, 14, 32);

    // Table
    const head = [["Libro", "Usuario", "Prestamo", "Devolucion", "Estado"]];
    const body = data.map(p => [
      p.nombreLibro || p.libroTitulo || "",
      p.nombreUsu || p.usuarioNombre || "",
      this._fechaStr(p.fechaPrestamo),
      this._fechaStr(p.fechaDevolucion),
      p.estado || "",
    ]);

    doc.autoTable({
      head, body,
      startY: 36,
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: [28, 62, 86],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: "bold",
        cellPadding: 3,
      },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 20 },
      },
      styles: { overflow: "linebreak" },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text("Biblioteca CEBAS 2 - Documento generado automaticamente", 14, 287);
      doc.text(`Pagina ${i} de ${pageCount}`, 195, 287, { align: "right" });
      doc.setDrawColor(28, 62, 86);
      doc.setLineWidth(0.3);
      doc.line(14, 283, 195, 283);
    }

    doc.save(`prestamos_biblioteca_${this._dateSlug()}.pdf`);
  },

  // ── PRESTAMOS XLSX ──────────────────────────────────────────
  async _prestamosXLSX() {
    const data = Prestamos._data;
    const rows = [["Libro", "Usuario", "Fecha prestamo", "Devolucion", "Estado"]];
    data.forEach(p => {
      rows.push([
        p.nombreLibro || p.libroTitulo || "",
        p.nombreUsu || p.usuarioNombre || "",
        this._fechaStr(p.fechaPrestamo),
        this._fechaStr(p.fechaDevolucion),
        p.estado || "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 35 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prestamos");
    XLSX.writeFile(wb, `prestamos_biblioteca_${this._dateSlug()}.xlsx`);
  },

  // ── Utilities ───────────────────────────────────────────────
  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  },

  _dateSlug() {
    return new Date().toISOString().slice(0, 10);
  },
};

window.Exportar = Exportar;

// ══════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ══════════════════════════════════════════════════════════════

// Cerrar modales con Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".overlay.open").forEach(modal => {
      modal.classList.remove("open");
    });
  }
});

// Cerrar modal al hacer clic en el overlay (fuera del modal)
document.querySelectorAll(".overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("open");
      // Only reset the specific modal that was closed
      if (overlay.id === "modal-usuario") Usuarios._prepararModalAgregar();
    }
  });
});

// Configurar modal de usuario al abrirlo (preparar para agregar)
document.getElementById("btn-guardar-usuario")?.addEventListener("click", () => {});

// Feature 1: Close notification dropdown when clicking outside
document.addEventListener("click", (e) => {
  const wrapper = document.getElementById("notif-wrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    Notificaciones.cerrar();
  }
});

// Iniciar el listener de autenticacion
Auth.init();

// Aplicar tema guardado (dark/light) antes de que se renderice nada
UI.aplicarTemaGuardado();

console.log("BiblioEscolar inicializado correctamente.");

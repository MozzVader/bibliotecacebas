// ══════════════════════════════════════════════════════════════
//  BiblioEscolar — app.js
//  Logica completa de la SPA con Firebase
// ══════════════════════════════════════════════════════════════

import {
  auth, db, secondaryAuth,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════════════════

const Utils = {
  formatDate(fecha) {
    if (!fecha) return "—";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  },

  toInputDate(fecha) {
    if (!fecha) return "";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toISOString().split("T")[0];
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
    const fin = fechaFin.toDate ? fechaFin.toDate() : new Date(fechaFin);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fin.setHours(0, 0, 0, 0);
    return Math.ceil((hoy - fin) / (1000 * 60 * 60 * 24));
  },

  loading(show) {
    const el = document.getElementById("loading-overlay");
    if (show) {
      el.style.display = "flex";
    } else {
      el.style.display = "none";
    }
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  toDate(fecha) {
    if (!fecha) return null;
    if (fecha.toDate) return fecha.toDate();
    if (fecha instanceof Date) return fecha;
    if (typeof fecha === "string" || typeof fecha === "number") return new Date(fecha);
    return new Date(fecha);
  },

  async cargarNombres() {
    const [librosSnap, usuariosSnap] = await Promise.all([
      getDocs(collection(db, "libros")),
      getDocs(collection(db, "usuarios"))
    ]);
    const mapLibros = {};
    const mapUsuarios = {};
    librosSnap.forEach(d => { mapLibros[d.id] = d.data().titulo || "—"; });
    usuariosSnap.forEach(d => { mapUsuarios[d.id] = d.data().nombre || "—"; });
    return { mapLibros, mapUsuarios };
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

    switch (seccion) {
      case "inicio":    Dashboard.render(); break;
      case "catalogo":  Catalogo.render(); break;
      case "prestamos": Prestamos.render(); break;
      case "usuarios":  Usuarios.render(); break;
      case "vencidos":  Vencidos.render(); break;
      case "reportes":  Reportes.render(); break;
      case "config":    Config.cargar(); break;
    }
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

  mostrarAlerta(id, mensaje, tipo = "success", duracion = 3000) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = mensaje;
    el.className = "alert alert-" + tipo + " show";
    setTimeout(() => {
      el.classList.remove("show");
    }, duracion);
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
    administrativo: { inicio: true, catalogo: true, prestamos: true, usuarios: true, vencidos: true, reportes: true, config: true },
    docente:        { inicio: true, catalogo: true, prestamos: true, usuarios: false, vencidos: true, reportes: true, config: false },
    alumno:         { inicio: true, catalogo: true, prestamos: false, usuarios: false, vencidos: false, reportes: true, config: false }
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
    document.querySelectorAll(".nav-item[data-sec]").forEach(item => {
      const sec = item.dataset.sec;
      if (!this.puedeVer(sec)) {
        item.style.display = "none";
      } else {
        item.style.display = "";
      }
    });
    document.querySelectorAll(".nav-section").forEach(section => {
      const items = section.querySelectorAll(".nav-item");
      const visibleItems = Array.from(items).filter(i => i.style.display !== "none");
      const divider = section.nextElementSibling;
      if (visibleItems.length === 0) {
        section.style.display = "none";
        if (divider && divider.classList.contains("nav-divider")) {
          divider.style.display = "none";
        }
      } else {
        section.style.display = "";
        if (divider && divider.classList.contains("nav-divider")) {
          divider.style.display = "";
        }
      }
    });
  },

  aplicarBotones(seccion) {
    switch (seccion) {
      case "catalogo": {
        const btnAgregarLibro = document.querySelector("#sec-catalogo .search-bar .btn-primary");
        if (btnAgregarLibro) btnAgregarLibro.style.display = this.puede("agregarLibro") ? "" : "none";
        document.querySelectorAll("#tabla-catalogo .btn-sm, #tabla-catalogo .btn-danger").forEach(btn => {
          if (btn.textContent.trim() === "" || btn.title === "Editar" || btn.title === "Eliminar") {
            btn.style.display = this.puede("editarLibro") ? "" : "none";
          }
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
        const btnAgregarPres = document.querySelector("#sec-prestamos .toolbar .btn-primary");
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
  mostrarRegistro() {
    document.getElementById("form-login").style.display = "none";
    document.getElementById("form-registro").style.display = "";
    document.getElementById("login-subtitle-text").textContent = "Creá tu cuenta";
    document.getElementById("login-error").className = "alert alert-danger";
    document.getElementById("registro-error").className = "alert alert-danger";
  },

  mostrarLogin() {
    document.getElementById("form-login").style.display = "";
    document.getElementById("form-registro").style.display = "none";
    document.getElementById("login-subtitle-text").textContent = "Ingresá para continuar";
    document.getElementById("registro-error").className = "alert alert-danger";
  },

  /**
   * Registra un nuevo usuario desde la pantalla de login.
   * Crea cuenta en Auth + documento en Firestore "usuarios".
   * Se le asigna tipo "Alumno" por defecto (no se puede elegir rol).
   */
  async registrar() {
    const nombre   = document.getElementById("reg-nombre").value.trim();
    const dni      = document.getElementById("reg-dni").value.trim();
    const email    = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    const errorEl  = document.getElementById("registro-error");

    // Validaciones
    if (!nombre) {
      errorEl.textContent = "El nombre es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (!dni) {
      errorEl.textContent = "El DNI es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (!email) {
      errorEl.textContent = "El email es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (password !== password2) {
      errorEl.textContent = "Las contraseñas no coinciden.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    Utils.loading(true);
    errorEl.className = "alert alert-danger";

    try {
      // 1) Crear la cuenta en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // 2) Crear documento en Firestore con tipo "Alumno" por defecto
      await addDoc(collection(db, "usuarios"), {
        authUid: uid,
        nombre,
        dni,
        email,
        tipo: "Alumno",
        createdAt: serverTimestamp()
      });

      // La sesion queda iniciada automaticamente.
      // onAuthStateChanged se encarga del resto.
    } catch (error) {
      let msg = "Error al crear la cuenta.";
      switch (error.code) {
        case "auth/email-already-in-use":
          msg = "Ya existe una cuenta con ese email.";
          break;
        case "auth/invalid-email":
          msg = "El formato del email no es valido.";
          break;
        case "auth/weak-password":
          msg = "La contraseña es demasiado debil (minimo 6 caracteres).";
          break;
      }
      errorEl.textContent = msg;
      errorEl.className = "alert alert-danger show";
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Inicia sesion con email y password
   */
  async login() {
    const email    = document.getElementById("login-usuario").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl  = document.getElementById("login-error");

    if (!email || !password) {
      errorEl.textContent = "Completá email y contraseña.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    Utils.loading(true);
    errorEl.className = "alert alert-danger";

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      let msg = "Error al iniciar sesion.";
      switch (error.code) {
        case "auth/user-not-found":
          msg = "No existe una cuenta con ese email.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          msg = "Contraseña incorrecta.";
          break;
        case "auth/invalid-email":
          msg = "El formato del email no es valido.";
          break;
        case "auth/too-many-requests":
          msg = "Demasiados intentos. Espera unos minutos.";
          break;
      }
      errorEl.textContent = msg;
      errorEl.className = "alert alert-danger show";
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Cierra la sesion del usuario actual
   */
  async logout() {
    Utils.loading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesion:", error);
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Configura el listener de estado de autenticacion.
   */
  init() {
    onAuthStateChanged(auth, async (user) => {
      const loginScreen = document.getElementById("pantalla-login");
      const appScreen = document.getElementById("app");

      if (user) {
        // Cargar rol del usuario desde su documento en "usuarios"
        await Roles.cargar(user.uid);
        // Aplicar permisos al sidebar
        Roles.aplicarSidebar();

        // Mostrar app
        loginScreen.style.display = "none";
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
      } else {
        // Sin autenticacion: mostrar login
        loginScreen.style.display = "";
        appScreen.classList.add("app-hidden");
        appScreen.classList.remove("app-visible");

        // Limpiar formularios
        document.getElementById("login-usuario").value = "";
        document.getElementById("login-password").value = "";
        document.getElementById("login-error").className = "alert alert-danger";
        this.mostrarLogin();
        document.getElementById("reg-nombre").value = "";
        document.getElementById("reg-dni").value = "";
        document.getElementById("reg-email").value = "";
        document.getElementById("reg-password").value = "";
        document.getElementById("reg-password2").value = "";
      }
    });
  }
};


// ══════════════════════════════════════════════════════════════
//  CATALOGO — CRUD de Libros
// ══════════════════════════════════════════════════════════════

const Catalogo = {
  coleccion: "libros",

  async render() {
    const tbody = document.getElementById("tabla-catalogo");
    const filtro = (document.getElementById("buscar-libro")?.value || "").toLowerCase();

    try {
      let q = query(collection(db, this.coleccion), orderBy("titulo", "asc"));
      const snapshot = await getDocs(q);

      let html = "";
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const disponibles = (data.disponibles ?? data.ejemplares ?? 0);

        if (filtro) {
          const texto = `${data.titulo} ${data.autor} ${data.isbn}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }

        let badgeHTML;
        if (disponibles <= 0) {
          badgeHTML = '<span class="badge badge-rojo">Sin stock</span>';
        } else if (disponibles < (data.ejemplares || 1)) {
          badgeHTML = `<span class="badge badge-amarillo">${disponibles}</span>`;
        } else {
          badgeHTML = `<span class="badge badge-verde">${disponibles}</span>`;
        }

        html += `
          <tr>
            <td><strong>${this._esc(data.titulo)}</strong></td>
            <td>${this._esc(data.autor)}</td>
            <td>${this._esc(data.genero || "—")}</td>
            <td>${data.ejemplares || 0}</td>
            <td>${badgeHTML}</td>
            <td>
              <button class="btn btn-sm" onclick="Catalogo.editar('${id}')" title="Editar">&#9998;</button>
              <button class="btn btn-sm btn-danger" onclick="Catalogo.eliminar('${id}', '${this._escAttr(data.titulo)}')" title="Eliminar">&#10005;</button>
            </td>
          </tr>`;
      });

      if (!html) {
        html = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          ${filtro ? "No se encontraron resultados." : "Aun no hay libros en el catalogo."}
        </td></tr>`;
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("catalogo");
    } catch (error) {
      console.error("Error al cargar catalogo:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos. Verifica la conexion con Firebase.
      </td></tr>`;
    }
  },

  async agregar() {
    const titulo = document.getElementById("libro-titulo").value.trim();
    const autor = document.getElementById("libro-autor").value.trim();
    const isbn = document.getElementById("libro-isbn").value.trim();
    const genero = document.getElementById("libro-genero").value;
    const ejemplares = parseInt(document.getElementById("libro-ejemplares").value) || 1;

    if (!titulo) {
      UI.mostrarAlerta("alert-libro", "El titulo es obligatorio.", "danger");
      return;
    }
    if (!autor) {
      UI.mostrarAlerta("alert-libro", "El autor es obligatorio.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      await addDoc(collection(db, this.coleccion), {
        titulo, autor,
        isbn: isbn || "",
        genero, ejemplares,
        disponibles: ejemplares,
        createdAt: serverTimestamp()
      });

      document.getElementById("libro-titulo").value = "";
      document.getElementById("libro-autor").value = "";
      document.getElementById("libro-isbn").value = "";
      document.getElementById("libro-genero").selectedIndex = 0;
      document.getElementById("libro-ejemplares").value = "1";
      UI.cerrarModal("modal-libro");
      UI.mostrarAlerta("alert-libro", `Libro "${titulo}" agregado correctamente.`);
      this.render();
    } catch (error) {
      console.error("Error al agregar libro:", error);
      UI.mostrarAlerta("alert-libro", "Error al guardar el libro. Intenta de nuevo.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async editar(id) {
    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      document.getElementById("libro-titulo").value = data.titulo || "";
      document.getElementById("libro-autor").value = data.autor || "";
      document.getElementById("libro-isbn").value = data.isbn || "";
      document.getElementById("libro-genero").value = data.genero || "Otro";
      document.getElementById("libro-ejemplares").value = data.ejemplares || 1;

      const modal = document.getElementById("modal-libro");
      modal.dataset.editId = id;
      const btnGuardar = modal.querySelector(".btn-primary");
      btnGuardar.textContent = "Actualizar libro";
      btnGuardar.onclick = () => Catalogo.guardarEdicion(id);

      UI.abrirModal("modal-libro");
    } catch (error) {
      console.error("Error al editar libro:", error);
      UI.mostrarAlerta("alert-libro", "Error al cargar el libro.", "danger");
    }
  },

  async guardarEdicion(id) {
    const titulo = document.getElementById("libro-titulo").value.trim();
    const autor = document.getElementById("libro-autor").value.trim();
    const isbn = document.getElementById("libro-isbn").value.trim();
    const genero = document.getElementById("libro-genero").value;
    const ejemplaresNuevos = parseInt(document.getElementById("libro-ejemplares").value) || 1;

    if (!titulo || !autor) {
      UI.mostrarAlerta("alert-libro", "Titulo y autor son obligatorios.", "danger");
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
        disponibles: nuevosDisponibles
      });

      this._resetModal();
      UI.cerrarModal("modal-libro");
      UI.mostrarAlerta("alert-libro", `Libro "${titulo}" actualizado correctamente.`);
      this.render();
    } catch (error) {
      console.error("Error al actualizar libro:", error);
      UI.mostrarAlerta("alert-libro", "Error al actualizar el libro.", "danger");
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
        UI.mostrarAlerta("alert-libro", "No se puede eliminar: tiene prestamos activos.", "danger", 4000);
        Utils.loading(false);
        return;
      }

      await deleteDoc(doc(db, this.coleccion, id));
      UI.mostrarAlerta("alert-libro", `"${titulo}" eliminado del catalogo.`);
      this.render();
    } catch (error) {
      console.error("Error al eliminar libro:", error);
      UI.mostrarAlerta("alert-libro", "Error al eliminar el libro.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  async obtenerTodos() {
    const q = query(collection(db, this.coleccion), orderBy("titulo", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  _resetModal() {
    const modal = document.getElementById("modal-libro");
    delete modal.dataset.editId;
    const btnGuardar = modal.querySelector(".btn-primary");
    btnGuardar.textContent = "Guardar libro";
    btnGuardar.onclick = () => Catalogo.agregar();
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  _escAttr(str) {
    if (!str) return "";
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }
};


// ══════════════════════════════════════════════════════════════
//  USUARIOS — CRUD de Usuarios (alumnos/docentes/admin)
// ══════════════════════════════════════════════════════════════

const Usuarios = {
  coleccion: "usuarios",

  /**
   * Lee todos los usuarios y renderiza la tabla
   */
  async render() {
    const tbody = document.getElementById("tabla-usuarios");
    const filtro = (document.getElementById("buscar-usuario")?.value || "").toLowerCase();

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

      let html = "";
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        const activos = prestamosPorUsuario[id] || 0;

        // Filtrar
        if (filtro) {
          const texto = `${data.nombre} ${data.dni || ""} ${data.tipo} ${data.email || ""}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }

        // Badge de tipo
        const tipoBadge = {
          "Alumno": "badge-azul",
          "Docente": "badge-verde",
          "Administrativo": "badge-amarillo"
        }[data.tipo] || "badge-azul";

        // Cuenta de acceso
        const tieneCuenta = data.authUid ? true : false;
        const cuentaHTML = tieneCuenta
          ? `<span style="color:var(--verde);font-size:12px">${this._esc(data.email || "—")}</span>`
          : `<span style="color:var(--texto-muted);font-size:12px">Sin cuenta</span>`;

        html += `
          <tr>
            <td><strong>${this._esc(data.nombre)}</strong></td>
            <td><span class="badge ${tipoBadge}">${this._esc(data.tipo)}</span></td>
            <td>${this._esc(data.dni || "—")}</td>
            <td>${cuentaHTML}</td>
            <td>${activos > 0 ? `<span class="badge badge-amarillo">${activos}</span>` : "0"}</td>
            <td>
              <button class="btn btn-sm" onclick="Usuarios.editar('${id}')" title="Editar">&#9998;</button>
              <button class="btn btn-sm btn-danger" onclick="Usuarios.eliminar('${id}', '${this._escAttr(data.nombre)}')" title="Eliminar">&#10005;</button>
            </td>
          </tr>`;
      });

      if (!html) {
        html = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          ${filtro ? "No se encontraron resultados." : "Aun no hay usuarios registrados."}
        </td></tr>`;
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("usuarios");
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
    document.getElementById("modal-usuario-error").className = "alert alert-danger";

    const btnGuardar = document.getElementById("btn-guardar-usuario");
    btnGuardar.textContent = "Guardar usuario";
    btnGuardar.onclick = () => Usuarios.agregar();

    const modal = document.getElementById("modal-usuario");
    delete modal.dataset.editId;
  },

  /**
   * Agrega un nuevo usuario.
   * Si se completa email + contraseña, crea la cuenta en Firebase Auth
   * usando una app secundaria (el admin no se desloguea).
   */
  async agregar() {
    const nombre   = document.getElementById("usu-nombre").value.trim();
    const tipo     = document.getElementById("usu-tipo").value;
    const dni      = document.getElementById("usu-dni").value.trim();
    const email    = document.getElementById("usu-email").value.trim();
    const password = document.getElementById("usu-password").value;
    const errorEl  = document.getElementById("modal-usuario-error");

    // Validaciones obligatorias
    if (!nombre) {
      errorEl.textContent = "El nombre es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (!dni) {
      errorEl.textContent = "El DNI es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    // Validaciones de cuenta de acceso (opcional)
    if (email && !password) {
      errorEl.textContent = "Si ingresas un email, también debes ingresar una contraseña.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (!email && password) {
      errorEl.textContent = "Si ingresas una contraseña, también debes ingresar un email.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (password && password.length < 6) {
      errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    Utils.loading(true);
    errorEl.className = "alert alert-danger";

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
          let msg = "Error al crear la cuenta de acceso.";
          switch (authError.code) {
            case "auth/email-already-in-use":
              msg = "Ya existe una cuenta con ese email.";
              break;
            case "auth/invalid-email":
              msg = "El formato del email no es valido.";
              break;
            case "auth/weak-password":
              msg = "La contraseña es demasiado debil (minimo 6 caracteres).";
              break;
          }
          errorEl.textContent = msg;
          errorEl.className = "alert alert-danger show";
          Utils.loading(false);
          return;
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

      await addDoc(collection(db, this.coleccion), docData);

      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta("alert-usuario", `Usuario "${nombre}" registrado correctamente.`);
      this.render();
    } catch (error) {
      console.error("Error al agregar usuario:", error);
      UI.mostrarAlerta("alert-usuario", "Error al guardar el usuario.", "danger");
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
      document.getElementById("modal-usuario-error").className = "alert alert-danger";

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
        document.getElementById("usu-email-hint").textContent = "Opcional. Si completas email + contraseña, se creará una cuenta de acceso.";
        document.getElementById("usu-email-hint").style.display = "";
        document.getElementById("usu-password").value = "";
        document.getElementById("usu-password").removeAttribute("readonly");
        document.getElementById("usu-password-label").textContent = "Contraseña";
        document.getElementById("usu-password-hint").textContent = "Opcional. Mínimo 6 caracteres.";
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
    const errorEl  = document.getElementById("modal-usuario-error");

    if (!nombre) {
      errorEl.textContent = "El nombre es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }
    if (!dni) {
      errorEl.textContent = "El DNI es obligatorio.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    Utils.loading(true);
    errorEl.className = "alert alert-danger";

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
          errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
          errorEl.className = "alert alert-danger show";
          Utils.loading(false);
          return;
        }

        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
          datosActualizar.authUid = userCredential.user.uid;
          datosActualizar.email = email;
          await signOut(secondaryAuth);
        } catch (authError) {
          let msg = "Error al crear la cuenta de acceso.";
          switch (authError.code) {
            case "auth/email-already-in-use":
              msg = "Ya existe una cuenta con ese email.";
              break;
            case "auth/invalid-email":
              msg = "El formato del email no es valido.";
              break;
            case "auth/weak-password":
              msg = "La contraseña es demasiado debil.";
              break;
          }
          errorEl.textContent = msg;
          errorEl.className = "alert alert-danger show";
          Utils.loading(false);
          return;
        }
      } else if (!tieneCuenta && email && !password) {
        // Solo email sin contraseña: guardar el email en Firestore (sin cuenta Auth)
        datosActualizar.email = email;
      }

      await updateDoc(doc(db, this.coleccion, id), datosActualizar);

      this._prepararModalAgregar();
      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta("alert-usuario", `Usuario "${nombre}" actualizado.`);

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
      UI.mostrarAlerta("alert-usuario", "Error al actualizar.", "danger");
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
        UI.mostrarAlerta("alert-usuario", "No se puede eliminar: tiene prestamos activos.", "danger", 4000);
        Utils.loading(false);
        return;
      }

      await deleteDoc(doc(db, this.coleccion, id));
      UI.mostrarAlerta("alert-usuario", `"${nombre}" eliminado.`);
      this.render();
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      UI.mostrarAlerta("alert-usuario", "Error al eliminar.", "danger");
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
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  _escAttr(str) {
    if (!str) return "";
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }
};


// ══════════════════════════════════════════════════════════════
//  PRESTAMOS — Gestion de prestamos y devoluciones
// ══════════════════════════════════════════════════════════════

const Prestamos = {
  coleccion: "prestamos",

  async render() {
    const tbody = document.getElementById("tabla-prestamos");

    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();
      const q = query(collection(db, this.coleccion), orderBy("fechaPrestamo", "desc"));
      const snapshot = await getDocs(q);

      let html = "";
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

        const nombreLibro = Utils.nombreLibro(data, mapLibros);
        const nombreUsu = Utils.nombreUsuario(data, mapUsuarios);

        html += `
          <tr>
            <td><strong>${this._esc(nombreLibro)}</strong></td>
            <td>${this._esc(nombreUsu)}</td>
            <td>${Utils.formatDate(data.fechaPrestamo)}</td>
            <td>${Utils.formatDate(data.fechaDevolucion)}</td>
            <td><span class="badge ${badge}">${estado}</span></td>
            <td>
              ${data.estado !== "devuelto"
                ? `<button class="btn btn-sm btn-primary" onclick="Prestamos.devolver('${id}')">Devolver</button>`
                : '<span style="color:var(--texto-muted);font-size:11px">Finalizado</span>'}
            </td>
          </tr>`;
      });

      if (!html) {
        html = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          No hay prestamos registrados.
        </td></tr>`;
      }

      tbody.innerHTML = html;
      Roles.aplicarBotones("prestamos");
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
      const selectLibro = document.getElementById("pres-libro");
      selectLibro.innerHTML = '<option value="">— Seleccionar libro —</option>';
      libros.forEach(libro => {
        if (libro.disponibles > 0) {
          selectLibro.innerHTML += `<option value="${libro.id}" data-titulo="${this._escAttr(libro.titulo)}">${libro.titulo} (${libro.disponibles} disp.)</option>`;
        }
      });

      const usuarios = await Usuarios.obtenerTodos();
      const selectUsuario = document.getElementById("pres-usuario");
      selectUsuario.innerHTML = '<option value="">— Seleccionar usuario —</option>';
      usuarios.forEach(usu => {
        const dniStr = usu.dni ? ` - DNI: ${usu.dni}` : "";
        selectUsuario.innerHTML += `<option value="${usu.id}" data-nombre="${this._escAttr(usu.nombre)}">${usu.nombre} (${usu.tipo}${dniStr})</option>`;
      });

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
    const selectLibro = document.getElementById("pres-libro");
    const selectUsuario = document.getElementById("pres-usuario");
    const libroId = selectLibro.value;
    const usuarioId = selectUsuario.value;
    const fechaPrestamo = document.getElementById("pres-fecha").value;
    const fechaDevolucion = document.getElementById("pres-devolucion").value;

    if (!libroId || !usuarioId) {
      UI.mostrarAlerta("alert-prestamo", "Selecciona un libro y un usuario.", "danger");
      return;
    }
    if (!fechaPrestamo || !fechaDevolucion) {
      UI.mostrarAlerta("alert-prestamo", "Completá las fechas de prestamo y devolucion.", "danger");
      return;
    }
    if (new Date(fechaDevolucion) <= new Date(fechaPrestamo)) {
      UI.mostrarAlerta("alert-prestamo", "La devolucion debe ser posterior al prestamo.", "danger");
      return;
    }

    const libroTitulo = selectLibro.options[selectLibro.selectedIndex].dataset.titulo || "";
    const usuarioNombre = selectUsuario.options[selectUsuario.selectedIndex].dataset.nombre || "";

    Utils.loading(true);

    try {
      await addDoc(collection(db, this.coleccion), {
        libroId, libroTitulo, usuarioId, usuarioNombre,
        fechaPrestamo: new Date(fechaPrestamo + "T12:00:00"),
        fechaDevolucion: new Date(fechaDevolucion + "T12:00:00"),
        estado: "activo",
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "libros", libroId), {
        disponibles: increment(-1)
      });

      UI.cerrarModal("modal-prestamo");
      UI.mostrarAlerta("alert-prestamo", `Prestamo de "${libroTitulo}" registrado.`);
      this.render();
      Vencidos.actualizarBadge();
    } catch (error) {
      console.error("Error al registrar prestamo:", error);
      UI.mostrarAlerta("alert-prestamo", "Error al registrar el prestamo.", "danger");
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

      await updateDoc(doc(db, this.coleccion, id), {
        estado: "devuelto",
        fechaRealDevolucion: new Date()
      });

      await updateDoc(doc(db, "libros", data.libroId), {
        disponibles: increment(1)
      });

      UI.mostrarAlerta("alert-prestamo", `"${data.libroTitulo}" devuelto correctamente.`);
      this.render();
      Vencidos.actualizarBadge();
    } catch (error) {
      console.error("Error al registrar devolucion:", error);
      UI.mostrarAlerta("alert-prestamo", "Error al registrar devolucion.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  _escAttr(str) {
    if (!str) return "";
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }
};


// ══════════════════════════════════════════════════════════════
//  VENCIDOS — Prestamos que pasaron la fecha de devolucion
// ══════════════════════════════════════════════════════════════

const Vencidos = {
  async render() {
    const tbody = document.getElementById("tabla-vencidos");

    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();
      const prestamosSnap = await getDocs(collection(db, "prestamos"));

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      let html = "";
      let count = 0;

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        if (data.estado === "devuelto") return;

        const fechaDev = Utils.toDate(data.fechaDevolucion);
        if (!fechaDev) return;
        fechaDev.setHours(0, 0, 0, 0);

        if (fechaDev < hoy) {
          count++;
          const diasAtraso = Utils.daysDiff(data.fechaDevolucion);
          const nombreLibro = Utils.nombreLibro(data, mapLibros);
          const nombreUsu = Utils.nombreUsuario(data, mapUsuarios);

          html += `
            <tr>
              <td><strong>${this._esc(nombreLibro)}</strong></td>
              <td>${this._esc(nombreUsu)}</td>
              <td>${Utils.formatDate(data.fechaDevolucion)}</td>
              <td><span class="badge badge-rojo">${diasAtraso} dias</span></td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="Prestamos.devolver('${id}')">Devolver</button>
              </td>
            </tr>`;
        }
      });

      if (!html) {
        html = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          No hay prestamos vencidos. Todo al dia.
        </td></tr>`;
      }

      tbody.innerHTML = html;
    } catch (error) {
      console.error("Error al cargar vencidos:", error);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  async actualizarBadge() {
    try {
      const prestamosSnap = await getDocs(collection(db, "prestamos"));

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      let count = 0;

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
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
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
};


// ══════════════════════════════════════════════════════════════
//  DASHBOARD — Panel principal con estadisticas
// ══════════════════════════════════════════════════════════════

const Dashboard = {
  async render() {
    try {
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();

      const totalLibros = Object.keys(mapLibros).length;
      const totalUsuarios = Object.keys(mapUsuarios).length;

      const prestamosSnap = await getDocs(collection(db, "prestamos"));
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const ultimosPrestamos = [];

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const p = { id: docSnap.id, ...data };

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
        ultimosPrestamos.push(p);
      });

      document.getElementById("stat-libros").textContent = totalLibros;
      document.getElementById("stat-activos").textContent = activos;
      document.getElementById("stat-vencidos").textContent = vencidos;
      document.getElementById("stat-usuarios").textContent = totalUsuarios;

      ultimosPrestamos.sort((a, b) => b._sortDate - a._sortDate);
      const ultimos5 = ultimosPrestamos.slice(0, 5);

      const tbody = document.getElementById("tabla-ultimos");
      let html = "";

      if (ultimos5.length === 0) {
        html = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          No hay prestamos registrados todavia.
        </td></tr>`;
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

          const nombreLibro = Utils.nombreLibro(p, mapLibros);
          const nombreUsu = Utils.nombreUsuario(p, mapUsuarios);

          html += `
            <tr>
              <td><strong>${this._esc(nombreLibro)}</strong></td>
              <td>${this._esc(nombreUsu)}</td>
              <td>${Utils.formatDate(p.fechaDevolucion)}</td>
              <td>${badge}</td>
            </tr>`;
        });
      }

      tbody.innerHTML = html;
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    }
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
};


// ══════════════════════════════════════════════════════════════
//  REPORTES — Estadisticas de la biblioteca
// ══════════════════════════════════════════════════════════════

const Reportes = {
  async render() {
    const statsContainer = document.getElementById("stats-reportes");
    const tbody = document.getElementById("tabla-mas-prestados");

    try {
      const prestamosSnap = await getDocs(collection(db, "prestamos"));
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const librosSnap = await getDocs(collection(db, "libros"));

      let totalPrestamos = prestamosSnap.size;
      let devueltos = 0;
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

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

      const ranking = Object.values(prestamosPorLibro)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

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
          <div class="trend">historicos</div>
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
          <div class="value" style="font-size:18px">${this._esc(topUsuario.nombre)}</div>
          <div class="trend">${topUsuario.cantidad} prestamos</div>
        </div>
      `;

      let rankingHTML = "";
      if (ranking.length === 0) {
        rankingHTML = `<tr><td colspan="3" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          No hay datos suficientes.
        </td></tr>`;
      } else {
        ranking.forEach((libro, i) => {
          const medalla = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          rankingHTML += `
            <tr>
              <td>${medalla} <strong>${this._esc(libro.titulo)}</strong></td>
              <td>${this._esc(libro.autor)}</td>
              <td><span class="badge badge-azul">${libro.count}</span></td>
            </tr>`;
        });
      }

      tbody.innerHTML = rankingHTML;
    } catch (error) {
      console.error("Error al cargar reportes:", error);
      statsContainer.innerHTML = `<p style="color:#B42318;padding:1rem">Error al cargar estadisticas.</p>`;
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:2rem;color:#B42318">Error.</td></tr>`;
    }
  },

  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
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

      UI.mostrarAlerta("alert-config", "Configuracion guardada correctamente.");
    } catch (error) {
      console.error("Error al guardar configuracion:", error);
      UI.mostrarAlerta("alert-config", "Error al guardar la configuracion.", "danger");
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
window.Auth = Auth;
window.UI = UI;
window.Catalogo = Catalogo;
window.Usuarios = Usuarios;
window.Prestamos = Prestamos;
window.Config = Config;
window.Roles = Roles;

// Permitir login con Enter
document.getElementById("login-password").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
});
document.getElementById("login-usuario").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
});

// Permitir registro con Enter
document.getElementById("reg-password2").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.registrar();
});
document.getElementById("reg-dni").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.registrar();
});

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
      Catalogo._resetModal();
      Usuarios._prepararModalAgregar();
    }
  });
});

// Configurar modal de usuario al abrirlo (preparar para agregar)
document.getElementById("btn-guardar-usuario")?.addEventListener("click", () => {});

// Iniciar el listener de autenticacion
Auth.init();

// Aplicar tema guardado (dark/light) antes de que se renderice nada
UI.aplicarTemaGuardado();

console.log("BiblioEscolar inicializado correctamente.");

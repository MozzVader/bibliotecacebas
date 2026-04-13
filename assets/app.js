// ══════════════════════════════════════════════════════════════
//  BiblioEscolar — app.js
//  Logica completa de la SPA con Firebase
// ══════════════════════════════════════════════════════════════

import {
  auth, db,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════════════════

const Utils = {
  /**
   * Formatea una fecha de Firebase Timestamp o Date a formato legible (dd/mm/yyyy)
   */
  formatDate(fecha) {
    if (!fecha) return "—";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  },

  /**
   * Formatea una fecha para input type="date" (yyyy-mm-dd)
   */
  toInputDate(fecha) {
    if (!fecha) return "";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toISOString().split("T")[0];
  },

  /**
   * Devuelve la fecha de hoy como string yyyy-mm-dd
   */
  today() {
    return new Date().toISOString().split("T")[0];
  },

  /**
   * Suma dias a una fecha y devuelve Date
   */
  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  /**
   * Calcula los dias de diferencia entre dos fechas (puede ser negativo)
   */
  daysDiff(fechaFin) {
    const fin = fechaFin.toDate ? fechaFin.toDate() : new Date(fechaFin);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fin.setHours(0, 0, 0, 0);
    return Math.ceil((hoy - fin) / (1000 * 60 * 60 * 24));
  },

  /**
   * Muestra u oculta el overlay de carga
   */
  loading(show) {
    const el = document.getElementById("loading-overlay");
    if (show) {
      el.style.display = "flex";
    } else {
      el.style.display = "none";
    }
  },

  /**
   * Genera un ID corto para documentos
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  /**
   * Convierte cualquier tipo de fecha (Timestamp, Date, string) a Date
   */
  toDate(fecha) {
    if (!fecha) return null;
    if (fecha.toDate) return fecha.toDate();
    if (fecha instanceof Date) return fecha;
    if (typeof fecha === "string" || typeof fecha === "number") return new Date(fecha);
    return new Date(fecha);
  },

  /**
   * Carga todos los libros y usuarios y devuelve maps {id: nombre}
   * Se usa como cache para resolver nombres en prestamos que no
   * tengan libroTitulo / usuarioNombre guardados.
   */
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

  /**
   * Resuelve el nombre de un libro desde el map, con fallback
   */
  nombreLibro(data, map) {
    if (data.libroTitulo) return data.libroTitulo;
    if (data.libroId && map && map[data.libroId]) return map[data.libroId];
    return "—";
  },

  /**
   * Resuelve el nombre de un usuario desde el map, con fallback
   */
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
  /**
   * Navega entre secciones de la SPA
   */
  navigate(el, seccion) {
    // Desactivar nav-item activo
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    // Activar el que se clickeo
    if (el) el.classList.add("active");
    // Ocultar todas las secciones
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    // Mostrar la seccion correspondiente
    const target = document.getElementById("sec-" + seccion);
    if (target) target.classList.add("active");

    // Disparar render de la seccion si corresponde
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

  /**
   * Abre un modal por su ID
   */
  abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("open");
      // Si es el modal de prestamo, cargar selects
      if (id === "modal-prestamo") {
        Prestamos.cargarSelects();
      }
    }
  },

  /**
   * Cierra un modal por su ID
   */
  cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("open");
  },

  /**
   * Muestra una alerta temporal
   * @param {string} id - ID del elemento alerta
   * @param {string} mensaje - Texto a mostrar
   * @param {string} tipo - "success" o "danger"
   * @param {number} duracion - Milisegundos antes de ocultar
   */
  mostrarAlerta(id, mensaje, tipo = "success", duracion = 3000) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = mensaje;
    el.className = "alert alert-" + tipo + " show";
    setTimeout(() => {
      el.classList.remove("show");
    }, duracion);
  }
};


// ══════════════════════════════════════════════════════════════
//  AUTH — Autenticacion con Firebase
// ══════════════════════════════════════════════════════════════

const Auth = {
  /**
   * Inicia sesion con email y password
   */
  async login() {
    const email = document.getElementById("login-usuario").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    // Validaciones basicas
    if (!email || !password) {
      errorEl.textContent = "Completá email y contrasena.";
      errorEl.className = "alert alert-danger show";
      return;
    }

    Utils.loading(true);
    errorEl.className = "alert alert-danger";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged se encarga del resto
    } catch (error) {
      let msg = "Error al iniciar sesion.";
      switch (error.code) {
        case "auth/user-not-found":
          msg = "No existe una cuenta con ese email.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          msg = "Contrasena incorrecta.";
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
      // onAuthStateChanged se encarga del resto
    } catch (error) {
      console.error("Error al cerrar sesion:", error);
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Configura el listener de estado de autenticacion.
   * Se ejecuta automaticamente al cargar la app.
   */
  init() {
    onAuthStateChanged(auth, (user) => {
      const loginScreen = document.getElementById("pantalla-login");
      const appScreen = document.getElementById("app");

      if (user) {
        // Usuario autenticado: mostrar app
        loginScreen.style.display = "none";
        appScreen.classList.remove("app-hidden");
        appScreen.classList.add("app-visible");

        // Datos del usuario en el header
        const email = user.email || "";
        const initials = email.substring(0, 2).toUpperCase();
        document.getElementById("avatar-initials").textContent = initials;
        document.getElementById("header-username").textContent = email;

        // Mostrar fecha de hoy en el panel principal
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
      }
    });
  }
};


// ══════════════════════════════════════════════════════════════
//  CATALOGO — CRUD de Libros
// ══════════════════════════════════════════════════════════════

const Catalogo = {
  coleccion: "libros",

  /**
   * Lee todos los libros de Firestore y renderiza la tabla
   */
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

        // Filtrar por busqueda
        if (filtro) {
          const texto = `${data.titulo} ${data.autor} ${data.isbn}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }

        // Badge de disponibilidad
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
    } catch (error) {
      console.error("Error al cargar catalogo:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos. Verifica la conexion con Firebase.
      </td></tr>`;
    }
  },

  /**
   * Agrega un nuevo libro a Firestore
   */
  async agregar() {
    const titulo = document.getElementById("libro-titulo").value.trim();
    const autor = document.getElementById("libro-autor").value.trim();
    const isbn = document.getElementById("libro-isbn").value.trim();
    const genero = document.getElementById("libro-genero").value;
    const ejemplares = parseInt(document.getElementById("libro-ejemplares").value) || 1;

    // Validaciones
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
        titulo,
        autor,
        isbn: isbn || "",
        genero,
        ejemplares,
        disponibles: ejemplares,
        createdAt: serverTimestamp()
      });

      // Limpiar formulario y cerrar modal
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

  /**
   * Abre el modal de edicion con los datos del libro
   */
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

      // Cambiar el boton del modal para que guarde como edicion
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

  /**
   * Guarda la edicion de un libro existente
   */
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
      // Obtener datos actuales para calcular disponibles
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const dataActual = docSnap.data();
      const ejemplaresAnteriores = dataActual.ejemplares || 0;
      const prestados = ejemplaresAnteriores - (dataActual.disponibles ?? 0);
      const nuevosDisponibles = Math.max(0, ejemplaresNuevos - prestados);

      await updateDoc(doc(db, this.coleccion, id), {
        titulo,
        autor,
        isbn: isbn || "",
        genero,
        ejemplares: ejemplaresNuevos,
        disponibles: nuevosDisponibles
      });

      // Restaurar modal a modo "agregar"
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

  /**
   * Elimina un libro de Firestore (solo si no tiene prestamos activos)
   */
  async eliminar(id, titulo) {
    // Confirmacion
    if (!confirm(`Estas seguro de eliminar "${titulo}"?`)) return;

    Utils.loading(true);

    try {
      // Verificar que no tenga prestamos activos
      const q = query(
        collection(db, "prestamos"),
        where("libroId", "==", id),
        where("estado", "==", "activo")
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        UI.mostrarAlerta(
          "alert-libro",
          "No se puede eliminar: tiene prestamos activos.",
          "danger",
          4000
        );
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

  /**
   * Obtiene todos los libros como array (para selects de prestamos)
   */
  async obtenerTodos() {
    const q = query(collection(db, this.coleccion), orderBy("titulo", "asc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /**
   * Restaura el modal a su estado original de "agregar"
   */
  _resetModal() {
    const modal = document.getElementById("modal-libro");
    delete modal.dataset.editId;
    const btnGuardar = modal.querySelector(".btn-primary");
    btnGuardar.textContent = "Guardar libro";
    btnGuardar.onclick = () => Catalogo.agregar();
  },

  /**
   * Escapa HTML para prevenir XSS
   */
  _esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Escapa atributos HTML
   */
  _escAttr(str) {
    if (!str) return "";
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
  }
};


// ══════════════════════════════════════════════════════════════
//  USUARIOS — CRUD de Usuarios (alumnos/docentes)
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
          const texto = `${data.nombre} ${data.curso} ${data.tipo}`.toLowerCase();
          if (!texto.includes(filtro)) return;
        }

        // Badge de tipo
        const tipoBadge = {
          "Alumno": "badge-azul",
          "Docente": "badge-verde",
          "Administrativo": "badge-amarillo"
        }[data.tipo] || "badge-azul";

        html += `
          <tr>
            <td><strong>${this._esc(data.nombre)}</strong></td>
            <td><span class="badge ${tipoBadge}">${this._esc(data.tipo)}</span></td>
            <td>${this._esc(data.curso || "—")}</td>
            <td>${activos > 0 ? `<span class="badge badge-amarillo">${activos}</span>` : "0"}</td>
            <td>
              <button class="btn btn-sm" onclick="Usuarios.editar('${id}')" title="Editar">&#9998;</button>
              <button class="btn btn-sm btn-danger" onclick="Usuarios.eliminar('${id}', '${this._escAttr(data.nombre)}')" title="Eliminar">&#10005;</button>
            </td>
          </tr>`;
      });

      if (!html) {
        html = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--texto-muted)">
          ${filtro ? "No se encontraron resultados." : "Aun no hay usuarios registrados."}
        </td></tr>`;
      }

      tbody.innerHTML = html;
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  /**
   * Agrega un nuevo usuario
   */
  async agregar() {
    const nombre = document.getElementById("usu-nombre").value.trim();
    const tipo = document.getElementById("usu-tipo").value;
    const curso = document.getElementById("usu-curso").value.trim();

    if (!nombre) {
      UI.mostrarAlerta("alert-usuario", "El nombre es obligatorio.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      await addDoc(collection(db, this.coleccion), {
        nombre,
        tipo,
        curso: curso || "",
        createdAt: serverTimestamp()
      });

      // Limpiar y cerrar
      document.getElementById("usu-nombre").value = "";
      document.getElementById("usu-curso").value = "";
      document.getElementById("usu-tipo").selectedIndex = 0;
      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta("alert-usuario", `Usuario "${nombre}" registrado.`);
      this.render();
    } catch (error) {
      console.error("Error al agregar usuario:", error);
      UI.mostrarAlerta("alert-usuario", "Error al guardar el usuario.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Abre el modal con datos para editar un usuario
   */
  async editar(id) {
    try {
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      document.getElementById("usu-nombre").value = data.nombre || "";
      document.getElementById("usu-tipo").value = data.tipo || "Alumno";
      document.getElementById("usu-curso").value = data.curso || "";

      // Cambiar boton a modo edicion
      const modal = document.getElementById("modal-usuario");
      modal.dataset.editId = id;
      const btnGuardar = modal.querySelector(".btn-primary");
      btnGuardar.textContent = "Actualizar usuario";
      btnGuardar.onclick = () => Usuarios.guardarEdicion(id);

      UI.abrirModal("modal-usuario");
    } catch (error) {
      console.error("Error al editar usuario:", error);
    }
  },

  /**
   * Guarda la edicion de un usuario
   */
  async guardarEdicion(id) {
    const nombre = document.getElementById("usu-nombre").value.trim();
    const tipo = document.getElementById("usu-tipo").value;
    const curso = document.getElementById("usu-curso").value.trim();

    if (!nombre) {
      UI.mostrarAlerta("alert-usuario", "El nombre es obligatorio.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      await updateDoc(doc(db, this.coleccion, id), {
        nombre,
        tipo,
        curso: curso || ""
      });

      this._resetModal();
      UI.cerrarModal("modal-usuario");
      UI.mostrarAlerta("alert-usuario", `Usuario "${nombre}" actualizado.`);
      this.render();
    } catch (error) {
      console.error("Error al actualizar usuario:", error);
      UI.mostrarAlerta("alert-usuario", "Error al actualizar.", "danger");
    } finally {
      Utils.loading(false);
    }
  },

  /**
   * Elimina un usuario (solo si no tiene prestamos activos)
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
        UI.mostrarAlerta(
          "alert-usuario",
          "No se puede eliminar: tiene prestamos activos.",
          "danger",
          4000
        );
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

  /**
   * Restaura el modal a modo "agregar"
   */
  _resetModal() {
    const modal = document.getElementById("modal-usuario");
    delete modal.dataset.editId;
    const btnGuardar = modal.querySelector(".btn-primary");
    btnGuardar.textContent = "Guardar usuario";
    btnGuardar.onclick = () => Usuarios.agregar();
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

  /**
   * Renderiza la tabla de todos los prestamos
   */
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

        // Determinar estado
        let estado, badge;
        if (data.estado === "devuelto") {
          estado = "Devuelto";
          badge = "badge-verde";
        } else {
          // Verificar si esta vencido
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
    } catch (error) {
      console.error("Error al cargar prestamos:", error);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#B42318">
        Error al cargar datos.
      </td></tr>`;
    }
  },

  /**
   * Carga los selects del modal de nuevo prestamo
   */
  async cargarSelects() {
    try {
      // Cargar libros con stock disponible
      const libros = await Catalogo.obtenerTodos();
      const selectLibro = document.getElementById("pres-libro");
      selectLibro.innerHTML = '<option value="">— Seleccionar libro —</option>';
      libros.forEach(libro => {
        if (libro.disponibles > 0) {
          selectLibro.innerHTML += `<option value="${libro.id}" data-titulo="${this._escAttr(libro.titulo)}">${libro.titulo} (${libro.disponibles} disp.)</option>`;
        }
      });

      // Cargar usuarios
      const usuarios = await Usuarios.obtenerTodos();
      const selectUsuario = document.getElementById("pres-usuario");
      selectUsuario.innerHTML = '<option value="">— Seleccionar usuario —</option>';
      usuarios.forEach(usu => {
        selectUsuario.innerHTML += `<option value="${usu.id}" data-nombre="${this._escAttr(usu.nombre)}">${usu.nombre} (${usu.tipo} - ${usu.curso || "—"})</option>`;
      });

      // Configurar fechas por defecto
      const hoy = Utils.today();
      document.getElementById("pres-fecha").value = hoy;

      // Cargar dias por defecto desde config
      const diasDefault = await Config.obtenerDias();
      const fechaDevolucion = Utils.addDays(hoy, diasDefault);
      document.getElementById("pres-devolucion").value = fechaDevolucion.toISOString().split("T")[0];
    } catch (error) {
      console.error("Error al cargar selects de prestamo:", error);
    }
  },

  /**
   * Registra un nuevo prestamo
   */
  async registrar() {
    const selectLibro = document.getElementById("pres-libro");
    const selectUsuario = document.getElementById("pres-usuario");
    const libroId = selectLibro.value;
    const usuarioId = selectUsuario.value;
    const fechaPrestamo = document.getElementById("pres-fecha").value;
    const fechaDevolucion = document.getElementById("pres-devolucion").value;

    // Validaciones
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
      // Crear el prestamo
      await addDoc(collection(db, this.coleccion), {
        libroId,
        libroTitulo,
        usuarioId,
        usuarioNombre,
        fechaPrestamo: new Date(fechaPrestamo + "T12:00:00"),
        fechaDevolucion: new Date(fechaDevolucion + "T12:00:00"),
        estado: "activo",
        createdAt: serverTimestamp()
      });

      // Descontar un ejemplar disponible del libro
      await updateDoc(doc(db, "libros", libroId), {
        disponibles: increment(-1)
      });

      // Cerrar modal y refrescar
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

  /**
   * Registra la devolucion de un prestamo
   */
  async devolver(id) {
    if (!confirm("Registrar devolucion de este libro?")) return;

    Utils.loading(true);

    try {
      // Obtener datos del prestamo
      const docSnap = await getDoc(doc(db, this.coleccion, id));
      const data = docSnap.data();

      // Marcar como devuelto
      await updateDoc(doc(db, this.coleccion, id), {
        estado: "devuelto",
        fechaRealDevolucion: new Date()
      });

      // Devolver el ejemplar al libro
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
  /**
   * Renderiza la tabla de prestamos vencidos
   */
  async render() {
    const tbody = document.getElementById("tabla-vencidos");

    try {
      // Cargar nombres para resolver por ID
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();

      // Obtener TODOS los prestamos (sin filtro por estado,
      // porque datos previos puede que no tengan el campo estado)
      const prestamosSnap = await getDocs(collection(db, "prestamos"));

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      let html = "";
      let count = 0;

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        // Ignorar devueltos
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

  /**
   * Actualiza el badge de vencidos en el sidebar
   */
  async actualizarBadge() {
    try {
      // Obtener TODOS los prestamos (compatible con datos sin campo estado)
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
  /**
   * Carga todas las estadisticas y los ultimos prestamos
   */
  async render() {
    try {
      // Cargar mapas de nombres (para prestamos que solo guarden IDs)
      const { mapLibros, mapUsuarios } = await Utils.cargarNombres();

      // Contar libros y usuarios
      const totalLibros = Object.keys(mapLibros).length;
      const totalUsuarios = Object.keys(mapUsuarios).length;

      // Prestamos
      const prestamosSnap = await getDocs(collection(db, "prestamos"));
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const ultimosPrestamos = [];

      prestamosSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const p = { id: docSnap.id, ...data };

        // Determinar si esta activo/vencido (compatible con datos que no tengan campo estado)
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

        // Ordenar por fecha
        const fechaP = Utils.toDate(data.fechaPrestamo);
        p._sortDate = fechaP ? fechaP.getTime() : 0;
        ultimosPrestamos.push(p);
      });

      // Actualizar contadores
      document.getElementById("stat-libros").textContent = totalLibros;
      document.getElementById("stat-activos").textContent = activos;
      document.getElementById("stat-vencidos").textContent = vencidos;
      document.getElementById("stat-usuarios").textContent = totalUsuarios;

      // Ordenar por fecha descendente y tomar 5
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
  /**
   * Renderiza estadisticas y ranking de libros mas prestados
   */
  async render() {
    const statsContainer = document.getElementById("stats-reportes");
    const tbody = document.getElementById("tabla-mas-prestados");

    try {
      const prestamosSnap = await getDocs(collection(db, "prestamos"));
      const usuariosSnap = await getDocs(collection(db, "usuarios"));
      const librosSnap = await getDocs(collection(db, "libros"));

      // Calcular estadisticas
      let totalPrestamos = prestamosSnap.size;
      let devueltos = 0;
      let activos = 0;
      let vencidos = 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Contar prestamos por libro
      const prestamosPorLibro = {};
      // Contar prestamos por usuario
      const prestamosPorUsuario = {};

      // Prestamos del mes actual
      const mesActual = new Date();
      const primerDiaMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
      let prestamosMes = 0;

      // Alumnos vs Docentes
      let prestamosAlumnos = 0;
      let prestamosDocentes = 0;

      // Mapear usuarios por ID para obtener tipo
      const usuariosMap = {};
      const usuariosNombres = {};
      usuariosSnap.forEach(d => {
        usuariosMap[d.id] = d.data();
        usuariosNombres[d.id] = d.data().nombre || "—";
      });

      // Mapear libros por ID para resolver nombres y autores
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

        // Contar por libro (resolver nombre por ID si no tiene titulo)
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

        // Contar por usuario
        if (data.usuarioId) {
          prestamosPorUsuario[data.usuarioId] = (prestamosPorUsuario[data.usuarioId] || 0) + 1;
        }

        // Prestamos del mes
        const fechaP = Utils.toDate(data.fechaPrestamo);
        if (fechaP && fechaP >= primerDiaMes) prestamosMes++;

        // Por tipo de usuario
        const usu = usuariosMap[data.usuarioId];
        if (usu) {
          if (usu.tipo === "Alumno") prestamosAlumnos++;
          else prestamosDocentes++;
        }
      });

      // Top libros mas prestados
      const ranking = Object.values(prestamosPorLibro)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top usuario mas activo
      let topUsuario = { nombre: "—", cantidad: 0 };
      Object.entries(prestamosPorUsuario).forEach(([uid, cantidad]) => {
        if (cantidad > topUsuario.cantidad) {
          topUsuario = { nombre: usuariosNombres[uid] || "—", cantidad };
        }
      });

      // Renderizar cards de estadisticas
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

      // Renderizar tabla de ranking
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

  /**
   * Carga la configuracion guardada en Firestore
   */
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

  /**
   * Guarda la configuracion en Firestore
   */
  async guardar() {
    const nombreInstitucion = document.getElementById("cfg-nombre").value.trim();
    const diasPrestamo = parseInt(document.getElementById("cfg-dias").value) || 7;
    const nombreBibliotecario = document.getElementById("cfg-biblio").value.trim();

    Utils.loading(true);

    try {
      await setDoc(doc(db, "config", this.docId), {
        nombreInstitucion,
        diasPrestamo,
        nombreBibliotecario,
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

  /**
   * Obtiene los dias de prestamo por defecto desde la config
   */
  async obtenerDias() {
    try {
      const docSnap = await getDoc(doc(db, "config", this.docId));
      if (docSnap.exists()) {
        return docSnap.data().diasPrestamo || 7;
      }
    } catch (error) {
      console.error("Error al obtener dias de prestamo:", error);
    }
    return 7; // Valor por defecto
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

// Permitir login con Enter
document.getElementById("login-password").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
});
document.getElementById("login-usuario").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
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
      // Resetear modales si estaban en modo edicion
      Catalogo._resetModal();
      Usuarios._resetModal();
    }
  });
});

// Iniciar el listener de autenticacion
Auth.init();

console.log("BiblioEscolar inicializado correctamente.");

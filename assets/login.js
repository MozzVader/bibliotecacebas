// ══════════════════════════════════════════════════════════════
//  BiblioEscolar — login.js
//  Lógica mínima para la página de login independiente
// ══════════════════════════════════════════════════════════════

import {
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "./firebase.js";

// ══════════════════════════════════════════════════════════════
//  UTILS — Solo lo necesario para el login
// ══════════════════════════════════════════════════════════════

const Utils = {
  _loadingCount: 0,
  loading(show) {
    const el = document.getElementById("loading-overlay");
    if (show) {
      this._loadingCount++;
      el.style.display = "flex";
    } else {
      this._loadingCount = Math.max(0, this._loadingCount - 1);
      if (this._loadingCount === 0) el.style.display = "none";
    }
  }
};

// ══════════════════════════════════════════════════════════════
//  UI — Solo toast para el login
// ══════════════════════════════════════════════════════════════

const UI = {
  toast(mensaje, tipo = "success", duracion = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const icons = {
      success: "\u2713",
      danger:  "\u2717",
      warning: "\u26A0",
      info:    "\u2139"
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
  }
};

// ══════════════════════════════════════════════════════════════
//  AUTH — Login + guard de autenticación
// ══════════════════════════════════════════════════════════════

const Auth = {
  /** Inicia sesión con email y password, luego redirige a index.html */
  async login() {
    const email    = document.getElementById("login-usuario").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      UI.toast("Completá email y contraseña.", "danger");
      return;
    }

    Utils.loading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged se encarga de la redirección
    } catch (error) {
      let msg = "Error al iniciar sesión.";
      switch (error.code) {
        case "auth/user-not-found":
          msg = "No existe una cuenta con ese email.";
          break;
        case "auth/wrong-password":
        case "auth/invalid-credential":
          msg = "Contraseña incorrecta.";
          break;
        case "auth/invalid-email":
          msg = "El formato del email no es válido.";
          break;
        case "auth/too-many-requests":
          msg = "Demasiados intentos. Esperá unos minutos.";
          break;
      }
      UI.toast(msg, "danger");
      Utils.loading(false);
    }
  },

  /** Listener: si ya está autenticado, redirige a index.html */
  init() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // Ya autenticado → ir al inicio
        window.location.href = "index.html";
      }
      // Si no está autenticado, el formulario ya es visible
    });
  }
};

// ═══ Exponer globalmente para onclick del HTML ═══
window.Auth = Auth;

// ═══ Iniciar ═══
Auth.init();

// Permitir login con Enter
document.getElementById("login-password").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
});
document.getElementById("login-usuario").addEventListener("keypress", (e) => {
  if (e.key === "Enter") Auth.login();
});

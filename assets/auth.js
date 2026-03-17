/* ════════════════════════════════════════════
   auth.js — Login con Firebase Authentication
   ════════════════════════════════════════════ */

import { fbLogin, fbLogout, fbOnAuthChange } from './firebase.js';
import DB from './db.js';
import UI from './ui.js';

const Auth = {
  usuarioActual: null,

  init() {
    // Si el usuario ya tenía sesión abierta, entrar directo
    fbOnAuthChange(user => {
      if (user && !this.usuarioActual) {
        this.usuarioActual = user;
        this._mostrarApp(user.email);
      }
    });
  },

  async login() {
    const email    = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl  = document.getElementById('login-error');

    if (!email || !password) {
      errorEl.textContent = 'Completá email y contraseña.';
      errorEl.classList.add('show');
      return;
    }

    errorEl.classList.remove('show');
    UI.mostrarCargando(true);

    try {
      const user = await fbLogin(email, password);
      this.usuarioActual = user;
      this._mostrarApp(user.email);
    } catch (e) {
      UI.mostrarCargando(false);
      errorEl.textContent = 'Email o contraseña incorrectos.';
      errorEl.classList.add('show');
    }
  },

  async logout() {
    await fbLogout();
    this.usuarioActual = null;
    document.getElementById('app').classList.replace('app-visible', 'app-hidden');
    document.getElementById('pantalla-login').style.display = 'flex';
    document.getElementById('login-usuario').value  = '';
    document.getElementById('login-password').value = '';
  },

  _mostrarApp(email) {
    // Nombre para mostrar: la parte antes del @
    const nombre = email.split('@')[0];
    const iniciales = nombre.slice(0, 2).toUpperCase();

    document.getElementById('header-username').textContent = nombre;
    document.getElementById('avatar-initials').textContent = iniciales;
    document.getElementById('pantalla-login').style.display = 'none';

    const app = document.getElementById('app');
    app.classList.remove('app-hidden');
    app.classList.add('app-visible');

    DB.cargar().then(() => {
      UI.mostrarCargando(false);
      import('./inicio.js').then(m => m.default.render());
    }).catch(() => {
      UI.mostrarCargando(false);
      alert('No se pudo conectar con la base de datos.');
    });
  },

  puedeEditar() {
    return this.usuarioActual !== null;
  }
};

export default Auth;

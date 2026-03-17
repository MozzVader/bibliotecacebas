/* ════════════════════════════════════════════
   app.js — Punto de entrada principal.
   Importa todos los módulos y los expone
   globalmente para los onclick del HTML.
   ════════════════════════════════════════════ */

import DB        from './db.js';
import Auth      from './auth.js';
import UI        from './ui.js';
import Inicio    from './inicio.js';
import Catalogo  from './catalogo.js';
import Prestamos from './prestamos.js';
import Usuarios  from './usuarios.js';
import Vencidos  from './vencidos.js';
import Reportes  from './reportes.js';
import Config    from './config.js';

// Exponer al scope global para que funcionen los onclick del HTML
window.DB        = DB;
window.Auth      = Auth;
window.UI        = UI;
window.Inicio    = Inicio;
window.Catalogo  = Catalogo;
window.Prestamos = Prestamos;
window.Usuarios  = Usuarios;
window.Vencidos  = Vencidos;
window.Reportes  = Reportes;
window.Config    = Config;

// Inicializar auth (detecta sesión previa)
Auth.init();

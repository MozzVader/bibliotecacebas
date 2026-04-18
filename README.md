<div align="center">

# 📚 Biblioteca - CEBAS 2

**Sistema de gestión bibliotecaria para escuelas**

[![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-success)](https://mozzvader.github.io/bibliotecacebas/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Aplicación web para administrar el catálogo, préstamos, devoluciones y usuarios
de una biblioteca escolar. Desarrollada con HTML, CSS y JavaScript vanilla,
con Firebase como backend.

[Ver demo en vivo →](https://mozzvader.github.io/bibliotecacebas/)

</div>

---

## ✨ Características

### Gestión de catálogo
- CRUD completo de libros (título, autor, ISBN, género, ejemplares)
- Control automático de stock disponible
- Búsqueda por título, autor o ISBN con debounce
- Filtro por género
- Ordenamiento por cualquier columna
- Paginación

### Préstamos y devoluciones
- Registro de préstamos con selección de libro y usuario
- Cálculo automático de fecha de devolución según configuración
- Devolución con un solo clic
- Detección automática de préstamos vencidos
- Historial personal de préstamos por usuario

### Gestión de usuarios
- CRUD de usuarios (alumnos, docentes, administrativos)
- Creación de cuentas de acceso desde la SPA
- Vinculación automática de cuentas Auth existentes
- Asignación de roles y permisos

### Roles y permisos
| Rol | Catálogo | Préstamos | Usuarios | Vencidos | Reportes | Config |
|-----|----------|-----------|----------|----------|----------|--------|
| **Administrativo** | ✅ CRUD | ✅ CRUD | ✅ CRUD | ✅ | ✅ | ✅ |
| **Docente** | 👁 Lectura | ✅ Registrar/Devolver | ❌ | ✅ | ✅ | ❌ |
| **Alumno** | 👁 Lectura | ❌ | ❌ | ❌ | ✅ | ❌ |

### Panel principal
- Estadísticas en tiempo real (libros, préstamos activos, vencidos, usuarios)
- Tabla de últimos préstamos
- Badge de notificaciones (vencidos y próximos a vencer)

### Reportes
- Total de préstamos históricos y del mes actual
- Ranking de libros más prestados con medallas
- Desglose por rol (alumnos vs docentes)
- Usuario más activo

### UX / UI
- Diseño glassmorphism con modo oscuro
- Responsive (desktop, tablet, mobile con sidebar drawer)
- Autocompletado de búsqueda en selects (combobox)
- Alertas contextuales y modales
- Transiciones suaves al cambiar tema
- Cierre de modales con Escape y clic en overlay

---

## 🛠️ Stack tecnológico

| Tecnología | Uso |
|------------|-----|
| **HTML5** | Estructura SPA con secciones |
| **CSS3** | Glassmorphism, variables CSS, dark mode, responsive |
| **JavaScript ES Modules** | Lógica de la aplicación |
| **Firebase Auth** | Autenticación de usuarios |
| **Firebase Firestore** | Base de datos NoSQL |
| **GitHub Pages** | Deploy estático |

---

## 📁 Estructura del proyecto

```
bibliotecacebas/
├── index.html              # SPA principal (todas las vistas)
├── assets/
│   ├── app.js              # Lógica completa de la aplicación
│   ├── estilos.css         # Estilos con glassmorphism + dark mode
│   ├── firebase.js         # Configuración e inicialización de Firebase
│   └── favicon.svg         # Ícono del sitio
└── README.md
```

---

## 🚀 Instalación y deploy

### Requisitos previos
- Un proyecto en [Firebase Console](https://console.firebase.google.com/)
- Authentication habilitado (Email/Password)
- Firestore creado con las siguientes colecciones:
  - `libros`
  - `usuarios`
  - `prestamos`
  - `config`

### Configurar Firebase

1. Crear un proyecto en Firebase Console
2. Habilitar **Authentication** → Proveedor **Email/Contraseña**
3. Crear **Firestore Database**
4. Copiar las credenciales de configuración en `assets/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

### Índices compuestos de Firestore

La aplicación necesita los siguientes índices compuestos para que
las consultas con múltiples filtros funcionen correctamente:

| Colección | Campos indexados | Modo |
|-----------|-----------------|------|
| `prestamos` | `estado` asc, `libroId` asc | `where("estado") + where("libroId")` |
| `prestamos` | `usuarioId` asc, `fechaPrestamo` desc | `where("usuarioId") + orderBy("fechaPrestamo")` |
| `prestamos` | `estado` asc, `usuarioId` asc | `where("estado") + where("usuarioId")` |

> Si no existen, Firestore mostrará un error con un enlace directo para crearlos.

### Deploy en GitHub Pages

1. Subir el repo a GitHub
2. Ir a **Settings → Pages**
3. Seleccionar rama `main` y carpeta raíz `/`
4. Guardar y esperar el deploy

---

## 👤 Roles del sistema

- **Administrativo**: acceso total. Puede gestionar usuarios, libros, préstamos, configuración y ver reportes.
- **Docente**: puede ver catálogo, registrar y devolver préstamos, ver vencidos y reportes.
- **Alumno**: solo lectura en catálogo y reportes. Puede ver su propio historial de préstamos.

Los usuarios pueden crear su cuenta desde la pantalla de login y se les asigna
el rol **Alumno** por defecto. Un administrativo puede cambiar el rol desde la
sección *Usuarios*.

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).

<div align="center">

<img src="assets/logo-cebas48.png" alt="CEBAS" width="48">

# Biblioteca - CEBAS 2

**Sistema de gestión bibliotecaria para escuelas**

[![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-success)](https://mozzvader.github.io/bibliotecacebas/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Aplicación web SPA para administrar el catálogo, préstamos, devoluciones y usuarios
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
- Selección masiva con checkboxes (eliminación batch)
- Portada de libros desde URL (preview, edición, eliminación)
- Detalle de libro en modal con vista y modo edición
- **Exportación a PDF y XLSX** con logo, resumen y tabla con filas alternadas
- **Carga masiva de libros** desde Excel/CSV con plantilla descargable

### Préstamos y devoluciones
- Registro de préstamos con autocompletado de libro y usuario (combobox)
- Validación de stock con transacciones Firestore (evita préstamos duplicados)
- Cálculo automático de fecha de devolución según configuración
- Devolución con un solo clic
- **Renovación** de préstamos activos (1 renovación permitida)
- Detección automática de préstamos vencidos
- Historial personal de préstamos por usuario
- Búsqueda por título de libro o nombre de usuario
- Filtro por estado (activo, devuelto, vencido)
- **Filtrado por rango de fechas** (Desde / Hasta)
- **Exportación a PDF y XLSX** con filtros activos
- Ordenamiento por cualquier columna y paginación

### Gestión de usuarios
- CRUD de usuarios (alumnos, docentes, administrativos)
- Creación de cuentas desde la SPA (auto-registro)
- Vinculación automática de cuentas Auth existentes
- Asignación de roles y permisos
- Búsqueda por nombre, DNI o tipo
- Filtro por tipo de usuario
- Contador de préstamos por usuario
- Ordenamiento y paginación

### Roles y permisos
| Rol | Catálogo | Préstamos | Usuarios | Vencidos | Reportes | Config | Log |
|-----|----------|-----------|----------|----------|----------|--------|-----|
| **Administrativo** | ✅ CRUD | ✅ CRUD | ✅ CRUD | ✅ | ✅ | ✅ | ✅ |
| **Docente** | 👁 Lectura | ✅ Registrar/Devolver | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Alumno** | 👁 Lectura | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

### Panel principal (Dashboard)
- Estadísticas en tiempo real (libros, préstamos activos, vencidos, usuarios)
- Tabla de últimos préstamos con ordenamiento
- Badge de notificaciones (vencidos y próximos a vencer)

### Vencidos
- Listado de préstamos vencidos con días de atraso
- Búsqueda por título o usuario
- Badge rojo en el sidebar con cantidad de vencidos

### Mi historial
- Historial personal de préstamos del usuario logueado
- Columnas: libro, fecha préstamo, devolución, devolución real, estado, días de atraso
- **Filtrado por rango de fechas**
- Renovación directa desde el historial
- Ordenamiento y paginación

### Reportes
- Total de préstamos (históricos o filtrados por período)
- Préstamos del mes actual
- Desglose por rol (alumnos vs docentes)
- Usuario más activo
- Ranking de top 10 libros más prestados con medallas
- **Filtrado por rango de fechas** que actualiza todas las estadísticas
- Ordenamiento por cualquier columna

### Notificaciones
- Badge con contador de préstamos vencidos y próximos a vencer
- Dropdown de notificaciones con detalles y acciones rápidas
- Actualización automática al navegar

### Log de eventos (Audit Log)
- Registro de actividad del sistema
- Filtros por entidad (libros, usuarios, préstamos, configuración)
- Filtros por acción (crear, editar, eliminar, devolver, configurar, registro)
- Búsqueda por texto libre
- Paginación

### Configuración
- Nombre de la institución
- Días de préstamo por defecto
- Nombre del bibliotecario

### Integración con Open Library API
- Búsqueda automática de portadas y datos de libros
- Autocompletado al agregar/editar libros

### UX / UI
- Diseño glassmorphism con modo oscuro
- Logo y favicon personalizados
- Responsive (desktop, tablet, mobile con sidebar drawer)
- Autocompletado de búsqueda en selects (combobox)
- Alertas contextuales (toasts) y modales
- Transiciones suaves al cambiar tema
- Cierre de modales con Escape y clic en overlay
- Loading spinner durante operaciones
- Columnas ordenables en todas las tablas

---

## 🛠️ Stack tecnológico

| Tecnología | Uso |
|------------|-----|
| **HTML5** | Estructura SPA con secciones |
| **CSS3** | Glassmorphism, variables CSS, dark mode, responsive |
| **JavaScript ES6+** | Lógica de la aplicación (vanilla, sin frameworks) |
| **Firebase Auth** | Autenticación de usuarios (email/contraseña) |
| **Firebase Firestore** | Base de datos NoSQL |
| **jsPDF + autoTable** | Generación de PDF |
| **SheetJS (XLSX)** | Importación y exportación de Excel |
| **Open Library API** | Datos de libros y portadas |
| **GitHub Pages** | Deploy estático |

---

## 📁 Estructura del proyecto

```
bibliotecacebas/
├── index.html              # SPA principal (todas las vistas y modales)
├── assets/
│   ├── app.js              # Lógica completa de la aplicación (~3800 líneas)
│   ├── estilos.css         # Estilos con glassmorphism + dark mode
│   ├── firebase.js         # Configuración e inicialización de Firebase
│   ├── logo-cebas48.png    # Logo de la biblioteca
│   ├── favicon.ico         # Favicon del sitio
│   └── favicon-16.png      # Favicon PNG alternativo
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
  - `auditlog`

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

- **Administrativo**: acceso total. Puede gestionar usuarios, libros, préstamos, configuración, ver reportes y el log de eventos.
- **Docente**: puede ver catálogo, registrar y devolver préstamos, ver vencidos y reportes.
- **Alumno**: solo lectura en catálogo y reportes. Puede ver su propio historial de préstamos.

Los usuarios pueden crear su cuenta desde la pantalla de login y se les asigna
el rol **Alumno** por defecto. Un administrativo puede cambiar el rol desde la
sección *Usuarios*.

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).

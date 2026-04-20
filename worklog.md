---
Task ID: 1
Agent: Super Z (main)
Task: Re-implementar carga masiva de libros y limpiar repo

Work Log:
- Clonado repo MozzVader/bibliotecacebas (se corrigió remote que apuntaba a LuisFerMaza)
- Eliminada referencia de submodule `bibliotecacebas` que causaba problemas de deploy
- Verificados archivos existentes: index.html, assets/app.js, assets/estilos.css, assets/firebase.js
- Confirmado que no existía implementación previa de CargaMasiva

Cambios implementados:

1. **index.html**:
   - Agregado CDN de SheetJS (xlsx-0.20.1) en <head>
   - Tarjeta de "Carga masiva de libros" en sección Configuración
   - Modal `modal-carga-masiva` con dropzone, vista previa, barra de progreso y botón importar

2. **assets/firebase.js**:
   - Importado `writeBatch` desde Firestore SDK
   - Exportado `writeBatch` para uso en app.js

3. **assets/app.js**:
   - Importado `writeBatch` en app.js
   - Módulo `CargaMasiva` completo (~280 líneas) con:
     - `abrirModal()` / `cerrarModal()` / `_resetState()`
     - `_initDropzone()` con drag & drop y click-to-select
     - `_procesarArchivo()` usando SheetJS para leer xlsx/csv
     - `_parsearFilas()` con normalización flexible de columnas
     - `_renderVistaPrevia()` con tabla de preview (máx 100 filas)
     - `importar()` con writeBatch y barra de progreso
   - `window.CargaMasiva = CargaMasiva` para acceso global
   - Lógica de visibilidad en `Config.cargar()` para ocultar tarjeta si no es admin

4. **assets/estilos.css**:
   - Estilos `.dropzone` con hover/drag-over
   - `.dropzone-content` y `.dropzone-file`
   - `.progress-bar` y `.progress-fill`
   - Estilos para tabla de vista previa

5. **Limpieza**:
   - Eliminado `bibliotecacebas` (submodule reference basura)

Stage Summary:
- Commit: f2a6b36 "feat: carga masiva de libros desde Excel/CSV"
- Push exitoso a MozzVader/bibliotecacebas (main)
- 5 archivos modificados, 489 inserciones, 4 eliminaciones
- Deploy debería funcionar correctamente sin archivos extra

# MedHistorical — Sistema de Ortopedia

Aplicación web local para gestionar una consulta de ortopedia: pacientes, citas,
historial médico, documentos, facturación y estadísticas.

## Cómo iniciar

Requisitos: [Node.js](https://nodejs.org) (v18 o superior).

```bash
npm install
node server.js
```

Abre el navegador en:

```
http://localhost:3000/login.html
```

El servidor levanta la base de datos local (`data.db`, SQLite) y sirve el frontend.
El primer usuario registrado es administrador; el resto de cuentas quedan como usuarios.

## Qué hace el sistema

- **Inicio / Dashboard** — próximas citas, citas completadas y diagnóstico, citas
  sin consulta y pacientes sin cita, con acceso a estadísticas.
- **Pacientes** — registrar (código automático), editar, ver ficha, borrado suave
  y eliminación definitiva (solo admin).
- **Citas** — agendar con turno y límites diarios/semanales configurables, avisos
  por WhatsApp o correo, impresión de turnos y calendario mensual.
  - Submenú del botón "Citas": **Citas completadas y diagnósticos** (guardar
    diagnóstico y tratamiento, reabrir, eliminar), **Citas sin consulta** y
    **Pacientes sin cita**.
- **Registros** — historial médico con descripción y archivo adjunto (PDF/imagen).
- **Documentos** — repositorio de archivos con descarga.
- **Facturación** — facturas por paciente con procedimientos, honorarios e impresión.
- **Administración** (solo admin) — gestión de usuarios, opciones del sistema y
  botón de **Ayuda** (guía de cada opción) en la esquina inferior derecha.
- **Modo claro / oscuro**, recuperación de contraseña y perfil con foto.

## Persistencia

Todo se guarda en una **base de datos SQLite local** (`data.db`) a través del
servidor (`server.js`), que es la fuente de verdad.

- La capa de datos está en `database.js`: un catálogo esquemático (ORM ligero)
  que define cada colección con sus tablas y columnas tipadas, y sus campos JSON.
- El frontend sincroniza las colecciones con la API:
  - `GET /api/datos` — descarga todo el estado.
  - `POST /api/datos` — guarda las colecciones en una transacción.
- En el primer arranque, los datos antiguos de `localStorage` se migran solos a la
  base. Si el servidor no está disponible, el sistema degrada a `localStorage`.

## Notas

- La carpeta del proyecto no debe estar en una ubicación sincronizada por la nube
  (OneDrive, Dropbox, etc.): el bloqueo de sincronización impide que SQLite escriba.
- Los archivos `med.html` y `setup.js` son material de práctica previo y no forman
  parte del sistema.
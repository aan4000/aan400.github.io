const sqlite = require("sqlite3");
const path = require("path");

const RUTA_DB = path.join(__dirname, "data.db");

// Catálogo esquemático: define colecciones → tablas tipadas.
// Los campos `json` guardan objetos/arreglos como JSON en una columna TEXT.
const CATALOGO = {
  usuarios: {
    tabla: "usuarios",
    campos: ["id", "name", "email", "password", "role", "foto", "createdAt"],
    json: []
  },
  pacientes: {
    tabla: "pacientes",
    campos: ["id", "codigo", "nombre", "cedula", "seguro", "edad", "sexo", "telefono", "email", "notas", "foto", "eliminado", "createdAt"],
    json: []
  },
  citas: {
    tabla: "citas",
    campos: ["id", "pacienteId", "fecha", "hora", "amPm", "motivo", "turno", "completada", "diagnostico", "tratamiento", "fechaCompletada", "cancelada", "fechaCancelacion"],
    json: []
  },
  registros: {
    tabla: "registros",
    campos: ["id", "pacienteId", "titulo", "detalle", "fecha", "tipo", "archivo", "proximaCita"],
    json: ["archivo", "proximaCita"]
  },
  documentos: {
    tabla: "documentos",
    campos: ["id", "pacienteId", "descripcion", "name", "type", "size", "dataUrl", "fecha"],
    json: []
  },
  facturas: {
    tabla: "facturas",
    campos: ["id", "codigo", "pacienteId", "subtotal", "porcentaje", "honorarios", "neto", "total", "doctor", "fecha", "items"],
    json: ["items"]
  },
  citasSinConsulta: {
    tabla: "citas_sin_consulta",
    campos: ["id", "pacienteId", "fecha", "hora", "amPm", "motivo", "turno"],
    json: []
  },
  recetas: {
    tabla: "recetas",
    campos: ["id", "codigo", "pacienteId", "fecha", "edad", "doctor", "medicamentos", "indicaciones"],
    json: ["medicamentos", "indicaciones"]
  },
  evaluaciones: {
    tabla: "evaluaciones",
    campos: ["id", "pacienteId", "fecha", "sexo", "nota", "lesiones"],
    json: ["lesiones"]
  }
};

const BOOLEANOS = ["eliminado", "completada", "cancelada"];

function abrir() {
  return new Promise((resolve, reject) => {
    const db = new sqlite.Database(RUTA_DB, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE, (err) =>
      err ? reject(err) : resolve(db)
    );
  });
}

function ejecutar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function consultar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
  });
}

async function inicializar(db) {
  await ejecutar(db, "CREATE TABLE IF NOT EXISTS Categories (id INTEGER PRIMARY KEY, name TEXT)");
  await ejecutar(db, 'DROP TABLE IF EXISTS kv');
  for (const modelo of Object.values(CATALOGO)) {
    const columnas = modelo.campos
      .map(c => (c === "id" ? '"id" INTEGER PRIMARY KEY' : '"' + c + '" TEXT'))
      .join(", ");
    await ejecutar(db, `CREATE TABLE IF NOT EXISTS "${modelo.tabla}" (${columnas})`);
  }
  for (const modelo of Object.values(CATALOGO)) {
    const existentes = new Set((await consultar(db, `PRAGMA table_info("${modelo.tabla}")`)).map(c => c.name));
    for (const campo of modelo.campos) {
      if (!existentes.has(campo)) {
        await ejecutar(db, `ALTER TABLE "${modelo.tabla}" ADD COLUMN "${campo}" TEXT`);
      }
    }
  }
  await ejecutar(db, "CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT)");
}

function filaADato(modelo, fila) {
  const dato = {};
  for (const campo of modelo.campos) {
    const valor = fila[campo];
    if (valor === null || valor === undefined) {
      if (BOOLEANOS.includes(campo)) dato[campo] = false;
      continue;
    }
    if (modelo.json.includes(campo)) {
      try {
        dato[campo] = JSON.parse(valor);
      } catch {
        continue;
      }
      continue;
    }
    if (BOOLEANOS.includes(campo)) {
      dato[campo] = valor === 1 || valor === true || valor === "1";
      continue;
    }
    dato[campo] = valor;
  }
  return dato;
}

function datoAFila(modelo, dato) {
  return modelo.campos.map(campo => {
    const valor = dato[campo];
    if (valor === undefined) return null;
    if (modelo.json.includes(campo)) return JSON.stringify(valor);
    if (BOOLEANOS.includes(campo)) return valor ? 1 : 0;
    return valor;
  });
}

async function cargarConfig(db) {
  const filas = await consultar(db, "SELECT clave, valor FROM config");
  const cfg = {};
  for (const f of filas) {
    try {
      cfg[f.clave] = JSON.parse(f.valor);
    } catch {
      cfg[f.clave] = f.valor;
    }
  }
  return cfg;
}

async function cargarColeccion(db, clave) {
  const modelo = CATALOGO[clave];
  if (!modelo) throw new Error("Colección desconocida: " + clave);
  const filas = await consultar(db, `SELECT * FROM "${modelo.tabla}"`);
  return filas.map(f => filaADato(modelo, f));
}

async function fondoColeccion(db, modelo, datos) {
  const filas = datos.map(d => datoAFila(modelo, d));
  await ejecutar(db, `DELETE FROM "${modelo.tabla}"`);
  if (filas.length) {
    const columnas = modelo.campos.map(c => '"' + c + '"').join(", ");
    const placeholders = modelo.campos.map(() => "?").join(", ");
    for (const fila of filas) {
      await ejecutar(db, `INSERT INTO "${modelo.tabla}" (${columnas}) VALUES (${placeholders})`, fila);
    }
  }
}

async function reemplazarColeccion(db, clave, datos) {
  const modelo = CATALOGO[clave];
  if (!modelo) throw new Error("Colección desconocida: " + clave);
  await ejecutar(db, "BEGIN");
  try {
    await fondoColeccion(db, modelo, datos || []);
    await ejecutar(db, "COMMIT");
  } catch (err) {
    await ejecutar(db, "ROLLBACK");
    throw err;
  }
}

async function guardarConfig(db, config) {
  await ejecutar(db, "BEGIN");
  try {
    await ejecutar(db, "DELETE FROM config");
    const cfg = config || {};
    for (const [clave, valor] of Object.entries(cfg)) {
      await ejecutar(db, "INSERT INTO config (clave, valor) VALUES (?, ?)", [clave, JSON.stringify(valor)]);
    }
    await ejecutar(db, "COMMIT");
  } catch (err) {
    await ejecutar(db, "ROLLBACK");
    throw err;
  }
}

async function cargarTodo(db) {
  const salida = { config: {} };
  for (const [clave, modelo] of Object.entries(CATALOGO)) {
    const filas = await consultar(db, `SELECT * FROM "${modelo.tabla}"`);
    salida[clave] = filas.map(f => filaADato(modelo, f));
  }
  salida.config = await cargarConfig(db);
  return salida;
}

async function guardarTodo(db, datos) {
  await ejecutar(db, "BEGIN");
  try {
    for (const [clave, modelo] of Object.entries(CATALOGO)) {
      await fondoColeccion(db, modelo, datos[clave] || []);
    }
    await ejecutar(db, "DELETE FROM config");
    const config = datos.config || {};
    for (const [clave, valor] of Object.entries(config)) {
      await ejecutar(db, "INSERT INTO config (clave, valor) VALUES (?, ?)", [clave, JSON.stringify(valor)]);
    }
    await ejecutar(db, "COMMIT");
  } catch (err) {
    await ejecutar(db, "ROLLBACK");
    throw err;
  }
}

module.exports = {
  abrir,
  inicializar,
  consultar,
  cargarTodo,
  guardarTodo,
  cargarColeccion,
  reemplazarColeccion,
  cargarConfig,
  guardarConfig
};
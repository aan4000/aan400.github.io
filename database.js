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
    campos: ["id", "pacienteId", "fecha", "hora", "amPm", "motivo", "turno", "completada", "diagnostico", "tratamiento", "fechaCompletada"],
    json: []
  },
  registros: {
    tabla: "registros",
    campos: ["id", "pacienteId", "titulo", "detalle", "fecha"],
    json: ["archivo"]
  },
  documentos: {
    tabla: "documentos",
    campos: ["id", "pacienteId", "descripcion", "name", "type", "size", "dataUrl", "fecha"],
    json: []
  },
  facturas: {
    tabla: "facturas",
    campos: ["id", "codigo", "pacienteId", "subtotal", "porcentaje", "honorarios", "neto", "total", "doctor", "fecha"],
    json: ["items"]
  },
  citasSinConsulta: {
    tabla: "citas_sin_consulta",
    campos: ["id", "pacienteId", "fecha", "hora", "amPm", "motivo", "turno"],
    json: []
  }
};

const BOOLEANOS = ["eliminado", "completada"];

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

async function cargarTodo(db) {
  const salida = { config: {} };
  for (const [clave, modelo] of Object.entries(CATALOGO)) {
    const filas = await consultar(db, `SELECT * FROM "${modelo.tabla}"`);
    salida[clave] = filas.map(f => filaADato(modelo, f));
  }
  const filasConfig = await consultar(db, "SELECT clave, valor FROM config");
  for (const f of filasConfig) {
    try {
      salida.config[f.clave] = JSON.parse(f.valor);
    } catch {
      salida.config[f.clave] = f.valor;
    }
  }
  return salida;
}

async function guardarTodo(db, datos) {
  await ejecutar(db, "BEGIN");
  try {
    for (const [clave, modelo] of Object.entries(CATALOGO)) {
      const filas = (datos[clave] || []).map(d => datoAFila(modelo, d));
      await ejecutar(db, `DELETE FROM "${modelo.tabla}"`);
      if (filas.length) {
        const columnas = modelo.campos.map(c => '"' + c + '"').join(", ");
        const placeholders = modelo.campos.map(() => "?").join(", ");
        for (const fila of filas) {
          await ejecutar(db, `INSERT INTO "${modelo.tabla}" (${columnas}) VALUES (${placeholders})`, fila);
        }
      }
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
  guardarTodo
};
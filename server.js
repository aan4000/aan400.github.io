const express = require("express");
const Base = require("./database");

const app = express();

app.use(express.static(__dirname));
app.use(express.json({ limit: "50mb" }));

Base.abrir()
  .then(db => {
    app.locals.db = db;
    return Base.inicializar(db);
  })
  .then(() => {
    app.get("/api/datos", async (req, res) => {
      try {
        res.json(await Base.cargarTodo(app.locals.db));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/datos/:modelo", async (req, res) => {
      const modelo = req.params.modelo;
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: "Cuerpo inválido: se espera un arreglo" });
      }
      try {
        await Base.reemplazarColeccion(app.locals.db, modelo, req.body);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/config", async (req, res) => {
      try {
        res.json(await Base.cargarConfig(app.locals.db));
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/config", async (req, res) => {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ error: "Cuerpo inválido" });
      }
      try {
        await Base.guardarConfig(app.locals.db, req.body);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/datos", async (req, res) => {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ error: "Cuerpo inválido" });
      }
      try {
        await Base.guardarTodo(app.locals.db, req.body);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/categoria", async (req, res) => {
      const id = req.query.id || 1;
      try {
        const filas = await Base.consultar(
          app.locals.db,
          "SELECT * FROM Categories WHERE id = ?",
          [id]
        );
        res.json(filas[0] || { error: "No se encontró la categoría" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.listen(3000, () => {
      console.log("Servidor en http://localhost:3000 (base local: data.db)");
    });
  })
  .catch(err => {
    console.error("Error al iniciar la base:", err.message);
    process.exit(1);
  });
const express = require("express");
const sqlite = require("sqlite3");
const path = require("path");

const app = express();
const db = new sqlite.Database("./data.db", sqlite.OPEN_READWRITE, (err) => {
  if (err) {
    console.error("Error al abrir la base:", err.message);
    process.exit(1);
  }
});

app.use(express.static(__dirname));

app.get("/api/categoria", (req, res) => {
  const id = req.query.id || 1;
  db.get("SELECT * FROM Categories WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || { error: "No se encontró la categoría" });
  });
});

app.listen(3000, () => {
  console.log("Servidor en http://localhost:3000");
});

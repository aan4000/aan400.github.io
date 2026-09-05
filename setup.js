const sqlite = require("sqlite3");
const db = new sqlite.Database("./data.db", (err) => {
  if (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
  db.run(
    `CREATE TABLE IF NOT EXISTS Categories (
      id INTEGER PRIMARY KEY,
      name TEXT
    )`,
    (e) => {
      if (e) throw e;
      const insert = db.prepare("INSERT OR IGNORE INTO Categories (id, name) VALUES (?, ?)");
      insert.run(1, "Categoría de ejemplo");
      insert.finalize(() => {
        console.log("Base lista con datos de ejemplo.");
        db.close();
      });
    }
  );
});

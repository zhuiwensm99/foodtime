"use strict";

// Pure-WASM SQLite (sql.js) wrapper that mimics the small subset of the
// better-sqlite3 API used by fridge_tracker (prepare/get/all/run, exec,
// serialize). Used in EdgeOne serverless mode to avoid native-module / GLIBC
// incompatibilities. Local dev can still use better-sqlite3 directly.

const path = require("node:path");
const initSqlJs = require("sql.js");

let enginePromise = null;

function getEngine() {
  if (!enginePromise) {
    const distDir = path.dirname(require.resolve("sql.js"));
    enginePromise = initSqlJs({
      // Resolve the .wasm next to the loader so it works inside the bundled
      // EdgeOne cloud function (where the working directory is not the package).
      locateFile: (file) => path.join(distDir, file)
    });
  }
  return enginePromise;
}

class Statement {
  constructor(db, sqlDb, sql) {
    this._db = db;
    this._sqlDb = sqlDb;
    this._stmt = sqlDb.prepare(sql);
  }

  get(...params) {
    if (params.length) this._stmt.bind(params);
    let row;
    if (this._stmt.step()) row = this._stmt.getAsObject();
    this._stmt.reset();
    return row;
  }

  all(...params) {
    if (params.length) this._stmt.bind(params);
    const rows = [];
    while (this._stmt.step()) rows.push(this._stmt.getAsObject());
    this._stmt.reset();
    return rows;
  }

  run(...params) {
    if (params.length) this._stmt.bind(params);
    this._stmt.step();
    this._stmt.reset();
    return {
      changes: this._sqlDb.getRowsModified(),
      lastInsertRowid: this._db._lastInsertRowid()
    };
  }

  free() {
    try {
      this._stmt.free();
    } catch (_) {
      /* noop */
    }
  }
}

class Database {
  constructor(sqlDb) {
    this._sqlDb = sqlDb;
  }

  prepare(sql) {
    return new Statement(this, this._sqlDb, sql);
  }

  exec(sql) {
    return this._sqlDb.exec(sql);
  }

  serialize() {
    return Buffer.from(this._sqlDb.export());
  }

  _lastInsertRowid() {
    const res = this._sqlDb.exec("SELECT last_insert_rowid() AS id");
    if (res.length && res[0].values.length) return res[0].values[0][0];
    return 0;
  }
}

async function createDatabase(arg) {
  const SQL = await getEngine();
  let sqlDb;
  if (arg === ":memory:" || arg == null) {
    sqlDb = new SQL.Database();
  } else if (Buffer.isBuffer(arg)) {
    sqlDb = new SQL.Database(new Uint8Array(arg));
  } else if (arg instanceof Uint8Array) {
    sqlDb = new SQL.Database(arg);
  } else {
    // Local-dev file path: load bytes if present, else start empty.
    const fs = require("node:fs");
    if (fs.existsSync(arg)) {
      sqlDb = new SQL.Database(new Uint8Array(fs.readFileSync(arg)));
    } else {
      sqlDb = new SQL.Database();
    }
  }
  return new Database(sqlDb);
}

module.exports = { createDatabase, Database, Statement };

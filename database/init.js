const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'chat.db');

let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    try {
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            console.log('✅ Loaded existing database');
        } else {
            db = new SQL.Database();
            console.log('✅ Created new database');
        }
    } catch (error) {
        db = new SQL.Database();
        console.log('✅ Created new database (fresh start)');
    }

    // Create tables
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      online INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      read INTEGER DEFAULT 0,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);

    // Save database
    saveDatabase();

    console.log('✅ Database tables initialized');
    return db;
}

// Save database to file
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// Get database instance
function getDb() {
    return db;
}

// Helper to run queries that don't return results
function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

// Helper to get one row
function get(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

// Helper to get all rows
function all(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// Helper to insert and get last insert id
function insert(sql, params = []) {
    db.run(sql, params);
    const result = db.exec("SELECT last_insert_rowid() as id");
    saveDatabase();
    return result[0]?.values[0]?.[0] || null;
}

module.exports = { initDatabase, getDb, run, get, all, insert, saveDatabase };

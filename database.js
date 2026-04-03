import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, 'db');
const DB_PATH = join(DB_DIR, 'family.db');

mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Add is_deceased column to existing databases that predate this column
try { db.exec("ALTER TABLE people ADD COLUMN is_deceased INTEGER DEFAULT 0"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    birth_date TEXT,
    death_date TEXT,
    gender TEXT CHECK(gender IN ('M','F','Other')) DEFAULT 'Other',
    photo TEXT,
    notes TEXT,
    is_deceased INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person1_id INTEGER NOT NULL,
    person2_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('parent','spouse')) NOT NULL,
    start_date TEXT,
    end_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (person1_id) REFERENCES people(id) ON DELETE CASCADE,
    FOREIGN KEY (person2_id) REFERENCES people(id) ON DELETE CASCADE
  );
`);

export const people = {
  getAll() {
    return db.prepare('SELECT * FROM people ORDER BY last_name, first_name').all();
  },

  getById(id) {
    return db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  },

  create({ first_name, last_name = '', birth_date = null, death_date = null, gender = 'Other', photo = null, notes = null, is_deceased = 0 }) {
    const stmt = db.prepare(`
      INSERT INTO people (first_name, last_name, birth_date, death_date, gender, photo, notes, is_deceased)
      VALUES (@first_name, @last_name, @birth_date, @death_date, @gender, @photo, @notes, @is_deceased)
    `);
    const result = stmt.run({ first_name, last_name, birth_date, death_date, gender, photo, notes, is_deceased: is_deceased ? 1 : 0 });
    return db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid);
  },

  update(id, { first_name, last_name, birth_date, death_date, gender, photo, notes, is_deceased }) {
    const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (!existing) return null;
    const updated = {
      first_name: first_name ?? existing.first_name,
      last_name: last_name ?? existing.last_name,
      birth_date: birth_date !== undefined ? birth_date : existing.birth_date,
      death_date: death_date !== undefined ? death_date : existing.death_date,
      gender: gender ?? existing.gender,
      photo: photo !== undefined ? photo : existing.photo,
      notes: notes !== undefined ? notes : existing.notes,
      is_deceased: is_deceased !== undefined ? (is_deceased ? 1 : 0) : existing.is_deceased,
    };
    db.prepare(`
      UPDATE people SET
        first_name = @first_name,
        last_name = @last_name,
        birth_date = @birth_date,
        death_date = @death_date,
        gender = @gender,
        photo = @photo,
        notes = @notes,
        is_deceased = @is_deceased
      WHERE id = @id
    `).run({ ...updated, id });
    return db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  },

  delete(id) {
    const result = db.prepare('DELETE FROM people WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

export const relationships = {
  getAll() {
    return db.prepare('SELECT * FROM relationships ORDER BY created_at').all();
  },

  create({ person1_id, person2_id, type, start_date = null, end_date = null, notes = null }) {
    const stmt = db.prepare(`
      INSERT INTO relationships (person1_id, person2_id, type, start_date, end_date, notes)
      VALUES (@person1_id, @person2_id, @type, @start_date, @end_date, @notes)
    `);
    const result = stmt.run({ person1_id, person2_id, type, start_date, end_date, notes });
    return db.prepare('SELECT * FROM relationships WHERE id = ?').get(result.lastInsertRowid);
  },

  delete(id) {
    const result = db.prepare('DELETE FROM relationships WHERE id = ?').run(id);
    return result.changes > 0;
  }
};

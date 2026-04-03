// seed.js — Populate the database with 42 family members from CSV
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, 'db');
const DB_PATH = join(DB_DIR, 'family.db');

mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Clear existing data
db.exec('DELETE FROM relationships');
db.exec('DELETE FROM people');
db.exec("DELETE FROM sqlite_sequence WHERE name='people' OR name='relationships'");

const insertPerson = db.prepare(`
  INSERT INTO people (first_name, last_name, gender)
  VALUES (@first_name, @last_name, @gender)
`);

const insertRel = db.prepare(`
  INSERT INTO relationships (person1_id, person2_id, type)
  VALUES (@person1_id, @person2_id, @type)
`);

// ── 42 People ──────────────────────────────────────────────────────────────
const peopleData = [
  { first_name: 'אבי',    last_name: 'קינן',              gender: 'M' },
  { first_name: 'שי',     last_name: 'קינן',              gender: 'M' },
  { first_name: 'איתי',   last_name: 'קינן',              gender: 'M' },
  { first_name: 'אינגה',  last_name: 'קינן',              gender: 'F' },
  { first_name: 'ראובן',  last_name: 'קינן',              gender: 'M' },
  { first_name: 'ליאנה',  last_name: 'גינגיחשווילי',     gender: 'F' },
  { first_name: 'רפי',    last_name: 'גינגיחשווילי',     gender: 'M' },
  { first_name: 'נטלה',   last_name: 'קונשווילי',        gender: 'F' },
  { first_name: 'יוכבת',  last_name: '',                  gender: 'F' },
  { first_name: 'נטלה',   last_name: 'פיצחזדה',          gender: 'F' },
  { first_name: 'רימה',   last_name: 'זיזוב',            gender: 'F' },
  { first_name: 'סימון',  last_name: 'זיזוב',            gender: 'M' },
  { first_name: 'נעמה',   last_name: 'מאיר',             gender: 'F' },
  { first_name: 'אליאור', last_name: 'זיזוב',            gender: 'M' },
  { first_name: 'דני',    last_name: 'זיזוב',            gender: 'M' },
  { first_name: 'מיקי',   last_name: 'זיזוב',            gender: 'M' },
  { first_name: 'מירי',   last_name: 'גולן',             gender: 'F' },
  { first_name: 'מישל',   last_name: 'גולן',             gender: 'F' },
  { first_name: 'אבי',    last_name: 'למלא',             gender: 'M' },
  { first_name: 'מיכו',   last_name: 'פיצחזדה',         gender: 'M' },
  { first_name: 'מאיר',   last_name: 'גולן',             gender: 'M' },
  { first_name: 'רויטל',  last_name: 'זיזוב',            gender: 'F' },
  { first_name: 'מוטי',   last_name: 'פיצחזדה',         gender: 'M' },
  { first_name: 'אידה',   last_name: 'פיצחזדה',         gender: 'F' },
  { first_name: 'נלי',    last_name: 'שמיר',             gender: 'F' },
  { first_name: 'בני',    last_name: 'שמיר',             gender: 'M' },
  { first_name: 'ליאם',   last_name: 'שמיר',             gender: 'M' },
  { first_name: 'ליהי',   last_name: 'שמיר',             gender: 'F' },
  { first_name: 'יגאל',   last_name: 'גינת',             gender: 'M' },
  { first_name: 'סופי',   last_name: 'גינת',             gender: 'F' },
  { first_name: 'אור',    last_name: 'דביר',             gender: 'M' },
  { first_name: 'לין',    last_name: 'דביר',             gender: 'F' },
  { first_name: 'גילה',   last_name: 'דביר',             gender: 'F' },
  { first_name: 'סימון',  last_name: 'דביר',             gender: 'M' },
  { first_name: 'איציק',  last_name: 'מגן',              gender: 'M' },
  { first_name: 'גלית',   last_name: 'מגן',              gender: 'F' },
  { first_name: 'אריאל',  last_name: 'מגן',              gender: 'M' },
  { first_name: 'נעמי',   last_name: 'מגן',              gender: 'F' },
  { first_name: 'יומי',   last_name: 'הררי',             gender: 'M' },
  { first_name: 'מורן',   last_name: 'הררי',             gender: 'F' },
  { first_name: 'תמר',    last_name: 'מגן',              gender: 'F' },
  { first_name: 'הילה',   last_name: 'מגן',              gender: 'F' },
];

const ids = {};
db.transaction(() => {
  for (const p of peopleData) {
    const r = insertPerson.run(p);
    ids[`${p.first_name} ${p.last_name}`.trim()] = r.lastInsertRowid;
  }
})();

// Helper: look up ID by full name
function id(name) {
  const found = ids[name];
  if (!found) throw new Error(`Unknown person: "${name}"`);
  return found;
}

// ── Parent-Child Relationships (person1=parent, person2=child) ─────────────
const parentChild = [
  // Children of ראובן + אינגה קינן
  ['ראובן קינן', 'אבי קינן'],
  ['אינגה קינן', 'אבי קינן'],
  ['ראובן קינן', 'שי קינן'],
  ['אינגה קינן', 'שי קינן'],
  ['ראובן קינן', 'איתי קינן'],
  ['אינגה קינן', 'איתי קינן'],

  // אינגה's parents
  ['ליאנה גינגיחשווילי', 'אינגה קינן'],
  ['רפי גינגיחשווילי',   'אינגה קינן'],

  // ראובן's mother
  ['נטלה קונשווילי', 'ראובן קינן'],

  // ליאנה's mother
  ['יוכבת', 'ליאנה גינגיחשווילי'],

  // יוכבת's children
  ['יוכבת', 'נטלה פיצחזדה'],
  ['יוכבת', 'רימה זיזוב'],

  // Children of סימון + רימה זיזוב
  ['סימון זיזוב', 'אליאור זיזוב'],
  ['רימה זיזוב',  'אליאור זיזוב'],
  ['סימון זיזוב', 'דני זיזוב'],
  ['רימה זיזוב',  'דני זיזוב'],
  ['סימון זיזוב', 'מיקי זיזוב'],
  ['רימה זיזוב',  'מיקי זיזוב'],
  ['סימון זיזוב', 'מירי גולן'],
  ['רימה זיזוב',  'מירי גולן'],

  // מישל's parents
  ['מירי גולן', 'מישל גולן'],
  ['אבי למלא',  'מישל גולן'],

  // Children of מיכו + נטלה פיצחזדה
  ['מיכו פיצחזדה', 'מוטי פיצחזדה'],
  ['נטלה פיצחזדה', 'מוטי פיצחזדה'],
  ['מיכו פיצחזדה', 'נלי שמיר'],
  ['נטלה פיצחזדה', 'נלי שמיר'],

  // Children of בני + נלי שמיר
  ['בני שמיר', 'ליאם שמיר'],
  ['נלי שמיר', 'ליאם שמיר'],
  ['בני שמיר', 'ליהי שמיר'],
  ['נלי שמיר', 'ליהי שמיר'],

  // Children of רפי + ליאנה גינגיחשווילי
  ['רפי גינגיחשווילי',   'יגאל גינת'],
  ['ליאנה גינגיחשווילי', 'יגאל גינת'],
  ['רפי גינגיחשווילי',   'גילה דביר'],
  ['ליאנה גינגיחשווילי', 'גילה דביר'],
  ['רפי גינגיחשווילי',   'גלית מגן'],
  ['ליאנה גינגיחשווילי', 'גלית מגן'],

  // Children of סימון + גילה דביר
  ['סימון דביר', 'אור דביר'],
  ['גילה דביר',  'אור דביר'],
  ['סימון דביר', 'לין דביר'],
  ['גילה דביר',  'לין דביר'],
  ['סימון דביר', 'מורן הררי'],
  ['גילה דביר',  'מורן הררי'],

  // Children of איציק + גלית מגן
  ['איציק מגן', 'אריאל מגן'],
  ['גלית מגן',  'אריאל מגן'],
  ['איציק מגן', 'נעמי מגן'],
  ['גלית מגן',  'נעמי מגן'],
  ['איציק מגן', 'תמר מגן'],
  ['גלית מגן',  'תמר מגן'],
  ['איציק מגן', 'הילה מגן'],
  ['גלית מגן',  'הילה מגן'],
];

// ── Spouse Relationships ───────────────────────────────────────────────────
const spousePairs = [
  ['ראובן קינן',          'אינגה קינן'],
  ['ליאנה גינגיחשווילי', 'רפי גינגיחשווילי'],
  ['מיכו פיצחזדה',       'נטלה פיצחזדה'],
  ['סימון זיזוב',         'רימה זיזוב'],
  ['אליאור זיזוב',        'נעמה מאיר'],
  ['דני זיזוב',           'רויטל זיזוב'],
  ['מירי גולן',           'מאיר גולן'],
  ['מוטי פיצחזדה',       'אידה פיצחזדה'],
  ['נלי שמיר',            'בני שמיר'],
  ['יגאל גינת',           'סופי גינת'],
  ['גילה דביר',           'סימון דביר'],
  ['איציק מגן',           'גלית מגן'],
  ['יומי הררי',           'מורן הררי'],
];

db.transaction(() => {
  for (const [parent, child] of parentChild) {
    insertRel.run({ person1_id: id(parent), person2_id: id(child), type: 'parent' });
  }
  for (const [p1, p2] of spousePairs) {
    insertRel.run({ person1_id: id(p1), person2_id: id(p2), type: 'spouse' });
  }
})();

console.log(`✅ Seeded ${peopleData.length} people and ${parentChild.length + spousePairs.length} relationships.`);
db.close();

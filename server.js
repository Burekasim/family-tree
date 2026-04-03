import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { people, relationships } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');

mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload photo
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ filename: req.file.filename, url: `/uploads/${req.file.filename}` });
});

// GET all people
app.get('/api/people', (_req, res) => {
  res.json(people.getAll());
});

// GET single person
app.get('/api/people/:id', (req, res) => {
  const person = people.getById(Number(req.params.id));
  if (!person) return res.status(404).json({ error: 'Not found' });
  res.json(person);
});

// POST create person
app.post('/api/people', (req, res) => {
  const { first_name } = req.body;
  if (!first_name || !first_name.trim()) {
    return res.status(400).json({ error: 'first_name is required' });
  }
  const person = people.create(req.body);
  res.status(201).json(person);
});

// PUT update person
app.put('/api/people/:id', (req, res) => {
  const person = people.update(Number(req.params.id), req.body);
  if (!person) return res.status(404).json({ error: 'Not found' });
  res.json(person);
});

// DELETE person
app.delete('/api/people/:id', (req, res) => {
  const ok = people.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// GET all relationships
app.get('/api/relationships', (_req, res) => {
  res.json(relationships.getAll());
});

// POST create relationship
app.post('/api/relationships', (req, res) => {
  const { person1_id, person2_id, type } = req.body;
  if (!person1_id || !person2_id || !type) {
    return res.status(400).json({ error: 'person1_id, person2_id, and type are required' });
  }
  if (!['parent', 'spouse'].includes(type)) {
    return res.status(400).json({ error: 'type must be parent or spouse' });
  }
  const rel = relationships.create(req.body);

  // Auto-associate: when parent→child is added, also link the parent's spouse to the child
  if (type === 'parent') {
    const parentId = Number(person1_id);
    const childId  = Number(person2_id);
    const allRels  = relationships.getAll();

    // Find spouses of this parent
    allRels
      .filter(r => r.type === 'spouse' && (r.person1_id === parentId || r.person2_id === parentId))
      .forEach(sr => {
        const spouseId = sr.person1_id === parentId ? sr.person2_id : sr.person1_id;
        // Only add if not already a parent of this child
        const alreadyLinked = allRels.some(
          r => r.type === 'parent' && r.person1_id === spouseId && r.person2_id === childId
        );
        if (!alreadyLinked) {
          relationships.create({ person1_id: spouseId, person2_id: childId, type: 'parent' });
        }
      });
  }

  res.status(201).json(rel);
});

// DELETE relationship
app.delete('/api/relationships/:id', (req, res) => {
  const ok = relationships.delete(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// GET full tree data
app.get('/api/tree', (_req, res) => {
  res.json({
    people: people.getAll(),
    relationships: relationships.getAll()
  });
});

app.listen(3000, () => {
  console.log('Family Tree running at http://localhost:3000');
});

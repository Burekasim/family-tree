const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const PEOPLE_TABLE  = process.env.PEOPLE_TABLE;
const RELS_TABLE    = process.env.RELS_TABLE;
const PHOTOS_BUCKET = process.env.PHOTOS_BUCKET;
const PHOTOS_URL    = process.env.PHOTOS_URL;
const API_TOKEN     = process.env.API_TOKEN;
const CACHE_TTL_MS  = 60_000; // 60 s safety expiry

// ── In-memory cache (lives for the container lifetime) ───────
let _cache = { people: null, rels: null, ts: 0 };

function _cacheValid() {
  return _cache.ts > 0 && (Date.now() - _cache.ts) < CACHE_TTL_MS;
}
function _invalidate() {
  _cache = { people: null, rels: null, ts: 0 };
}

// ── Helpers ──────────────────────────────────────────────────
function respond(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function strip(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

async function scanPeople() {
  const r = await dynamo.send(new ScanCommand({ TableName: PEOPLE_TABLE }));
  return (r.Items || []).sort((a, b) =>
    (a.last_name || '').localeCompare(b.last_name || '') ||
    (a.first_name || '').localeCompare(b.first_name || '')
  );
}

async function scanRels() {
  const r = await dynamo.send(new ScanCommand({ TableName: RELS_TABLE }));
  return (r.Items || []).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}

// Returns both tables from cache when possible, fetches and warms cache otherwise
async function getTree() {
  if (_cacheValid() && _cache.people && _cache.rels) {
    return { people: _cache.people, rels: _cache.rels };
  }
  const [people, rels] = await Promise.all([scanPeople(), scanRels()]);
  _cache = { people, rels, ts: Date.now() };
  return { people, rels };
}

// ── Handler ──────────────────────────────────────────────────
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  const path   = event.rawPath || '';

  if (method === 'OPTIONS') return respond(200, {});

  try {

    // POST /api/auth  — open endpoint, validates last name against DB
    if (method === 'POST' && path === '/api/auth') {
      const { lastName } = JSON.parse(event.body || '{}');
      if (!lastName) return respond(400, { error: 'lastName required' });
      // Use cache to avoid an extra scan on every login
      const { people } = await getTree();
      const found = people.some(p =>
        (p.last_name || '').trim().toLowerCase() === lastName.trim().toLowerCase()
      );
      if (!found) return respond(401, { error: 'שם משפחה לא נמצא' });
      return respond(200, { token: API_TOKEN });
    }

    // Auth check for all other routes
    const auth = (event.headers || {})['authorization'] || '';
    if (API_TOKEN && auth !== 'Bearer ' + API_TOKEN) {
      return respond(401, { error: 'Unauthorized' });
    }

    // GET /api/tree
    if (method === 'GET' && path === '/api/tree') {
      const { people, rels: relationships } = await getTree();
      return respond(200, { people, relationships });
    }

    // POST /api/people
    if (method === 'POST' && path === '/api/people') {
      const d = JSON.parse(event.body || '{}');
      const item = strip({
        id:          randomUUID(),
        first_name:  d.first_name,
        last_name:   d.last_name  || '',
        birth_date:  d.birth_date || null,
        death_date:  d.death_date || null,
        gender:      d.gender     || 'Other',
        photo:       d.photo      || null,
        notes:       d.notes      || null,
        is_deceased: d.is_deceased ? 1 : 0,
        created_at:  new Date().toISOString(),
      });
      await dynamo.send(new PutCommand({ TableName: PEOPLE_TABLE, Item: item }));
      _invalidate();
      return respond(200, item);
    }

    // PUT /api/people/:id
    const putPersonMatch = path.match(/^\/api\/people\/([^/]+)$/);
    if (method === 'PUT' && putPersonMatch) {
      const id  = putPersonMatch[1];
      const res = await dynamo.send(new GetCommand({ TableName: PEOPLE_TABLE, Key: { id } }));
      if (!res.Item) return respond(404, { error: 'Person not found' });
      const d       = JSON.parse(event.body || '{}');
      const updated = strip({
        ...res.Item, ...d, id,
        is_deceased: (d.is_deceased != null ? d.is_deceased : res.Item.is_deceased) ? 1 : 0,
      });
      await dynamo.send(new PutCommand({ TableName: PEOPLE_TABLE, Item: updated }));
      _invalidate();
      return respond(200, updated);
    }

    // DELETE /api/people/:id
    const delPersonMatch = path.match(/^\/api\/people\/([^/]+)$/);
    if (method === 'DELETE' && delPersonMatch) {
      const id = delPersonMatch[1];
      // Fetch rels before invalidating cache
      const { rels } = await getTree();
      await Promise.all([
        dynamo.send(new DeleteCommand({ TableName: PEOPLE_TABLE, Key: { id } })),
        ...rels
          .filter(r => r.person1_id === id || r.person2_id === id)
          .map(r => dynamo.send(new DeleteCommand({ TableName: RELS_TABLE, Key: { id: r.id } })))
      ]);
      _invalidate();
      return respond(200, { success: true });
    }

    // POST /api/relationships
    if (method === 'POST' && path === '/api/relationships') {
      const d = JSON.parse(event.body || '{}');
      const { person1_id, person2_id, type, start_date, end_date, notes } = d;
      const item = strip({
        id: randomUUID(), person1_id, person2_id, type,
        start_date: start_date || null,
        end_date:   end_date   || null,
        notes:      notes      || null,
        created_at: new Date().toISOString(),
      });

      // Fetch current rels before writing (use cache)
      const { rels: allRels } = await getTree();

      // Collect all puts to fire in parallel
      const puts = [dynamo.send(new PutCommand({ TableName: RELS_TABLE, Item: item }))];

      if (type === 'parent') {
        // Add parent's existing spouses as co-parents of the new child
        allRels
          .filter(r => r.type === 'spouse' && (r.person1_id === person1_id || r.person2_id === person1_id))
          .forEach(sr => {
            const spouseId = sr.person1_id === person1_id ? sr.person2_id : sr.person1_id;
            const already  = allRels.some(r =>
              r.type === 'parent' && r.person1_id === spouseId && r.person2_id === person2_id
            );
            if (!already) {
              puts.push(dynamo.send(new PutCommand({
                TableName: RELS_TABLE,
                Item: strip({ id: randomUUID(), person1_id: spouseId, person2_id, type: 'parent', created_at: new Date().toISOString() }),
              })));
            }
          });
      }

      if (type === 'spouse') {
        // Each partner inherits the other's existing children
        for (const [parentId, otherParentId] of [[person1_id, person2_id], [person2_id, person1_id]]) {
          allRels
            .filter(r => r.type === 'parent' && r.person1_id === parentId)
            .forEach(r => {
              const childId = r.person2_id;
              const alreadyParent = allRels.some(x =>
                x.type === 'parent' && x.person1_id === otherParentId && x.person2_id === childId
              );
              if (!alreadyParent) {
                puts.push(dynamo.send(new PutCommand({
                  TableName: RELS_TABLE,
                  Item: strip({ id: randomUUID(), person1_id: otherParentId, person2_id: childId, type: 'parent', created_at: new Date().toISOString() }),
                })));
              }
            });
        }
      }

      await Promise.all(puts);
      _invalidate();
      return respond(200, item);
    }

    // PUT /api/relationships/:id
    const putRelMatch = path.match(/^\/api\/relationships\/([^/]+)$/);
    if (method === 'PUT' && putRelMatch) {
      const id  = putRelMatch[1];
      const res = await dynamo.send(new GetCommand({ TableName: RELS_TABLE, Key: { id } }));
      if (!res.Item) return respond(404, { error: 'Relationship not found' });
      const d       = JSON.parse(event.body || '{}');
      const updated = strip({ ...res.Item, ...d, id });
      await dynamo.send(new PutCommand({ TableName: RELS_TABLE, Item: updated }));
      _invalidate();
      return respond(200, updated);
    }

    // DELETE /api/relationships/:id
    const delRelMatch = path.match(/^\/api\/relationships\/([^/]+)$/);
    if (method === 'DELETE' && delRelMatch) {
      await dynamo.send(new DeleteCommand({ TableName: RELS_TABLE, Key: { id: delRelMatch[1] } }));
      _invalidate();
      return respond(200, { success: true });
    }

    // POST /api/upload-url  →  presigned S3 PUT URL
    if (method === 'POST' && path === '/api/upload-url') {
      const { filename, contentType } = JSON.parse(event.body || '{}');
      const ext      = (filename || 'photo').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, 'jpg');
      const key      = `uploads/${randomUUID()}.${ext}`;
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({ Bucket: PHOTOS_BUCKET, Key: key, ContentType: contentType || 'image/jpeg' }),
        { expiresIn: 300 }
      );
      return respond(200, { uploadUrl, photoUrl: `${PHOTOS_URL}/${key}`, key });
    }

    return respond(404, { error: 'Not found' });

  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message });
  }
};

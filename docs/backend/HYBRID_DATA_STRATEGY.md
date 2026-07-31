# 🎯 Hybrid Data Strategy: MongoDB + JSON Fallback

## Overview

This project implements a **3-layer fallback strategy** for data loading:

```
Layer 1: MongoDB (Primary - if available)
   ↓
Layer 2: In-Memory Cache (Fast fallback)
   ↓
Layer 3: Local JSON Files (Always works)
```

## Key Benefits

✅ **Reliability** - App works even if MongoDB is down  
✅ **Performance** - Local JSON files are instant  
✅ **Development** - Works offline without MongoDB  
✅ **Scalability** - Easy to migrate between sources  
✅ **Transparency** - API shows which source was used (`_source` field)

## How It Works

### Example API Response

```json
{
  "success": true,
  "count": 20,
  "data": [...],
  "_source": "mongodb",  // or "cache" or "json_file"
  "page": 1,
  "limit": 20
}
```

## Setup

### 1. Initialize Cache on Startup

```javascript
// In server.js
const dataLayer = require('./utils/dataLayer');
await dataLayer.initializeCache();
```

✅ Loads JSON files into memory on server start

### 2. Use Data Layer in Controllers

```javascript
// In controllers
const { data, source } = await dataLayer.getVocabulary(
  { part: 'PART1', limit: 20 },
  Vocabulary  // Optional MongoDB model
);
```

### 3. Seed Data to MongoDB

```bash
# Preview (dry-run)
npm run seed:vocab:dry

# Actually seed
npm run seed:vocab

# Clear and re-seed
npm run seed:vocab:clear
```

## Architecture

### Data Layer (`utils/dataLayer.js`)

Wrapper function that handles all fallback logic:

```javascript
async function getVocabulary(filters, VocabularyModel) {
  // Try MongoDB first (with 2s timeout)
  // Fall back to cache
  // Fall back to JSON files
  // Return { data, source }
}
```

### Vocabulary Model (`models/Vocabulary.js`)

MongoDB schema with indexes for fast queries:

```javascript
vocabularySchema.index({ en: 1 });          // For search
vocabularySchema.index({ part: 1 });        // For filtering
vocabularySchema.index({ level: 1 });       // For difficulty
vocabularySchema.index({ part: 1, level: 1 }); // Compound
```

### Seed Script (`utils/seedVocabulary.js`)

CLI tool to upload JSON data to MongoDB:

```bash
node utils/seedVocabulary.js                # Seed vocabulary.json
node utils/seedVocabulary.js --dry-run      # Preview only
node utils/seedVocabulary.js --clear        # Delete + seed
node utils/seedVocabulary.js my-file.json   # Seed custom file
```

## Data Flow

### Request Flow

```
API Request (/api/vocabulary)
    ↓
vocabularyController.getAllVocabulary()
    ↓
dataLayer.getVocabulary(filters, Vocabulary)
    ↓
Try MongoDB (timeout: 2s)
    ├─ Success? Return from DB ✅
    └─ Fail? Continue to next layer
    ↓
Try In-Memory Cache
    ├─ Has data? Return from cache ✅
    └─ Empty? Continue to next layer
    ↓
Load from JSON Files
    ├─ Success? Cache it + return ✅
    └─ Fail? Throw error ❌
    ↓
API Response (with _source field)
```

## Configuration

### Environment Variables

```bash
# .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
NODE_ENV=development
```

### Timeout Settings

MongoDB query timeout: **2 seconds** (hardcoded in `dataLayer.js`)

```javascript
await fetchWithTimeout(query.exec(), 2000); // 2 second timeout
```

## Monitoring

### Health Check Endpoint

```bash
GET /health
```

Response:

```json
{
  "status": "OK",
  "uptime": 3600,
  "mongodb": "connected",
  "vocabularyCount": 5000,
  "timestamp": "2026-04-22T10:00:00Z"
}
```

### Logging

Data layer logs all fallback events:

```
✅ Vocabulary loaded from MongoDB (5000 records)
⚠️  MongoDB failed, falling back...
✅ Vocabulary loaded from cache (5000 records)
```

## Migration Path

### Phase 1: Development (Now)
- ✅ JSON files are primary
- ✅ MongoDB optional
- ✅ Auto-fallback works

### Phase 2: Production
- Upload JSON to MongoDB: `npm run seed:vocab`
- MongoDB becomes primary
- JSON files serve as fallback
- Monitor logs to confirm switch

### Phase 3: Optimization
- Delete JSON files (if desired)
- MongoDB as only source
- Remove JSON file fallback

## Troubleshooting

### MongoDB is slow/timing out

Check if MongoDB connection is healthy:

```bash
npm run seed:vocab:dry  # Tests connection
```

### Cache is empty

Restart server to reload JSON files:

```bash
npm run dev  # Restarts and reinitializes cache
```

### Which source is being used?

Check `_source` field in API responses:

```bash
curl http://localhost:5000/api/vocabulary | jq ._source
# Returns: "mongodb" or "cache" or "json_file"
```

## Advanced Usage

### Refresh Cache from JSON

```javascript
const dataLayer = require('./utils/dataLayer');
await dataLayer.refreshCacheFromJSON();
```

### Update Cache from MongoDB

```javascript
const data = await Vocabulary.find();
dataLayer.updateCacheFromMongoDB(data);
```

### Get Current Cache Status

```javascript
const cache = dataLayer.cache();
console.log(cache.vocabulary.length); // Number of records
```

## Performance Notes

| Source | Speed | Size | Reliability |
|---|---|---|---|
| **MongoDB** | 50-200ms | Unlimited | Good (if connected) |
| **In-Memory Cache** | <1ms | ~50MB (5000 words) | Excellent |
| **JSON Files** | 1-5ms | ~2MB | Perfect |

**Recommended for:**
- **Development**: Use JSON files (offline-friendly)
- **Production**: Use MongoDB + fallback to JSON

## Security Notes

- ✅ No sensitive data in JSON files (git-ignored via .gitignore)
- ✅ MongoDB URI in .env (not in code)
- ✅ Read-only endpoints (vocabulary is not user-modifiable)

## Support Files

```
utils/dataLayer.js              # Core fallback logic
models/Vocabulary.js            # MongoDB schema
utils/seedVocabulary.js         # Seed CLI tool
public/data/vocabulary.json     # Source vocabulary data
```

## Next Steps

1. **Setup MongoDB** (if not already)
   - Create MongoDB Atlas cluster
   - Get connection string
   - Add to .env

2. **Seed Data**
   ```bash
   npm run seed:vocab:dry      # Preview
   npm run seed:vocab          # Actually seed
   ```

3. **Monitor**
   ```bash
   curl http://localhost:5000/api/vocabulary?limit=1 | jq ._source
   ```

4. **Optimize**
   - Add more compound indexes
   - Adjust timeout based on network
   - Cache frequently accessed queries

---

**Questions?** Check logs: `npm run dev` shows all fallback events in real-time

---

## 🔄 Refactoring Update (Latest)

### Collection Name Change
```javascript
// Before:
collection: 'vocabulary'

// After:
collection: 'vocabularies'  // Standardized with plural naming
```

⚠️ **Migration Required:**
```bash
npm run seed:vocab:list      # See available files
npm run seed:vocab:clear     # Delete & re-seed (auto-creates new collection)
```

### Multi-Source Support

Now supports seeding from multiple JSON files with auto-detection:

```
vocabulary.json  → source: 'vocabulary'
ETS2024.json     → source: 'ets2024'
ETS2026.json     → source: 'ets2026'
600WORDS.json    → source: '600words'
keytoeic.json    → source: 'keytoeic'
```

### New API Features

#### Filter by source:
```bash
GET /api/vocabulary?source=ets2024
GET /api/vocabulary?source=ets2024&part=PART1
GET /api/vocabulary?source=600words&limit=50
```

#### Response now includes:
```json
{
  "data": [...],
  "_source": "mongodb",
  "_filters": {
    "source": "ets2024",
    "part": "PART1",
    "type": null
  }
}
```

### New npm Scripts

```bash
npm run seed:vocab              # Seed all files
npm run seed:vocab:list         # List available files
npm run seed:vocab:ets2024      # Seed ETS2024 only
npm run seed:vocab:ets2026      # Seed ETS2026 only
npm run seed:vocab:dry          # Preview without writing
npm run seed:vocab:clear        # Delete all + re-seed
```

### Seed Script Improvements

**Auto-detect source from filename:**
```javascript
FILE_TO_SOURCE = {
    'vocabulary.json': 'vocabulary',
    'ETS2024.json': 'ets2024',
    'ETS2026.json': 'ets2026',
    '600WORDS.json': '600words',
    ...
}
```

**Seed summary with breakdown:**
```
Seeding complete!
   Inserted: 5432
   Skipped: 234
   Total: 5666

Breakdown by source:
   vocabulary      1234 words
   ets2024         2111 words
   600words       1321 words
```

### Database Indexes

Added for multi-source queries:
```javascript
vocabularySchema.index({ source: 1 });
vocabularySchema.index({ source: 1, part: 1 });  // Compound
```

### Example Workflows

**Seed everything:**
```bash
npm run seed:vocab:list        # Preview
npm run seed:vocab:clear       # Seed all (takes ~1min)
```

**Seed specific dataset:**
```bash
npm run seed:vocab:ets2024     # Only ETS2024
npm run seed:vocab:ets2026     # Only ETS2026
```

**Query by source:**
```bash
# Get only ETS2024 words
curl "http://localhost:5000/api/vocabulary?source=ets2024&limit=50"

# Get ETS2024 Part 1 words
curl "http://localhost:5000/api/vocabulary?source=ets2024&part=PART1"

# Count words by source (admin query)
db.vocabularies.aggregate([
  { $group: { _id: '$source', count: { $sum: 1 } } }
])
```

---

**Key Takeaway:** Now you can easily manage multiple vocabulary datasets in MongoDB with transparent source tracking!

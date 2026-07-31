# 📤 User Vocabulary Upload Feature

## Overview
Complete implementation of a file upload feature allowing users to upload vocabulary data (Excel, JSON, TXT) which gets automatically normalized using OpenAI API and stored in MongoDB with automatic 7-day expiration.

## Features Implemented

### 1. **Backend**

#### Models
- **UserPermission** - Manage user upload permissions and limits
  - `canUploadVocab`: Boolean permission flag
  - `uploadLimit`: Max words per upload (default 100)
  - `maxFileSize`: Max file size (default 5MB)
  - `filesPerWeek`: Upload frequency limit (default 3)
  - `status`: 'active' or 'revoked'

- **UploadedVocab** - Store uploaded vocabulary with TTL auto-deletion
  - Normalized fields: en, vn, phonetic, part, synonyms, type, image, example, level
  - TTL Index: Auto-deletes after 7 days
  - Tracks: email, userId, uploadBatchId, createdAt

#### Controllers
- **uploadController.js** - User upload operations
  - `POST /api/upload/vocabulary` - Upload file
  - `GET /api/upload/vocabulary/my-uploads` - List user's uploads
  - `DELETE /api/upload/vocabulary/:batchId` - Delete upload batch
  - `GET /api/upload/vocabulary/check-permission` - Check upload permission

- **adminUploadController.js** - Admin management
  - `GET /api/admin/permissions` - List all permissions
  - `POST /api/admin/permissions` - Grant permission
  - `PUT /api/admin/permissions/:userId` - Update permission settings
  - `DELETE /api/admin/permissions/:userId` - Revoke permission (auto-deletes user's data)
  - `GET /api/admin/upload-stats` - View upload statistics

#### Middleware
- **uploadRateLimit.js** - Check upload frequency (3 files/week limit)

#### Utils
- **fileParser.js** - Multi-format file parser
  - Supports: Excel (.xlsx, .xls), JSON, TXT/CSV
  - Uses OpenAI API to normalize diverse formats to standard structure
  - Validates and limits output to 100 words max

#### Routes
- **uploadRoutes.js** - All upload endpoints, admin & user routes

### 2. **Frontend**

#### Modules
- **uploadUI.js** - Upload form UI
  - Permission checking
  - Drag-and-drop file upload
  - Real-time upload progress
  - Success/error feedback

#### Styles
- **upload.css** - Upload form styling
  - Drag-drop area
  - Progress bar
  - Success/error states
- **topicSelector.css** - Topic selection modal with tabs

#### Integration
- Modified `topicSelector.js` to include "📤 Upload" tab in topic selection modal
- Tab-based UI: "Đề có sẵn" (Built-in) | "📤 Tải lên" (Upload)

## API Endpoints

### User Routes (Protected)
```
POST   /api/upload/vocabulary                  - Upload file
GET    /api/upload/vocabulary/my-uploads       - List uploads
DELETE /api/upload/vocabulary/:batchId         - Delete batch
GET    /api/upload/vocabulary/check-permission - Check permission
```

### Admin Routes (Protected + Admin role)
```
GET    /api/admin/permissions              - List all permissions
POST   /api/admin/permissions              - Grant permission
PUT    /api/admin/permissions/:userId      - Update permission
DELETE /api/admin/permissions/:userId      - Revoke & delete data
GET    /api/admin/upload-stats             - Upload statistics
```

## File Format Support

### Excel (.xlsx, .xls)
Must have columns: English, Vietnamese, Example, etc.

### JSON
Array format:
```json
[
  {
    "en": "word",
    "vn": "từ",
    "example": "Example sentence",
    "synonyms": "similar words"
  }
]
```

### TXT/CSV
Tab or comma-separated values with header row:
```
English | Vietnamese | Example
word    | từ        | Example sentence
```

## Normalized JSON Structure
All uploaded files are converted to:
```json
{
  "en": "English word",
  "vn": "Vietnamese translation",
  "phonetic": "/phonetic/",
  "part": "noun/verb/adjective",
  "synonyms": "comma-separated",
  "type": "word type",
  "image": "image path or empty",
  "example": "Example sentence",
  "level": "A1-C2",
  "source": "user_upload"
}
```

## Limits & Constraints
- **File Size**: 5MB max per upload
- **Words per Upload**: 100 max (configurable per user)
- **Upload Frequency**: 3 files per week
- **Data Retention**: 7 days (TTL index auto-deletes)

## Admin Management Flow
1. Admin views pending users: `GET /api/admin/permissions`
2. Admin grants permission: `POST /api/admin/permissions` (email/userId)
3. User can now upload files (max 3/week)
4. User data auto-deletes after 7 days
5. If admin revokes: `DELETE /api/admin/permissions/:userId`
   - Permission revoked
   - All user's uploaded data automatically deleted

## Environment Variables Required
```env
OPENAI_API_KEY=sk-...          # For file parsing normalization
JWT_SECRET=your_secret         # Auth token
MONGODB_URI=mongodb+srv://...  # MongoDB connection
```

## Database Indexes
- **user_permissions**: email, userId
- **uploaded_vocabulary**: email, uploadBatchId, TTL on createdAt (7 days)

## Error Handling
All errors return generic messages per requirements:
- File parsing errors → "Failed to process file"
- Permission denied → "You do not have permission"
- Rate limit → "You have reached the upload limit"
- File validation → "No valid vocabulary data found in file"

## Future Enhancements
- Batch upload progress tracking
- User upload history dashboard
- Custom TTL per user
- File preview before upload
- Bulk permission management (CSV import)
- Analytics on upload patterns

## Installation & Testing

1. **Install dependencies**:
   ```bash
   npm install xlsx papaparse express-fileupload uuid
   ```

2. **Create test permission** (admin endpoint):
   ```bash
   curl -X POST http://localhost:5000/api/admin/permissions \
     -H "Authorization: Bearer ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"userId":"USER_ID","email":"user@example.com"}'
   ```

3. **Upload file**:
   ```bash
   curl -X POST http://localhost:5000/api/upload/vocabulary \
     -H "Authorization: Bearer USER_TOKEN" \
     -F "file=@vocabulary.xlsx"
   ```

4. **Check uploads**:
   ```bash
   curl http://localhost:5000/api/upload/vocabulary/my-uploads \
     -H "Authorization: Bearer USER_TOKEN"
   ```

---

**Status**: ✅ Complete and ready for testing
**Dependencies**: xlsx, papaparse, express-fileupload, uuid, openai (existing)

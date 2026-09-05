# PulseWatch Backend

Simple local Node.js backend for PulseWatch, a website and API uptime monitoring application.

## Architecture

This is a **local development** backend using:
- **Express.js** - Web framework
- **Node.js** - JavaScript runtime
- **In-Memory Data** - Mock data for development (not a database)
- **CORS** - Cross-Origin Resource Sharing for frontend communication

### Future Architecture
Eventually, this will be migrated to AWS:
```
React Frontend
    ↓
API Gateway
    ↓
AWS Lambda
    ↓
DynamoDB
```

But for now, we use:
```
React Frontend (localhost:5173)
    ↓
Express API (localhost:5000)
    ↓
In-Memory Mock Data
```

## Project Structure

```
pulsewatch-backend/
├── controllers/
│   └── monitorController.js    # Business logic for monitors
├── routes/
│   └── monitorRoutes.js        # API route definitions
├── data/
│   └── mockData.js             # Sample monitors & incidents
├── middleware/
│   └── errorHandler.js         # Error handling
├── server.js                   # Express server setup
├── package.json                # Dependencies & scripts
└── README.md                   # This file
```

## Installation

Dependencies are already installed. If needed, install them:

```bash
npm install
```

## Running the Backend

### Development Mode (with auto-reload)
```bash
npm run dev
```

The server will start on `http://localhost:5000`

Nodemon will automatically restart the server when you make code changes.

### Production Mode
```bash
npm start
```

## API Endpoints

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "message": "PulseWatch backend is running"
}
```

### Get All Monitors
```http
GET /api/monitors
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "label": "My Portfolio",
      "url": "https://example.com",
      "status": "up",
      "responseTime": 182,
      "checkedAt": "2 minutes ago"
    },
    ...
  ]
}
```

### Create a New Monitor
```http
POST /api/monitors
Content-Type: application/json

{
  "label": "My Website",
  "url": "https://example.com"
}
```

**Validation:**
- `label` is required (string)
- `url` is required (valid URL format)

**Response on Success (201):**
```json
{
  "success": true,
  "data": {
    "id": "1788633756808",
    "label": "My Website",
    "url": "https://example.com",
    "status": "unknown",
    "responseTime": null,
    "checkedAt": null
  }
}
```

**Response on Error (400):**
```json
{
  "success": false,
  "message": "Label and URL are required"
}
```

### Get All Incidents
```http
GET /api/incidents
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "monitorId": "2",
      "title": "Demo API went down",
      "time": "Today, 12:20 PM",
      "type": "down"
    },
    ...
  ]
}
```

## File Explanations

### `server.js`
Main Express server file that:
- Sets up CORS middleware
- Registers routes
- Handles 404s
- Handles global errors
- Starts the server on port 5000

### `controllers/monitorController.js`
Contains business logic:
- `getAllMonitors()` - Fetches all monitors from in-memory data
- `createMonitor()` - Creates a new monitor with validation
- URL validation using Node.js `URL` API

### `routes/monitorRoutes.js`
Defines API routes:
- `GET /monitors` → `getAllMonitors`
- `POST /monitors` → `createMonitor`

### `data/mockData.js`
Sample data for development:
- 3 monitors: Portfolio (up), API (down), Portal (up)
- 2 incidents: API down event, API recovery event
- Data is stored in-memory arrays

### `middleware/errorHandler.js`
Global error handler that:
- Catches all errors
- Logs error messages
- Returns consistent JSON error responses

## Testing the API

### Using cURL (if Git Bash or similar)
```bash
# Health check
curl http://localhost:5000/api/health

# Get monitors
curl http://localhost:5000/api/monitors

# Create a monitor
curl -X POST http://localhost:5000/api/monitors \
  -H "Content-Type: application/json" \
  -d '{"label":"Test","url":"https://test.com"}'
```

### Using PowerShell
```powershell
# Health check
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing

# Get monitors
Invoke-WebRequest -Uri "http://localhost:5000/api/monitors" -UseBasicParsing

# Create a monitor
$body = @{label="Test"; url="https://test.com"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:5000/api/monitors" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -UseBasicParsing
```

## Important Notes

1. **Data is In-Memory** - All data is stored in JavaScript arrays. If you restart the server, new monitors are lost.

2. **No Database** - This is development-only. No persistence.

3. **CORS Enabled** - The React frontend (localhost:5173) can communicate with this API (localhost:5000).

4. **Simple Validation** - URL validation uses Node.js `URL` constructor. Missing fields are caught.

5. **Status Field** - New monitors start with `status: "unknown"`. Actual health checks would be implemented later.

6. **Timestamps** - `checkedAt` is mock data. Real timestamps would come from actual health checks.

## Next Steps (Future Development)

1. **Add More Endpoints** - Update, delete, patch monitors
2. **Database Integration** - Replace in-memory data with DynamoDB
3. **Health Check Logic** - Implement actual HTTP checks to monitor URLs
4. **Scheduled Tasks** - Use cron jobs or EventBridge to run health checks
5. **AWS Migration** - Move to Lambda + API Gateway + DynamoDB
6. **Authentication** - Add Cognito authentication
7. **Logging** - Add CloudWatch logging

## Troubleshooting

### Port 5000 is already in use
Change the PORT in `server.js` or kill the process using port 5000.

### CORS errors
Make sure CORS is enabled in `server.js`:
```javascript
app.use(cors())
```

### "Cannot find module" errors
Run `npm install` to install dependencies.

### Server won't start
Check for syntax errors. Run with `npm run dev` for better error messages from nodemon.

## License

ISC

# Bitespeed Identity Reconciliation

A REST API service that identifies and reconciles customer identities across multiple purchases using different contact details.

## Tech Stack
- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **ORM:** Prisma
- **Database:** SQLite (dev) / PostgreSQL (prod)

## Project Structure
```
bitespeed/
├── prisma/
│   └── schema.prisma       # DB schema
├── src/
│   ├── index.ts            # Entry point
│   ├── app.ts              # Express app & routes
│   └── identifyService.ts  # Core reconciliation logic
├── .env
├── package.json
└── tsconfig.json
```

## Setup & Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
# .env is already created, default uses SQLite
# For PostgreSQL, change DATABASE_URL to:
# DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

### 3. Setup Database
```bash
# Generate Prisma client
npm run db:generate

# Run migration (creates the DB + tables)
npm run db:migrate
# OR for quick push without migration history:
npm run db:push
```

### 4. Run the Server
```bash
# Development (with ts-node)
npm run dev

# Production
npm run build
npm start
```

Server starts at: `http://localhost:3000`

---

## API

### `POST /identify`

Identifies a customer and links their contact records.

**Request Body:**
```json
{
  "email": "doc@hillvalley.edu",       // optional
  "phoneNumber": "1234567890"          // optional
}
```
At least one of `email` or `phoneNumber` must be provided.

**Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["doc@hillvalley.edu", "emmett@future.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

---

## Reconciliation Logic

The `/identify` endpoint handles these scenarios:

### Scenario 1: New Contact
No existing contact matches → create a new **primary** contact.

### Scenario 2: Existing Contact (exact match)
Contact already exists with same email/phone → return existing cluster as-is.

### Scenario 3: New Info on Existing Contact
Request links to an existing contact but introduces new email/phone combination → create a new **secondary** contact linked to the primary.

### Scenario 4: Two Separate Clusters Need Merging
Request contains an email from cluster A and a phone from cluster B:
- Determine which cluster is older (by `createdAt` of their primaries)
- The older cluster's primary remains primary
- The newer cluster's primary is **demoted to secondary**
- All contacts in the newer cluster are re-linked to the true primary

### Example Walk-through

```
Request 1: { email: "lorraine@hillvalley.edu", phoneNumber: "123456" }
→ Creates Contact #1 (primary)

Request 2: { email: "mcfly@hillvalley.edu", phoneNumber: "123456" }
→ phoneNumber matches #1 → Creates Contact #23 (secondary, linkedId=1)

Request 3: { email: "lorraine@hillvalley.edu", phoneNumber: "999999" }
→ email matches #1 → Creates Contact #24 (secondary, linkedId=1)

Response always returns:
{
  primaryContactId: 1,
  emails: ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
  phoneNumbers: ["123456", "999999"],
  secondaryContactIds: [23, 24]
}
```

---

## Deployment (Railway / Render)

### Railway
1. Push code to GitHub
2. Create new Railway project → link repo
3. Add environment variable: `DATABASE_URL` (Railway provides PostgreSQL)
4. Update `prisma/schema.prisma` datasource to `postgresql`
5. Add build command: `npm run db:generate && npm run db:migrate && npm run build`
6. Start command: `npm start`

### Render
1. Push to GitHub
2. New Web Service → link repo
3. Build Command: `npm install && npm run db:generate && npm run db:push && npm run build`
4. Start Command: `npm start`
5. Add `DATABASE_URL` env variable

---

## Testing with cURL

```bash
# Test 1: Create new contact
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"123456"}'

# Test 2: Same phone, new email → creates secondary
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"mcfly@hillvalley.edu","phoneNumber":"123456"}'

# Test 3: Only email
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu"}'

# Test 4: Merge two clusters
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"email":"lorraine@hillvalley.edu","phoneNumber":"999999"}'
```

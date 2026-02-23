# MorningStar.ai — Backend

Preview generation + pipeline API. Deployed on Vercel.

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/capture` | Receive Chrome Extension data |
| POST | `/api/generate` | Run Claude + generate preview HTML |
| GET | `/p/:id` | Serve preview page to prospect |
| GET | `/api/prospects` | List prospects (dashboard) |
| PATCH | `/api/prospects` | Update prospect status |
| POST | `/api/approve` | Approve/reject preview |
| POST | `/api/track` | Receive view/click events |
| GET | `/api/dashboard` | All dashboard data in one call |
| POST | `/api/webhooks?source=stripe` | Stripe payment webhooks |
| POST | `/api/webhooks?source=calendly` | Calendly booking webhooks |

All routes except `/p/:id` and `/api/track` require header: `x-api-key: YOUR_INTERNAL_API_KEY`

---

## Deploy in 5 Steps

### Step 1 — Clone & install
```bash
git clone YOUR_REPO
cd morningstar-backend
npm install
```

### Step 2 — Copy your templates
Copy all 26 HTML template files into the `/templates` folder:
```bash
cp /path/to/templates/*.html ./templates/
```

### Step 3 — Set environment variables
```bash
cp .env.example .env.local
# Edit .env.local with your real values
```

### Step 4 — Create Supabase Storage bucket
1. Go to Supabase → Storage
2. Create a new bucket called `previews`
3. Set it to **Public** (so preview URLs work without auth)

### Step 5 — Deploy to Vercel
```bash
npm install -g vercel   # if not installed

# Add secrets to Vercel
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add INTERNAL_API_KEY
vercel env add PREVIEW_BASE_URL

# Deploy
vercel --prod
```

Note your deployment URL (e.g. `https://morningstar-backend.vercel.app`)
Update `PREVIEW_BASE_URL` env var to this URL.

---

## Test It

### Test capture endpoint:
```bash
curl -X POST https://morningstar-backend.vercel.app/api/capture \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{
    "page_url": "https://alnoor-dental.ae",
    "page_title": "Al Noor Dental Centre - Dubai",
    "h1_text": "Your Smile Our Priority",
    "contact_phones": ["+971 4 123 4567"],
    "business_name": "Al Noor Dental Centre"
  }'
```

### Generate preview:
```bash
curl -X POST https://morningstar-backend.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{"prospect_id": "PROSPECT_ID_FROM_CAPTURE_RESPONSE"}'
```

### View dashboard:
```bash
curl https://morningstar-backend.vercel.app/api/dashboard \
  -H "x-api-key: YOUR_INTERNAL_API_KEY"
```

---

## Folder Structure

```
morningstar-backend/
├── api/
│   ├── capture.js          # Receives Chrome Extension data
│   ├── generate.js         # Claude detection + preview generation
│   ├── approve.js          # Review dashboard approvals
│   ├── prospects.js        # Prospect CRUD
│   ├── dashboard.js        # Dashboard data endpoint
│   ├── track.js            # View/click tracking
│   ├── webhooks.js         # Stripe + Calendly
│   └── preview/
│       └── [id].js         # Serves preview HTML
├── lib/
│   ├── supabase.js         # Supabase client
│   ├── claude.js           # Anthropic API calls
│   ├── inject.js           # Template injection engine
│   └── auth.js             # API key middleware
├── templates/              # 26 HTML template files (copy here)
├── .env.example
├── package.json
└── vercel.json
```

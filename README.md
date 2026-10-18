# KisanConnect

> *"Seedha Kisan, Seedha Sauda" — Straight from the Farmer, Straight Deal.*

A role-based marketplace platform that connects **farmers (sellers)** directly with **wholesale/retail buyers**, removing the local middleman/commission-agent layer that traditionally sits between the two and extracts a hidden margin from every transaction.

A farmer lists their produce once — crop, quantity, price, quality, location, availability — and every relevant buyer is notified **instantly**, the same way they'd hear about fresh stock from a trader's phone call. Except now it's the farmer speaking directly, at the farmer's own price.

---

## Table of Contents

- [The Problem](#the-problem)
- [Key Features](#key-features)
- [User Roles](#user-roles)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Core Flow: Listing → Notification](#core-flow-listing--notification)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)

---

## The Problem

- Most farmers sell through local commission agents (*arhtiyas*) who buy low and sell high, pocketing the spread.
- Farmers rarely have a direct channel to verified buyers — they don't know who's buying, how much, or at what price.
- Buyers don't know which farmers currently have fresh stock ready to sell.
- Both sides stay dependent on the middleman purely because there's no shared, trusted place where supply and demand can see each other directly.

**Result:** farmers get underpaid, buyers get marked-up prices, and the only guaranteed winner is an intermediary who adds no real value beyond "knowing both sides."

---

## Key Features

1. **Three distinct roles** — Admin, Seller, Buyer — with purpose-built permissions and views.
2. **Instant notification on new listing** — the moment a seller publishes, matching buyers (filtered by crop + region) are notified automatically.
3. **Persistent notification feed** — every alert is saved in-app, not just a push popup, so buyers can review recent listings anytime.
4. **Admin-gated onboarding** — sellers and buyers are KYC-verified before they can transact.
5. **Express-interest model** — buyers signal interest in-app; sellers pick who to deal with, contact details are revealed once both sides opt in.
6. **Listing lifecycle** — Active → Reserved → Sold / Expired.
7. **Crop + region-based matching** — buyers set preferences once; relevant listings route to them automatically.

---

## User Roles

| Role | Capabilities |
|---|---|
| **Admin** | Approve/reject sign-ups (KYC), suspend/ban accounts, moderate listings, view platform analytics, manage crop master data |
| **Seller (Farmer)** | Create/edit/delete listings, view interested buyers, mark listings Reserved/Sold/Expired, view listing history |
| **Buyer** | Set crop + region preferences, browse/search listings, receive instant notifications, view notification history, express interest, view deal history |

---

## Tech Stack

**Frontend**
- React — role-based dashboards (Admin / Seller / Buyer)
- Tailwind CSS — consistent styling across all three UIs

**Backend**
- FastAPI (Python) — REST API, RBAC, listing CRUD, notification fan-out logic
- JWT (custom, via `python-jose` + `passlib`) — role-aware authentication

**Database**
- PostgreSQL — users, listings, notifications, interests with relational integrity

**Real-Time / Notification Delivery**
- Celery + Redis (broker) — async fan-out job triggered directly from the listing-creation request
- WebSockets (via FastAPI) — live delivery to online buyers
- PostgreSQL `notifications` table — persistent source of truth (delivery is transient, the record is not)

**Background Jobs**
- Celery — notification fan-out, listing auto-expiry after N days

**File / Image Storage**
- AWS S3 or Cloudinary — listing images, stored separately from the DB

**Deployment**
- Docker Compose — single-command spin-up (frontend, backend, Postgres, Redis, Celery worker)
- GitHub Actions — CI/CD (lint + test on push)

---

## System Architecture

```
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │  Admin Panel  │   │ Seller (React) │   │ Buyer (React) │
   │    (React)    │   │      App       │   │      App      │
   └───────┬───────┘   └───────┬────────┘   └───────┬───────┘
           │                   │                    │
           └─────────┬─────────┴──────────┬─────────┘
                      │                    │
                ┌─────▼────────────────────▼─────┐
                │            FastAPI              │
                │  (Auth, RBAC, Listings, Interests) │
                └───────┬───────────────┬──────────┘
                        │               │
           ┌────────────▼───┐    ┌──────▼───────────┐
           │   PostgreSQL    │    │   Celery Worker   │
           │ (users,         │    │ (matches buyers   │
           │  listings,      │    │  by crop+region,  │
           │  notifications, │    │  writes rows,     │
           │  interests)     │    │  pushes via WS)   │
           └─────────────────┘    └───────────────────┘
```

---

## Core Flow: Listing → Notification

1. Seller fills the **New Listing** form: crop, quantity, price/quintal, quality grade, photos, location, available-from date.
2. FastAPI validates the seller's role + data, writes a new row to `listings` (`status = active`), and dispatches a Celery task with the listing ID.
3. The Celery worker:
   - Queries `buyer_preferences` for all buyers whose crop + region match the listing.
   - Inserts one row per matched buyer into `notifications` (persists even if the buyer is offline).
   - Pushes a live event over WebSocket to any matched buyer currently connected.
4. Buyer sees the live push (if online) and/or finds it at the top of their persistent in-app feed on next open.
5. Buyer taps the notification → views the listing → clicks **Express Interest**.
6. FastAPI records the interest and notifies the seller ("3 buyers are interested in your wheat listing").
7. Seller reviews interested buyers, picks one, marks the listing **Reserved → Sold** once the deal is finalized.

**Separate admin flow:** new sign-up → status `pending` → Admin reviews KYC docs → Approves/Rejects → only `approved` accounts can list produce or receive notifications.

---

## Database Schema

**users**
`id (PK)`, `name`, `phone_number`, `role (admin|seller|buyer)`, `status (pending|approved|rejected|suspended)`, `region`, `created_at`

**crops**
`id (PK)`, `name`, `unit`

**buyer_preferences**
`id (PK)`, `user_id (FK → users)`, `crop_id (FK → crops)`, `preferred_region`

**listings**
`id (PK)`, `seller_id (FK → users)`, `crop_id (FK → crops)`, `quantity`, `price_per_unit`, `quality_grade`, `location`, `available_from`, `status (active|reserved|sold|expired)`, `image_urls (JSONB)`, `created_at`

**notifications**
`id (PK)`, `buyer_id (FK → users)`, `listing_id (FK → listings)`, `is_read (bool)`, `created_at`

**interests**
`id (PK)`, `listing_id (FK → listings)`, `buyer_id (FK → users)`, `status (pending|accepted|declined)`, `created_at`

---

## Project Structure

```
kisanconnect/
├── frontend/               # React app (Admin / Seller / Buyer)
│   └── src/
│       ├── api/            # axios clients per resource
│       ├── auth/            # AuthContext, ProtectedRoute
│       ├── components/      # shared + feature components
│       ├── pages/            # admin/, seller/, buyer/, auth/
│       └── hooks/            # useWebSocket, etc.
│
├── backend/                # FastAPI app
│   └── app/
│       ├── models/          # SQLAlchemy models
│       ├── schemas/          # Pydantic schemas
│       ├── routers/          # auth, admin, listings, notifications, interests
│       ├── services/         # business logic (matching, notifications, etc.)
│       ├── core/             # security, permissions, redis client
│       ├── ws/                # WebSocket connection manager
│       ├── db/                # SQLAlchemy base + session
│       └── tasks/             # Celery app + notify_buyers job
│   └── alembic/              # DB migrations
│
├── docker-compose.yml       # frontend + backend + postgres + redis + celery
├── .github/workflows/ci.yml # lint + test on push
└── .env.example
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (optional, recommended)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env            # then fill in DB/Redis credentials

# Run DB migrations
alembic upgrade head

# Start the API
uvicorn app.main:app --reload
```

### Celery Worker

```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Or, run everything with Docker Compose

```bash
docker-compose up --build
```

This spins up the frontend, backend, PostgreSQL, Redis, and the Celery worker together.

---

## Environment Variables

See `.env.example` for the full list. At minimum you'll need:

```
DATABASE_URL=postgresql://user:password@localhost:5432/kisanconnect
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

## Roadmap

- [ ] In-app negotiation/chat between seller and interested buyers
- [ ] Escrow-based payment + delivery tracking
- [ ] Rating/review system for sellers and buyers post-deal
- [ ] WhatsApp-based notification channel (same fan-out logic, different adapter)
- [ ] Bidding model — multiple buyers bid, seller picks the best offer
- [ ] Integration with price-transparency data so sellers see a fair asking price
- [ ] Bulk/recurring listings for buyers needing standing weekly supply

---

## License

TBD

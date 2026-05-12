# BepNhip IRMS - Main Restaurant Flow (Express + React + PostgreSQL)

This project implements the core SRS flow from ordering to kitchen processing, serving, billing, and manager operations.

## SRS Coverage

- `3.1` Digital Ordering & Menu Management
  - waiter menu browsing, item notes, draft editing, add/merge quantity, remove-before-confirm
  - unavailable item protection
  - post-confirm change requests (cancel/change qty/change note)
  - manager menu/price/availability update via admin tools
- `3.2` Kitchen Workflow Coordination
  - order push to KDS on confirm
  - station-aware kitchen queue
  - status transitions: `new -> cooking -> ready -> served` (+ `cancelled`)
  - urgency/deadline signals (`normal`, `due_soon`, `overdue`)
  - waiter-ready pickup and sync back to table view
- `3.4` Billing, Payments & Receipts
  - waiter action `Mời thanh toán` after service completes
  - session waits in payment queue with waiting-time tracking
  - open bill from session
  - total calculation: subtotal, discount, service charge, tax, tip
  - payment methods: `cash`, `card`, `digital_wallet`
  - split bill preview (`split_count`)
  - receipt generation endpoint
  - sensitive action audit logs: discount override, manual adjustment, void, refund
- `3.7` Administrative Tools
  - user account create/update/lock (RBAC roles supported)
  - menu configuration and pricing updates
  - promotion management
  - audit log search by actor/action/entity/time

## FR Traceability (3.1, 3.2, 3.4, 3.7)

### 3.1 - Digital Ordering & Menu Management

| FR | Status | Notes |
|---|---|---|
| FR-ORD-01 | Done | Menu list by category in waiter UI |
| FR-ORD-02 | Partial | Name, price, short description, availability done; combo promo info not fully displayed per item |
| FR-ORD-03 | Done | Add item to table order |
| FR-ORD-04 | Done | Per-item note supported |
| FR-ORD-05 | Partial | Basic option payload exists; advanced variant UI is minimal |
| FR-ORD-06 | Not in scope | Full combo rule engine not implemented |
| FR-ORD-07 | Done | Quantity editable before confirm + same-item merge |
| FR-ORD-08 | Done | Remove item before sending to kitchen |
| FR-ORD-09 | Done | Manager/Admin menu price/status update in admin tools |

### 3.2 - Kitchen Order Display & Workflow Coordination

| FR | Status | Notes |
|---|---|---|
| FR-KDS-01 | Done | Confirmed orders auto appear on KDS |
| FR-KDS-02 | Done | Station-aware queue (`grill`, `fryer`, `dessert`, `beverage`, etc.) |
| FR-KDS-03 | Done | Order code, table, item, quantity, note, urgency |
| FR-KDS-04 | Done | `new`, `cooking`, `ready`, `cancelled`, plus `served` handoff state |
| FR-KDS-05 | Done | Kitchen updates status via API/UI |
| FR-KDS-06 | Done | Due-soon / overdue deadline signaling |
| FR-KDS-07 | Done | Waiter view syncs from kitchen status |

### 3.4 - Billing, Payments & Receipts

| FR | Status | Notes |
|---|---|---|
| FR-BILL-01 | Done | Open bill from session |
| FR-BILL-02 | Done | Subtotal, discount, service charge, tax, tip |
| FR-BILL-03 | Done | `cash`, `card`, `digital_wallet` |
| FR-BILL-04 | Partial | Split preview + split count supported; full per-split settlement flow not separated into child bills |
| FR-BILL-05 | Done | Tip supported |
| FR-BILL-06 | Done | Promotion code and manual discount adjustment |
| FR-BILL-07 | Done | Receipt endpoint and UI preview |
| FR-BILL-08 | Done | Audit logs: refund, void, discount override, manual adjustment |

Payment flow note:
- After all items are served/cancelled, session moves to `service_completed`.
- Waiter must click `Mời thanh toán` to move session to `awaiting_payment`.
- Manager/Cashier sees waiting tables and waiting duration before opening bill.
- Table becomes `cleaning` only after bill payment is completed.

### 3.7 - Administrative Tools

| FR | Status | Notes |
|---|---|---|
| FR-ADM-01 | Done | Create/update/lock user account |
| FR-ADM-02 | Done | RBAC roles: manager, waiter, chef, cashier, host, admin |
| FR-ADM-03 | Done | Manager/Admin menu and pricing config |
| FR-ADM-04 | Done | Promotion create/update/toggle active |
| FR-ADM-05 | Done | Critical actions are written to audit log |
| FR-ADM-06 | Done | Audit log query by actor/action/entity/time |

## Scope Notes

- This release is intentionally focused on the core restaurant operational flow.
- Out-of-scope major modules from full SRS: feature 5 (inventory) and feature 6 (analytics/reports).
- Table reservation/waitlist/transfer from feature 3 are only minimally represented where needed for main flow.

## Tech Stack

- Backend: Express 5, PostgreSQL, JWT auth, Zod validation
- Frontend: React + Vite
- Package manager: `pnpm`
- Database runtime: Docker (`docker compose`)

## Quick Start

```bash
pnpm install
copy backend\\.env.example backend\\.env
pnpm db:up
pnpm reset:db
pnpm dev
```

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Demo Accounts

Password for all seeded users: `123456`

- waiter: `waiter01`
- chef: `chef01`
- manager: `manager01`
- cashier: `cashier01`
- host: `host01`
- admin: `admin01`

## Database with Docker

- Compose file: `docker-compose.yml`
- Schema: `backend/database/init/001_schema.sql`
- Seed: `backend/database/init/002_seed.sql`

## Useful Scripts

- `pnpm db:up`
- `pnpm db:down`
- `pnpm db:logs`
- `pnpm reset:db`
- `pnpm dev`
- `pnpm build`

## Main API Groups

- Auth: `/api/auth/*`
- Tables/Sessions: `/api/tables/*`
- Orders/Change requests: `/api/orders/*`
- Kitchen workflow: `/api/kitchen/*`
- Billing/Payment/Receipt: `/api/billing/*`
- Admin tools: `/api/admin/*`

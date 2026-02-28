# Tailored Athlete ERP — Setup Guide

## What you need
- A computer with **Node.js** installed (download: nodejs.org)
- A free **Supabase** account (supabase.com)
- A free **Vercel** account (vercel.com)
- A free **GitHub** account (github.com)

---

## STEP 1 — Set up the database (Supabase)

1. Go to **supabase.com** → Create new project
2. Name it `tailored-athlete-erp`, set a password, pick the closest region (e.g. West EU)
3. Wait ~1 min for it to spin up
4. In the left menu go to **SQL Editor**
5. Click **+ New query**
6. Copy the entire contents of `supabase/schema.sql` and paste it in
7. Click **Run** — this creates all tables and seed data
8. Go to **Settings → API** and copy:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon public** key (long string starting with `eyJ...`)

---

## STEP 2 — Configure the project locally

1. Unzip this project folder
2. Copy `.env.local.example` → rename to `.env.local`
3. Open `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
```

---

## STEP 3 — Run locally (optional, to test first)

Open Terminal in the project folder:
```bash
npm install
npm run dev
```
Open **http://localhost:3000** in your browser. ✓

---

## STEP 4 — Deploy to Vercel (live URL)

1. Upload this folder to a new **GitHub repository** (github.com → New repository → upload files)
2. Go to **vercel.com** → New Project → Import your GitHub repo
3. In Vercel, before deploying go to **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. Click **Deploy**
5. In ~2 minutes you'll have a live URL like: `https://tailored-athlete-erp.vercel.app`

---

## STEP 5 — Add your team (optional)

Share the Vercel URL with your team. To add login/authentication later:
- In Supabase go to **Authentication → Providers** → enable Email
- Ask for help setting this up when ready

---

## Excel Import Format

Your Excel file should have these column headers (exact names, case-insensitive):

| SKU | Product Name | Unit Cost | XS | S | M | L | XL | XXL |
|-----|-------------|-----------|-----|---|---|---|----|----|
| TA-COMP-001 | Compression Tights | 22.50 | 200 | 500 | 700 | 400 | 200 | 100 |

The importer auto-detects columns but you can remap them manually in the UI.

---

## Project structure

```
tailored-athlete-erp/
├── supabase/schema.sql     ← Run this in Supabase first!
├── .env.local.example      ← Copy to .env.local and fill in
├── lib/supabase.js         ← All database functions
├── components/
│   ├── ui.js               ← Shared UI components
│   ├── Sidebar.js          ← Navigation
│   └── Shell.js            ← Page layout
└── app/
    ├── dashboard/          ← Dashboard page
    ├── purchase-orders/    ← PO management
    ├── inventory/          ← Stock view
    └── suppliers/          ← Supplier cards
```

---

## Need help?
Ask Claude — paste any error message and it will fix it for you.

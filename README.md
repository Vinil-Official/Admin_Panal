# Northstar Lead Desk

Admin dashboard for the existing Supabase table `public.qualified_leads`. The browser client reads the Vite public URL and anon key; it never uses a service-role key.

## Run locally

Create `my-Lead/.env.local` with the existing project's values:

```env
VITE_SUPABASE_URL=https://wjjxgvwrggjnyvuiuqkx.supabase.co
VITE_SUPABASE_ANON_KEY=your_existing_anon_key
```

Then run:

```sh
npm install
npm run dev
```

Production checks are `npm run build` and `npm run lint`.

## Database and security

The app queries `qualified_leads` using the supplied schema: `id`, `source_lead_id`, `owner_id`, `name`, `phone`, `location`, `website`, `qualification_status`, `lead_score`, `notes`, `created_at`, and `updated_at`. Status filter options are read from the table. Summary buckets currently classify common status wording (qualified, contacted, meeting/demo, proposal/quote, deal/won/closed); adapt the classifier in `src/services/leadsService.js` if the existing values use different wording.

Sign-in uses Supabase Auth password authentication. Admin UI access requires the trusted `app_metadata.role` claim to equal `admin`; clients cannot set `app_metadata`. The database must independently enforce admin-only reads and writes through RLS for this claim. This repository did not contain the existing RLS policies or an admin membership mechanism, so no SQL policy migration was generated or applied. Inspect the current table grants and policies before adding or changing policies; the frontend check is not a substitute for RLS.

No records are created or changed during app startup. Local-only data is not used or mixed with Supabase records.
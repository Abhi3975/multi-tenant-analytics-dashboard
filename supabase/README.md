# Supabase (local database)

Postgres schema, Row Level Security (RLS) policies, and seed data for the
multi-tenant analytics dashboard.

```
supabase/
├── config.toml                       # local stack config (ports, auth, seed)
├── migrations/
│   ├── 20260712120000_initial_schema.sql          # tables + enable RLS
│   ├── 20260712120100_rls_helper_functions.sql    # SECURITY DEFINER helpers
│   └── 20260712120200_rls_policies.sql            # the RLS policies
├── seed.sql                          # org, teams, users, memberships, metrics
└── README.md
```

## Prerequisites

- **Docker** running (the local Supabase stack runs in containers).
- **Supabase CLI** — not bundled in this repo. Install one of:
  ```bash
  brew install supabase/tap/supabase      # macOS
  npm install -g supabase                 # any platform
  ```
  Docs: https://supabase.com/docs/guides/local-development

## Start the local stack

From the repo root:

```bash
supabase start
```

The first run pulls Docker images (slow once), then applies **all migrations in
`migrations/`** and runs **`seed.sql`** automatically. When it finishes it prints
your local credentials:

```
API URL:     http://localhost:54321
DB URL:      postgresql://postgres:postgres@localhost:54322/postgres
Studio URL:  http://localhost:54323
anon key:    eyJhbGciOi...        <- NEXT_PUBLIC_SUPABASE_ANON_KEY
service_role key: eyJhbGciOi...   <- SUPABASE_SERVICE_ROLE_KEY
```

Copy those into `.env.local` (see `../.env.local.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

## Re-apply migrations + reseed

Reset the database to a clean state — drops everything, re-runs every migration,
then re-runs `seed.sql`:

```bash
supabase db reset
```

Use this whenever you change a migration or the seed.

## Add a new migration

```bash
supabase migration new <name>      # creates migrations/<timestamp>_<name>.sql
# edit the file, then:
supabase db reset                  # apply locally
```

## Seeded logins

All three users share the password **`password123`**:

| Email               | Team      | Role   | Can…                                  |
| ------------------- | --------- | ------ | ------------------------------------- |
| `alice@example.com` | Finance   | admin  | read + write + manage members         |
| `bob@example.com`   | Finance   | editor | read + write dashboards/widgets/metrics |
| `carol@example.com` | Marketing | viewer | read Marketing only                   |

Because of RLS, `alice`/`bob` see **only Finance** data and `carol` sees **only
Marketing** data — no cross-team leakage. See the root task notes / `CLAUDE.md`
for how the policies enforce this.

## Notes

- If your CLI version rejects a field in `config.toml`, regenerate it with
  `supabase init` (it leaves `migrations/` and `seed.sql` untouched) and re-add
  the `[db.seed]` block if needed.
- `seed.sql` inserts directly into `auth.users`/`auth.identities` for local
  testing only — never do this against a hosted project; use the Auth API there.

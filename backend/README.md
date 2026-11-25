# Sentinel Recovery intake API

A zero-dependency Node.js service that receives scam reports, contact enquiries and case-status requests. It also serves a private admin dashboard at `/admin`.

**Requires Node.js 22.5+** for `node:sqlite`.

## What it does

- Assigns the case reference **on the server** (`SR-YYYY-XXXXXX`) — the browser-supplied reference is stored only as a cross-check.
- Stores report fields in SQLite under `data/sentinel.db`.
- Stores uploaded evidence in `data/evidence/<case-id>/` with random filenames. Original filenames are kept in the database for display.
- Hashes visitor IP addresses with a salt so raw IPs are not retained.
- Rate-limits every public endpoint and admin login.
- Protects admin routes with an HttpOnly, SameSite=Strict session cookie.
- Never reveals case details through the public status endpoint — it only records the request and flags whether the reference/email pair matched.
- Optionally sends email through Resend. Without an API key, submissions are still stored and alerts are simply skipped.

## Local setup

```powershell
cd "C:\Users\USER\Documents\Oloyede-Daniel-Portfolio\sentinel-recovery\backend"
Copy-Item .env.example .env
notepad .env
```

Set at least:

```env
NOTIFICATION_EMAIL=alyshiakelly6@gmail.com
ADMIN_PASSWORD=choose-a-long-unique-password
```

Leave `ADMIN_PASSWORD` blank if you prefer — a random password is generated on first start and printed to the console **once**. Save it immediately.

Then start it:

```powershell
npm start
```

Open:

- API health: <http://localhost:8787/health>
- Admin dashboard: <http://localhost:8787/admin>

Data is written to `backend/data/`, which is gitignored. Delete that folder to reset the demo.

## Connecting the website

Edit `assets/js/config.js` in the site root:

```js
apiBase: "http://localhost:8787",
```

The config derives these endpoints automatically:

| Setting | Endpoint |
|---|---|
| `formEndpoint` | `/api/reports` |
| `contactEndpoint` | `/api/contact` |
| `statusEndpoint` | `/api/case-status` |

For the deployed site, use your HTTPS API URL instead, for example `https://api.yourdomain.com`. Do **not** point a public site at `localhost` — that would mean the visitor's own machine.

You can also set it from the browser console on the site's own origin without editing the file:

```js
localStorage.setItem("sentinel_api_base", "https://api.yourdomain.com");
```

Remove it with `localStorage.removeItem("sentinel_api_base")`.

## Email notifications

`NOTIFICATION_EMAIL` is the address that receives alerts — in this setup it is `alyshiakelly6@gmail.com`. It is **not published on the public website**.

To actually send mail, add a [Resend](https://resend.com/) API key and a sending address from a domain you control:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Sentinel Recovery <cases@yourdomain.com>
```

Resend's `onboarding@resend.dev` sender only works while testing and only to your own account. Verify your domain before going live.

## Hosting the API

GitHub Pages cannot run Node.js. Host this folder on a service with persistent storage and a public HTTPS URL, for example:

- **Render (easiest)** — a `render.yaml` Blueprint is already in the repo root. It creates a Node web service with a 5 GB persistent disk mounted at `/data`, sets `DATA_DIR=/data`, and asks you for `ADMIN_PASSWORD`. See `DEPLOY-RENDER.md` in the repo root.
- **Railway** — add a persistent volume mounted at `/data`, set `DATA_DIR=/data`, set the env vars, deploy from this folder.
- **Fly.io** — small VM plus a volume mounted at `/data`, with `DATA_DIR=/data`.
- **A VPS** — run behind Caddy or Nginx with automatic HTTPS.

After deployment, update `.env`:

```env
BASE_URL=https://api.yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://justech-tech.github.io
```

`BASE_URL` must use `https://` so the admin cookie gets the `Secure` flag.

## Operational notes

- Back up `data/sentinel.db` and `data/evidence/` together. A restore is only consistent if both are from the same point in time.
- Evidence files are not encrypted individually; they rely on disk-level encryption and access control. For regulated work, move evidence to encrypted object storage with a data-processing agreement.
- Admin notes are internal. The public case-status form never returns them.
- Sessions expire after 8 hours.
- This service does **not** replace legal review of the privacy and terms pages, a retention policy, or a breach response plan.

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | Liveness check |
| `POST` | `/api/reports` | No | multipart report + evidence |
| `POST` | `/api/contact` | No | JSON contact enquiry |
| `POST` | `/api/case-status` | No | JSON status request (no details returned) |
| `POST` | `/api/admin/login` | No | Start session |
| `GET` | `/api/admin/session` | No | Check session |
| `POST` | `/api/admin/logout` | Yes | End session |
| `GET` | `/api/admin/cases` | Yes | List reports (`?status=&q=`) |
| `GET` | `/api/admin/cases/:id` | Yes | Full case + evidence list |
| `PATCH` | `/api/admin/cases/:id` | Yes | Update status and notes |
| `GET` | `/api/admin/evidence/:id/download` | Yes | Stream an evidence file |
| `GET` | `/api/admin/enquiries` | Yes | Contact messages |
| `GET` | `/api/admin/status-requests` | Yes | Status requests |

## Safety rules baked into the product

The acknowledgement email and the public copy repeat that the service will never ask for passwords, PINs, one-time codes, gift cards, crypto payments or remote access, and that no recovery outcome is guaranteed. Keep those rules true in daily operations.

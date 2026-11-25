# Deploy the backend on Render — click by click

This makes the website fully real: reports go into the admin dashboard instead of only opening an email app.

**Important:** Render needs a card for the persistent disk. The cheapest plan is around **$7/month plus a small disk charge**. You can delete it any time. A free Render service has no persistent disk, so evidence and reports could disappear after a restart — do not use free for real case data.

---

## 1. Create a Render account

1. Go to https://dashboard.render.com/register
2. Choose **Sign up with GitHub**
3. Approve GitHub access

---

## 2. Create the service from the Blueprint

1. In Render, click **New +** at the top right
2. Choose **Blueprint**
3. Find and select this repository:

   ```text
   JUSTECH-tech/sentinel-recovery
   ```

   If you do not see it, click **Configure account** / **Install Render** and allow access to that repo.

4. Blueprint name: type anything, e.g.

   ```text
   sentinel-recovery
   ```

5. Render will show environment variables. Fill these:

   | Variable | What to enter |
   |---|---|
   | `ADMIN_PASSWORD` | Choose a long password. **Write it down.** Use this instead of the local one. |
   | `RESEND_API_KEY` | Leave blank for now |

   Do **not** change the other values. I already set them.

6. Click **Apply** or **Create Blueprint**

---

## 3. Wait for it to finish

Render will build and start the service. This takes 2–5 minutes.

You want to see a green **Live** status.

The service will be called:

```text
sentinel-recovery-api
```

Its URL will look like:

```text
https://sentinel-recovery-api.onrender.com
```

If the URL is slightly different, that is fine.

---

## 4. Test it yourself

Open this in your browser:

```text
https://YOUR-URL-HERE/health
```

You should see something like:

```json
{"ok":true,"service":"sentinel-recovery-intake","time":"..."}
```

Then open:

```text
https://YOUR-URL-HERE/admin
```

Sign in with the `ADMIN_PASSWORD` you chose in Step 2.

---

## 5. Send me the URL

Copy the full URL, for example:

```text
https://sentinel-recovery-api.onrender.com
```

Send it to me here and I will:

1. Put it into `assets/js/config.js`
2. Push the change to GitHub
3. Test the live forms
4. Confirm that a real submission appears in the admin dashboard

After that, the website is fully connected.

---

## If something goes wrong

Send me a screenshot of the Render page. Do not try to fix the code yourself — the Blueprint is already written.

---

## What I already prepared for you

- `render.yaml` — tells Render exactly how to run the backend
- A persistent disk for reports and evidence
- Your Gmail address as the alert recipient
- CORS settings so the GitHub Pages site can call the API
- A health check URL
- Automatic redeploys when I push changes

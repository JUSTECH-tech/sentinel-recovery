# Start here — plain English

You do **not** need to understand the code. This page tells you exactly where things stand and what to do next.

---

## The simple version

Think of the project as two parts:

| Part | What it is | Status |
|---|---|---|
| **The website** | What visitors see at `https://justech-tech.github.io/sentinel-recovery/` | ✅ Live and working |
| **The office system** | The hidden dashboard that receives reports and stores evidence | ✅ Built and tested, but not running on the internet yet |

Nothing is broken. Nothing is lost.

Right now, if someone fills in the form, the site prepares an email for them to send. That is safe, but it is not a fully automatic system yet.

---

## Step 1 — Save the admin password

Keep this somewhere safe. Do not share it publicly.

```text
u4RZ_lafLcRvtlf8
```

This is the password for the private admin dashboard on your own computer.

---

## Step 2 — Decide: demo or real

### If you are not ready to launch

**Do nothing.** The website is already live. You can show it to people. The forms still work through email.

### If you want it fully real

You need three real things that only you can provide:

1. A real domain name, e.g. `sentineltrecovery.com`
2. Real public contact details: email, phone, address, company registration number
3. A place to run the office system 24/7, e.g. Railway, Render, Fly.io, or a VPS

Once you have those, I can connect everything.

---

## Step 3 — Test the admin dashboard on your computer

Open PowerShell and run these two commands:

```powershell
cd "C:\Users\USER\Documents\Oloyede-Daniel-Portfolio\sentinel-recovery\backend"
npm start
```

Then open this address in your browser:

```text
http://localhost:8787/admin
```

Sign in with the password from Step 1.

To stop it, press `Ctrl + C` in PowerShell.

---

## Step 4 — Make reports go into the dashboard automatically

GitHub Pages cannot run the office system. It only shows the website.

You need to host the `backend` folder somewhere that supports Node.js. After it is hosted, you will get a URL like:

```text
https://sentinel-recovery-api.up.railway.app
```

Send that URL to me and I will:

1. Put it into `assets/js/config.js`
2. Push the change to GitHub
3. Test the live forms
4. Confirm that reports appear in the admin dashboard

You do not need to edit the code yourself.

---

## Step 5 — Email notifications

Your Gmail address `alyshiakelly6@gmail.com` is already set as the alert recipient in the backend.

To actually send emails, you still need a free Resend account and API key. Until then, submissions are stored in the dashboard but no email alerts are sent.

I can set this up once you have the key.

---

## Step 6 — Legal check

Before taking real clients, a lawyer should review:

- `privacy.html`
- `terms.html`
- your fee/engagement agreement

Keep these promises true:

- No guaranteed recovery
- No upfront fee before written terms
- Never ask for passwords, PINs, one-time codes, gift cards, crypto payments, or remote access

---

## What I already did for you

- Built the full website
- Deployed it to GitHub Pages
- Built the report, contact and case-status forms
- Built the intake API
- Built the private admin dashboard
- Connected the forms to the API in code
- Tested all 17 API checks
- Tested the contact and case-status forms in a browser
- Pushed everything to GitHub

---

## What you need to do

Right now, only this:

1. **Save the password.**
2. **Decide if you want to stay as a demo or go fully live.**
3. **If fully live, create a Railway or Render account and send me the API URL.**

That is all. You are not behind — you are just at the decision point.

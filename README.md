# Sentinel Recovery — website

A fast, responsive, static marketing and intake site for a fraud-recovery company.
Visitors can learn how recovery works, read victim resources, and submit a confidential
scam report for a free case assessment.

Built with plain HTML, CSS and JavaScript — no build step, no framework, no dependencies.
Drop the folder on any static host and it works.

---

## 1. What's inside

| Page | Purpose |
| --- | --- |
| `index.html` | Home page: positioning, process, services, trust content, CTAs |
| `report.html` | Core 4-step scam report wizard (the main conversion path) |
| `how-it-works.html` | Process, timelines, fees, what we can and cannot do |
| `services.html` | Scam-type coverage and what each engagement involves |
| `case-studies.html` | Four anonymised cases with honest outcomes, including one declined |
| `resources.html` | First-24-hours checklist, evidence guide, recovery-scam warnings |
| `about.html` | Company story, role-based team cards, principles |
| `faq.html` | Detailed FAQs (fees, process, privacy, legal limits) |
| `contact.html` | Contact methods + general enquiry form |
| `case-status.html` | Secure case-update request form |
| `privacy.html` | Privacy policy template |
| `terms.html` | Terms of service template |
| `404.html` | Not-found page |

Supporting files:

```
assets/
  css/styles.css        Design system + all page styles
  js/config.js          Brand, contact details and form endpoints (edit this)
  js/main.js            Shared behaviour: nav, reveals, FAQ, contact/status forms
  js/report.js          Report wizard: validation, drafts, review, success flow
  img/                  Logos, favicon, app icons, Open Graph image
robots.txt
sitemap.xml
site.webmanifest
_headers              Security + cache headers (Netlify, Cloudflare Pages)
vercel.json           Security + cache headers (Vercel)
.well-known/security.txt
```

---

## 2. Run it locally

No tooling is required.

- **Simplest:** open `index.html` in a browser.
- **Recommended (matches production):** serve the folder over HTTP.

```bash
# from inside the sentinel-recovery folder
npx serve .
# or
python -m http.server 8080
```

Then visit `http://localhost:8080`.

> A local server is recommended because `fetch()` and some browser security features
> behave differently on `file://` URLs.

---

## 3. Configuration

Almost everything you need to change lives in **`assets/js/config.js`**.

```js
window.SENTINEL_CONFIG = {
  brand: "Sentinel Recovery",
  legalName: "Sentinel Recovery Ltd.",
  email: "hello@sentineltrecovery.com",
  casesEmail: "cases@sentineltrecovery.com",
  phone: "+1 (555) 010-2040",
  phoneHref: "+15550102040",
  address: "Suite 400, 1200 Harbor Street, Wilmington, DE 19801, United States",
  hours: "Mon–Fri, 8:00am–8:00pm ET · Sat, 9:00am–2:00pm ET",
  responseTime: "one business day",
  registration: "",          // e.g. "Company no. 12345678" — hidden when empty
  formEndpoint: "",          // optional POST endpoint for reports
  contactEndpoint: "",       // optional POST endpoint for contact messages
  social: { linkedin: "", x: "" }
};
```

Values are applied across the site automatically through `data-*` attributes
(`data-email`, `data-phone`, `data-address`, `data-brand`, and so on). You should not
need to edit the HTML to change contact details.

### Replacing the placeholder details

Before launch, replace **all** of the following:

- Email addresses, phone number and office address in `config.js`.
- The domain `www.sentineltrecovery.com` in every `<link rel="canonical">`,
  `og:url`, `og:image`, `robots.txt` and `sitemap.xml`.
- The company/legal name and registration number (if applicable).
- The opening hours and response-time promise.

Search the project for `sentineltrecovery.com` and `+1 (555)` to find every occurrence.

---

## 4. How the forms work

### Report wizard (`report.html`)

The report form is a 4-step wizard that:

1. Validates each step before allowing progress.
2. Saves a draft to `localStorage` as the visitor types, so a refresh does not lose data.
3. Lets visitors attach evidence files and review everything before submitting.
4. Generates a case reference in the format `SR-YYYY-XXXXXX`.
5. Offers a downloadable `.txt` copy of the report and a pre-filled email fallback.

**Default behaviour (no backend):** the report is **not** silently submitted anywhere.
The visitor gets a success panel with their case reference, a download button, and a
`mailto:` link to send the report to `casesEmail`. This is intentional — it avoids
pretending a report was received when it was not.

**With a backend:** set `formEndpoint` in `config.js` to a URL that accepts a `POST`
of `FormData`. The wizard will then submit via `fetch()`, use the returned `caseId`
when present, and show the "received" state. If the request fails, it falls back to the
email/download flow rather than losing the report.

### Contact and case-status forms

`contact.html` and `case-status.html` use the same pattern:

- Set `contactEndpoint` to POST to your backend, or
- leave it empty to use the `mailto:` fallback.

The case-status form never displays case details on the page — it is a request form only.
Keep it that way unless you build proper authenticated case tracking.

### File uploads

Selected files are listed in the report and their names are included in the generated
summary. With the email fallback, files are **not** attached automatically — the
success panel tells the visitor to attach them to the email. With a backend endpoint,
files are included in the `FormData` payload.

---

## 5. Deploying

The site is fully static. It works on any of:

- Netlify, Vercel, Cloudflare Pages, GitHub Pages
- Amazon S3 + CloudFront, Azure Static Web Apps
- Any shared host or nginx/Apache server

Steps:

1. Replace the placeholder contact details and domain (see section 3).
2. Upload the contents of this folder to your host's web root.
3. Point your domain at the host and enable HTTPS.
4. Submit `sitemap.xml` in Google Search Console / Bing Webmaster Tools.
5. Test the report wizard end to end on the live domain.

If your host supports custom 404 pages, point it at `404.html`.

### Security headers (recommended)

`_headers` and `vercel.json` already ship a hardened header set (HSTS, CSP,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`). Netlify and Cloudflare Pages read `_headers`;
Vercel reads `vercel.json`. If you host elsewhere, copy the same values into
your server or CDN config.

The Content-Security-Policy currently allows `'unsafe-inline'` for scripts because
of the small inline script that adds the `js` class before first paint. If you want
a stricter policy, move that line into `main.js` and switch to a nonce or hash.

### Structured data

The site emits JSON-LD for:

- `Organization` + `ContactPoint` on `index.html`
- `Service` with an offer catalog on `services.html`
- `FAQPage` on `faq.html`
- `BreadcrumbList` on every interior page

Validate changes with the [Rich Results Test](https://search.google.com/test/rich-results).
Keep the markup in sync with the visible copy — never mark up answers that are not on the page.

### Print output

A print stylesheet is included. Printing any page hides the header, footer and
navigation, switches to black-on-white, and expands collapsed FAQ answers so nothing
is silently cut off. The report success panel prints as a clean case summary you can
save as PDF.

---

## 6. Customising the design

The visual system is driven by CSS custom properties at the top of
`assets/css/styles.css`:

```css
:root {
  --navy-950: #061223;
  --navy-900: #08182b;
  --teal-600: #0f766e;
  --teal-400: #2dd4bf;
  /* ...typography, spacing, radii, shadows */
}
```

Change the navy/teal tokens to re-brand the whole site. Typography uses **Manrope**
(headings) and **Inter** (body), loaded from Google Fonts.

The shared header and footer are duplicated in each HTML file. If you change navigation
or footer links, update them in **every** page (or regenerate them from `index.html`).
The mobile menu, scroll reveals and FAQ accordions are handled in `main.js`.

---

## 7. Accessibility and performance

- Semantic landmarks (`header`, `nav`, `main`, `footer`), skip link, and visible focus states.
- Forms use real `<label>` elements, error text and `aria-live` status regions.
- FAQ items use native `<details>/<summary>` — keyboard accessible with no JavaScript.
- Motion respects `prefers-reduced-motion`.
- No JavaScript frameworks, no build step, no tracking scripts.
- Google Fonts are the only third-party request; self-host them if you need to avoid it.

---

## 8. Before you publish — legal and compliance checklist

This site is a **template**. The legal pages are realistic starting points, not legal advice.

- [ ] Have a qualified lawyer review `privacy.html` and `terms.html` for your jurisdiction.
- [ ] Confirm the claims you make about services, timelines and fees are accurate and lawful.
- [ ] Keep the "no guarantee of recovery" language visible and do not remove it.
- [ ] Never add testimonials, recovery statistics or "amounts recovered" you cannot substantiate.
- [ ] Confirm your licensing, registration and any bonding/insurance requirements.
- [ ] Check consumer-protection and advertising rules for fraud-recovery services in your market.
- [ ] Put a real complaints process and regulator details in place.
- [ ] Make sure the business never asks for passwords, PINs, one-time codes, gift cards,
      crypto payments or remote access — and keep that promise in operations, not just copy.
- [ ] Add a cookie/consent banner only if you later introduce analytics or marketing cookies.
- [ ] Replace the placeholder address and phone number with contactable, monitored details.

---

## 9. Browser support

Current versions of Chrome, Edge, Firefox and Safari, plus modern mobile browsers.
The site degrades gracefully without JavaScript: content is visible, links work, and the
FAQ still functions. The report wizard requires JavaScript.

---

## 10. License / attribution

All copy, layout and graphics in this project were created for Sentinel Recovery.
Replace the placeholder brand assets (`assets/img/logo*.svg`, icons, `og-image.png`)
with your own before launch if the brand changes.

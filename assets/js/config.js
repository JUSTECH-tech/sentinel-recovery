/* ==========================================================================
   Sentinel Recovery — site configuration
   Edit this file to change contact details, company information and the
   endpoint that receives reports. No other file should need editing.
   ========================================================================== */

window.SENTINEL_CONFIG = {
  brand: "Sentinel Recovery",
  legalName: "Sentinel Recovery Ltd.",
  tagline: "Standing between you and fraud.",

  // Public contact details (replace with your real details before launch)
  email: "hello@sentineltrecovery.com",
  casesEmail: "cases@sentineltrecovery.com",
  phone: "+1 (555) 010-2040",
  phoneHref: "+15550102040",
  address: "Suite 400, 1200 Harbor Street, Wilmington, DE 19801, United States",
  hours: "Mon–Fri, 8:00am–8:00pm ET · Sat, 9:00am–2:00pm ET",
  responseTime: "one business day",
  registration: "", // e.g. "Company no. 12345678" — hidden when empty

  // Optional API endpoint. When set, report and contact forms POST here.
  // Example: "https://api.yourdomain.com/v1/reports"
  // Leave empty to use the email fallback (recommended until your backend is live).
  formEndpoint: "",
  contactEndpoint: "",

  // Social links — leave empty to hide
  social: {
    linkedin: "",
    x: ""
  }
};

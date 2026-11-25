/* ==========================================================================
   Sentinel Recovery — site configuration
   Edit this file to change contact details, company information and the
   API that receives reports. No other file should need editing.
   ========================================================================== */

(function () {
  "use strict";

  var cfg = {
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

    // Base URL of the intake API, with no trailing slash.
    // Leave empty to keep the email fallback. Examples:
    //   "http://localhost:8787"          (local testing)
    //   "https://api.yourdomain.com"     (production)
    apiBase: "",

    // Social links — leave empty to hide
    social: {
      linkedin: "",
      x: ""
    }
  };

  // A per-browser override is useful for testing a deployed site against a
  // staging API without editing files:  localStorage.setItem("sentinel_api_base", "https://...")
  // It is deliberately NOT read from the URL, so a crafted link cannot redirect
  // a visitor's report to another server.
  try {
    var storedBase = window.localStorage.getItem("sentinel_api_base");
    if (!cfg.apiBase && storedBase) { cfg.apiBase = storedBase; }
  } catch (error) {
    // Storage may be unavailable in private browsing — ignore.
  }

  cfg.apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  cfg.formEndpoint = cfg.apiBase ? cfg.apiBase + "/api/reports" : "";
  cfg.contactEndpoint = cfg.apiBase ? cfg.apiBase + "/api/contact" : "";
  cfg.statusEndpoint = cfg.apiBase ? cfg.apiBase + "/api/case-status" : "";

  window.SENTINEL_CONFIG = cfg;
})();

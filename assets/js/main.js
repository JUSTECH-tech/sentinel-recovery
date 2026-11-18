/* ==========================================================================
   Sentinel Recovery — shared site behaviour
   ========================================================================== */

(function () {
  "use strict";

  var cfg = window.SENTINEL_CONFIG || {};
  document.documentElement.classList.add("js");

  /* ---------- Small helpers ---------- */
  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function text(value, fallback) {
    return value === undefined || value === null || value === "" ? (fallback || "") : value;
  }

  function mailto(address, subject, body) {
    return "mailto:" + address +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  /* ---------- Populate contact details from config ---------- */
  function hydrateConfig() {
    $$("[data-brand]").forEach(function (el) { el.textContent = text(cfg.brand, "Sentinel Recovery"); });
    $$("[data-legal-name]").forEach(function (el) { el.textContent = text(cfg.legalName, text(cfg.brand, "Sentinel Recovery")); });
    $$("[data-email]").forEach(function (el) { el.textContent = text(cfg.email); });
    $$("[data-cases-email]").forEach(function (el) { el.textContent = text(cfg.casesEmail, text(cfg.email)); });
    $$("[data-phone]").forEach(function (el) { el.textContent = text(cfg.phone); });
    $$("[data-address]").forEach(function (el) { el.textContent = text(cfg.address); });
    $$("[data-hours]").forEach(function (el) { el.textContent = text(cfg.hours); });
    $$("[data-response-time]").forEach(function (el) { el.textContent = text(cfg.responseTime, "one business day"); });
    $$("[data-registration]").forEach(function (el) {
      if (cfg.registration) {
        el.textContent = cfg.registration;
      } else {
        var wrap = el.closest(".js-hide-empty");
        if (wrap) { wrap.hidden = true; } else { el.hidden = true; }
      }
    });

    $$("[data-email-link]").forEach(function (el) {
      el.href = "mailto:" + text(cfg.email);
      if (!el.textContent.trim()) { el.textContent = text(cfg.email); }
    });
    $$("[data-cases-link]").forEach(function (el) {
      el.href = "mailto:" + text(cfg.casesEmail, text(cfg.email));
      if (!el.textContent.trim()) { el.textContent = text(cfg.casesEmail, text(cfg.email)); }
    });
    $$("[data-phone-link]").forEach(function (el) {
      el.href = "tel:" + text(cfg.phoneHref, text(cfg.phone));
      if (!el.textContent.trim()) { el.textContent = text(cfg.phone); }
    });

    $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

    $$("[data-social]").forEach(function (el) {
      var key = el.getAttribute("data-social");
      var url = cfg.social && cfg.social[key];
      if (url) { el.href = url; el.hidden = false; } else { el.hidden = true; }
    });
  }

  /* ---------- Header scroll state ---------- */
  function initHeader() {
    var header = $(".site-header");
    if (!header) { return; }

    function update() {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  /* ---------- Active navigation link ---------- */
  function initActiveNav() {
    var page = window.location.pathname.split("/").pop() || "index.html";
    $$(".nav__link, .mobile-menu__links a").forEach(function (link) {
      var href = (link.getAttribute("href") || "").split("#")[0].split("?")[0];
      if (href === page) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  /* ---------- Mobile menu ---------- */
  function initMobileMenu() {
    var toggle = $(".menu-toggle");
    var menu = $("#mobile-menu");
    if (!toggle || !menu) { return; }

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      if (open) { menu.removeAttribute("inert"); } else { menu.setAttribute("inert", ""); }
      document.body.classList.toggle("nav-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    $$("a", menu).forEach(function (link) {
      link.addEventListener("click", function () { setOpen(false); });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 920 && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
      }
    });

    setOpen(false);
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var items = $$(".reveal");
    if (!items.length) { return; }

    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* ---------- FAQ: keep one answer open per group ---------- */
  function initFaqGroups() {
    $$("[data-faq-group]").forEach(function (group) {
      $$("details", group).forEach(function (item) {
        item.addEventListener("toggle", function () {
          if (!item.open) { return; }
          $$("details[open]", group).forEach(function (other) {
            if (other !== item) { other.open = false; }
          });
        });
      });
    });
  }

  /* ---------- Form validation ---------- */
  function validateForm(form) {
    var firstInvalid = null;

    $$("[required]", form).forEach(function (field) {
      var valid = true;

      if (field.type === "checkbox") {
        valid = field.checked;
      } else if (field.type === "radio") {
        valid = !!form.querySelector('input[name="' + field.name + '"]:checked');
      } else {
        valid = field.value.trim() !== "";
        if (valid && field.type === "email") {
          valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
        }
      }

      var wrap = field.closest(".field");
      if (wrap) { wrap.classList.toggle("field--error", !valid); }

      if (!valid && !firstInvalid) { firstInvalid = field; }
    });

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      return false;
    }
    return true;
  }

  function clearErrorOnInput(form) {
    $$("input, select, textarea", form).forEach(function (field) {
      var eventName = field.type === "checkbox" || field.type === "radio" ? "change" : "input";
      field.addEventListener(eventName, function () {
        var wrap = field.closest(".field");
        if (wrap) { wrap.classList.remove("field--error"); }
      });
    });
  }

  function setStatus(form, type, message) {
    var status = $("[data-form-status]", form);
    if (!status) { return; }
    status.hidden = false;
    status.className = "form-status form-status--" + type;
    status.innerHTML =
      (type === "success"
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>') +
      "<span>" + message + "</span>";
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- Contact form ---------- */
  function initContactForm() {
    var form = $("[data-contact-form]");
    if (!form) { return; }

    clearErrorOnInput(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validateForm(form)) { return; }

      var button = $('button[type="submit"]', form);
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      var topic = String(data.get("topic") || "General enquiry");
      var message = String(data.get("message") || "").trim();

      var body =
        "Name: " + name + "\n" +
        "Email: " + email + "\n" +
        "Topic: " + topic + "\n\n" +
        message + "\n\n" +
        "— Sent from the Sentinel Recovery website";

      var address = text(cfg.email, "hello@sentineltrecovery.com");
      var target = mailto(address, "Website enquiry — " + topic, body);

      if (button) { button.disabled = true; }

      if (cfg.contactEndpoint) {
        fetch(cfg.contactEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name, email: email, topic: topic, message: message })
        }).then(function (response) {
          if (!response.ok) { throw new Error("Request failed"); }
          form.reset();
          setStatus(form, "success", "Thank you — your message has been received. We reply within " + text(cfg.responseTime, "one business day") + ".");
        }).catch(function () {
          window.location.href = target;
          setStatus(form, "success", "Your email app should open with your message ready to send. If it does not, email us directly at " + address + ".");
        }).then(function () {
          if (button) { button.disabled = false; }
        });
      } else {
        window.location.href = target;
        setStatus(form, "success", "Your email app should open with your message ready to send. If it does not, email us directly at <a href=\"mailto:" + address + "\">" + address + "</a>.");
        if (button) { button.disabled = false; }
      }
    });
  }

  /* ---------- Case status request ---------- */
  function initStatusForm() {
    var form = $("[data-status-form]");
    if (!form) { return; }

    clearErrorOnInput(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validateForm(form)) { return; }

      var data = new FormData(form);
      var caseId = String(data.get("caseId") || "").trim().toUpperCase();
      var email = String(data.get("email") || "").trim();
      var address = text(cfg.casesEmail, text(cfg.email, "cases@sentineltrecovery.com"));

      var body =
        "Case reference: " + caseId + "\n" +
        "Email on file: " + email + "\n\n" +
        "Please send me a status update on my case.\n\n" +
        "— Sent from the Sentinel Recovery website";

      var result = $("[data-status-result]", form.parentNode) || $("[data-status-result]");
      if (result) {
        result.hidden = false;
        result.innerHTML =
          "<h3>Request ready to send</h3>" +
          "<p>For your security, case updates are only sent to the email address on file. Your email app should open with a request for <strong>" + caseId + "</strong>.</p>" +
          "<p><a class=\"link-arrow\" href=\"" + mailto(address, "Case status request — " + caseId, body) + "\">Open the email request again</a></p>";
      }

      window.location.href = mailto(address, "Case status request — " + caseId, body);
    });
  }

  /* ---------- Generic copy buttons ---------- */
  function initCopyButtons() {
    $$("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        var value = button.getAttribute("data-copy");
        if (!value) { return; }

        function done() {
          var original = button.innerHTML;
          button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg> Copied';
          window.setTimeout(function () { button.innerHTML = original; }, 1800);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done).catch(function () {});
        } else {
          var input = document.createElement("textarea");
          input.value = value;
          input.setAttribute("readonly", "");
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.appendChild(input);
          input.select();
          try { document.execCommand("copy"); done(); } catch (error) { /* no-op */ }
          document.body.removeChild(input);
        }
      });
    });
  }

  /* ---------- Print: expand every collapsed section ---------- */
  function initPrintExpansion() {
    var opened = [];

    function expand() {
      opened = [];
      $$("details").forEach(function (item) {
        if (!item.open) {
          item.open = true;
          opened.push(item);
        }
      });
    }

    function restore() {
      opened.forEach(function (item) { item.open = false; });
      opened = [];
    }

    if (window.matchMedia) {
      window.addEventListener("beforeprint", expand);
      window.addEventListener("afterprint", restore);
      var query = window.matchMedia("print");
      if (query.addEventListener) {
        query.addEventListener("change", function (event) {
          if (event.matches) { expand(); } else { restore(); }
        });
      }
    }
  }

  /* ---------- Init ---------- */
  hydrateConfig();
  initHeader();
  initActiveNav();
  initMobileMenu();
  initReveal();
  initFaqGroups();
  initContactForm();
  initStatusForm();
  initCopyButtons();
  initPrintExpansion();
})();

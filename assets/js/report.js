/* ==========================================================================
   Sentinel Recovery — multi-step scam report wizard
   ========================================================================== */

(function () {
  "use strict";

  var cfg = window.SENTINEL_CONFIG || {};
  var form = document.querySelector("[data-report-form]");
  if (!form) { return; }

  var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
  var totalSteps = steps.length;
  var currentStep = 1;
  var draftKey = "sentinel_report_draft_v1";
  var casesKey = "sentinel_cases_v1";
  var files = [];
  var lastSummary = "";
  var saveTimer = null;
  var successPanel = document.querySelector("[data-success]");

  var els = {
    bar: form.querySelector("[data-progress-bar]"),
    labels: Array.prototype.slice.call(form.querySelectorAll("[data-progress-labels] li")),
    count: form.querySelector("[data-step-count]"),
    back: form.querySelector("[data-back]"),
    next: form.querySelector("[data-next]"),
    submit: form.querySelector("[data-submit]"),
    draftIndicator: form.querySelector("[data-draft-indicator]"),
    draftBanner: document.querySelector("[data-draft-banner]"),
    startFresh: document.querySelector("[data-start-fresh]"),
    review: form.querySelector("[data-review]"),
    fileInput: form.querySelector("[data-file-input]"),
    dropzone: form.querySelector("[data-dropzone]"),
    fileList: form.querySelector("[data-file-list]"),
    fileNote: form.querySelector("[data-file-note]"),
    errorBox: form.querySelector("[data-report-error]")
  };

  /* ---------- Helpers ---------- */
  function text(value, fallback) {
    return value === undefined || value === null || String(value).trim() === "" ? (fallback || "") : String(value).trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function collect() {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (key === "evidence") { return; }
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!Array.isArray(data[key])) { data[key] = [data[key]]; }
        data[key].push(value);
      } else {
        data[key] = value;
      }
    });
    return data;
  }

  function setFieldError(field, invalid) {
    var wrap = field.closest(".field");
    if (wrap) { wrap.classList.toggle("field--error", invalid); }
  }

  function validateStep(step) {
    var firstInvalid = null;
    var seenRadioGroups = {};
    var required = step.querySelectorAll("[required]");

    Array.prototype.forEach.call(required, function (field) {
      var valid = true;

      if (field.type === "radio") {
        if (seenRadioGroups[field.name]) { return; }
        seenRadioGroups[field.name] = true;
        valid = !!step.querySelector('input[name="' + field.name + '"]:checked');
      } else if (field.type === "checkbox") {
        valid = field.checked;
      } else {
        valid = field.value.trim() !== "";
        if (valid && field.type === "email") {
          valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
        }
        if (valid && field.type === "date" && field.max) {
          valid = field.value <= field.max;
        }
        if (valid && field.minLength > 0) {
          valid = field.value.trim().length >= field.minLength;
        }
      }

      setFieldError(field, !valid);
      if (!valid && !firstInvalid) { firstInvalid = field; }
    });

    if (firstInvalid) {
      firstInvalid.focus();
      var wrap = firstInvalid.closest(".field");
      if (wrap) { wrap.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return false;
    }
    return true;
  }

  function clearErrorsOnInput() {
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), function (field) {
      var eventName = field.type === "checkbox" || field.type === "radio" ? "change" : "input";
      field.addEventListener(eventName, function () { setFieldError(field, false); });
    });
  }

  /* ---------- Step navigation ---------- */
  function showStep(step, moveFocus) {
    currentStep = Math.min(Math.max(step, 1), totalSteps);

    steps.forEach(function (section) {
      section.hidden = Number(section.getAttribute("data-step")) !== currentStep;
    });

    if (els.bar) { els.bar.style.width = (currentStep / totalSteps) * 100 + "%"; }

    els.labels.forEach(function (label, index) {
      label.classList.toggle("is-active", index === currentStep - 1);
      label.classList.toggle("is-done", index < currentStep - 1);
    });

    if (els.count) { els.count.textContent = "Step " + currentStep + " of " + totalSteps; }
    if (els.back) { els.back.hidden = currentStep === 1; }
    if (els.next) { els.next.hidden = currentStep === totalSteps; }
    if (els.submit) { els.submit.hidden = currentStep !== totalSteps; }

    if (currentStep === totalSteps) { buildReview(); }

    if (moveFocus) {
      var heading = steps[currentStep - 1].querySelector("h2");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
      var top = form.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    }
  }

  /* ---------- Draft saving ---------- */
  function saveDraft() {
    var data = collect();
    try {
      localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), step: currentStep, data: data }));
      if (els.draftIndicator) {
        els.draftIndicator.classList.add("is-visible");
        window.clearTimeout(saveDraft.indicatorTimer);
        saveDraft.indicatorTimer = window.setTimeout(function () {
          els.draftIndicator.classList.remove("is-visible");
        }, 2400);
      }
    } catch (error) { /* storage may be unavailable */ }
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 500);
  }

  function restoreDraft() {
    var raw;
    try { raw = localStorage.getItem(draftKey); } catch (error) { return; }
    if (!raw) { return; }

    var draft;
    try { draft = JSON.parse(raw); } catch (error) { return; }
    if (!draft || !draft.data) { return; }

    Object.keys(draft.data).forEach(function (name) {
      var controls = form.querySelectorAll('[name="' + name.replace(/"/g, '\\"') + '"]');
      if (!controls.length) { return; }

      var value = draft.data[name];
      var first = controls[0];

      if (first.type === "radio") {
        Array.prototype.forEach.call(controls, function (control) {
          control.checked = control.value === value;
        });
      } else if (first.type === "checkbox") {
        var values = Array.isArray(value) ? value : [value];
        Array.prototype.forEach.call(controls, function (control) {
          control.checked = values.indexOf(control.value) !== -1;
        });
      } else {
        first.value = value;
      }
    });

    if (els.draftBanner) { els.draftBanner.hidden = false; }
    showStep(Number(draft.step) || 1, false);
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch (error) { /* no-op */ }
    if (els.draftBanner) { els.draftBanner.hidden = true; }
    if (els.draftIndicator) { els.draftIndicator.classList.remove("is-visible"); }
  }

  /* ---------- Review ---------- */
  function labelFor(name) {
    var controls = form.querySelectorAll('[name="' + name + '"]');
    if (!controls.length) { return ""; }

    var first = controls[0];
    if (first.type === "radio" || first.type === "checkbox") {
      var labels = [];
      Array.prototype.forEach.call(controls, function (control) {
        if (!control.checked) { return; }
        var strong = control.closest(".choice") && control.closest(".choice").querySelector("strong");
        labels.push(strong ? strong.textContent.trim() : control.value);
      });
      return labels.join(", ");
    }

    if (first.tagName === "SELECT") {
      return first.options[first.selectedIndex] ? first.options[first.selectedIndex].text : first.value;
    }
    return first.value;
  }

  function formatDate(value) {
    if (!value) { return ""; }
    var date = new Date(value + "T00:00:00");
    if (isNaN(date.getTime())) { return value; }
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }

  function addReviewRow(dl, label, value) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = text(value, "Not provided");
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function buildReview() {
    if (!els.review) { return; }
    els.review.innerHTML = "";

    var amount = "";
    var amountValue = form.elements.amount ? form.elements.amount.value.trim() : "";
    var currency = form.elements.currency ? form.elements.currency.value : "";
    if (amountValue) { amount = currency + " " + amountValue; }

    var fileNames = files.map(function (file) { return file.name; }).join(", ");

    var groups = [
      {
        title: "Your situation",
        step: 1,
        rows: [
          ["Type of scam", labelFor("scamType")],
          ["Date it happened", formatDate(labelFor("incidentDate"))],
          ["Amount lost", amount],
          ["Payment method", labelFor("paymentMethods")]
        ]
      },
      {
        title: "What happened",
        step: 2,
        rows: [
          ["Description", labelFor("description")],
          ["Suspect details", labelFor("suspectDetails")],
          ["Platform or website", labelFor("platform")],
          ["Evidence files", fileNames],
          ["Already reported to", labelFor("reportedTo")]
        ]
      },
      {
        title: "About you",
        step: 3,
        rows: [
          ["Full name", labelFor("fullName")],
          ["Email", labelFor("email")],
          ["Phone", labelFor("phone")],
          ["Country", labelFor("country")],
          ["Preferred contact", labelFor("contactPreference")],
          ["Safe to contact", labelFor("contactSafety")],
          ["Extra support", labelFor("supportNeeds")]
        ]
      }
    ];

    groups.forEach(function (group) {
      var block = document.createElement("div");
      block.className = "review-block";

      var head = document.createElement("div");
      head.className = "review-block__head";

      var heading = document.createElement("h3");
      heading.textContent = group.title;

      var edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("data-edit", String(group.step));
      edit.addEventListener("click", function () { showStep(group.step, true); });

      head.appendChild(heading);
      head.appendChild(edit);

      var dl = document.createElement("dl");
      dl.className = "review-list";
      group.rows.forEach(function (row) { addReviewRow(dl, row[0], row[1]); });

      block.appendChild(head);
      block.appendChild(dl);
      els.review.appendChild(block);
    });
  }

  /* ---------- Files ---------- */
  function formatSize(bytes) {
    if (bytes < 1024) { return bytes + " B"; }
    if (bytes < 1024 * 1024) { return Math.round(bytes / 1024) + " KB"; }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function renderFiles() {
    if (!els.fileList) { return; }
    els.fileList.innerHTML = "";

    files.forEach(function (file, index) {
      var item = document.createElement("div");
      item.className = "file-item";
      item.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>' +
        "<span>" + escapeHtml(file.name) + "</span>" +
        "<small>" + formatSize(file.size) + "</small>" +
        '<button type="button" aria-label="Remove ' + escapeHtml(file.name) + '" data-remove-file="' + index + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
        "</button>";
      els.fileList.appendChild(item);
    });
  }

  function addFiles(fileList) {
    if (!fileList || !fileList.length) { return; }
    var allowed = /\.(jpe?g|png|webp|gif|pdf|docx?|txt|eml|msg|csv)$/i;
    var rejected = [];

    Array.prototype.forEach.call(fileList, function (file) {
      if (files.length >= 5) { rejected.push("You can add up to 5 files."); return; }
      if (!allowed.test(file.name)) { rejected.push(file.name + " is not a supported file type."); return; }
      if (file.size > 10 * 1024 * 1024) { rejected.push(file.name + " is larger than 10 MB."); return; }
      if (files.some(function (existing) { return existing.name === file.name && existing.size === file.size; })) { return; }
      files.push(file);
    });

    renderFiles();

    if (els.fileNote) {
      if (rejected.length) {
        els.fileNote.textContent = rejected.join(" ");
        els.fileNote.style.color = "var(--danger)";
      } else {
        els.fileNote.textContent = files.length
          ? files.length + " file" + (files.length === 1 ? "" : "s") + " ready. They will be sent with your report."
          : "Images, PDFs, emails or documents. Max 5 files, 10 MB each.";
        els.fileNote.style.color = "";
      }
    }
  }

  function initFiles() {
    if (els.fileInput) {
      els.fileInput.addEventListener("change", function () {
        addFiles(els.fileInput.files);
        els.fileInput.value = "";
      });
    }

    if (els.dropzone) {
      ["dragenter", "dragover"].forEach(function (eventName) {
        els.dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          els.dropzone.classList.add("is-dragover");
        });
      });
      ["dragleave", "drop"].forEach(function (eventName) {
        els.dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          els.dropzone.classList.remove("is-dragover");
        });
      });
      els.dropzone.addEventListener("drop", function (event) {
        if (event.dataTransfer) { addFiles(event.dataTransfer.files); }
      });
    }

    if (els.fileList) {
      els.fileList.addEventListener("click", function (event) {
        var button = event.target.closest("[data-remove-file]");
        if (!button) { return; }
        files.splice(Number(button.getAttribute("data-remove-file")), 1);
        renderFiles();
        if (els.fileNote) {
          els.fileNote.textContent = files.length
            ? files.length + " file" + (files.length === 1 ? "" : "s") + " ready."
            : "Images, PDFs, emails or documents. Max 5 files, 10 MB each.";
          els.fileNote.style.color = "";
        }
      });
    }
  }

  /* ---------- Submission ---------- */
  function makeCaseId() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var random = "";
    if (window.crypto && window.crypto.getRandomValues) {
      var values = new Uint32Array(6);
      window.crypto.getRandomValues(values);
      for (var i = 0; i < 6; i += 1) { random += chars[values[i] % chars.length]; }
    } else {
      for (var j = 0; j < 6; j += 1) { random += chars[Math.floor(Math.random() * chars.length)]; }
    }
    return "SR-" + new Date().getFullYear() + "-" + random;
  }

  function buildSummaryText(caseId, data) {
    var lines = [];
    lines.push("SENTINEL RECOVERY — SCAM REPORT");
    lines.push("Case reference: " + caseId);
    lines.push("Prepared: " + new Date().toLocaleString());
    lines.push("");
    lines.push("YOUR SITUATION");
    lines.push("Type of scam: " + text(data.scamType, "Not provided"));
    lines.push("Date it happened: " + text(formatDate(data.incidentDate), "Not provided"));
    lines.push("Amount lost: " + text((data.currency ? data.currency + " " : "") + (data.amount || ""), "Not provided"));
    lines.push("Payment method: " + text(labelFor("paymentMethods"), "Not provided"));
    lines.push("");
    lines.push("WHAT HAPPENED");
    lines.push("Description: " + text(data.description, "Not provided"));
    lines.push("Suspect details: " + text(data.suspectDetails, "Not provided"));
    lines.push("Platform or website: " + text(data.platform, "Not provided"));
    lines.push("Evidence files: " + text(files.map(function (file) { return file.name; }).join(", "), "None attached yet"));
    lines.push("Already reported to: " + text(labelFor("reportedTo"), "Not provided"));
    lines.push("");
    lines.push("ABOUT YOU");
    lines.push("Name: " + text(data.fullName, "Not provided"));
    lines.push("Email: " + text(data.email, "Not provided"));
    lines.push("Phone: " + text(data.phone, "Not provided"));
    lines.push("Country: " + text(data.country, "Not provided"));
    lines.push("Preferred contact: " + text(labelFor("contactPreference"), "Not provided"));
    lines.push("Safe to contact: " + text(labelFor("contactSafety"), "Not provided"));
    lines.push("Extra support: " + text(labelFor("supportNeeds"), "Not provided"));
    lines.push("");
    lines.push("This report was prepared on the Sentinel Recovery website. Recovery cannot be guaranteed.");
    return lines.join("\n");
  }

  function saveCaseRecord(caseId, status) {
    try {
      var cases = JSON.parse(localStorage.getItem(casesKey) || "[]");
      cases.push({ caseId: caseId, createdAt: new Date().toISOString(), status: status });
      localStorage.setItem(casesKey, JSON.stringify(cases.slice(-20)));
    } catch (error) { /* no-op */ }
  }

  function showSuccess(caseId, data, received) {
    if (!successPanel) { return; }

    form.hidden = true;
    successPanel.hidden = false;

    var caseEl = successPanel.querySelector("[data-success-case]");
    if (caseEl) { caseEl.textContent = caseId; }

    var copyButton = successPanel.querySelector("[data-copy]");
    if (copyButton) { copyButton.setAttribute("data-copy", caseId); }

    var title = successPanel.querySelector("[data-success-title]");
    var lead = successPanel.querySelector("[data-success-lead]");
    var emailLink = successPanel.querySelector("[data-success-email]");
    var next = successPanel.querySelector("[data-success-next]");

    lastSummary = buildSummaryText(caseId, data);
    saveCaseRecord(caseId, received ? "received" : "prepared");

    var address = text(cfg.casesEmail, text(cfg.email, "cases@sentineltrecovery.com"));
    var subject = "Scam report — " + caseId;
    var mailBody = lastSummary;
    if (mailBody.length > 1800) {
      mailBody = mailBody.slice(0, 1750) + "\n\n[Report shortened for email. A full copy can be downloaded from the website.]";
    }

    if (emailLink) {
      emailLink.href = "mailto:" + address + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(mailBody);
      emailLink.hidden = !!received;
    }

    if (received) {
      if (title) { title.textContent = "Report received"; }
      if (lead) {
        lead.textContent = "Thank you. Your report is with our case team. We will confirm receipt by email within " + text(cfg.responseTime, "one business day") + ".";
      }
      if (next) {
        next.innerHTML =
          "<h3>What happens next</h3>" +
          "<ol>" +
          "<li>You will receive an email confirming we have your report.</li>" +
          "<li>A case manager reviews the details and checks what routes may be available.</li>" +
          "<li>We contact you with an honest assessment — including if recovery is unlikely.</li>" +
          "</ol>";
      }
    } else {
      if (title) { title.textContent = "One last step: send your report"; }
      if (lead) {
        lead.textContent = "Your report is ready. Open your email app to send it to our case team, then attach any evidence files you have.";
      }
      if (next) {
        next.innerHTML =
          "<h3>What happens next</h3>" +
          "<ol>" +
          "<li>Send the pre-filled email to <strong>" + escapeHtml(address) + "</strong>.</li>" +
          "<li>Attach any screenshots, receipts or messages you have.</li>" +
          "<li>We confirm receipt within " + escapeHtml(text(cfg.responseTime, "one business day")) + " and arrange a call if appropriate.</li>" +
          "</ol>";
      }
    }

    var download = successPanel.querySelector("[data-download]");
    if (download) {
      download.onclick = function () {
        var blob = new Blob([lastSummary], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "Sentinel-Recovery-Report-" + caseId + ".txt";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      };
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitReport(event) {
    event.preventDefault();
    if (!validateStep(steps[currentStep - 1])) { return; }

    var data = collect();
    var caseId = makeCaseId();
    var button = els.submit;
    if (button) { button.disabled = true; button.textContent = "Preparing your report…"; }

    if (els.errorBox) { els.errorBox.hidden = true; }

    if (cfg.formEndpoint) {
      var payload = new FormData();
      Object.keys(data).forEach(function (key) {
        if (Array.isArray(data[key])) {
          data[key].forEach(function (value) { payload.append(key, value); });
        } else {
          payload.append(key, data[key]);
        }
      });
      payload.append("caseId", caseId);
      payload.append("submittedAt", new Date().toISOString());
      files.forEach(function (file) { payload.append("evidence", file, file.name); });

      fetch(cfg.formEndpoint, { method: "POST", body: payload })
        .then(function (response) {
          if (!response.ok) { throw new Error("Submission failed"); }
          return response.json().catch(function () { return {}; });
        })
        .then(function (result) {
          clearDraft();
          showSuccess(result.caseId || caseId, data, true);
        })
        .catch(function () {
          if (els.errorBox) {
            els.errorBox.hidden = false;
            els.errorBox.textContent = "We could not submit automatically, but your report is ready to send by email. Nothing has been lost.";
          }
          clearDraft();
          showSuccess(caseId, data, false);
        })
        .then(function () {
          if (button) { button.disabled = false; button.textContent = "Submit report"; }
        });
    } else {
      window.setTimeout(function () {
        clearDraft();
        showSuccess(caseId, data, false);
        if (button) { button.disabled = false; button.textContent = "Submit report"; }
      }, 550);
    }
  }

  /* ---------- Init ---------- */
  var today = new Date();
  var isoToday = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  Array.prototype.forEach.call(form.querySelectorAll('input[type="date"]'), function (input) {
    input.max = isoToday;
  });

  clearErrorsOnInput();
  initFiles();
  restoreDraft();
  showStep(currentStep, false);

  if (els.next) {
    els.next.addEventListener("click", function () {
      if (validateStep(steps[currentStep - 1])) { showStep(currentStep + 1, true); }
    });
  }

  if (els.back) {
    els.back.addEventListener("click", function () { showStep(currentStep - 1, true); });
  }

  form.addEventListener("input", queueSave);
  form.addEventListener("change", queueSave);

  if (els.startFresh) {
    els.startFresh.addEventListener("click", function () {
      form.reset();
      files = [];
      renderFiles();
      clearDraft();
      Array.prototype.forEach.call(form.querySelectorAll(".field--error"), function (field) {
        field.classList.remove("field--error");
      });
      showStep(1, true);
    });
  }

  form.addEventListener("submit", submitReport);
})();

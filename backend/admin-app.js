/* Sentinel Recovery — admin dashboard behaviour. No dependencies. */

(function () {
  'use strict';

  var loginView = document.getElementById('loginView');
  var dashboardView = document.getElementById('dashboardView');
  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  var logoutButton = document.getElementById('logoutButton');
  var appStatus = document.getElementById('appStatus');

  var STATUSES = ['new', 'in-review', 'assessment', 'active', 'on-hold', 'resolved', 'declined', 'closed'];

  var state = {
    cases: [],
    filtered: [],
    selected: null,
    tabsLoaded: { cases: false, enquiries: false, requests: false }
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function parseList(value) {
    try {
      var parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function statusLabel(status) {
    return String(status || 'new').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function statusClass(status) {
    return 'badge badge--' + String(status || 'new').replace(/[^a-z-]/gi, '');
  }

  async function api(path, options) {
    var opts = Object.assign({ credentials: 'same-origin' }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    var response = await fetch(path, opts);
    var data = {};
    try { data = await response.json(); } catch (error) { data = {}; }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.errors?.join?.(' ') || 'Request failed (' + response.status + ')');
    }
    return data;
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
  }

  function clearError(element) {
    if (!element) return;
    element.textContent = '';
    element.hidden = true;
  }

  /* ---------- Session ---------- */

  async function checkSession() {
    try {
      var result = await api('/api/admin/session');
      if (result.ok) { showDashboard(); return; }
    } catch (error) {
      // Not signed in.
    }
    loginView.hidden = false;
    dashboardView.hidden = true;
  }

  async function login(event) {
    event.preventDefault();
    clearError(loginError);
    var button = loginForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: { password: loginForm.elements.password.value }
      });
      loginForm.reset();
      showDashboard();
    } catch (error) {
      showError(loginError, error.message || 'Unable to sign in.');
      if (button) button.disabled = false;
    }
  }

  async function logout() {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch (error) { /* ignore */ }
    state.cases = [];
    state.filtered = [];
    state.selected = null;
    state.tabsLoaded = { cases: false, enquiries: false, requests: false };
    dashboardView.hidden = true;
    loginView.hidden = false;
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    appStatus.textContent = 'Signed in';
    loadCases();
  }

  /* ---------- Reports ---------- */

  async function loadCases() {
    appStatus.textContent = 'Loading reports…';
    try {
      var result = await api('/api/admin/cases');
      state.cases = result.cases || [];
      state.tabsLoaded.cases = true;
      renderCases();
      appStatus.textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (error) {
      appStatus.textContent = 'Load failed';
      $('caseList').innerHTML = '<p class="error">' + escapeHtml(error.message) + '</p>';
    }
  }

  function renderCases() {
    var status = $('caseFilter').value;
    var query = $('caseSearch').value.trim().toLowerCase();

    state.filtered = state.cases.filter(function (item) {
      if (status !== 'all' && item.status !== status) return false;
      if (!query) return true;
      return [item.case_id, item.full_name, item.email, item.scam_type].join(' ').toLowerCase().includes(query);
    });

    $('caseCount').textContent = state.cases.length;
    $('statTotal').textContent = state.cases.length;
    $('statNew').textContent = state.cases.filter(function (c) { return c.status === 'new'; }).length;
    $('statReview').textContent = state.cases.filter(function (c) { return ['in-review', 'assessment'].includes(c.status); }).length;

    var list = $('caseList');
    if (!state.filtered.length) {
      list.innerHTML = '<p class="muted">No reports match this view.</p>';
      return;
    }

    list.innerHTML = state.filtered.map(function (item) {
      var active = state.selected === item.case_id ? ' is-selected' : '';
      var amount = item.amount ? escapeHtml(item.currency || '') + ' ' + escapeHtml(item.amount) : '';
      return '' +
        '<button class="case-row' + active + '" type="button" data-case="' + escapeHtml(item.case_id) + '">' +
          '<span class="case-row__top">' +
            '<strong>' + escapeHtml(item.case_id) + '</strong>' +
            '<span class="' + statusClass(item.status) + '">' + escapeHtml(statusLabel(item.status)) + '</span>' +
          '</span>' +
          '<span class="case-row__name">' + escapeHtml(item.full_name || 'Unnamed') + '</span>' +
          '<span class="case-row__meta">' + escapeHtml(item.scam_type || 'Unspecified') + (amount ? ' · ' + amount : '') + '</span>' +
          '<span class="case-row__date">' + formatDate(item.created_at) + '</span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('[data-case]'), function (button) {
      button.addEventListener('click', function () { openCase(button.getAttribute('data-case')); });
    });

    if (state.selected && !state.filtered.some(function (c) { return c.case_id === state.selected; })) {
      state.selected = null;
      renderEmptyDetail();
    }
  }

  async function openCase(caseId) {
    var detail = $('caseDetail');
    detail.innerHTML = '<p class="muted">Loading case…</p>';

    try {
      var result = await api('/api/admin/cases/' + encodeURIComponent(caseId));
      var item = result.case;
      state.selected = caseId;

      var evidence = (result.evidence || []).map(function (file) {
        return '<li>' +
          '<a href="/api/admin/evidence/' + encodeURIComponent(file.id) + '/download">' + escapeHtml(file.original_name) + '</a>' +
          '<span class="muted"> ' + formatBytes(file.size) + '</span>' +
        '</li>';
      }).join('');

      var fields = [
        ['Case reference', item.case_id],
        ['Submitted', formatDate(item.created_at)],
        ['Scam type', item.scam_type],
        ['Incident date', item.incident_date],
        ['Amount', item.amount ? (item.currency || '') + ' ' + item.amount : ''],
        ['Payment methods', parseList(item.payment_methods).join(', ')],
        ['Platform', item.platform],
        ['Reported to', parseList(item.reported_to).join(', ')],
        ['Full name', item.full_name],
        ['Email', item.email],
        ['Phone', item.phone],
        ['Country', item.country],
        ['Contact preference', item.contact_preference],
        ['Support needs', item.support_needs],
        ['Contact safety', item.contact_safety],
        ['Referral', item.referral],
        ['Consents', parseList(item.consents).join(', ')],
        ['Browser reference', item.client_case_id]
      ];

      var rows = fields.filter(function (pair) { return pair[1]; }).map(function (pair) {
        return '<div class="detail-row"><dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd></div>';
      }).join('');

      detail.innerHTML = '' +
        '<div class="detail-head">' +
          '<div><p class="eyebrow">Case file</p><h2>' + escapeHtml(item.case_id) + '</h2></div>' +
          '<span class="' + statusClass(item.status) + '">' + escapeHtml(statusLabel(item.status)) + '</span>' +
        '</div>' +

        '<section class="detail-section">' +
          '<h3>Description</h3>' +
          '<p class="prose">' + nl2br(item.description) + '</p>' +
        '</section>' +

        (item.suspect_details ? '<section class="detail-section"><h3>Suspect details</h3><p class="prose">' + nl2br(item.suspect_details) + '</p></section>' : '') +

        '<section class="detail-section">' +
          '<h3>Submission details</h3>' +
          '<dl class="detail-grid">' + rows + '</dl>' +
        '</section>' +

        '<section class="detail-section">' +
          '<h3>Evidence</h3>' +
          (evidence ? '<ul class="evidence-list">' + evidence + '</ul>' : '<p class="muted">No files were attached.</p>') +
        '</section>' +

        '<section class="detail-section">' +
          '<h3>Update case</h3>' +
          '<form id="caseUpdateForm">' +
            '<label class="field"><span>Status</span>' +
              '<select class="select" name="status">' +
                STATUSES.map(function (s) {
                  return '<option value="' + s + '"' + (s === item.status ? ' selected' : '') + '>' + statusLabel(s) + '</option>';
                }).join('') +
              '</select>' +
            '</label>' +
            '<label class="field"><span>Internal notes</span>' +
              '<textarea class="textarea" name="notes" rows="5" placeholder="Internal only. Do not include sensitive data unless necessary.">' + escapeHtml(item.notes || '') + '</textarea>' +
            '</label>' +
            '<p class="error" id="caseUpdateError" hidden></p>' +
            '<button class="button button--primary" type="submit">Save update</button>' +
          '</form>' +
        '</section>';

      $('caseUpdateForm').addEventListener('submit', function (event) { saveCase(event, caseId); });
      renderCases();
    } catch (error) {
      detail.innerHTML = '<p class="error">' + escapeHtml(error.message) + '</p>';
    }
  }

  async function saveCase(event, caseId) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var errorBox = $('caseUpdateError');
    clearError(errorBox);
    if (button) button.disabled = true;

    try {
      await api('/api/admin/cases/' + encodeURIComponent(caseId), {
        method: 'PATCH',
        body: {
          status: form.elements.status.value,
          notes: form.elements.notes.value
        }
      });
      var local = state.cases.find(function (c) { return c.case_id === caseId; });
      if (local) local.status = form.elements.status.value;
      renderCases();
      var banner = document.createElement('p');
      banner.className = 'saved-note';
      banner.textContent = 'Saved.';
      form.appendChild(banner);
      window.setTimeout(function () { banner.remove(); }, 2500);
    } catch (error) {
      showError(errorBox, error.message || 'Unable to save.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderEmptyDetail() {
    $('caseDetail').innerHTML = '<div class="empty-state"><h2>Select a report</h2><p class="muted">Choose a case from the list to see the full submission, evidence and notes.</p></div>';
  }

  /* ---------- Enquiries and status requests ---------- */

  async function loadEnquiries() {
    var target = $('enquiryList');
    target.innerHTML = '<p class="muted">Loading…</p>';
    try {
      var result = await api('/api/admin/enquiries');
      $('enquiryCount').textContent = (result.enquiries || []).length;
      if (!result.enquiries.length) {
        target.innerHTML = '<p class="muted">No enquiries yet.</p>';
        return;
      }
      target.innerHTML = result.enquiries.map(function (item) {
        return '<article class="message-card">' +
          '<div class="message-card__head">' +
            '<strong>' + escapeHtml(item.name || 'Unnamed') + '</strong>' +
            '<span class="muted">' + formatDate(item.created_at) + '</span>' +
          '</div>' +
          '<p class="message-card__meta">' + escapeHtml(item.email || '') + ' · ' + escapeHtml(item.topic || '') + '</p>' +
          '<p class="prose">' + nl2br(item.message) + '</p>' +
        '</article>';
      }).join('');
    } catch (error) {
      target.innerHTML = '<p class="error">' + escapeHtml(error.message) + '</p>';
    }
  }

  async function loadRequests() {
    var target = $('requestList');
    target.innerHTML = '<p class="muted">Loading…</p>';
    try {
      var result = await api('/api/admin/status-requests');
      $('requestCount').textContent = (result.requests || []).length;
      if (!result.requests.length) {
        target.innerHTML = '<p class="muted">No status requests yet.</p>';
        return;
      }
      target.innerHTML = result.requests.map(function (item) {
        var badge = item.matched
          ? '<span class="badge badge--resolved">Matched</span>'
          : '<span class="badge badge--declined">Unverified</span>';
        return '<article class="message-card">' +
          '<div class="message-card__head">' +
            '<strong>' + escapeHtml(item.case_id || '—') + '</strong>' +
            badge +
            '<span class="muted">' + formatDate(item.created_at) + '</span>' +
          '</div>' +
          '<p class="message-card__meta">' + escapeHtml(item.email || '') + '</p>' +
        '</article>';
      }).join('');
    } catch (error) {
      target.innerHTML = '<p class="error">' + escapeHtml(error.message) + '</p>';
    }
  }

  /* ---------- Tabs ---------- */

  function activateTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-tab') === name);
    });
    ['cases', 'enquiries', 'requests'].forEach(function (tab) {
      var panel = $('panel-' + tab);
      var active = tab === name;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });

    if (!state.tabsLoaded[name]) {
      state.tabsLoaded[name] = true;
      if (name === 'cases') loadCases();
      if (name === 'enquiries') loadEnquiries();
      if (name === 'requests') loadRequests();
    }
  }

  /* ---------- Init ---------- */

  loginForm.addEventListener('submit', login);
  loginForm.elements.password.addEventListener('input', function () { clearError(loginError); });
  logoutButton.addEventListener('click', logout);

  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (button) {
    button.addEventListener('click', function () { activateTab(button.getAttribute('data-tab')); });
  });

  $('caseSearch').addEventListener('input', renderCases);
  $('caseFilter').addEventListener('change', renderCases);

  checkSession();
})();

/**
 * Americas Health — Frontend Event Tracker
 *
 * Handles: session management, UTM capture, event tracking,
 * form field persistence (7-day cookies), and zip code lookup.
 */
(function () {
  "use strict";

  var API_BASE = "/api";
  var COOKIE_DAYS = 7;
  var PREFIX = "ah_";

  // -----------------------------------------------------------------------
  // Cookie helpers
  // -----------------------------------------------------------------------
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      ";expires=" + d.toUTCString() +
      ";path=/;SameSite=Lax";
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------
  function getOrCreateSession() {
    var sid = getCookie(PREFIX + "session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      setCookie(PREFIX + "session_id", sid, COOKIE_DAYS);
    }
    return sid;
  }

  var SESSION_ID = getOrCreateSession();

  // -----------------------------------------------------------------------
  // UTM capture — read from URL params, persist to cookies
  // -----------------------------------------------------------------------
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function captureUtms() {
    var params = new URLSearchParams(window.location.search);
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) setCookie(PREFIX + k, v, COOKIE_DAYS);
    });
  }

  function getUtms() {
    var out = {};
    UTM_KEYS.forEach(function (k) {
      out[k] = getCookie(PREFIX + k) || "";
    });
    return out;
  }

  captureUtms();

  // -----------------------------------------------------------------------
  // Event tracking
  // -----------------------------------------------------------------------
  function currentPage() {
    var p2 = document.getElementById("page2");
    return p2 && p2.classList.contains("active") ? "thankyou" : "form";
  }

  function trackEvent(eventType, extra) {
    var payload = Object.assign(
      { session_id: SESSION_ID, event_type: eventType, page: currentPage() },
      getUtms(),
      extra || {}
    );
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(API_BASE + "/events", blob);
  }

  // -----------------------------------------------------------------------
  // Field persistence — restore from cookies, save on change
  // -----------------------------------------------------------------------
  var PERSIST_FIELDS = ["first_name", "email", "phone", "zip", "dob_month", "dob_day", "dob_year"];

  function initFieldPersistence() {
    PERSIST_FIELDS.forEach(function (f) {
      var el = document.getElementById(f);
      if (!el) return;

      // Restore saved value
      var saved = getCookie(PREFIX + f);
      if (saved && !el.value) {
        el.value = saved;
      }

      // Save on change
      el.addEventListener("change", function () {
        setCookie(PREFIX + f, el.value, COOKIE_DAYS);
      });
    });
  }

  // -----------------------------------------------------------------------
  // Field interaction tracking — fire once per field per session
  // -----------------------------------------------------------------------
  function initFieldTracking() {
    var tracked = {};
    var fields = ["first_name", "email", "phone", "zip", "dob_month", "dob_day", "dob_year", "tcpa_checkbox"];
    fields.forEach(function (f) {
      var el = document.getElementById(f);
      if (!el) return;
      el.addEventListener("focus", function () {
        if (!tracked[f]) {
          tracked[f] = true;
          trackEvent("field_interaction", { field_name: f });
        }
      });
    });
  }

  // -----------------------------------------------------------------------
  // Form start detection — fire once when user first types
  // -----------------------------------------------------------------------
  function initFormStartTracking() {
    var started = false;
    var form = document.getElementById("formSubmit");
    if (!form) return;
    form.addEventListener("input", function () {
      if (!started) {
        started = true;
        trackEvent("form_start");
      }
    });
  }

  // -----------------------------------------------------------------------
  // Zip code lookup — auto-fill city/state on blur
  // -----------------------------------------------------------------------
  function initZipLookup() {
    var zipEl = document.getElementById("zip");
    if (!zipEl) return;

    zipEl.addEventListener("blur", function () {
      var z = zipEl.value.trim();
      if (z.length !== 5) return;

      fetch(API_BASE + "/zipcode/" + z)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var cityEl = document.getElementById("city");
          var stateEl = document.getElementById("state");
          if (cityEl) cityEl.value = data.city || "";
          if (stateEl) stateEl.value = data.state || "";
        })
        .catch(function () { /* zip not found, no-op */ });
    });
  }

  // -----------------------------------------------------------------------
  // Initialize on DOM ready
  // -----------------------------------------------------------------------
  function init() {
    initFieldPersistence();
    initFieldTracking();
    initFormStartTracking();
    initZipLookup();

    // Page load events
    trackEvent("page_view");
    trackEvent("impression");

    // Render event after paint
    requestAnimationFrame(function () {
      trackEvent("render");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // -----------------------------------------------------------------------
  // Public API — used by handleSubmit in index.html
  // -----------------------------------------------------------------------
  window._ahTracker = {
    SESSION_ID: SESSION_ID,
    getUtms: getUtms,
    trackEvent: trackEvent,
  };
})();

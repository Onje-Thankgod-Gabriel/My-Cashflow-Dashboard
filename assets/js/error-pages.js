(function () {
  "use strict";

  var THEME_KEY = "savvyfi-theme";

  function byId(id) {
    return document.getElementById(id);
  }

  function applyTheme(theme) {
    var nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
    var toggle = byId("theme-toggle");
    if (!toggle) return;
    toggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    toggle.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
    var icon = toggle.querySelector("[data-lucide]");
    if (icon) icon.setAttribute("data-lucide", nextTheme === "dark" ? "sun" : "moon");
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function safeBack(event) {
    event.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "./index.html";
    }
  }

  function reportUnavailableSupport(event) {
    event.preventDefault();
    var status = byId("error-status");
    if (status) {
      status.textContent = "Support contact is not configured in this frontend yet.";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(localStorage.getItem(THEME_KEY) || "dark");
    var toggle = byId("theme-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
      });
    }
    document.querySelectorAll("[data-safe-back]").forEach(function (link) {
      link.addEventListener("click", safeBack);
    });
    document.querySelectorAll("[data-unavailable-support]").forEach(function (link) {
      link.addEventListener("click", reportUnavailableSupport);
    });
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  });
}());

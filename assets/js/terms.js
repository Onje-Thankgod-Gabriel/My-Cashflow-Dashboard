(function () {
  "use strict";

  var THEME_KEY = "savvyfi-theme";
  var toggle = document.getElementById("theme-toggle");

  function applyTheme(theme) {
    var nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    if (!toggle) return;
    toggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    toggle.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
    var icon = toggle.querySelector("[data-lucide]");
    if (icon) icon.setAttribute("data-lucide", nextTheme === "dark" ? "sun" : "moon");
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }

  applyTheme(localStorage.getItem(THEME_KEY));
  if (toggle) {
    toggle.addEventListener("click", function () {
      applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
    });
  }
})();

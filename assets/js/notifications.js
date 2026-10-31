/* Gabsweb CashFlow — shared navigation notification panel */
(function () {
  "use strict";

  function initNotifications() {
    var wrapper = document.getElementById("notification-wrapper");
    var button = document.getElementById("notification-btn");
    var dropdown = document.getElementById("notification-dropdown");
    if (!wrapper || !button || !dropdown) return;
    if (wrapper.getAttribute("data-notifications-ready") === "true") return;
    wrapper.setAttribute("data-notifications-ready", "true");

    var closeTimer = null;

    if (!dropdown.id) dropdown.id = "notification-dropdown";
    if (!button.getAttribute("aria-label")) {
      button.setAttribute("aria-label", "Notifications");
    }
    button.setAttribute("aria-controls", dropdown.id);
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");
    dropdown.setAttribute("role", "region");
    dropdown.setAttribute("aria-label", "Notifications");

    function isOpen() {
      return !dropdown.classList.contains("hidden");
    }

    function open() {
      window.clearTimeout(closeTimer);
      dropdown.classList.remove("hidden");
      button.setAttribute("aria-expanded", "true");
      window.requestAnimationFrame(function () {
        dropdown.classList.add("opacity-100", "translate-y-0");
        dropdown.classList.remove("opacity-0", "translate-y-2");
      });
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      window.clearTimeout(closeTimer);
      dropdown.classList.remove("opacity-100", "translate-y-0");
      dropdown.classList.add("opacity-0", "translate-y-2");
      button.setAttribute("aria-expanded", "false");
      closeTimer = window.setTimeout(function () {
        if (!dropdown.classList.contains("opacity-100")) {
          dropdown.classList.add("hidden");
        }
      }, 160);
      if (returnFocus) button.focus();
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen()) {
        close(false);
      } else {
        open();
      }
    });

    document.addEventListener("click", function (event) {
      if (!isOpen()) return;
      if (wrapper.contains(event.target)) return;
      close(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !isOpen()) return;
      event.stopPropagation();
      close(true);
    });

    var clearButton = dropdown.querySelector("#clear-notifications");
    if (clearButton) {
      clearButton.addEventListener("click", function () {
        var list = dropdown.querySelector("#notification-list");
        if (!list) return;
        list.innerHTML =
          '<div class="app-notification-empty">' +
          '<span class="app-notification-empty-icon"><i data-lucide="bell" class="w-4 h-4"></i></span>' +
          "<p>No new notifications</p>" +
          "<small>Notifications from your CashFlow activity will appear here.</small>" +
          "</div>";
        if (window.lucide && typeof window.lucide.createIcons === "function") {
          window.lucide.createIcons();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNotifications);
  } else {
    initNotifications();
  }
})();

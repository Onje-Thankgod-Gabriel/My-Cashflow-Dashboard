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
    localStorage.setItem(THEME_KEY, nextTheme);
    var toggle = byId("theme-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
      var icon = toggle.querySelector("[data-lucide]");
      if (icon) icon.setAttribute("data-lucide", nextTheme === "dark" ? "sun" : "moon");
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }
  }

  function setStatus(message, isInfo) {
    var status = byId("auth-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-info", Boolean(isInfo));
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function togglePassword(button) {
    var input = byId(button.getAttribute("aria-controls"));
    var icon = button.querySelector("[data-lucide]");
    if (!input) return;
    var showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    if (icon) icon.setAttribute("data-lucide", showing ? "eye" : "eye-off");
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function validateLogin(event) {
    event.preventDefault();
    var email = byId("email").value.trim();
    var password = byId("password").value;
    if (!email || !password) {
      setStatus("Enter your email address and password.");
      return;
    }
    if (!validEmail(email)) {
      setStatus("Enter a valid email address.");
      return;
    }
    setStatus("Sign-in will be available when the Django authentication service is connected.", true);
  }

  function validateRegistration(event) {
    event.preventDefault();
    var name = byId("name").value.trim();
    var email = byId("email").value.trim();
    var password = byId("password").value;
    var confirmation = byId("password-confirmation").value;
    var terms = byId("terms").checked;
    if (!name || !email || !password || !confirmation) {
      setStatus("Complete all required fields.");
      return;
    }
    if (!validEmail(email)) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setStatus("Passwords do not match.");
      return;
    }
    if (!terms) {
      setStatus("Agree to the terms before creating your account.");
      return;
    }
    setStatus("Account creation will be available when the Django authentication service is connected.", true);
  }

  function validateResetRequest(event) {
    event.preventDefault();
    var email = byId("email").value.trim();
    if (!email) {
      setStatus("Enter the email address associated with your account.");
      return;
    }
    if (!validEmail(email)) {
      setStatus("Enter a valid email address.");
      return;
    }
    setStatus("Password reset requests will be available when the Django authentication service is connected.", true);
  }

  function validateResetConfirm(event) {
    event.preventDefault();
    var password = byId("password").value;
    var confirmation = byId("password-confirmation").value;
    if (!password || !confirmation) {
      setStatus("Enter and confirm your new password.");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setStatus("Passwords do not match.");
      return;
    }
    setStatus("Password changes will be available when the Django authentication service is connected.", true);
  }

  document.querySelectorAll("[data-password-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      togglePassword(button);
    });
  });

  document.querySelectorAll("[data-auth-form]").forEach(function (form) {
    var formType = form.getAttribute("data-auth-form");
    var handler = validateLogin;
    if (formType === "register") handler = validateRegistration;
    if (formType === "reset-request") handler = validateResetRequest;
    if (formType === "reset-confirm") handler = validateResetConfirm;
    form.addEventListener("submit", handler);
  });

  document.querySelectorAll("[data-google-auth]").forEach(function (button) {
    button.addEventListener("click", function () {
      setStatus("Google sign-in will be available with the authentication service.", true);
    });
  });

  var savedTheme = localStorage.getItem(THEME_KEY);
  applyTheme(savedTheme === "light" ? "light" : "dark");
  var themeToggle = byId("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
    });
  }
})();

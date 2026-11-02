(function () {
  "use strict";

  var THEME_KEY = "savvyfi-theme";
  var VALID_THEMES = ["dark", "light"];
  var SUPPORTED_CURRENCIES = ["NGN"];
  var MAX_IMAGE_DIMENSION = 360;
  var MAX_IMAGE_FILE_SIZE = 8 * 1024 * 1024;
  var profileImageSaved = "";
  var profileImageDraft = "";
  var profileImageProcessing = false;
  var profileImageRequestId = 0;
  var defaultProfileImage = "assets/images/profiles/emma.jpg";

  function getCashflowData() {
    return window.GabswebCashFlowData || null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function notify(title, message, type) {
    var toast = byId("toast");
    var toastTitle = byId("toast-title");
    var toastMessage = byId("toast-message");
    if (!toast || !toastTitle || !toastMessage) return;
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toast.className = "toast " + (type || "success");
    toast.classList.add("show");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidImageSource(value) {
    return (
      typeof value === "string" &&
      /^data:image\/(png|jpe?g|webp);base64,/i.test(value)
    );
  }

  function getInitials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (!parts.length) return "--";
    return parts
      .map(function (part) {
        return part.charAt(0);
      })
      .join("")
      .toUpperCase();
  }

  function getSavedProfileImage() {
    var data = getCashflowData();
    if (!data) return "";
    try {
      var settings = data.getSettings();
      var image =
        settings && settings.preferences ? settings.preferences.profileImage : "";
      return isValidImageSource(image) ? image : "";
    } catch (error) {
      return "";
    }
  }

  function formatShift(value) {
    if (value === "morning") return "Morning · 7:00 AM – 1:00 PM";
    if (value === "afternoon") return "Afternoon · 1:00 PM – 7:00 PM";
    if (value === "night") return "Night · 7:00 PM – 7:00 AM";
    return "Not set";
  }

  function renderAvatar(imageId, initialsId, name, image, fallbackImage) {
    var imageElement = byId(imageId);
    var initialsElement = byId(initialsId);
    var hasImage = isValidImageSource(image);
    var imageSource = hasImage ? image : fallbackImage || "";
    if (imageElement) {
      if (imageSource) {
        imageElement.src = imageSource;
        imageElement.hidden = false;
      } else {
        imageElement.removeAttribute("src");
        imageElement.hidden = true;
      }
    }
    if (initialsElement) {
      initialsElement.textContent = getInitials(name);
      initialsElement.hidden = Boolean(imageSource);
    }
  }

  function renderProfileSummary(profile) {
    var name = profile && profile.name ? profile.name : "";
    var email = profile && profile.email ? profile.email : "";
    var team = profile && profile.workTeam ? profile.workTeam : "";
    var supervisor = profile && profile.supervisor ? profile.supervisor : "";
    var shift = profile && profile.shiftPreferences
      ? profile.shiftPreferences.preferredShift
      : "";
    var displayName = byId("profile-display-name");
    var displayEmail = byId("profile-display-email");
    var detailName = byId("profile-detail-name");
    var detailEmail = byId("profile-detail-email");
    var detailTeam = byId("profile-detail-team");
    var detailSupervisor = byId("profile-detail-supervisor");
    var detailShift = byId("profile-detail-shift");
    var summaryName = byId("profile-summary-name");
    var summaryEmail = byId("profile-summary-email");
    var summaryInitials = byId("profile-summary-initials");

    if (displayName) displayName.textContent = name || "Not set";
    if (displayEmail) displayEmail.textContent = email || "No email saved";
    if (detailName) detailName.textContent = name || "Not set";
    if (detailEmail) detailEmail.textContent = email || "Not set";
    if (detailTeam) detailTeam.textContent = team || "Not set";
    if (detailSupervisor) detailSupervisor.textContent = supervisor || "Not set";
    if (detailShift) detailShift.textContent = formatShift(shift);
    if (summaryName) summaryName.textContent = name || "Not set";
    if (summaryEmail) summaryEmail.textContent = email || "Not set";
    if (summaryInitials) summaryInitials.textContent = getInitials(name);

    renderAvatar(
      "profile-avatar-image",
      "profile-avatar-initials",
      name,
      profileImageSaved,
      defaultProfileImage
    );
    renderAvatar(
      "profile-image-preview-img",
      "profile-image-preview-initials",
      name,
      profileImageDraft
    );
  }

  function clearFieldError(inputId) {
    var input = byId(inputId);
    var field = byId(inputId + "-field");
    var error = byId(inputId + "-error");
    if (field) field.classList.remove("is-invalid");
    if (input) input.removeAttribute("aria-invalid");
    if (error) error.textContent = "";
  }

  function setFieldError(inputId, message) {
    var input = byId(inputId);
    var field = byId(inputId + "-field");
    var error = byId(inputId + "-error");
    if (field) field.classList.add("is-invalid");
    if (input) input.setAttribute("aria-invalid", "true");
    if (error) error.textContent = message;
  }

  function setSelectValue(selectId, value) {
    var select = byId(selectId);
    if (!select) return;
    var target = value || "";
    var exists = Array.prototype.some.call(select.options, function (option) {
      return option.value === target;
    });
    if (!exists && target) {
      var option = document.createElement("option");
      option.value = target;
      option.textContent = target + " (saved value)";
      select.appendChild(option);
    }
    select.value = target;
    if (select.selectedIndex === -1) select.selectedIndex = 0;
  }

  function setProfileEditMode(editing) {
    var viewCard = byId("profile-view-card");
    var form = byId("profile-form");
    if (viewCard) viewCard.hidden = editing;
    if (form) form.hidden = !editing;
  }

  function loadProfileFields() {
    var data = getCashflowData();
    if (!data) return;
    try {
      var profile = data.getProfile();
      var nameField = byId("profile-name");
      var emailField = byId("profile-email");
      if (nameField) nameField.value = profile.name || "";
      if (emailField) emailField.value = profile.email || "";
      clearFieldError("profile-name");
      clearFieldError("profile-email");
      profileImageSaved = getSavedProfileImage();
      profileImageDraft = profileImageSaved;
      renderProfileSummary(profile);
    } catch (error) {
      notify(
        "Profile Unavailable",
        "Saved profile information could not be loaded.",
        "error"
      );
    }
  }

  function openProfileEdit() {
    var data = getCashflowData();
    if (!data) {
      notify(
        "Settings Unavailable",
        "The shared data layer is not available.",
        "error"
      );
      return;
    }
    try {
      var profile = data.getProfile();
      var nameField = byId("profile-name");
      var emailField = byId("profile-email");
      if (nameField) nameField.value = profile.name || "";
      if (emailField) emailField.value = profile.email || "";
      clearFieldError("profile-name");
      clearFieldError("profile-email");
      profileImageSaved = getSavedProfileImage();
      profileImageDraft = profileImageSaved;
      renderProfileSummary(profile);
      setProfileEditMode(true);
      if (nameField) nameField.focus();
    } catch (error) {
      notify("Profile Unavailable", "Your profile could not be opened for editing.", "error");
    }
  }

  function cancelPendingProfileImage() {
    profileImageRequestId += 1;
    profileImageProcessing = false;
    var saveButton = byId("save-profile-btn");
    if (saveButton) saveButton.disabled = false;
  }

  function cancelProfileEdit() {
    cancelPendingProfileImage();
    profileImageDraft = profileImageSaved;
    var imageInput = byId("profile-image-input");
    if (imageInput) imageInput.value = "";
    setProfileEditMode(false);
    loadProfileFields();
  }

  function processProfileImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("The selected image could not be read."));
      };
      reader.onload = function (event) {
        var image = new Image();
        image.onerror = function () {
          reject(new Error("The selected image could not be loaded."));
        };
        image.onload = function () {
          var scale = Math.min(
            1,
            MAX_IMAGE_DIMENSION / Math.max(image.width, image.height)
          );
          var width = Math.max(1, Math.round(image.width * scale));
          var height = Math.max(1, Math.round(image.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          var context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("The selected image could not be prepared."));
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          try {
            resolve(
              canvas.toDataURL(
                file.type === "image/png" ? "image/png" : "image/jpeg",
                0.84
              )
            );
          } catch (error) {
            reject(new Error("The selected image could not be prepared."));
          }
        };
        image.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleProfileImageChange(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      input.value = "";
      notify("Image Not Added", "Choose a JPG, PNG or WebP image.", "error");
      return;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
      input.value = "";
      notify("Image Too Large", "Choose an image smaller than 8 MB.", "error");
      return;
    }

    var saveButton = byId("save-profile-btn");
    var requestId = profileImageRequestId + 1;
    profileImageRequestId = requestId;
    profileImageProcessing = true;
    if (saveButton) saveButton.disabled = true;
    processProfileImage(file)
      .then(function (dataUrl) {
        if (requestId !== profileImageRequestId) return;
        profileImageDraft = dataUrl;
        var nameField = byId("profile-name");
        renderAvatar(
          "profile-image-preview-img",
          "profile-image-preview-initials",
          nameField ? nameField.value : "",
          profileImageDraft
        );
      })
      .catch(function (error) {
        if (requestId !== profileImageRequestId) return;
        input.value = "";
        notify(
          "Image Not Added",
          error && error.message ? error.message : "The selected image could not be used.",
          "error"
        );
      })
      .then(function () {
        if (requestId !== profileImageRequestId) return;
        profileImageProcessing = false;
        if (saveButton) saveButton.disabled = false;
      });
  }

  function removeProfileImage() {
    cancelPendingProfileImage();
    var imageInput = byId("profile-image-input");
    var nameField = byId("profile-name");
    profileImageDraft = "";
    if (imageInput) imageInput.value = "";
    renderAvatar(
      "profile-image-preview-img",
      "profile-image-preview-initials",
      nameField ? nameField.value : "",
      ""
    );
  }

  function saveProfile(event) {
    if (event) event.preventDefault();
    var data = getCashflowData();
    if (!data) {
      notify(
        "Settings Unavailable",
        "The shared data layer is not available.",
        "error"
      );
      return;
    }
    if (profileImageProcessing) {
      notify("Image Not Ready", "Wait for the selected image to load, then save again.", "info");
      return;
    }

    var nameField = byId("profile-name");
    var emailField = byId("profile-email");
    var name = nameField ? nameField.value.trim() : "";
    var email = emailField ? emailField.value.trim() : "";
    clearFieldError("profile-name");
    clearFieldError("profile-email");

    if (!name) {
      setFieldError("profile-name", "Enter your full name.");
      if (nameField) nameField.focus();
      notify("Validation Error", "Full name is required.", "error");
      return;
    }

    if (!email) {
      setFieldError("profile-email", "Enter your email address.");
      if (emailField) emailField.focus();
      notify("Validation Error", "Email address is required.", "error");
      return;
    }

    if (!isValidEmail(email)) {
      setFieldError("profile-email", "Enter a valid email address.");
      if (emailField) emailField.focus();
      notify("Validation Error", "Enter a valid email address.", "error");
      return;
    }

    try {
      if (profileImageDraft !== profileImageSaved) {
        var settings = data.getSettings();
        var preferences = Object.assign({}, settings.preferences || {}, {
          profileImage: profileImageDraft || ""
        });
        data.updateSettings({
          name: name,
          email: email,
          preferences: preferences
        });
      } else {
        data.updateProfile({ name: name, email: email });
      }
      loadProfileFields();
      setProfileEditMode(false);
      renderSidebarBalance();
      window.dispatchEvent(new CustomEvent("gabsweb:profile-updated"));
      window.dispatchEvent(new CustomEvent("gabsweb:profile-image-updated"));
      notify("Profile Updated", "Your profile information has been saved.", "success");
    } catch (error) {
      notify(
        "Profile Not Saved",
        error && error.message ? error.message : "Your profile could not be saved.",
        "error"
      );
    }
  }

  function loadFinancialFields() {
    var data = getCashflowData();
    if (!data) return;
    try {
      var settings = data.getSettings();
      setSelectValue("settings-currency", settings.currency || "NGN");
      var monthField = byId("settings-financial-month");
      if (monthField) monthField.value = "calendar";
    } catch (error) {
      notify("Preferences Unavailable", "Saved financial preferences could not be loaded.", "error");
    }
  }

  function saveFinancialPreferences(event) {
    if (event) event.preventDefault();
    var data = getCashflowData();
    if (!data) {
      notify("Settings Unavailable", "The shared data layer is not available.", "error");
      return;
    }

    var currencyField = byId("settings-currency");
    var currency = currencyField ? currencyField.value : "";
    if (SUPPORTED_CURRENCIES.indexOf(currency) === -1) {
      notify(
        "Currency Not Supported",
        "Only Nigerian Naira (NGN) is currently supported.",
        "error"
      );
      return;
    }

    try {
      data.updateSettings({
        currency: currency,
        financialMonthPreference: "calendar"
      });
      loadFinancialFields();
      notify("Preferences Saved", "Your financial preferences have been saved.", "success");
    } catch (error) {
      notify(
        "Preferences Not Saved",
        error && error.message ? error.message : "Your financial preferences could not be saved.",
        "error"
      );
    }
  }

  function loadWorkFields() {
    var data = getCashflowData();
    if (!data) return;
    try {
      var profile = data.getProfile();
      var settings = data.getSettings();
      var teamField = byId("work-team");
      var supervisorField = byId("work-supervisor");
      var shiftPreferences = profile.shiftPreferences || settings.shiftPreferences || {};
      if (teamField) teamField.value = profile.workTeam || "";
      if (supervisorField) supervisorField.value = profile.supervisor || "";
      setSelectValue("work-shift", shiftPreferences.preferredShift || "");
    } catch (error) {
      notify("Work Preferences Unavailable", "Saved work preferences could not be loaded.", "error");
    }
  }

  function saveWorkPreferences(event) {
    if (event) event.preventDefault();
    var data = getCashflowData();
    if (!data) {
      notify("Settings Unavailable", "The shared data layer is not available.", "error");
      return;
    }

    var teamField = byId("work-team");
    var supervisorField = byId("work-supervisor");
    var shiftField = byId("work-shift");

    try {
      var profile = data.getProfile();
      var shiftPreferences = Object.assign({}, profile.shiftPreferences || {});
      var shift = shiftField ? shiftField.value : "";
      if (shift) {
        shiftPreferences.preferredShift = shift;
      } else {
        delete shiftPreferences.preferredShift;
      }
      data.updateProfile({
        workTeam: teamField ? teamField.value.trim() : "",
        supervisor: supervisorField ? supervisorField.value.trim() : "",
        shiftPreferences: shiftPreferences
      });
      loadWorkFields();
      loadProfileFields();
      notify(
        "Work Preferences Updated",
        "Your work preferences have been saved.",
        "success"
      );
    } catch (error) {
      notify(
        "Work Preferences Not Saved",
        error && error.message ? error.message : "Your work preferences could not be saved.",
        "error"
      );
    }
  }

  function getStoredTheme() {
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (VALID_THEMES.indexOf(stored) !== -1) return stored;
    } catch (error) {
      return "dark";
    }
    return "dark";
  }

  function updateThemeSelection(theme) {
    document.querySelectorAll("[data-theme-option]").forEach(function (option) {
      var isSelected = option.getAttribute("data-theme-option") === theme;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    var label = byId("current-theme-label");
    if (label) label.textContent = theme === "light" ? "Light mode" : "Dark mode";
  }

  function syncThemeSelection() {
    var theme = getStoredTheme();
    var isDark = document.documentElement.classList.contains("dark");
    if (isDark) theme = "dark";
    updateThemeSelection(theme);
  }

  function applyTheme(theme, announce) {
    var normalized = VALID_THEMES.indexOf(theme) === -1 ? "dark" : theme;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(normalized);
    document.documentElement.style.colorScheme = normalized;
    try {
      localStorage.setItem(THEME_KEY, normalized);
    } catch (error) {
      notify("Theme Not Saved", "Your theme was applied but could not be stored.", "error");
      updateThemeSelection(normalized);
      return;
    }
    updateThemeSelection(normalized);
    if (announce) {
      notify(
        "Theme Applied",
        normalized === "light" ? "Light mode is now active." : "Dark mode is now active.",
        "success"
      );
    }
  }

  function initThemePreferences() {
    updateThemeSelection(getStoredTheme());
    document.querySelectorAll("[data-theme-option]").forEach(function (option) {
      option.addEventListener("click", function () {
        applyTheme(option.getAttribute("data-theme-option"), true);
      });
    });

    var headerToggle = byId("theme-toggle");
    if (headerToggle) {
      headerToggle.addEventListener("click", function () {
        window.setTimeout(syncThemeSelection, 0);
      });
    }

    if (window.MutationObserver) {
      var observer = new MutationObserver(syncThemeSelection);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  function activatePanel(name) {
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll("[data-settings-target]")
    );
    var panels = Array.prototype.slice.call(
      document.querySelectorAll("[data-settings-panel]")
    );
    buttons.forEach(function (button) {
      var isActive = button.getAttribute("data-settings-target") === name;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach(function (panel) {
      var isActive = panel.getAttribute("data-settings-panel") === name;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  }

  function initSettingsNav() {
    var buttons = Array.prototype.slice.call(
      document.querySelectorAll("[data-settings-target]")
    );
    buttons.forEach(function (button, index) {
      button.tabIndex = button.classList.contains("active") ? 0 : -1;
      button.addEventListener("click", function () {
        activatePanel(button.getAttribute("data-settings-target"));
      });
      button.addEventListener("keydown", function (event) {
        var nextIndex = index;
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          nextIndex = (index + 1) % buttons.length;
        } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          nextIndex = (index - 1 + buttons.length) % buttons.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = buttons.length - 1;
        } else {
          return;
        }
        event.preventDefault();
        buttons[nextIndex].focus();
        buttons[nextIndex].click();
      });
    });
  }

  function updateStorageStatus() {
    var data = getCashflowData();
    var chip = byId("settings-storage-chip");
    var title = byId("settings-storage-title");
    var copy = byId("settings-storage-copy");
    var available = true;
    if (data && typeof data.isStorageAvailable === "function") {
      try {
        available = data.isStorageAvailable();
      } catch (error) {
        available = false;
      }
    }
    if (chip) chip.classList.toggle("is-warning", !available);
    if (title) title.textContent = available ? "Saved on this device" : "Storage unavailable";
    if (copy) copy.textContent = available ? "Private browser storage" : "Changes may not persist";
  }

  function bindForms() {
    var profileForm = byId("profile-form");
    if (profileForm) profileForm.addEventListener("submit", saveProfile);
    var editButton = byId("edit-profile-btn");
    if (editButton) editButton.addEventListener("click", openProfileEdit);
    var resetButton = byId("reset-profile-btn");
    if (resetButton) resetButton.addEventListener("click", cancelProfileEdit);
    var imageInput = byId("profile-image-input");
    if (imageInput) imageInput.addEventListener("change", handleProfileImageChange);
    var removeImageButton = byId("remove-profile-image-btn");
    if (removeImageButton) removeImageButton.addEventListener("click", removeProfileImage);

    var nameField = byId("profile-name");
    if (nameField) {
      nameField.addEventListener("input", function () {
        clearFieldError("profile-name");
        if (!profileImageDraft) {
          renderAvatar(
            "profile-image-preview-img",
            "profile-image-preview-initials",
            nameField.value,
            ""
          );
        }
      });
    }
    var emailField = byId("profile-email");
    if (emailField) {
      emailField.addEventListener("input", function () {
        clearFieldError("profile-email");
      });
    }

    var financialForm = byId("financial-preferences-form");
    if (financialForm) {
      financialForm.addEventListener("submit", saveFinancialPreferences);
    }

    var workForm = byId("work-preferences-form");
    if (workForm) workForm.addEventListener("submit", saveWorkPreferences);
  }

  function renderSidebarBalance() {
    var data = getCashflowData();
    if (!data) return;
    var balanceElement = byId("sidebar-total-balance");
    var noteElement = byId("sidebar-balance-note");
    var total = data.getTotalBalance();
    var month = data.getMonthKey(data.todayKey());
    var income = data.getTotalIncome({ month: month });
    var expenses = data.getTotalExpenses({ month: month });
    var net = Math.round((income - expenses + Number.EPSILON) * 100) / 100;
    if (balanceElement) balanceElement.textContent = data.formatNaira(total);
    if (noteElement) {
      noteElement.textContent =
        income === 0 && expenses === 0
          ? "No activity this month"
          : (net > 0 ? "+" : "") + data.formatNaira(net) + " net this month";
    }
  }

  function initSettings() {
    var data = getCashflowData();
    updateStorageStatus();
    initSettingsNav();
    initThemePreferences();
    bindForms();
    setProfileEditMode(false);

    if (!data) {
      notify(
        "Settings Unavailable",
        "The shared data layer could not be loaded.",
        "error"
      );
      return;
    }

    loadProfileFields();
    loadFinancialFields();
    loadWorkFields();
    renderSidebarBalance();
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettings);
  } else {
    initSettings();
  }
})();

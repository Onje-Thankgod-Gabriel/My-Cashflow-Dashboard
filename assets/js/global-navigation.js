/* Gabsweb CashFlow — shared top profile and mobile navigation */
(function () {
  "use strict";

  var defaultProfileImage = "assets/images/profiles/emma.jpg";
  var destinations = [
    { label: "Dashboard", href: "index.html", icon: "layout-dashboard" },
    { label: "My Finances", href: "transaction.html", icon: "wallet-cards" },
    { label: "Budget", href: "budgets.html", icon: "pie-chart" },
    { label: "Savings", href: "savings.html", icon: "coins" },
    { label: "Goals", href: "goals.html", icon: "target" }
  ];

  function currentFile() {
    return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function icon(name) {
    return '<i data-lucide="' + name + '" class="w-4 h-4"></i>';
  }

  function renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function isProfileImage(value) {
    return (
      typeof value === "string" &&
      (/^data:image\/(png|jpe?g|webp);base64,/i.test(value) ||
        /^(?:\.\/)?assets\/images\/profiles\/[^/]+$/i.test(value))
    );
  }

  function getProfileImage() {
    var data = window.GabswebCashFlowData;
    if (data && typeof data.getSettings === "function") {
      try {
        var settings = data.getSettings();
        var savedImage =
          settings && settings.preferences ? settings.preferences.profileImage : "";
        if (isProfileImage(savedImage)) return savedImage;
      } catch (error) {
        console.warn("Profile image could not be loaded.", error);
      }
    }
    return defaultProfileImage;
  }

  function updateProfileImages() {
    var image = getProfileImage();
    var selectors = [
      "#global-profile-avatar-image",
      "#user-button img"
    ];
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (imageElement) {
        imageElement.src = image;
      });
    });
  }

  function updateWelcomeName() {
    if (!window.GabswebCashFlowData || typeof window.GabswebCashFlowData.getProfile !== "function") return;
    var profile = window.GabswebCashFlowData.getProfile() || {};
    var fullName = String(profile.name || "").trim();
    var shortName = fullName ? fullName.split(/\s+/)[0] : "";
    document.querySelectorAll("header.sticky p").forEach(function (element) {
      if (!/^Welcome back(?:, .*)?!?$/.test(element.textContent.trim())) return;
      element.textContent = "Welcome back" + (shortName ? ", " + shortName : "") + "!";
    });
  }

  function closeProfileMenu() {
    var wrapper = document.getElementById("global-profile");
    var button = document.getElementById("global-profile-button");
    if (!wrapper || !button) return;
    wrapper.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  }

  function setupMobileSidebar(header) {
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("overlay");
    var headerStart = header && header.firstElementChild;
    if (!sidebar || !overlay || !headerStart || document.getElementById("mobile-sidebar-toggle")) return;

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "mobile-sidebar-toggle";
    toggle.className = "mobile-sidebar-toggle";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "sidebar");
    toggle.innerHTML = icon("menu");
    headerStart.insertBefore(toggle, headerStart.firstChild);

    function setSidebarOpen(isOpen) {
      sidebar.classList.toggle("mobile-sidebar-open", isOpen);
      overlay.classList.toggle("mobile-sidebar-overlay-visible", isOpen);
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.body.classList.toggle("mobile-sidebar-is-open", isOpen);
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setSidebarOpen(!sidebar.classList.contains("mobile-sidebar-open"));
    });

    var closeButton = document.getElementById("close-sidebar");
    if (closeButton) closeButton.addEventListener("click", function () {
      setSidebarOpen(false);
    });

    overlay.addEventListener("click", function () {
      setSidebarOpen(false);
    });

    sidebar.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setSidebarOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setSidebarOpen(false);
    });

    renderIcons();
  }

  function setupProfile(header) {
    if (!header || document.getElementById("global-profile")) return;
    var controls = header.querySelector(":scope > div:last-child");
    if (!controls) return;

    var wrapper = document.createElement("div");
    wrapper.id = "global-profile";
    wrapper.className = "global-profile";
    wrapper.innerHTML =
      '<button type="button" class="global-profile-button" id="global-profile-button" aria-label="Open profile menu" aria-expanded="false" aria-haspopup="menu">' +
        '<span class="global-profile-avatar"><img id="global-profile-avatar-image" src="' + getProfileImage() + '" alt="Profile" /></span>' +
      "</button>" +
      '<div class="global-profile-menu" role="menu" aria-label="Profile menu">' +
        '<a href="settings.html" role="menuitem">' + icon("user-round") + "<span>Profile</span></a>" +
        '<button type="button" id="global-profile-logout" role="menuitem">' + icon("log-out") + "<span>Logout</span></button>" +
      "</div>";

    controls.appendChild(wrapper);
    var button = wrapper.querySelector("#global-profile-button");
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      var isOpen = wrapper.classList.toggle("is-open");
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    wrapper.querySelector("#global-profile-logout").addEventListener("click", function () {
      localStorage.removeItem("auth");
      window.location.href = "login.html";
    });

    renderIcons();
    updateProfileImages();
  }

  function setupBottomNavigation(nav) {
    if (!nav) return;
    nav.classList.add("global-bottom-nav");
    nav.innerHTML = destinations
      .map(function (destination) {
        var active = currentFile() === destination.href;
        return (
          '<a href="' + destination.href + '" class="bottom-nav-item' +
          (active ? " active" : "") +
          '" aria-current="' + (active ? "page" : "false") + '">' +
          icon(destination.icon) +
          "<span>" + destination.label + "</span></a>"
        );
      })
      .join("");
    document.body.classList.add("has-global-bottom-nav");
    renderIcons();
  }

  function init() {
    var header = document.querySelector("header.sticky");
    var bottomNav = document.querySelector("nav.bottom-nav");
    setupMobileSidebar(header);
    setupProfile(header);
    updateWelcomeName();
    setupBottomNavigation(bottomNav);
    updateProfileImages();
    window.addEventListener("gabsweb:profile-image-updated", updateProfileImages);

    document.addEventListener("click", function (event) {
      var wrapper = document.getElementById("global-profile");
      if (wrapper && !wrapper.contains(event.target)) closeProfileMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeProfileMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

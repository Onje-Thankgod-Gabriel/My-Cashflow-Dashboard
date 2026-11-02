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

  function getProfileName() {
    if (!window.GabswebCashFlowData || typeof window.GabswebCashFlowData.getProfile !== "function") return "";
    try {
      var profile = window.GabswebCashFlowData.getProfile() || {};
      return String(profile.name || "").trim();
    } catch (error) {
      return "";
    }
  }

  function updateIdentity() {
    var fullName = getProfileName();
    var displayName = fullName || "Your profile";
    document.querySelectorAll("#user-button h2, #sidebar-user-name").forEach(function (element) {
      element.textContent = displayName;
    });
    document.querySelectorAll("#user-button p").forEach(function (element) {
      element.textContent = "Personal account";
    });
    var shortName = fullName ? fullName.split(/\s+/)[0] : "";
    document.querySelectorAll("header.sticky p").forEach(function (element) {
      if (!/^Welcome back(?:, .*)?!?$/.test(element.textContent.trim())) return;
      element.textContent = "Welcome back" + (shortName ? ", " + shortName : "") + "!";
    });
  }

  function handleLogout(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    localStorage.removeItem("auth");
    window.location.href = "login.html";
  }

  function setupLogout() {
    document.querySelectorAll("#logOut").forEach(function (link) {
      link.setAttribute("href", "login.html");
    });
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        var link = target && target.closest ? target.closest("#logOut") : null;
        if (link) handleLogout(event);
      },
      true
    );
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

  function setupDesktopSidebar() {
    var sidebar = document.getElementById("sidebar");
    if (!sidebar || document.getElementById("desktop-sidebar-toggle")) return;
    var headerRow = sidebar.firstElementChild && sidebar.firstElementChild.firstElementChild;
    if (!headerRow) return;

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "desktop-sidebar-toggle";
    toggle.className = "desktop-sidebar-toggle";
    toggle.setAttribute("aria-controls", "sidebar");
    toggle.innerHTML = icon("chevron-left");
    headerRow.insertBefore(toggle, document.getElementById("close-sidebar"));

    sidebar.querySelectorAll(".nav-item").forEach(function (link) {
      var label = link.querySelector("span");
      if (!label) return;
      var text = label.textContent.trim();
      link.setAttribute("title", text);
      link.setAttribute("aria-label", text);
      link.setAttribute("data-tooltip", text);
    });

    var transitionTimer = null;

    function applyCollapsed(collapsed, animate) {
      var root = document.documentElement;
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = null;
      }
      if (animate) {
        root.classList.add("sidebar-transitioning");
        transitionTimer = setTimeout(function () {
          root.classList.remove("sidebar-transitioning");
          transitionTimer = null;
        }, 300);
      }
      root.classList.toggle("sidebar-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("aria-label", collapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar");
      toggle.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
      toggle.innerHTML = icon(collapsed ? "chevron-right" : "chevron-left");
      renderIcons();
    }

    var collapsed = localStorage.getItem("gabsweb-sidebar-collapsed") === "1";
    applyCollapsed(collapsed, false);

    toggle.addEventListener("click", function () {
      collapsed = !collapsed;
      localStorage.setItem("gabsweb-sidebar-collapsed", collapsed ? "1" : "0");
      applyCollapsed(collapsed, true);
    });
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

    wrapper.querySelector("#global-profile-logout").addEventListener("click", handleLogout);

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
    setupDesktopSidebar();
    setupProfile(header);
    updateIdentity();
    setupLogout();
    setupBottomNavigation(bottomNav);
    updateProfileImages();
    window.addEventListener("gabsweb:profile-image-updated", updateProfileImages);
    window.addEventListener("gabsweb:profile-updated", updateIdentity);

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

(function () {
  var theme = localStorage.getItem("savvyfi-theme") === "light" ? "light" : "dark";
  var root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  if (localStorage.getItem("gabsweb-sidebar-collapsed") === "1") {
    root.classList.add("sidebar-collapsed");
  }
})();
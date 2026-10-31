(function () {
  "use strict";

  var data = window.GabswebCashFlowData;
  if (!data) return;

  var legacy = document.getElementById("db-legacy-templates");
  if (legacy) legacy.remove();

  var state = {
    month: data.getMonthKey(data.todayKey()),
    plannerDate: data.todayKey(),
    analyticsChart: null,
    compareChart: null,
    editingTask: null,
    editingMeeting: null,
    editingProjectId: null,
    editingMilestone: null,
    manageProjectId: null,
    confirmAction: null,
    notesEditing: { notes: false, remarks: false },
    notesDate: null,
    toastTimer: null
  };

  var PRIORITY_META = {
    low: "Low priority",
    medium: "Medium priority",
    high: "High priority"
  };

  var STATUS_META = {
    planned: { label: "Planned", tone: "is-planned" },
    active: { label: "Active", tone: "is-ok" },
    "on-hold": { label: "On hold", tone: "is-near" },
    completed: { label: "Completed", tone: "is-income" }
  };

  var SHIFT_META = {
    morning: { label: "Morning shift", icon: "sunrise" },
    afternoon: { label: "Afternoon shift", icon: "sun" },
    night: { label: "Night shift", icon: "moon" },
    off: { label: "Day off", icon: "calendar-off" }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function text(id, value) {
    var node = $(id);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function html(id, value) {
    var node = $(id);
    if (node) node.innerHTML = value;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name, className) {
    return '<i data-lucide="' + name + '" class="' + (className || "w-4 h-4") + '"></i>';
  }

  function createIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function setBalanceVisibility(hidden) {
    var toggle = $("db-balance-toggle");
    document.body.classList.toggle("db-balance-hidden", hidden);
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", hidden ? "true" : "false");
    toggle.setAttribute("aria-label", hidden ? "Show balances" : "Hide balances");
    toggle.setAttribute("title", hidden ? "Show balances" : "Hide balances");
    toggle.innerHTML = icon(hidden ? "eye-off" : "eye", "w-4 h-4");
    createIcons();
  }

  function fmt(amount) {
    return data.formatCurrency(Number(amount) || 0);
  }

  function signed(amount) {
    var value = Number(amount) || 0;
    return (value >= 0 ? "+" : "-") + fmt(Math.abs(value));
  }

  function compact(amount) {
    var value = Number(amount) || 0;
    var abs = Math.abs(value);
    if (abs >= 1000000) return "₦" + (value / 1000000).toFixed(1) + "m";
    if (abs >= 1000) return "₦" + (value / 1000).toFixed(0) + "k";
    return "₦" + value.toFixed(0);
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function parseDateKey(key) {
    var parts = String(key || "").split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function fmtDate(value, options) {
    if (!value) return "";
    var keyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    var date = keyMatch
      ? new Date(Number(keyMatch[1]), Number(keyMatch[2]) - 1, Number(keyMatch[3]))
      : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-NG", options || {}).format(date);
    } catch (error) {
      return String(value);
    }
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function addDays(key, delta) {
    var date = parseDateKey(key);
    date.setDate(date.getDate() + delta);
    return toDateKey(date);
  }

  function shiftMonth(month, delta) {
    var year = Number(month.slice(0, 4));
    var index = Number(month.slice(5, 7)) - 1 + delta;
    var date = new Date(year, index, 1);
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
  }

  function monthLabel(month) {
    return fmtDate(month + "-01", { month: "long", year: "numeric" });
  }

  function shortMonth(month) {
    return fmtDate(month + "-01", { month: "short" });
  }

  function daysInMonth(month) {
    var year = Number(month.slice(0, 4));
    var index = Number(month.slice(5, 7));
    return new Date(year, index, 0).getDate();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ratio(part, whole) {
    if (!(whole > 0)) return null;
    return (part / whole) * 100;
  }

  function lower(value) {
    return String(value || "").toLowerCase();
  }

  function changeClass(delta, invert) {
    if (Math.abs(delta) < 0.0001) return "is-muted";
    var positive = invert ? delta < 0 : delta > 0;
    return positive ? "is-positive" : "is-negative";
  }

  function setTone(node, tone) {
    if (!node) return;
    node.classList.remove("is-positive", "is-negative", "is-muted");
    if (tone) node.classList.add(tone);
  }

  function setMetric(id, value, tone) {
    var node = $(id);
    if (!node) return;
    node.textContent = value;
    setTone(node, tone);
  }

  function showToast(title, message, type) {
    var toast = $("db-toast");
    if (!toast) return;
    text("db-toast-title", title);
    text("db-toast-message", message || "");
    toast.classList.remove("is-error", "is-success");
    if (type === "error") toast.classList.add("is-error");
    else toast.classList.add("is-success");
    toast.classList.add("is-open");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-open");
    }, 3400);
  }

  function attempt(action, title, message) {
    try {
      action();
      if (title) showToast(title, message || "Changes saved.", "success");
      return true;
    } catch (error) {
      showToast("Action failed", error && error.message ? error.message : "Please try again.", "error");
      return false;
    }
  }

  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    createIcons();
  }

  function closeModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.classList.remove("is-open");
    if (!document.querySelector(".db-modal.is-open")) {
      document.body.style.overflow = "";
    }
  }

  function openConfirm(options) {
    state.confirmAction = options.onConfirm;
    text("db-confirm-title", options.title || "Confirm action");
    text("db-confirm-message", options.message || "Please confirm this action.");
    var ok = $("db-confirm-ok");
    if (ok) {
      ok.textContent = options.confirmLabel || "Confirm";
      ok.classList.toggle("db-btn-primary", false);
    }
    openModal("db-confirm-modal");
  }

  function getAccountsMap() {
    var map = {};
    data.getAccounts().forEach(function (account) {
      map[account.id] = account.name;
    });
    return map;
  }

  function shiftLabel(type) {
    return SHIFT_META[lower(type)] ? SHIFT_META[lower(type)].label : "Shift";
  }

  function timeLabel(value) {
    if (!value || typeof value !== "string" || value.indexOf(":") === -1) return "";
    var parts = value.split(":");
    var hours = Number(parts[0]);
    var minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    var suffix = hours >= 12 ? "PM" : "AM";
    var display = hours % 12;
    if (display === 0) display = 12;
    return display + ":" + pad2(minutes) + " " + suffix;
  }

  function timeRange(record) {
    var start = timeLabel(record.startTime);
    var end = timeLabel(record.endTime);
    var label = start && end ? start + " – " + end : start || end;
    if (!label) return "";
    if (
      lower(record.shiftType) === "night" &&
      record.startTime &&
      record.endTime &&
      record.endTime <= record.startTime
    ) {
      label += " next day";
    }
    return label;
  }

  function workRecordFor(date) {
    var records = data.getWorkScheduleRecords({ dateFrom: date, dateTo: date });
    return records.length ? records[0] : null;
  }

  function savingsForMonth(month) {
    return data.getSavingsMovements({ month: month }).reduce(function (sum, movement) {
      var amount = Number(movement.amount) || 0;
      if (movement.type === "contribution") return sum + amount;
      if (movement.type === "withdrawal") return sum - amount;
      return sum;
    }, 0);
  }

  function savingsContributions(month) {
    return data.getSavingsMovements({ month: month }).reduce(function (sum, movement) {
      if (movement.type !== "contribution") return sum;
      return sum + (Number(movement.amount) || 0);
    }, 0);
  }

  function chartPalette() {
    var styles = window.getComputedStyle(document.documentElement);
    var muted = (styles.getPropertyValue("--muted") || "").trim() || "#64748b";
    var border = (styles.getPropertyValue("--border") || "").trim() || "#e2e8f0";
    var dark = document.documentElement.classList.contains("dark");
    return {
      muted: muted,
      border: border,
      grid: dark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.07)",
      tooltipBg: dark ? "rgba(2, 6, 23, 0.94)" : "rgba(255, 255, 255, 0.97)",
      tooltipText: dark ? "#e2e8f0" : "#0f172a",
      dark: dark
    };
  }

  function renderShell() {
    var profile = data.getProfile() || {};
    var name = String(profile.name || "").trim();
    var shortName = name ? name.split(/\s+/)[0] : "";
    var hour = new Date().getHours();
    var greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    text("db-greeting", name ? greeting + ", " + name : greeting);
    text("header-welcome", "Welcome back" + (shortName ? ", " + shortName : "") + "!");
    text(
      "db-greeting-sub",
      "Here is your financial position for " + monthLabel(state.month) + ". Figures come from your stored records."
    );
    text("db-period-pill", monthLabel(state.month));
    text(
      "db-date-pill",
      fmtDate(data.todayKey(), { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    );

    var chip = $("db-storage-chip");
    var label = $("db-storage-label");
    if (chip) chip.classList.remove("is-warning");
    if (data.isStorageAvailable()) {
      if (label) label.textContent = "Saved locally";
    } else {
      if (chip) chip.classList.add("is-warning");
      if (label) label.textContent = "Local storage unavailable";
    }
  }

  function renderOverview() {
    var total = data.getTotalBalance();
    var available = data.getAvailableBalance();
    var savings = data.getSavingsBalance();
    var income = data.getTotalIncome({ month: state.month });
    var expenses = data.getTotalExpenses({ month: state.month });
    var net = income - expenses;
    var summary = data.getAllocationSummary(state.month);

    text("db-hero-total", fmt(total));
    text("db-hero-available", fmt(available));
    setMetric("db-hero-net", signed(net), net > 0 ? "is-positive" : net < 0 ? "is-negative" : "is-muted");
    text(
      "db-hero-note",
      savings > 0
        ? fmt(savings) + " is set aside in savings and is excluded from your available balance."
        : total > 0
          ? "Savings movements do not count as income or spending."
          : "Add your first account in My Finances to begin tracking."
    );

    text("db-period-label", monthLabel(state.month));
    text("db-analytics-caption", monthLabel(state.month));

    setMetric("stat-income", fmt(income), income > 0 ? "is-positive" : "is-muted");
    setMetric("stat-expenses", fmt(expenses), expenses > 0 ? "is-negative" : "is-muted");
    setMetric("stat-net", signed(net), net > 0 ? "is-positive" : net < 0 ? "is-negative" : "is-muted");
    setMetric("stat-savings", fmt(savings), savings > 0 ? "is-positive" : "is-muted");
    setMetric("stat-allocated", fmt(summary.totalAllocated), summary.totalAllocated > 0 ? "" : "is-muted");
    setMetric("stat-unallocated", signed(summary.unallocatedFunds), summary.unallocatedFunds >= 0 ? "is-positive" : "is-negative");

    text("sidebar-total-balance", fmt(total));
    var note = $("sidebar-balance-note");
    if (note) {
      if (income === 0 && expenses === 0) {
        note.textContent = "No activity this period";
      } else {
        note.textContent = (net >= 0 ? "+" : "-") + fmt(Math.abs(net)) + " net this period";
      }
    }
  }

  function renderAnalyticsChart() {
    var canvas = $("db-analytics-chart");
    var empty = $("db-analytics-empty");
    var emptyCopy = $("db-analytics-empty-copy");
    if (!canvas) return;

    var days = daysInMonth(state.month);
    var income = new Array(days).fill(0);
    var expenses = new Array(days).fill(0);
    data.getTransactions({ month: state.month }).forEach(function (transaction) {
      var day = Number(String(transaction.date || "").slice(8, 10));
      if (!(day >= 1 && day <= days)) return;
      if (transaction.type === "income") income[day - 1] += Number(transaction.amount) || 0;
      if (transaction.type === "expense") expenses[day - 1] += Number(transaction.amount) || 0;
    });

    var totalIncome = income.reduce(function (sum, value) { return sum + value; }, 0);
    var totalExpense = expenses.reduce(function (sum, value) { return sum + value; }, 0);
    var activeDays = income.reduce(function (count, value, index) {
      return count + (value > 0 || expenses[index] > 0 ? 1 : 0);
    }, 0);

    text("db-avg-income", fmt(totalIncome / days));
    text("db-avg-expense", fmt(totalExpense / days));
    text("db-active-days", String(activeDays));
    text("db-analytics-sub", "Daily actuals · " + monthLabel(state.month));

    if (state.analyticsChart) {
      state.analyticsChart.destroy();
      state.analyticsChart = null;
    }

    var isEmpty = totalIncome === 0 && totalExpense === 0;
    if (isEmpty) {
      canvas.style.display = "none";
      if (empty) empty.style.display = "flex";
      if (emptyCopy) {
        emptyCopy.textContent =
          "No income or expenses recorded in " + monthLabel(state.month) + ". Add records in My Finances to populate this chart.";
      }
      return;
    }

    canvas.style.display = "block";
    if (empty) empty.style.display = "none";
    if (!window.Chart) return;

    var palette = chartPalette();
    var ctx = canvas.getContext("2d");
    var incomeGradient = ctx.createLinearGradient(0, 0, 0, 276);
    incomeGradient.addColorStop(0, "rgba(16, 185, 129, 0.28)");
    incomeGradient.addColorStop(1, "rgba(16, 185, 129, 0)");
    var expenseGradient = ctx.createLinearGradient(0, 0, 0, 276);
    expenseGradient.addColorStop(0, "rgba(239, 68, 68, 0.2)");
    expenseGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
    var labels = income.map(function (_, index) { return String(index + 1); });

    state.analyticsChart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Income",
            data: income,
            borderColor: "#10b981",
            backgroundColor: incomeGradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.38,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointBackgroundColor: "#10b981",
            pointBorderColor: "#fff",
            pointBorderWidth: 2
          },
          {
            label: "Expenses",
            data: expenses,
            borderColor: "#ef4444",
            backgroundColor: expenseGradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.38,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointBackgroundColor: "#ef4444",
            pointBorderColor: "#fff",
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: palette.tooltipBg,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            borderColor: palette.border,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: function (items) {
                return "Day " + items[0].label + " · " + monthLabel(state.month);
              },
              label: function (context) {
                return context.dataset.label + ": " + fmt(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: palette.muted, maxTicksLimit: 10, font: { weight: "600" } }
          },
          y: {
            grid: { color: palette.grid },
            ticks: { color: palette.muted, callback: compact, font: { weight: "600" } }
          }
        }
      }
    });
  }

  function renderHealth() {
    var list = $("db-health-list");
    if (!list) return;

    var total = data.getTotalBalance();
    var available = data.getAvailableBalance();
    var savings = data.getSavingsBalance();
    var income = data.getTotalIncome({ month: state.month });
    var expenses = data.getTotalExpenses({ month: state.month });
    var net = income - expenses;
    var summary = data.getAllocationSummary(state.month);

    var availableRatio = ratio(available, total);
    var expenseRatio = ratio(expenses, income);
    var savingsRatio = ratio(savings, total);
    var allocationRatio = ratio(summary.totalActualSpending, summary.totalAllocated);
    var savingsRate = ratio(net, income);

    var rows = [];

    rows.push(healthRow({
      label: "Available balance",
      iconName: "wallet",
      value: total > 0 ? fmt(available) : "—",
      note: total > 0
        ? (availableRatio == null ? "No balance recorded." : availableRatio.toFixed(0) + "% of total balance is available after savings.")
        : "Add an account in My Finances to calculate this indicator.",
      pct: availableRatio,
      tone: "is-income"
    }));

    rows.push(healthRow({
      label: "Income vs expenses",
      iconName: "scale",
      value: income > 0 ? (expenseRatio || 0).toFixed(0) + "% of income" : "—",
      note: income > 0
        ? (expenses <= income ? "Spending is within recorded income." : "Spending is above recorded income.")
        : "No income recorded for this period.",
      pct: expenseRatio,
      tone: expenseRatio != null && expenseRatio > 100 ? "is-over" : "is-expense"
    }));

    rows.push(healthRow({
      label: "Savings position",
      iconName: "coins",
      value: savings > 0 ? fmt(savings) : "—",
      note: total > 0 && savings > 0
        ? (savingsRatio || 0).toFixed(0) + "% of total balance is set aside."
        : "No savings set aside yet.",
      pct: savingsRatio,
      tone: "is-neutral"
    }));

    rows.push(healthRow({
      label: "Allocation usage",
      iconName: "pie-chart",
      value: summary.totalAllocated > 0 ? (allocationRatio || 0).toFixed(0) + "% used" : "—",
      note: summary.totalAllocated > 0
        ? fmt(summary.totalActualSpending) + " of " + fmt(summary.totalAllocated) + " planned is linked spending."
        : "No allocation plans for this period.",
      pct: allocationRatio,
      tone: allocationRatio != null && allocationRatio > 100 ? "is-over" : ""
    }));

    rows.push(healthRow({
      label: "Savings rate",
      iconName: "percent",
      value: income > 0 ? (savingsRate || 0).toFixed(0) + "%" : "—",
      note: income > 0
        ? (net >= 0 ? "Share of income kept after expenses." : "Expenses are above income this period.")
        : "No income recorded for this period.",
      pct: savingsRate == null ? null : clamp(savingsRate, 0, 100),
      tone: savingsRate != null && savingsRate < 0 ? "is-over" : "is-income"
    }));

    list.innerHTML = rows.join("");
  }

  function healthRow(options) {
    var width = options.pct == null ? 0 : clamp(options.pct, 0, 100);
    var fillClass = options.tone || "";
    return (
      '<div class="db-health-row">' +
        '<div class="db-health-top">' +
          '<span class="db-health-label">' + icon(options.iconName) + esc(options.label) + "</span>" +
          '<span class="db-health-value">' + esc(options.value) + "</span>" +
        "</div>" +
        '<div class="db-health-note">' + esc(options.note) + "</div>" +
        '<div class="db-progress"><div class="db-progress-fill ' + fillClass + '" style="width:' + width + '%"></div></div>' +
      "</div>"
    );
  }

  function renderComparisonChart() {
    var canvas = $("db-compare-chart");
    var empty = $("db-compare-empty");
    if (!canvas) return;

    var months = [];
    var income = [];
    var expenses = [];
    for (var index = 5; index >= 0; index -= 1) {
      var month = shiftMonth(state.month, -index);
      months.push(month);
      income.push(data.getTotalIncome({ month: month }));
      expenses.push(data.getTotalExpenses({ month: month }));
    }

    if (state.compareChart) {
      state.compareChart.destroy();
      state.compareChart = null;
    }

    var hasData = income.concat(expenses).some(function (value) { return value > 0; });
    if (!hasData) {
      canvas.style.display = "none";
      if (empty) empty.style.display = "flex";
      return;
    }

    canvas.style.display = "block";
    if (empty) empty.style.display = "none";
    if (!window.Chart) return;

    var palette = chartPalette();
    state.compareChart = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: months.map(shortMonth),
        datasets: [
          {
            label: "Income",
            data: income,
            backgroundColor: "#10b981",
            borderRadius: 6,
            maxBarThickness: 24
          },
          {
            label: "Expenses",
            data: expenses,
            backgroundColor: "#ef4444",
            borderRadius: 6,
            maxBarThickness: 24
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              color: palette.muted,
              usePointStyle: true,
              boxWidth: 7,
              boxHeight: 7,
              padding: 14,
              font: { size: 10, weight: "600" }
            }
          },
          tooltip: {
            backgroundColor: palette.tooltipBg,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            borderColor: palette.border,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: function (context) {
                return context.dataset.label + ": " + fmt(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: palette.muted, font: { weight: "600" } }
          },
          y: {
            grid: { color: palette.grid },
            ticks: { color: palette.muted, callback: compact, font: { weight: "600" } }
          }
        }
      }
    });
  }

  function renderComparisonList() {
    var list = $("db-compare-list");
    if (!list) return;

    var previousMonth = shiftMonth(state.month, -1);
    var currentIncome = data.getTotalIncome({ month: state.month });
    var previousIncome = data.getTotalIncome({ month: previousMonth });
    var currentExpenses = data.getTotalExpenses({ month: state.month });
    var previousExpenses = data.getTotalExpenses({ month: previousMonth });
    var currentNet = currentIncome - currentExpenses;
    var previousNet = previousIncome - previousExpenses;
    var currentSavings = savingsContributions(state.month);
    var previousSavings = savingsContributions(previousMonth);

    list.innerHTML = [
      compareRow("Income", currentIncome, previousIncome, fmt(currentIncome), false, ""),
      compareRow("Expenses", currentExpenses, previousExpenses, fmt(currentExpenses), true, ""),
      compareRow("Net income", currentNet, previousNet, signed(currentNet), false, currentNet > 0 ? "is-positive" : currentNet < 0 ? "is-negative" : "is-muted"),
      compareRow("Savings contributions", currentSavings, previousSavings, fmt(currentSavings), false, "")
    ].join("");
  }

  function compareRow(label, current, previous, display, invert, valueClass) {
    var small;
    if (previous === 0 && current === 0) {
      small = '<small class="is-muted">No activity in either period</small>';
    } else if (previous === 0) {
      small = '<small class="is-muted">No previous month record</small>';
    } else {
      var change = ((current - previous) / previous) * 100;
      small =
        '<small class="' + changeClass(change, invert) + '">' +
          (change >= 0 ? "+" : "") + change.toFixed(1) + "% vs " + shortMonth(shiftMonth(state.month, -1)) +
        "</small>";
    }
    return (
      '<div class="db-compare-row">' +
        "<span>" + esc(label) + "</span>" +
        '<strong class="' + (valueClass || "") + '">' + esc(display) + small + "</strong>" +
      "</div>"
    );
  }

  function renderRecentTransactions() {
    var list = $("db-recent-list");
    if (!list) return;

    var accounts = getAccountsMap();
    var transactions = data.getTransactions({}).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt || "") < String(a.createdAt || "") ? -1 : 1;
    }).slice(0, 6);

    if (!transactions.length) {
      list.innerHTML = emptyState(
        "No transactions yet",
        "Income, expenses and transfers recorded in My Finances will appear here.",
        "transaction.html",
        "Open My Finances"
      );
      return;
    }

    list.innerHTML = transactions.map(function (transaction) {
      var type = transaction.type;
      var meta =
        type === "income"
          ? { label: "Income", icon: "arrow-down-left", tone: "is-income" }
          : type === "expense"
            ? { label: "Expense", icon: "arrow-up-right", tone: "is-expense" }
            : { label: "Transfer", icon: "arrow-right-left", tone: "is-transfer" };
      var title = transaction.description || transaction.category || meta.label;
      var from = accounts[transaction.accountId] || "Account";
      var accountLabel = type === "transfer"
        ? from + " → " + (accounts[transaction.toAccountId] || "Account")
        : from;
      var amountLabel = type === "income" ? "+" + fmt(transaction.amount) : type === "expense" ? "-" + fmt(transaction.amount) : fmt(transaction.amount);
      var amountTone = type === "income" ? "is-positive" : type === "expense" ? "is-negative" : "is-muted";
      return (
        '<div class="db-list-row">' +
          '<span class="db-list-icon ' + meta.tone + '">' + icon(meta.icon) + "</span>" +
          '<div class="db-list-main">' +
            '<span class="db-list-title">' + esc(title) + "</span>" +
            '<div class="db-list-meta">' +
              "<span>" + esc(meta.label) + "</span>" +
              (transaction.category && transaction.category !== title ? "<span>" + esc(transaction.category) + "</span>" : "") +
              "<span>" + esc(accountLabel) + "</span>" +
              "<span>" + esc(fmtDate(transaction.date, { month: "short", day: "numeric" })) + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="db-list-amount ' + amountTone + '">' + amountLabel + "<small>" + esc(meta.label) + "</small></div>" +
        "</div>"
      );
    }).join("");
  }

  function emptyState(title, message, href, label) {
    return (
      '<div class="db-empty">' +
        icon("inbox", "w-5 h-5") +
        "<strong>" + esc(title) + "</strong>" +
        "<p>" + esc(message) + "</p>" +
        (href && label ? '<a href="' + esc(href) + '">' + esc(label) + "</a>" : "") +
      "</div>"
    );
  }

  function allocationBadge(planned, actual) {
    if (!(planned > 0)) return { label: "No plan", tone: "" };
    var used = actual / planned;
    if (used >= 1) return { label: "Over plan", tone: "is-over" };
    if (used >= 0.8) return { label: "Near plan", tone: "is-near" };
    return { label: "On track", tone: "is-ok" };
  }

  function renderBudget() {
    var summary = data.getAllocationSummary(state.month);
    text("db-budget-allocated", fmt(summary.totalAllocated));
    text("db-budget-actual", fmt(summary.totalActualSpending));
    text("db-budget-unallocated", signed(summary.unallocatedFunds));
    setTone($("db-budget-unallocated"), summary.unallocatedFunds >= 0 ? "is-positive" : "is-negative");
    text("db-budget-sub", "Allocation plans for " + monthLabel(state.month) + ".");

    var list = $("db-budget-list");
    if (!list) return;
    var allocations = summary.allocations.slice().sort(function (a, b) {
      var aUsed = a.plannedAmount > 0 ? a.actualSpending / a.plannedAmount : 0;
      var bUsed = b.plannedAmount > 0 ? b.actualSpending / b.plannedAmount : 0;
      return bUsed - aUsed;
    }).slice(0, 4);

    if (!allocations.length) {
      list.innerHTML = emptyState(
        "No allocations this period",
        "Create allocation plans in Budget & Money Allocation to track planned amounts against linked expenses.",
        "budgets.html",
        "Open budget"
      );
      return;
    }

    list.innerHTML = allocations.map(function (allocation) {
      var used = allocation.plannedAmount > 0 ? (allocation.actualSpending / allocation.plannedAmount) * 100 : 0;
      var badge = allocationBadge(allocation.plannedAmount, allocation.actualSpending);
      var remaining = allocation.plannedAmount - allocation.actualSpending;
      var note = remaining >= 0 ? fmt(remaining) + " remaining" : fmt(Math.abs(remaining)) + " over plan";
      return (
        '<div class="db-alloc-row">' +
          '<div class="db-alloc-top">' +
            '<span class="db-alloc-name">' + esc(allocation.name) + "</span>" +
            '<span class="db-alloc-values">' + esc(fmt(allocation.actualSpending)) + " / " + esc(fmt(allocation.plannedAmount)) + "</span>" +
          "</div>" +
          '<div class="db-progress"><div class="db-progress-fill ' + badge.tone + '" style="width:' + clamp(used, 0, 100) + '%"></div></div>' +
          '<div class="db-alloc-note"><span>' + esc(note) + "</span>" +
            '<span class="db-badge ' + badge.tone + '">' + esc(badge.label) + "</span>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function renderSavingsAndGoals() {
    var plans = data.getSavingsPlans();
    var total = data.getSavingsBalance();
    var activePlans = plans.filter(function (plan) { return plan.status === "active"; });
    var monthMovement = savingsForMonth(state.month);

    text("db-savings-total", fmt(total));
    text("db-savings-plans", String(activePlans.length));
    text("db-savings-month", signed(monthMovement));
    setTone($("db-savings-month"), monthMovement > 0 ? "is-positive" : monthMovement < 0 ? "is-negative" : "is-muted");

    var savingsList = $("db-savings-list");
    if (savingsList) {
      var rankedPlans = plans
        .filter(function (plan) { return plan.status !== "archived"; })
        .sort(function (a, b) {
          return data.getSavingsPlanSavedAmount(b.id) - data.getSavingsPlanSavedAmount(a.id);
        })
        .slice(0, 4);

      if (!rankedPlans.length) {
        savingsList.innerHTML = emptyState(
          "No savings plans yet",
          "Create a savings plan to start setting money aside. Savings are excluded from available balance.",
          "savings.html",
          "Open savings"
        );
      } else {
        savingsList.innerHTML = rankedPlans.map(function (plan) {
          var progress = data.getSavingsPlanProgress(plan.id);
          var pct = progress && progress.percentage != null ? progress.percentage : null;
          return (
            '<div class="db-plan-row">' +
              '<div class="db-plan-top">' +
                '<span class="db-plan-name">' + esc(plan.name) + "</span>" +
                '<span class="db-plan-values">' +
                  (progress && progress.targetAmount > 0
                    ? esc(fmt(progress.savedAmount)) + " / " + esc(fmt(progress.targetAmount))
                    : esc(fmt(data.getSavingsPlanSavedAmount(plan.id))) + " set aside") +
                "</span>" +
              "</div>" +
              (pct == null
                ? '<div class="db-progress"><div class="db-progress-fill is-neutral" style="width:0%"></div></div>'
                : '<div class="db-progress"><div class="db-progress-fill" style="width:' + clamp(pct, 0, 100) + '%"></div></div>') +
              '<div class="db-alloc-note"><span>' + esc(plan.status === "completed" ? "Completed plan" : plan.status === "active" ? "Active plan" : "Archived plan") + "</span><span>" + (pct == null ? "No target" : pct.toFixed(0) + "%") + "</span></div>" +
            "</div>"
          );
        }).join("");
      }
    }

    var goalsList = $("db-goals-list");
    if (!goalsList) return;
    var goals = data.getGoals().slice().sort(function (a, b) {
      var aDone = a.status === "completed" ? 1 : 0;
      var bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return String(a.targetDate || "") < String(b.targetDate || "") ? -1 : 1;
    }).slice(0, 4);

    if (!goals.length) {
      goalsList.innerHTML = emptyState(
        "No goals yet",
        "Goals show progress from their linked savings plan. Create one in Goals & Planned Purchases.",
        "goals.html",
        "Open goals"
      );
      return;
    }

    goalsList.innerHTML = goals.map(function (goal) {
      var progress = data.getGoalProgress(goal.id);
      var hasProgress = progress && progress.available && progress.percentage != null;
      return (
        '<div class="db-goal-row">' +
          '<div class="db-list-main">' +
            '<span class="db-goal-name">' + esc(goal.name) + "</span>" +
            '<span class="db-goal-meta">' +
              esc(goal.status === "completed" ? "Completed" : goal.targetDate ? "Target " + fmtDate(goal.targetDate, { month: "short", day: "numeric", year: "numeric" }) : "No target date") +
            "</span>" +
            (hasProgress
              ? '<div class="db-progress" style="margin-top:6px"><div class="db-progress-fill" style="width:' + clamp(progress.percentage, 0, 100) + '%"></div></div>'
              : "") +
          "</div>" +
          '<div class="db-list-amount">' +
            (hasProgress ? esc(fmt(progress.currentAmount)) : "—") +
            "<small>" + (hasProgress ? esc(progress.percentage.toFixed(0) + "% funded") : "Funding not linked") + "</small>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function currentPlan() {
    return data.getDailyPlanByDate(state.plannerDate);
  }

  function ensurePlan() {
    var plan = currentPlan();
    if (plan) return plan;
    try {
      return data.getOrCreateDailyPlan(state.plannerDate);
    } catch (error) {
      showToast("Could not open plan", error && error.message ? error.message : "Please try again.", "error");
      return null;
    }
  }

  function findTask(plan, taskId) {
    if (!plan || !Array.isArray(plan.tasks)) return null;
    for (var index = 0; index < plan.tasks.length; index += 1) {
      if (plan.tasks[index].id === taskId) return plan.tasks[index];
    }
    return null;
  }

  function findMeeting(plan, meetingId) {
    if (!plan || !Array.isArray(plan.meetings)) return null;
    for (var index = 0; index < plan.meetings.length; index += 1) {
      if (plan.meetings[index].id === meetingId) return plan.meetings[index];
    }
    return null;
  }

  function plannerDateLabel() {
    return fmtDate(state.plannerDate, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function noteFieldConfig(key) {
    return {
      textarea: "planner-" + key,
      editor: "planner-" + key + "-editor",
      view: "planner-" + key + "-view",
      edit: "planner-" + key + "-edit",
      status: "planner-" + key + "-status",
      empty:
        key === "notes"
          ? "No notes saved for this day."
          : "No remarks saved for this day.",
      fallbackStatus:
        key === "notes"
          ? "Notes are saved against this date."
          : "Remarks are saved against this date."
    };
  }

  function renderPlannerNoteField(key, plan, dateDisplay) {
    var config = noteFieldConfig(key);
    var editing = state.notesEditing[key] === true;
    var value =
      plan && typeof plan[key] === "string" ? plan[key].trim() : "";
    var view = $(config.view);
    var editor = $(config.editor);
    var edit = $(config.edit);
    var textarea = $(config.textarea);

    if (view) {
      view.hidden = editing;
      view.textContent = value || config.empty;
      view.classList.toggle("is-empty", !value);
    }
    if (editor) editor.hidden = !editing;
    if (edit) {
      edit.hidden = editing;
      edit.textContent = value ? "Edit" : "Add";
      edit.setAttribute(
        "aria-label",
        (value ? "Edit " : "Add ") +
          (key === "notes" ? "daily notes" : "daily remarks")
      );
    }
    if (textarea && !editing) textarea.value = value;
    text(
      config.status,
      plan ? "Saved against " + dateDisplay + "." : config.fallbackStatus
    );
  }

  function setNoteEditing(key, editing) {
    state.notesEditing[key] = !!editing;
    var plan = currentPlan();
    var dateDisplay = plannerDateLabel();
    var textarea = $("planner-" + key);
    if (editing && textarea) {
      textarea.value =
        plan && typeof plan[key] === "string" ? plan[key] : "";
    }
    renderPlannerNoteField(key, plan, dateDisplay);
    if (editing && textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }

  function renderPlanner() {
    var plan = currentPlan();
    var dateDisplay = plannerDateLabel();
    if (state.notesDate !== state.plannerDate) {
      state.notesDate = state.plannerDate;
      state.notesEditing.notes = false;
      state.notesEditing.remarks = false;
    }
    text("planner-date-display", dateDisplay);
    var input = $("planner-date-input");
    if (input && input.value !== state.plannerDate) input.value = state.plannerDate;

    renderPlannerScore(plan);
    renderPlannerContext();
    renderTopThree(plan);

    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    var completed = tasks.filter(function (task) { return task.completed; }).length;
    text("planner-task-count", tasks.length + (tasks.length === 1 ? " task" : " tasks") + (tasks.length ? " · " + completed + " done" : ""));

    var taskList = $("planner-task-list");
    if (taskList) {
      if (!tasks.length) {
        taskList.innerHTML = '<div class="db-inline-empty">No tasks yet. Add your first task for this day.</div>';
      } else {
        taskList.innerHTML = tasks.map(function (task) {
          return (
            '<div class="db-task-row ' + (task.completed ? "is-done" : "") + '">' +
              '<button type="button" class="db-task-check ' + (task.completed ? "is-done" : "") + '" data-task-action="toggle" data-task-id="' + esc(task.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="' + (task.completed ? "Mark task incomplete" : "Mark task complete") + '">' +
                icon("check", "w-4 h-4") +
              "</button>" +
              '<div class="db-task-main">' +
                '<span class="db-task-title">' + esc(task.title) + "</span>" +
                '<div class="db-task-meta">' +
                  "<span>" + esc(PRIORITY_META[lower(task.priority)] || "Medium priority") + "</span>" +
                  (task.description ? "<span>" + esc(task.description) + "</span>" : "") +
                  (task.isTopThree ? "<span>Top three</span>" : "") +
                "</div>" +
              "</div>" +
              '<div class="db-task-actions">' +
                '<button type="button" class="db-icon-btn ' + (task.isTopThree ? "is-top" : "") + '" data-task-action="top" data-task-id="' + esc(task.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="Toggle top three">' + icon("star") + "</button>" +
                '<button type="button" class="db-icon-btn" data-task-action="edit" data-task-id="' + esc(task.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="Edit task">' + icon("pencil") + "</button>" +
                '<button type="button" class="db-icon-btn is-danger" data-task-action="delete" data-task-id="' + esc(task.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="Delete task">' + icon("trash-2") + "</button>" +
              "</div>" +
            "</div>"
          );
        }).join("");
      }
    }

    var meetings = plan && Array.isArray(plan.meetings) ? plan.meetings : [];
    var meetingList = $("planner-meeting-list");
    if (meetingList) {
      if (!meetings.length) {
        meetingList.innerHTML = '<div class="db-inline-empty">No appointments recorded for this day.</div>';
      } else {
        meetingList.innerHTML = meetings.map(function (meeting) {
          var time = timeRange(meeting);
          var meta = [];
          if (meeting.location) meta.push(meeting.location);
          if (meeting.notes) meta.push(meeting.notes);
          return (
            '<div class="db-meeting-row">' +
              '<span class="db-meeting-time">' + esc(time || "All day") + "</span>" +
              '<div class="db-meeting-main">' +
                '<span class="db-meeting-title">' + esc(meeting.title) + "</span>" +
                '<span class="db-meeting-meta">' + esc(meta.join(" · ") || "No location or notes") + "</span>" +
              "</div>" +
              '<div class="db-task-actions">' +
                '<button type="button" class="db-icon-btn" data-meeting-action="edit" data-meeting-id="' + esc(meeting.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="Edit appointment">' + icon("pencil") + "</button>" +
                '<button type="button" class="db-icon-btn is-danger" data-meeting-action="delete" data-meeting-id="' + esc(meeting.id) + '" data-plan-id="' + esc(plan.id) + '" aria-label="Delete appointment">' + icon("trash-2") + "</button>" +
              "</div>" +
            "</div>"
          );
        }).join("");
      }
    }

    renderPlannerNoteField("notes", plan, dateDisplay);
    renderPlannerNoteField("remarks", plan, dateDisplay);
    createIcons();
  }

  function renderPlannerScore(plan) {
    var ring = $("planner-score-ring");
    var score = plan ? data.getDailyPlanScore(plan) : null;
    var available = score && score.available;

    if (ring) ring.style.setProperty("--score", available ? score.percentage + "%" : "0%");
    text("planner-score-value", available ? score.percentage.toFixed(0) + "%" : "—");
    text("planner-score-title", available ? "Daily score" : "No score available");
    text(
      "planner-score-note",
      available
        ? score.completedTasks + " of " + score.totalTasks + " tasks completed."
        : "Add a task to calculate the daily score."
    );
  }

  function renderPlannerContext() {
    var container = $("planner-day-context");
    if (!container) return;
    var record = workRecordFor(state.plannerDate);
    var date = fmtDate(state.plannerDate, { weekday: "long", month: "short", day: "numeric" });
    var markup;
    if (!record) {
      markup = icon("calendar-clock") + "<span><strong>" + esc(date) + "</strong> · No confirmed work schedule for this day.</span>";
    } else if (record.status === "off") {
      markup = icon("calendar-off") + "<span><strong>" + esc(date) + "</strong> · Day off confirmed.</span>";
    } else if (record.status === "working") {
      var range = timeRange(record);
      markup =
        icon("briefcase") +
        "<span><strong>" + esc(date) + "</strong> · " + esc(shiftLabel(record.shiftType)) +
        (range ? " · " + esc(range) : "") + "</span>";
    } else {
      markup = icon("help-circle") + "<span><strong>" + esc(date) + "</strong> · Schedule unconfirmed.</span>";
    }
    container.innerHTML = markup;
  }

  function renderTopThree(plan) {
    var container = $("planner-top-three");
    if (!container) return;
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    var ids = plan && Array.isArray(plan.topThreeTaskIds) ? plan.topThreeTaskIds.slice(0, 3) : [];
    var cards = [];
    for (var index = 0; index < 3; index += 1) {
      var task = ids[index] ? findTask(plan, ids[index]) : null;
      cards.push(
        '<div class="db-top-card ' + (task ? (task.completed ? "is-done" : "") : "is-empty") + '"' +
          (task ? ' data-task-toggle="' + esc(task.id) + '" data-plan-id="' + esc(plan.id) + '"' : "") + ">" +
          "<span>Priority " + (index + 1) + "</span>" +
          '<div class="db-top-task">' + esc(task ? task.title : "Empty priority slot") + "</div>" +
        "</div>"
      );
    }
    var topCount = ids.filter(function (id) { return !!findTask(plan, id); }).length;
    text("planner-top-three-hint", topCount >= 3 ? "Remove a star to change priorities." : "Use the star on any task.");
    container.innerHTML = cards.join("");
  }

  function renderProjects() {
    var projects = data.getProjects({});
    var active = projects.filter(function (project) { return project.status === "active"; }).length;
    var completed = projects.filter(function (project) { return project.status === "completed"; }).length;
    var upcoming = data.getUpcomingMilestones(30);
    var overdue = data.getOverdueMilestones();

    text("project-active-count", String(active));
    text("project-completed-count", String(completed));
    text("project-upcoming-count", String(upcoming.length));
    text("project-overdue-count", String(overdue.length));

    var grid = $("db-project-grid");
    if (!grid) return;
    if (!projects.length) {
      grid.innerHTML = emptyState(
        "No projects yet",
        "Create a project to organise objectives, milestones and deadlines. Estimated costs are not expenses.",
        "",
        ""
      );
      return;
    }

    var sorted = projects.slice().sort(function (a, b) {
      var aDone = a.status === "completed" ? 1 : 0;
      var bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return String(a.deadline || "") < String(b.deadline || "") ? -1 : 1;
    }).slice(0, 4);

    grid.innerHTML = sorted.map(function (project) {
      var progress = data.getProjectProgress(project.id);
      var status = STATUS_META[lower(project.status)] || { label: project.status || "Project", tone: "" };
      var milestones = Array.isArray(project.milestones) ? project.milestones : [];
      var next = milestones
        .filter(function (milestone) { return milestone.status !== "completed"; })
        .sort(function (a, b) { return String(a.dueDate) < String(b.dueDate) ? -1 : 1; })[0];
      var percent = progress && progress.percentage != null ? progress.percentage : 0;
      return (
        '<article class="db-project-card">' +
          '<div class="db-project-top">' +
            '<div>' +
              '<div class="db-project-name">' + esc(project.name) + "</div>" +
              '<div class="db-project-meta">' +
                "<span>" + esc(project.deadline ? "Deadline " + fmtDate(project.deadline, { month: "short", day: "numeric" }) : "No deadline") + "</span>" +
                "<span>" + esc(milestones.length + (milestones.length === 1 ? " milestone" : " milestones")) + "</span>" +
                "<span>" + esc("Est. " + fmt(project.estimatedCost)) + "</span>" +
              "</div>" +
            "</div>" +
            '<span class="db-badge ' + status.tone + '">' + esc(status.label) + "</span>" +
          "</div>" +
          (next ? '<div class="db-project-meta" style="margin-top:8px"><span>' + esc("Next: " + next.title + " · " + fmtDate(next.dueDate, { month: "short", day: "numeric" })) + "</span></div>" : "") +
          '<div class="db-project-bottom">' +
            '<div class="db-project-progress">' +
              '<div class="db-progress"><div class="db-progress-fill" style="width:' + clamp(percent, 0, 100) + '%"></div></div>' +
              "<span>" + esc(progress && progress.available ? progress.completedMilestones + " of " + progress.totalMilestones + " milestones · " + percent.toFixed(0) + "%" : "No milestones yet") + "</span>" +
            "</div>" +
            '<div class="db-project-actions">' +
              '<button type="button" class="db-icon-btn" data-project-action="manage" data-project-id="' + esc(project.id) + '" aria-label="Manage project">' + icon("list-checks") + "</button>" +
              '<button type="button" class="db-icon-btn" data-project-action="edit" data-project-id="' + esc(project.id) + '" aria-label="Edit project">' + icon("pencil") + "</button>" +
              '<button type="button" class="db-icon-btn is-danger" data-project-action="delete" data-project-id="' + esc(project.id) + '" aria-label="Delete project">' + icon("trash-2") + "</button>" +
            "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function renderPlannerSummaries() {
    var today = data.todayKey();
    var plan = data.getDailyPlanByDate(today);
    var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    var completed = tasks.filter(function (task) { return task.completed === true; }).length;
    var remaining = Math.max(0, tasks.length - completed);
    var score = plan ? data.getDailyPlanScore(plan) : null;

    text("db-planner-summary-date", "Today · " + fmtDate(today, { weekday: "long", month: "short", day: "numeric" }));
    text("db-planner-task-count", String(tasks.length));
    text("db-planner-completed-count", String(completed));
    text("db-planner-remaining-count", String(remaining));
    text("db-planner-score", score && score.available ? score.percentage.toFixed(0) + "%" : "—");
    text(
      "db-planner-summary-note",
      tasks.length
        ? (remaining ? remaining + " task" + (remaining === 1 ? "" : "s") + " still need attention today." : "All tasks for today are complete.")
        : "No tasks are scheduled for today. Open Planner to start organising your day."
    );

    var projects = data.getProjects({});
    var active = projects.filter(function (project) { return project.status === "active"; });
    var completedProjects = projects.filter(function (project) { return project.status === "completed"; }).length;
    var upcomingDeadlines = active.filter(function (project) {
      return project.deadline && project.deadline >= today;
    }).length;
    text("db-project-active-summary", String(active.length));
    text("db-project-progress-summary", String(active.length));
    text("db-project-completed-summary", String(completedProjects));
    text("db-project-deadline-summary", String(upcomingDeadlines));
    text(
      "db-project-summary-note",
      projects.length
        ? (active.length ? active.length + " active project" + (active.length === 1 ? "" : "s") + " are in progress." : "No projects are currently active.")
        : "No projects yet. Open Planner to create your first project."
    );
  }

  function renderWorkSchedule() {
    var today = data.todayKey();
    var todayRecord = workRecordFor(today);
    var container = $("db-work-today");
    if (container) {
      if (!todayRecord) {
        container.innerHTML =
          '<div class="db-work-icon is-unconfirmed">' + icon("calendar-clock", "w-5 h-5") + "</div>" +
          '<div class="db-work-copy"><span>Today · ' + esc(fmtDate(today, { month: "short", day: "numeric" })) + "</span>" +
          "<strong>No confirmed schedule</strong><p>Add a work schedule entry to confirm this day.</p></div>";
      } else if (todayRecord.status === "off") {
        container.innerHTML =
          '<div class="db-work-icon is-off">' + icon("calendar-off", "w-5 h-5") + "</div>" +
          '<div class="db-work-copy"><span>Today · ' + esc(fmtDate(today, { month: "short", day: "numeric" })) + "</span>" +
          "<strong>Day off</strong><p>No shift is confirmed for today.</p></div>";
      } else if (todayRecord.status === "working") {
        var range = timeRange(todayRecord);
        container.innerHTML =
          '<div class="db-work-icon">' + icon(SHIFT_META[lower(todayRecord.shiftType)] ? SHIFT_META[lower(todayRecord.shiftType)].icon : "briefcase", "w-5 h-5") + "</div>" +
          '<div class="db-work-copy"><span>Today · ' + esc(fmtDate(today, { month: "short", day: "numeric" })) + "</span>" +
          "<strong>" + esc(shiftLabel(todayRecord.shiftType)) + "</strong><p>" + esc(range || "Shift time not recorded") + "</p></div>";
      } else {
        container.innerHTML =
          '<div class="db-work-icon is-unconfirmed">' + icon("help-circle", "w-5 h-5") + "</div>" +
          '<div class="db-work-copy"><span>Today · ' + esc(fmtDate(today, { month: "short", day: "numeric" })) + "</span>" +
          "<strong>Schedule unconfirmed</strong><p>Update Work Schedule to confirm this day.</p></div>";
      }
    }

    var upcoming = data.getWorkScheduleRecords({ dateFrom: addDays(today, 1) });
    var nextShift = upcoming.filter(function (record) { return record.status === "working"; })[0];
    var nextOff = upcoming.filter(function (record) { return record.status === "off"; })[0];
    var config = data.getWorkScheduleConfig();
    var workLines = $("db-work-lines");
    if (workLines) {
      var anchor = config && config.anchor ? config.anchor : null;
      workLines.innerHTML = [
        workLine("Next confirmed shift", nextShift ? shiftLabel(nextShift.shiftType) + " · " + fmtDate(nextShift.date, { weekday: "short", month: "short", day: "numeric" }) : "None confirmed"),
        workLine("Next day off", nextOff ? fmtDate(nextOff.date, { weekday: "short", month: "short", day: "numeric" }) : "None confirmed"),
        workLine(
          "Rotation anchor",
          anchor && anchor.date
            ? shiftLabel(anchor.shiftType) + " · " + fmtDate(anchor.date, { month: "short", day: "numeric", year: "numeric" })
            : "Not set"
        )
      ].join("");
    }
  }

  function workLine(label, value) {
    return '<div class="db-work-line"><span>' + esc(label) + "</span><strong>" + esc(value) + "</strong></div>";
  }

  function renderUpcomingDates() {
    var list = $("db-upcoming-list");
    if (!list) return;
    var today = data.todayKey();
    var items = [];

    data.getGoals().forEach(function (goal) {
      if (goal.status === "completed") return;
      if (!goal.targetDate || goal.targetDate < today) return;
      items.push({
        date: goal.targetDate,
        iconName: "target",
        title: goal.name,
        kind: "Goal target"
      });
    });

    data.getProjects({}).forEach(function (project) {
      (Array.isArray(project.milestones) ? project.milestones : []).forEach(function (milestone) {
        if (milestone.status === "completed") return;
        if (!milestone.dueDate || milestone.dueDate < today) return;
        items.push({
          date: milestone.dueDate,
          iconName: "flag",
          title: milestone.title,
          kind: project.name
        });
      });
    });

    data.getWorkScheduleRecords({ dateFrom: today }).forEach(function (record) {
      if (record.status !== "working") return;
      items.push({
        date: record.date,
        iconName: "calendar-clock",
        title: shiftLabel(record.shiftType),
        kind: "Confirmed shift"
      });
    });

    items.sort(function (a, b) {
      if (a.date === b.date) return 0;
      return a.date < b.date ? -1 : 1;
    });

    if (!items.length) {
      list.innerHTML = emptyState(
        "Nothing scheduled yet",
        "Confirmed shifts, goal target dates and project milestones will appear here.",
        "",
        ""
      );
      return;
    }

    list.innerHTML = items.slice(0, 4).map(function (item) {
      return (
        '<div class="db-list-row">' +
          '<span class="db-list-icon">' + icon(item.iconName) + "</span>" +
          '<div class="db-list-main">' +
            '<span class="db-list-title">' + esc(item.title) + "</span>" +
            '<div class="db-list-meta"><span>' + esc(item.kind) + "</span></div>" +
          "</div>" +
          '<div class="db-list-amount">' + esc(fmtDate(item.date, { month: "short", day: "numeric" })) + "<small>" + esc(fmtDate(item.date, { weekday: "short" })) + "</small></div>" +
        "</div>"
      );
    }).join("");
  }

  function renderNotifications() {
    var list = $("notification-list");
    if (!list) return;
    var items = [];

    var overdue = data.getOverdueMilestones();
    if (overdue.length) {
      items.push({
        iconName: "alert-triangle",
        title: overdue.length + (overdue.length === 1 ? " milestone is" : " milestones are") + " overdue",
        message: overdue[0].title + (overdue[0].projectName ? " · " + overdue[0].projectName : "")
      });
    }

    var summary = data.getAllocationSummary(state.month);
    var overPlan = summary.allocations.filter(function (allocation) {
      return allocation.plannedAmount > 0 && allocation.actualSpending > allocation.plannedAmount;
    });
    if (overPlan.length) {
      items.push({
        iconName: "pie-chart",
        title: overPlan.length + (overPlan.length === 1 ? " allocation is" : " allocations are") + " over plan",
        message: overPlan[0].name + " · " + monthLabel(state.month)
      });
    }

    var todayPlan = data.getDailyPlanByDate(data.todayKey());
    var openTasks = todayPlan && Array.isArray(todayPlan.tasks)
      ? todayPlan.tasks.filter(function (task) { return !task.completed; }).length
      : 0;
    if (openTasks) {
      items.push({
        iconName: "check-square",
        title: openTasks + (openTasks === 1 ? " task is" : " tasks are") + " still open today",
        message: "Open the daily planner to finish them."
      });
    }

    if (!items.length) {
      list.innerHTML =
        '<div class="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">' +
          '<div class="w-9 h-9 rounded-full bg-bg flex items-center justify-center">' + icon("bell", "w-4 h-4 text-muted") + "</div>" +
          '<p class="text-xs sm:text-sm font-medium text-text">No new notifications</p>' +
          '<p class="text-[10px] sm:text-xs text-muted">Overdue milestones and over-plan allocations appear here.</p>' +
        "</div>";
      createIcons();
      return;
    }

    list.innerHTML = items.slice(0, 4).map(function (item) {
      return (
        '<div class="flex items-start gap-3 p-4 border-b border-border hover:bg-bg transition">' +
          '<div class="w-8 h-8 rounded-full bg-bg flex items-center justify-center text-muted">' + icon(item.iconName) + "</div>" +
          '<div class="flex-1">' +
            '<p class="text-xs sm:text-sm font-semibold text-text">' + esc(item.title) + "</p>" +
            '<p class="text-[10px] sm:text-xs text-muted mt-1">' + esc(item.message) + "</p>" +
          "</div>" +
        "</div>"
      );
    }).join("");
    createIcons();
  }

  function renderProjectManage() {
    if (!state.manageProjectId) return;
    var project = data.getProject(state.manageProjectId);
    if (!project) {
      state.manageProjectId = null;
      closeModal("db-project-manage-modal");
      return;
    }
    var progress = data.getProjectProgress(project.id);
    var status = STATUS_META[lower(project.status)] || { label: project.status || "Project", tone: "" };
    var milestones = Array.isArray(project.milestones) ? project.milestones.slice().sort(function (a, b) {
      var aDone = a.status === "completed" ? 1 : 0;
      var bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return String(a.dueDate || "") < String(b.dueDate || "") ? -1 : 1;
    }) : [];

    text("db-project-manage-title", project.name);
    text(
      "db-project-manage-meta",
      status.label + " · " + (project.startDate ? fmtDate(project.startDate, { month: "short", day: "numeric" }) : "No start") +
      " – " + (project.endDate ? fmtDate(project.endDate, { month: "short", day: "numeric" }) : "No end") +
      " · Est. " + fmt(project.estimatedCost)
    );

    var body = $("db-project-manage-body");
    if (!body) return;
    body.innerHTML =
      '<div class="db-overview-strip">' +
        '<div class="db-budget-stat"><span>Progress</span><strong>' + esc(progress && progress.available ? progress.percentage.toFixed(0) + "%" : "—") + "</strong></div>" +
        '<div class="db-budget-stat"><span>Milestones</span><strong>' + esc(progress ? progress.completedMilestones + " / " + progress.totalMilestones : "0 / 0") + "</strong></div>" +
        '<div class="db-budget-stat"><span>Deadline</span><strong>' + esc(project.deadline ? fmtDate(project.deadline, { month: "short", day: "numeric" }) : "—") + "</strong></div>" +
        '<div class="db-budget-stat"><span>Estimated cost</span><strong>' + esc(fmt(project.estimatedCost)) + "</strong></div>" +
      "</div>" +
      (project.objectives ? '<div class="db-field"><span>Objectives</span><p class="db-health-note">' + esc(project.objectives) + "</p></div>" : "") +
      (project.executionPlan ? '<div class="db-field"><span>Execution plan</span><p class="db-health-note">' + esc(project.executionPlan) + "</p></div>" : "") +
      (project.notes ? '<div class="db-field"><span>Notes</span><p class="db-health-note">' + esc(project.notes) + "</p></div>" : "") +
      '<div class="db-modal-subhead"><h4>Milestones</h4><span>' + esc(progress ? progress.completedMilestones + " of " + progress.totalMilestones + " complete" : "0 milestones") + "</span></div>" +
      (milestones.length
        ? '<div class="db-project-milestones">' + milestones.map(function (milestone) {
            var done = milestone.status === "completed";
            return (
              '<div class="db-milestone-row ' + (done ? "is-completed" : "") + '">' +
                '<button type="button" class="db-task-check ' + (done ? "is-done" : "") + '" data-milestone-action="toggle" data-project-id="' + esc(project.id) + '" data-milestone-id="' + esc(milestone.id) + '" aria-label="' + (done ? "Mark milestone incomplete" : "Mark milestone complete") + '">' + icon("check", "w-4 h-4") + "</button>" +
                '<div class="db-milestone-main">' +
                  '<span class="db-milestone-title">' + esc(milestone.title) + "</span>" +
                  '<span class="db-milestone-meta">' + esc((milestone.status || "pending") + " · due " + fmtDate(milestone.dueDate, { month: "short", day: "numeric", year: "numeric" })) + "</span>" +
                  (milestone.description ? '<span class="db-milestone-meta">' + esc(milestone.description) + "</span>" : "") +
                "</div>" +
                '<div class="db-task-actions">' +
                  '<button type="button" class="db-icon-btn" data-milestone-action="edit" data-project-id="' + esc(project.id) + '" data-milestone-id="' + esc(milestone.id) + '" aria-label="Edit milestone">' + icon("pencil") + "</button>" +
                  '<button type="button" class="db-icon-btn is-danger" data-milestone-action="delete" data-project-id="' + esc(project.id) + '" data-milestone-id="' + esc(milestone.id) + '" aria-label="Delete milestone">' + icon("trash-2") + "</button>" +
                "</div>" +
              "</div>"
            );
          }).join("") + "</div>"
        : '<div class="db-inline-empty">No milestones yet. Add one below.</div>') +
      '<div class="db-modal-subhead"><h4>Add milestone</h4><span>Progress updates automatically.</span></div>' +
      '<form class="db-milestone-form" id="db-milestone-add-form">' +
        '<label class="db-field"><span>Milestone title</span><input type="text" class="db-input" id="db-milestone-add-title" autocomplete="off" /></label>' +
        '<div class="db-field-row">' +
          '<label class="db-field"><span>Due date</span><input type="date" class="db-input" id="db-milestone-add-due" value="' + esc(data.todayKey()) + '" /></label>' +
          '<label class="db-field"><span>Status</span><select class="db-select" id="db-milestone-add-status"><option value="pending">Pending</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select></label>' +
        "</div>" +
        '<label class="db-field"><span>Description</span><textarea class="db-textarea" id="db-milestone-add-description"></textarea></label>' +
        '<div class="db-modal-foot" style="padding:8px 0 0;border:0;background:transparent"><button type="submit" class="db-btn db-btn-primary">' + icon("plus") + "Add milestone</button></div>" +
      "</form>";

    var form = $("db-milestone-add-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var title = $("db-milestone-add-title").value.trim();
        var due = $("db-milestone-add-due").value;
        var statusValue = $("db-milestone-add-status").value;
        var description = $("db-milestone-add-description").value.trim();
        if (!title) {
          showToast("Milestone not added", "Enter a milestone title.", "error");
          return;
        }
        if (!due) {
          showToast("Milestone not added", "Choose a due date.", "error");
          return;
        }
        attempt(function () {
          data.addMilestone(project.id, {
            title: title,
            dueDate: due,
            status: statusValue,
            description: description
          });
          form.reset();
          $("db-milestone-add-due").value = data.todayKey();
        }, "Milestone added", "Project progress has been recalculated.");
        createIcons();
      });
    }
    createIcons();
  }

  function resetProjectForm() {
    state.editingProjectId = null;
    text("db-project-modal-title", "New project");
    var form = $("db-project-form");
    if (form) form.reset();
    $("db-project-status-field").value = "planned";
    $("db-project-start-field").value = data.todayKey();
    $("db-project-end-field").value = addDays(data.todayKey(), 30);
    $("db-project-deadline-field").value = addDays(data.todayKey(), 30);
    $("db-project-cost-field").value = "0";
  }

  function openProjectForm(projectId) {
    state.editingProjectId = projectId || null;
    var project = projectId ? data.getProject(projectId) : null;
    if (projectId && !project) {
      showToast("Project not found", "It may have been deleted.", "error");
      return;
    }
    if (!project) {
      resetProjectForm();
    } else {
      text("db-project-modal-title", "Edit project");
      $("db-project-name-field").value = project.name || "";
      $("db-project-status-field").value = project.status || "planned";
      $("db-project-start-field").value = project.startDate || "";
      $("db-project-end-field").value = project.endDate || "";
      $("db-project-deadline-field").value = project.deadline || "";
      $("db-project-cost-field").value = Number(project.estimatedCost) || 0;
      $("db-project-objectives-field").value = project.objectives || "";
      $("db-project-plan-field").value = project.executionPlan || "";
      $("db-project-notes-field").value = project.notes || "";
    }
    openModal("db-project-modal");
  }

  function openTaskEditor(planId, taskId) {
    var plan = data.getDailyPlan(planId);
    var task = findTask(plan, taskId);
    if (!task) return;
    state.editingTask = { planId: planId, taskId: taskId };
    $("db-task-title-field").value = task.title || "";
    $("db-task-description-field").value = task.description || "";
    $("db-task-priority-field").value = task.priority || "medium";
    openModal("db-task-modal");
  }

  function openMeetingEditor(planId, meetingId) {
    var plan = data.getDailyPlan(planId);
    var meeting = meetingId ? findMeeting(plan, meetingId) : null;
    if (meetingId && !meeting) return;
    state.editingMeeting = { planId: planId, meetingId: meetingId || null };
    text("db-meeting-modal-title", meetingId ? "Edit appointment" : "Add appointment");
    text("db-meeting-date-label", fmtDate(state.plannerDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    $("db-meeting-title-field").value = meeting ? meeting.title || "" : "";
    $("db-meeting-start-field").value = meeting ? meeting.startTime || "" : "";
    $("db-meeting-end-field").value = meeting ? meeting.endTime || "" : "";
    $("db-meeting-location-field").value = meeting ? meeting.location || "" : "";
    $("db-meeting-notes-field").value = meeting ? meeting.notes || "" : "";
    openModal("db-meeting-modal");
  }

  function openMilestoneEditor(projectId, milestoneId) {
    var milestone = data.getMilestone(projectId, milestoneId);
    if (!milestone) return;
    state.editingMilestone = { projectId: projectId, milestoneId: milestoneId };
    $("db-milestone-title-field").value = milestone.title || "";
    $("db-milestone-due-field").value = milestone.dueDate || "";
    $("db-milestone-status-field").value = milestone.status || "pending";
    $("db-milestone-description-field").value = milestone.description || "";
    $("db-milestone-notes-field").value = milestone.notes || "";
    openModal("db-milestone-modal");
  }

  function renderAll() {
    renderShell();
    renderOverview();
    renderAnalyticsChart();
    renderHealth();
    renderComparisonChart();
    renderComparisonList();
    renderRecentTransactions();
    renderBudget();
    renderSavingsAndGoals();
    renderPlanner();
    renderProjects();
    renderPlannerSummaries();
    renderWorkSchedule();
    renderUpcomingDates();
    renderNotifications();
    if (state.manageProjectId) renderProjectManage();
    createIcons();
  }

  function bindEvents() {
    var balanceToggle = $("db-balance-toggle");
    if (balanceToggle) {
      balanceToggle.addEventListener("click", function () {
        setBalanceVisibility(!document.body.classList.contains("db-balance-hidden"));
      });
    }

    var previous = $("period-prev");
    var next = $("period-next");
    var current = $("period-current");
    if (previous) {
      previous.addEventListener("click", function () {
        state.month = shiftMonth(state.month, -1);
        renderAll();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        state.month = shiftMonth(state.month, 1);
        renderAll();
      });
    }
    if (current) {
      current.addEventListener("click", function () {
        state.month = data.getMonthKey(data.todayKey());
        renderAll();
      });
    }

    var plannerPrev = $("planner-prev");
    var plannerNext = $("planner-next");
    var plannerToday = $("planner-today");
    var plannerDateInput = $("planner-date-input");
    if (plannerPrev) {
      plannerPrev.addEventListener("click", function () {
        state.plannerDate = addDays(state.plannerDate, -1);
        renderPlanner();
        createIcons();
      });
    }
    if (plannerNext) {
      plannerNext.addEventListener("click", function () {
        state.plannerDate = addDays(state.plannerDate, 1);
        renderPlanner();
        createIcons();
      });
    }
    if (plannerToday) {
      plannerToday.addEventListener("click", function () {
        state.plannerDate = data.todayKey();
        renderPlanner();
        createIcons();
      });
    }
    var plannerPageToday = $("planner-page-today");
    if (plannerPageToday) {
      plannerPageToday.addEventListener("click", function () {
        state.plannerDate = data.todayKey();
        renderPlanner();
        createIcons();
      });
    }
    var plannerPageNewProject = $("planner-page-new-project");
    if (plannerPageNewProject) {
      plannerPageNewProject.addEventListener("click", function () {
        openProjectForm(null);
      });
    }
    if (plannerDateInput) {
      plannerDateInput.addEventListener("change", function () {
        if (!plannerDateInput.value) return;
        state.plannerDate = plannerDateInput.value;
        renderPlanner();
        createIcons();
      });
    }

    var taskForm = $("planner-task-form");
    if (taskForm) {
      taskForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var titleInput = $("planner-task-title");
        var title = titleInput.value.trim();
        if (!title) {
          showToast("Task not added", "Enter a task title.", "error");
          return;
        }
        var plan = ensurePlan();
        if (!plan) return;
        var priority = $("planner-task-priority").value;
        attempt(function () {
          data.addTask(plan.id, { title: title, priority: priority });
          titleInput.value = "";
        }, "Task added", "The daily score updates automatically.");
      });
    }

    var three = $("planner-top-three");
    if (three) {
      three.addEventListener("click", function (event) {
        var card = event.target.closest("[data-task-toggle]");
        if (!card) return;
        data.toggleTask(card.getAttribute("data-plan-id"), card.getAttribute("data-task-toggle"));
      });
    }

    var taskList = $("planner-task-list");
    if (taskList) {
      taskList.addEventListener("click", function (event) {
        var button = event.target.closest("[data-task-action]");
        if (!button) return;
        var action = button.getAttribute("data-task-action");
        var planId = button.getAttribute("data-plan-id");
        var taskId = button.getAttribute("data-task-id");
        if (action === "toggle") {
          attempt(function () { data.toggleTask(planId, taskId); });
        } else if (action === "top") {
          var plan = data.getDailyPlan(planId);
          if (!plan) return;
          var ids = plan.topThreeTaskIds.slice();
          var position = ids.indexOf(taskId);
          if (position >= 0) {
            ids.splice(position, 1);
          } else {
            if (ids.length >= 3) {
              showToast("Top three is full", "Remove a star from another task first.", "error");
              return;
            }
            ids.push(taskId);
          }
          attempt(function () { data.setTopThreeTasks(planId, ids); });
        } else if (action === "edit") {
          openTaskEditor(planId, taskId);
        } else if (action === "delete") {
          openConfirm({
            title: "Delete task?",
            message: "This task will be removed from this day's plan and from the top three if selected.",
            confirmLabel: "Delete task",
            onConfirm: function () {
              data.deleteTask(planId, taskId);
              closeModal("db-confirm-modal");
              showToast("Task deleted", "The daily score has been recalculated.", "success");
            }
          });
        }
      });
    }

    var taskFormModal = $("db-task-form");
    if (taskFormModal) {
      taskFormModal.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!state.editingTask) return;
        var title = $("db-task-title-field").value.trim();
        if (!title) {
          showToast("Task not saved", "Enter a task title.", "error");
          return;
        }
        var payload = {
          title: title,
          description: $("db-task-description-field").value.trim(),
          priority: $("db-task-priority-field").value
        };
        var editing = state.editingTask;
        attempt(function () {
          data.updateTask(editing.planId, editing.taskId, payload);
          closeModal("db-task-modal");
        }, "Task updated", "The same task and daily score are updated.");
      });
    }

    var addMeeting = $("planner-add-meeting");
    if (addMeeting) {
      addMeeting.addEventListener("click", function () {
        var plan = ensurePlan();
        if (!plan) return;
        openMeetingEditor(plan.id, null);
      });
    }

    var meetingList = $("planner-meeting-list");
    if (meetingList) {
      meetingList.addEventListener("click", function (event) {
        var button = event.target.closest("[data-meeting-action]");
        if (!button) return;
        var action = button.getAttribute("data-meeting-action");
        var planId = button.getAttribute("data-plan-id");
        var meetingId = button.getAttribute("data-meeting-id");
        if (action === "edit") {
          openMeetingEditor(planId, meetingId);
        } else if (action === "delete") {
          openConfirm({
            title: "Delete appointment?",
            message: "This appointment will be removed from this day's plan.",
            confirmLabel: "Delete appointment",
            onConfirm: function () {
              data.deleteMeeting(planId, meetingId);
              closeModal("db-confirm-modal");
              showToast("Appointment deleted", "The appointment was removed.", "success");
            }
          });
        }
      });
    }

    var meetingForm = $("db-meeting-form");
    if (meetingForm) {
      meetingForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!state.editingMeeting) return;
        var title = $("db-meeting-title-field").value.trim();
        if (!title) {
          showToast("Appointment not saved", "Enter an appointment title.", "error");
          return;
        }
        var payload = {
          title: title,
          startTime: $("db-meeting-start-field").value,
          endTime: $("db-meeting-end-field").value,
          location: $("db-meeting-location-field").value.trim(),
          notes: $("db-meeting-notes-field").value.trim()
        };
        var editing = state.editingMeeting;
        attempt(function () {
          if (editing.meetingId) {
            data.updateMeeting(editing.planId, editing.meetingId, payload);
          } else {
            data.addMeeting(editing.planId, Object.assign({ date: state.plannerDate }, payload));
          }
          closeModal("db-meeting-modal");
        }, editing.meetingId ? "Appointment updated" : "Appointment added", "It is saved against the selected day.");
      });
    }

    var notesEdit = $("planner-notes-edit");
    if (notesEdit) {
      notesEdit.addEventListener("click", function () {
        setNoteEditing("notes", true);
      });
    }

    var remarksEdit = $("planner-remarks-edit");
    if (remarksEdit) {
      remarksEdit.addEventListener("click", function () {
        setNoteEditing("remarks", true);
      });
    }

    var saveNotes = $("planner-save-notes");
    if (saveNotes) {
      saveNotes.addEventListener("click", function () {
        var value = $("planner-notes").value;
        var plan = ensurePlan();
        if (!plan) return;
        var saved = attempt(function () {
          data.updateDailyPlan(plan.id, { notes: value });
        }, "Notes saved", "Notes remain associated with this date.");
        if (saved) {
          state.notesEditing.notes = false;
          renderPlanner();
        }
      });
    }

    var saveRemarks = $("planner-save-remarks");
    if (saveRemarks) {
      saveRemarks.addEventListener("click", function () {
        var value = $("planner-remarks").value;
        var plan = ensurePlan();
        if (!plan) return;
        var saved = attempt(function () {
          data.updateDailyPlan(plan.id, { remarks: value });
        }, "Remarks saved", "Remarks remain associated with this date.");
        if (saved) {
          state.notesEditing.remarks = false;
          renderPlanner();
        }
      });
    }

    var addProject = $("project-add-btn");
    if (addProject) addProject.addEventListener("click", function () { openProjectForm(null); });
    var projectGrid = $("db-project-grid");
    if (projectGrid) {
      projectGrid.addEventListener("click", function (event) {
        var button = event.target.closest("[data-project-action]");
        if (!button) return;
        var action = button.getAttribute("data-project-action");
        var projectId = button.getAttribute("data-project-id");
        if (action === "manage") {
          state.manageProjectId = projectId;
          renderProjectManage();
          openModal("db-project-manage-modal");
        } else if (action === "edit") {
          openProjectForm(projectId);
        } else if (action === "delete") {
          var project = data.getProject(projectId);
          openConfirm({
            title: "Delete project?",
            message: "Delete " + (project ? project.name : "this project") + " and its milestones? Linked expenses in My Finances are not affected.",
            confirmLabel: "Delete project",
            onConfirm: function () {
              data.deleteProject(projectId);
              closeModal("db-confirm-modal");
              showToast("Project deleted", "The project and its milestones were removed.", "success");
            }
          });
        }
      });
    }

    var projectForm = $("db-project-form");
    if (projectForm) {
      projectForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var name = $("db-project-name-field").value.trim();
        var startDate = $("db-project-start-field").value;
        var endDate = $("db-project-end-field").value;
        var deadline = $("db-project-deadline-field").value;
        var cost = Number($("db-project-cost-field").value);
        if (!name) {
          showToast("Project not saved", "Enter a project name.", "error");
          return;
        }
        if (!startDate || !endDate || !deadline) {
          showToast("Project not saved", "Choose a start date, end date and deadline.", "error");
          return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
          showToast("Project not saved", "Estimated cost must be zero or more.", "error");
          return;
        }
        var payload = {
          name: name,
          status: $("db-project-status-field").value,
          startDate: startDate,
          endDate: endDate,
          deadline: deadline,
          estimatedCost: cost,
          objectives: $("db-project-objectives-field").value.trim(),
          executionPlan: $("db-project-plan-field").value.trim(),
          notes: $("db-project-notes-field").value.trim()
        };
        var editingId = state.editingProjectId;
        attempt(function () {
          if (editingId) {
            data.updateProject(editingId, payload);
          } else {
            data.createProject(payload);
          }
          closeModal("db-project-modal");
        }, editingId ? "Project updated" : "Project created", "Estimated cost is not counted as an expense.");
      });
    }

    var manageEdit = $("db-project-manage-edit");
    if (manageEdit) {
      manageEdit.addEventListener("click", function () {
        if (!state.manageProjectId) return;
        var id = state.manageProjectId;
        closeModal("db-project-manage-modal");
        openProjectForm(id);
      });
    }

    var manageBody = $("db-project-manage-body");
    if (manageBody) {
      manageBody.addEventListener("click", function (event) {
        var button = event.target.closest("[data-milestone-action]");
        if (!button) return;
        var action = button.getAttribute("data-milestone-action");
        var projectId = button.getAttribute("data-project-id");
        var milestoneId = button.getAttribute("data-milestone-id");
        if (action === "toggle") {
          var milestone = data.getMilestone(projectId, milestoneId);
          if (!milestone) return;
          attempt(function () {
            data.updateMilestone(projectId, milestoneId, {
              status: milestone.status === "completed" ? "pending" : "completed"
            });
          });
        } else if (action === "edit") {
          openMilestoneEditor(projectId, milestoneId);
        } else if (action === "delete") {
          openConfirm({
            title: "Delete milestone?",
            message: "This milestone will be removed and project progress will be recalculated.",
            confirmLabel: "Delete milestone",
            onConfirm: function () {
              data.deleteMilestone(projectId, milestoneId);
              closeModal("db-confirm-modal");
              showToast("Milestone deleted", "Project progress has been recalculated.", "success");
            }
          });
        }
      });
    }

    var milestoneForm = $("db-milestone-form");
    if (milestoneForm) {
      milestoneForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!state.editingMilestone) return;
        var title = $("db-milestone-title-field").value.trim();
        var due = $("db-milestone-due-field").value;
        if (!title || !due) {
          showToast("Milestone not saved", "Enter a title and due date.", "error");
          return;
        }
        var editing = state.editingMilestone;
        attempt(function () {
          data.updateMilestone(editing.projectId, editing.milestoneId, {
            title: title,
            dueDate: due,
            status: $("db-milestone-status-field").value,
            description: $("db-milestone-description-field").value.trim(),
            notes: $("db-milestone-notes-field").value.trim()
          });
          closeModal("db-milestone-modal");
        }, "Milestone updated", "Project progress has been recalculated.");
      });
    }

    var confirmOk = $("db-confirm-ok");
    if (confirmOk) {
      confirmOk.addEventListener("click", function () {
        if (typeof state.confirmAction !== "function") {
          closeModal("db-confirm-modal");
          return;
        }
        var action = state.confirmAction;
        state.confirmAction = null;
        attempt(action);
      });
    }

    document.querySelectorAll("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button.getAttribute("data-close"));
      });
    });

    document.querySelectorAll(".db-modal").forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var open = document.querySelector(".db-modal.is-open");
      if (open) closeModal(open.id);
    });
  }

  function installThemeObserver() {
    if (!window.MutationObserver) return;
    var dark = document.documentElement.classList.contains("dark");
    var observer = new MutationObserver(function () {
      var next = document.documentElement.classList.contains("dark");
      if (next === dark) return;
      dark = next;
      renderAnalyticsChart();
      renderComparisonChart();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    var legacyNode = document.getElementById("db-legacy-templates");
    if (legacyNode) legacyNode.remove();
    bindEvents();
    renderAll();
    installThemeObserver();
    data.subscribe(function () {
      renderAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

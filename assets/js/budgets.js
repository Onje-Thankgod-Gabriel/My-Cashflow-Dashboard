/* Gabsweb CashFlow — Budget & Money Allocation */
(function () {
  "use strict";

  var data = window.GabswebCashFlowData;
  if (!data) return;

  var STATUS_ORDER = ["planned", "active", "completed", "cancelled"];
  var STATUS_META = {
    planned: { label: "Planned", icon: "clock", tone: "is-planned" },
    active: { label: "Active", icon: "activity", tone: "is-active" },
    completed: { label: "Completed", icon: "check", tone: "is-completed" },
    cancelled: { label: "Cancelled", icon: "ban", tone: "is-cancelled" },
  };
  var PURPOSE_OPTIONS = [
    "Feeding",
    "Transportation",
    "Rent",
    "Family support",
    "Personal expenses",
    "Utilities",
    "Emergency fund",
    "Savings",
    "Education",
    "Health",
    "Other",
  ];
  var PURPOSE_ICONS = {
    feeding: { icon: "utensils", tone: "is-income" },
    food: { icon: "utensils", tone: "is-income" },
    transportation: { icon: "car", tone: "is-transfer" },
    transport: { icon: "car", tone: "is-transfer" },
    rent: { icon: "home", tone: "is-warning" },
    housing: { icon: "home", tone: "is-warning" },
    family: { icon: "users", tone: "is-purple" },
    "family support": { icon: "users", tone: "is-purple" },
    personal: { icon: "user", tone: "is-transfer" },
    "personal expenses": { icon: "user", tone: "is-transfer" },
    utilities: { icon: "zap", tone: "is-warning" },
    emergency: { icon: "shield-check", tone: "is-income" },
    "emergency fund": { icon: "shield-check", tone: "is-income" },
    savings: { icon: "piggy-bank", tone: "is-income" },
    education: { icon: "book-open", tone: "is-transfer" },
    health: { icon: "heart", tone: "is-expense" },
    other: { icon: "target", tone: "is-neutral" },
  };
  var TOAST_ICONS = {
    success: "check",
    error: "alert-circle",
    info: "info",
    warning: "alert-triangle",
  };

  var currentMonthKey = getTodayKey().slice(0, 7);
  var state = {
    selectedMonth: currentMonthKey,
    status: "all",
    search: "",
    editingId: null,
    detailId: null,
  };
  var confirmHandler = null;
  var toastTimer = null;
  var accountMap = Object.create(null);

  /* ---------- Small helpers ---------- */

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    var replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(value === null || value === undefined ? "" : value).replace(
      /[&<>"']/g,
      function (character) {
        return replacements[character];
      }
    );
  }

  function iconMarkup(name, className) {
    return (
      '<i data-lucide="' +
      escapeHtml(name) +
      '" class="' +
      escapeHtml(className || "w-4 h-4") +
      '"></i>'
    );
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function getTodayKey() {
    if (typeof data.todayKey === "function") return data.todayKey();
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      pad2(now.getMonth() + 1) +
      "-" +
      pad2(now.getDate())
    );
  }

  function getMonthKey(value) {
    return value ? String(value).slice(0, 7) : "";
  }

  function isMonthKey(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
  }

  function parseDateOnly(value) {
    if (!value) return null;
    var parts = String(value).split("-");
    if (parts.length !== 3) return null;
    var parsed = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      12,
      0,
      0
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatMonth(monthKey) {
    var parsed = parseDateOnly(String(monthKey) + "-01");
    if (!parsed) return monthKey;
    try {
      return new Intl.DateTimeFormat("en-NG", {
        month: "long",
        year: "numeric",
      }).format(parsed);
    } catch (error) {
      return monthKey;
    }
  }

  function formatDate(value) {
    var parsed = parseDateOnly(value);
    if (!parsed) return "—";
    try {
      return new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(parsed);
    } catch (error) {
      return value;
    }
  }

  function getCurrency() {
    try {
      var settings = data.getSettings();
      return settings && settings.currency ? settings.currency : "NGN";
    } catch (error) {
      return "NGN";
    }
  }

  function formatMoney(amount) {
    var value = Number(amount);
    if (!Number.isFinite(value)) value = 0;
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: getCurrency(),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch (error) {
      return "NGN " + value.toFixed(2);
    }
  }

  function roundMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural || singular + "s";
  }

  function statusDetails(status) {
    var key = String(status || "").toLowerCase();
    if (STATUS_META[key]) return STATUS_META[key];
    return {
      label: status ? String(status) : "Planned",
      icon: "circle",
      tone: "is-planned",
    };
  }

  function purposeDetails(allocation) {
    var purpose = String(
      (allocation && allocation.purpose) || (allocation && allocation.category) || ""
    )
      .trim()
      .toLowerCase();
    if (PURPOSE_ICONS[purpose]) return PURPOSE_ICONS[purpose];
    var keys = Object.keys(PURPOSE_ICONS);
    for (var index = 0; index < keys.length; index += 1) {
      if (purpose && purpose.indexOf(keys[index]) !== -1) {
        return PURPOSE_ICONS[keys[index]];
      }
    }
    return { icon: "target", tone: "is-neutral" };
  }

  function accountName(accountId) {
    var account = accountMap[accountId];
    return account ? account.name : "Unknown account";
  }

  function allocationProgress(allocation, actual) {
    var planned = Number(allocation && allocation.plannedAmount) || 0;
    if (planned <= 0) return null;
    return roundMoney((actual / planned) * 100);
  }

  function progressTone(percentage) {
    if (percentage === null) return "";
    if (percentage > 100) return "is-danger";
    if (percentage >= 100) return "is-complete";
    if (percentage >= 80) return "is-warning";
    return "";
  }

  /* ---------- Data helpers ---------- */

  function allAllocations() {
    return data.getAllocations().slice();
  }

  function allocationsForMonth(month) {
    return data
      .getAllocations({ month: month })
      .slice()
      .sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }

  function linkedExpenses(allocationId) {
    return data
      .getTransactions({ allocationId: allocationId, type: "expense" })
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function unlinkedExpenses(month) {
    var filters = { type: "expense" };
    if (month) filters.month = month;
    return data
      .getTransactions(filters)
      .filter(function (transaction) {
        return !transaction.allocationId;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function isExpenseInAllocationPeriod(transaction, allocation) {
    return Boolean(
      transaction &&
        allocation &&
        getMonthKey(transaction.date) === allocation.financialMonth
    );
  }

  /* ---------- Month selector ---------- */

  function buildMonthOptions() {
    var months = Object.create(null);
    months[currentMonthKey] = true;
    months[state.selectedMonth] = true;

    allAllocations().forEach(function (allocation) {
      if (isMonthKey(allocation.financialMonth)) {
        months[allocation.financialMonth] = true;
      }
    });
    data.getTransactions({ type: "income" }).forEach(function (transaction) {
      var month = getMonthKey(transaction.date);
      if (isMonthKey(month)) months[month] = true;
    });

    var list = Object.keys(months)
      .filter(isMonthKey)
      .sort()
      .reverse();
    if (list.length === 0) list = [currentMonthKey];

    var select = byId("bd-month-select");
    if (!select) return;
    select.innerHTML = list
      .map(function (month) {
        return (
          '<option value="' +
          escapeHtml(month) +
          '">' +
          escapeHtml(formatMonth(month)) +
          "</option>"
        );
      })
      .join("");
    select.value = state.selectedMonth;
  }

  /* ---------- Sidebar & storage ---------- */

  function renderShell() {
    var totalBalance = data.getTotalBalance();
    var income = data.getTotalIncome({ month: currentMonthKey });
    var expenses = data.getTotalExpenses({ month: currentMonthKey });
    var netFlow = roundMoney(income - expenses);
    var balanceEl = byId("sidebar-total-balance");
    var noteEl = byId("sidebar-balance-note");

    if (balanceEl) balanceEl.textContent = formatMoney(totalBalance);
    if (noteEl) {
      noteEl.textContent =
        netFlow === 0
          ? "No change this month"
          : (netFlow > 0 ? "+" : "") + formatMoney(netFlow) + " net this month";
    }

    var chip = byId("bd-storage-chip");
    var label = byId("bd-storage-label");
    if (!chip || !label) return;
    var info = data.getLoadInfo ? data.getLoadInfo() : null;
    var needsAttention =
      info &&
      (info.status === "corrupt" ||
        info.status === "incompatible" ||
        info.status === "recovered");
    var sessionOnly = info && info.storageAvailable === false;
    chip.classList.toggle("is-warning", Boolean(needsAttention || sessionOnly));
    if (needsAttention) {
      label.textContent = "Local data needs attention";
      chip.title = info.warning || "Review your locally saved finance data.";
    } else if (sessionOnly) {
      label.textContent = "Session only";
      chip.title = "Browser storage is unavailable in this session.";
    } else {
      label.textContent = "Saved locally";
      chip.title = "Your allocation data is stored privately in this browser.";
    }
  }

  /* ---------- Overview ---------- */

  function renderOverview() {
    var summary = data.getAllocationSummary(state.selectedMonth);
    var monthAllocations = allocationsForMonth(state.selectedMonth);
    var activeAllocations = monthAllocations.filter(function (allocation) {
      return allocation.status !== "cancelled";
    });
    var activeIds = Object.create(null);
    activeAllocations.forEach(function (allocation) {
      activeIds[allocation.id] = true;
    });
    var monthTransactions = data.getTransactions({ month: state.selectedMonth });
    var incomeCount = monthTransactions.filter(function (transaction) {
      return transaction.type === "income";
    }).length;
    var linkedCount = monthTransactions.filter(function (transaction) {
      return transaction.type === "expense" && activeIds[transaction.allocationId];
    }).length;

    byId("bd-overview-month-label").textContent =
      formatMonth(state.selectedMonth) +
      " · " +
      pluralize(activeAllocations.length, "active plan", "active plans");

    var incomeEl = byId("bd-total-income");
    incomeEl.textContent = formatMoney(summary.monthlyIncome);
    incomeEl.classList.toggle("is-positive", summary.monthlyIncome > 0);
    byId("bd-income-note").textContent = incomeCount
      ? incomeCount + " " + pluralize(incomeCount, "income entry", "income entries") + " this month"
      : "No income recorded this month";

    byId("bd-total-allocated").textContent = formatMoney(summary.totalAllocated);
    byId("bd-allocated-badge").textContent =
      activeAllocations.length +
      " " +
      pluralize(activeAllocations.length, "allocation", "allocations");
    var allocatedPercent =
      summary.monthlyIncome > 0
        ? Math.round((summary.totalAllocated / summary.monthlyIncome) * 100)
        : null;
    byId("bd-allocated-note").textContent =
      activeAllocations.length === 0
        ? "No allocations planned yet"
        : allocatedPercent === null
          ? "Income not recorded for this month"
          : allocatedPercent + "% of recorded income allocated";

    var unallocatedEl = byId("bd-unallocated");
    unallocatedEl.textContent = formatMoney(summary.unallocatedFunds);
    unallocatedEl.classList.toggle(
      "is-negative",
      summary.unallocatedFunds < 0
    );
    var unallocatedBadge = byId("bd-unallocated-badge");
    var unallocatedNote = byId("bd-unallocated-note");
    if (summary.unallocatedFunds < 0) {
      unallocatedBadge.textContent = "Over-allocated";
      unallocatedNote.textContent =
        "Over-allocated by " + formatMoney(Math.abs(summary.unallocatedFunds));
    } else if (summary.monthlyIncome === 0 && summary.totalAllocated === 0) {
      unallocatedBadge.textContent = "To assign";
      unallocatedNote.textContent = "Income minus total allocated";
    } else {
      unallocatedBadge.textContent = "To assign";
      unallocatedNote.textContent =
        "Available to assign after planned allocations";
    }

    byId("bd-actual-spending").textContent = formatMoney(
      summary.totalActualSpending
    );
    byId("bd-spending-note").textContent = linkedCount
      ? linkedCount +
        " linked " +
        pluralize(linkedCount, "expense", "expenses") +
        " against this month's plans"
      : "No linked expenses yet";
  }

  /* ---------- Allocation cards ---------- */

  function matchesFilters(allocation) {
    if (state.status !== "all" && allocation.status !== state.status) {
      return false;
    }
    if (!state.search) return true;
    var haystack = [
      allocation.name,
      allocation.purpose,
      allocation.category,
      allocation.description,
      allocation.notes,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(state.search) !== -1;
  }

  function allocationCard(allocation) {
    var actual = data.getAllocationActualSpending(allocation.id);
    var remaining = roundMoney(Number(allocation.plannedAmount || 0) - actual);
    var percentage = allocationProgress(allocation, actual);
    var status = statusDetails(allocation.status);
    var purpose = purposeDetails(allocation);
    var linked = linkedExpenses(allocation.id);
    var width = percentage === null ? 0 : Math.min(percentage, 100);
    var progressText =
      percentage === null ? "No planned amount" : percentage.toFixed(1) + "% used";
    var remainingLabel =
      remaining < 0
        ? "Over by " + formatMoney(Math.abs(remaining))
        : formatMoney(remaining) + " left";

    return (
      '<article class="bd-allocation-card' +
      (allocation.status === "cancelled" ? " is-cancelled" : "") +
      '">' +
      '<div class="bd-allocation-top">' +
      '<div class="bd-allocation-identity">' +
      '<span class="bd-allocation-icon ' +
      purpose.tone +
      '">' +
      iconMarkup(purpose.icon, "w-5 h-5") +
      "</span>" +
      '<div class="bd-allocation-copy">' +
      '<h3 class="bd-allocation-name" title="' +
      escapeHtml(allocation.name) +
      '">' +
      escapeHtml(allocation.name || "Untitled allocation") +
      "</h3>" +
      '<p class="bd-allocation-purpose">' +
      iconMarkup("tag", "w-3 h-3") +
      "<span>" +
      escapeHtml(allocation.purpose || allocation.category || "General purpose") +
      "</span></p>" +
      "</div></div>" +
      '<span class="bd-status-pill ' +
      status.tone +
      '">' +
      iconMarkup(status.icon, "w-3 h-3") +
      escapeHtml(status.label) +
      "</span>" +
      "</div>" +
      '<div class="bd-allocation-amount"><span>Planned amount</span><strong>' +
      escapeHtml(formatMoney(allocation.plannedAmount)) +
      "</strong></div>" +
      '<div class="bd-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      escapeHtml(String(percentage === null ? 0 : Math.round(Math.min(percentage, 100)))) +
      '"><div class="bd-progress-fill ' +
      progressTone(percentage) +
      '" style="width: ' +
      width +
      '%"></div></div>' +
      '<div class="bd-allocation-meta"><span>' +
      escapeHtml(formatMoney(actual)) +
      " spent · " +
      escapeHtml(progressText) +
      '</span><strong class="' +
      (remaining < 0 ? "is-negative" : "is-positive") +
      '">' +
      escapeHtml(remainingLabel) +
      "</strong></div>" +
      '<div class="bd-allocation-footer">' +
      '<span class="bd-allocation-footnote">' +
      iconMarkup("receipt", "w-3 h-3") +
      escapeHtml(
        linked.length
          ? linked.length + " linked " + pluralize(linked.length, "expense", "expenses")
          : "No linked expenses"
      ) +
      "</span>" +
      '<button type="button" class="bd-btn bd-btn-ghost bd-btn-small" data-bd-details="' +
      escapeHtml(allocation.id) +
      '">View details' +
      iconMarkup("chevron-right", "w-4 h-4") +
      "</button>" +
      "</div>" +
      "</article>"
    );
  }

  function renderAllocations() {
    var monthAllocations = allocationsForMonth(state.selectedMonth);
    var visible = monthAllocations.filter(matchesFilters);
    var grid = byId("bd-allocation-grid");
    var summaryLine = byId("bd-allocation-summary-line");
    if (!grid) return;

    var active = monthAllocations.filter(function (allocation) {
      return allocation.status !== "cancelled";
    });
    var plannedTotal = active.reduce(function (sum, allocation) {
      return sum + Number(allocation.plannedAmount || 0);
    }, 0);

    if (monthAllocations.length === 0) {
      summaryLine.textContent = "No allocations for this month yet.";
    } else {
      summaryLine.textContent =
        visible.length +
        " of " +
        monthAllocations.length +
        " " +
        pluralize(monthAllocations.length, "allocation", "allocations") +
        " shown · " +
        formatMoney(plannedTotal) +
        " planned";
    }

    if (visible.length === 0) {
      if (monthAllocations.length === 0) {
        grid.innerHTML =
          '<div class="bd-empty bd-empty-wide">' +
          '<div class="bd-empty-icon">' +
          iconMarkup("layers", "w-5 h-5") +
          "</div>" +
          "<h3>No allocations yet</h3>" +
          "<p>Start by dividing this month's income into planned purposes such as feeding, transport or savings.</p>" +
          '<button type="button" class="bd-btn bd-btn-primary" data-bd-empty-add="true">' +
          iconMarkup("plus", "w-4 h-4") +
          "<span>Add your first allocation</span></button>" +
          "</div>";
      } else {
        grid.innerHTML =
          '<div class="bd-empty bd-empty-wide">' +
          '<div class="bd-empty-icon">' +
          iconMarkup("search", "w-5 h-5") +
          "</div>" +
          "<h3>No allocations match</h3>" +
          "<p>Try a different status filter or clear your search to see every allocation for this month.</p>" +
          '<button type="button" class="bd-btn bd-btn-ghost" data-bd-empty-clear="true">Clear filters</button>' +
          "</div>";
      }
    } else {
      grid.innerHTML = visible.map(allocationCard).join("");
    }

    refreshIcons();
  }

  /* ---------- History ---------- */

  function renderHistory() {
    var container = byId("bd-history-list");
    if (!container) return;
    var months = Object.create(null);
    allAllocations().forEach(function (allocation) {
      if (!isMonthKey(allocation.financialMonth)) return;
      if (!months[allocation.financialMonth]) {
        months[allocation.financialMonth] = true;
      }
    });
    var list = Object.keys(months)
      .filter(isMonthKey)
      .sort()
      .reverse();

    if (list.length === 0) {
      container.innerHTML =
        '<div class="bd-empty is-compact">' +
        '<div class="bd-empty-icon">' +
        iconMarkup("history", "w-5 h-5") +
        "</div>" +
        "<h3>No allocation history yet</h3>" +
        "<p>Past months will appear here once you create allocations.</p>" +
        "</div>";
      refreshIcons();
      return;
    }

    container.innerHTML = list
      .map(function (month) {
        var summary = data.getAllocationSummary(month);
        var count = allocationsForMonth(month).length;
        return (
          '<button type="button" class="bd-history-row' +
          (month === state.selectedMonth ? " is-active" : "") +
          '" data-bd-history="' +
          escapeHtml(month) +
          '">' +
          '<span class="bd-history-month"><strong>' +
          escapeHtml(formatMonth(month)) +
          "</strong><small>" +
          escapeHtml(count + " " + pluralize(count, "allocation", "allocations")) +
          "</small></span>" +
          '<span class="bd-history-metric"><span>Planned</span><strong>' +
          escapeHtml(formatMoney(summary.totalAllocated)) +
          "</strong></span>" +
          '<span class="bd-history-metric"><span>Actual</span><strong>' +
          escapeHtml(formatMoney(summary.totalActualSpending)) +
          "</strong></span>" +
          '<span class="bd-history-metric is-remaining"><span>Remaining</span><strong class="' +
          (summary.totalRemaining < 0 ? "is-negative" : "is-positive") +
          '">' +
          escapeHtml(formatMoney(summary.totalRemaining)) +
          "</strong></span>" +
          "</button>"
        );
      })
      .join("");
    refreshIcons();
  }

  /* ---------- Unlinked expenses ---------- */

  function renderUnlinked() {
    var container = byId("bd-unlinked-list");
    var monthLabel = byId("bd-unlinked-month");
    if (!container || !monthLabel) return;
    var list = unlinkedExpenses(state.selectedMonth);
    var total = list.reduce(function (sum, transaction) {
      return sum + Number(transaction.amount || 0);
    }, 0);

    monthLabel.textContent = list.length
      ? formatMonth(state.selectedMonth) +
        " · " +
        list.length +
        " unlinked " +
        pluralize(list.length, "expense", "expenses") +
        " · " +
        formatMoney(total)
      : formatMonth(state.selectedMonth) + " · no unlinked expenses";

    if (list.length === 0) {
      container.innerHTML =
        '<div class="bd-empty is-compact is-warning">' +
        '<div class="bd-empty-icon">' +
        iconMarkup("check-circle", "w-5 h-5") +
        "</div>" +
        "<h3>Nothing unassigned</h3>" +
        "<p>Every recorded expense this month is linked to an allocation, or no expenses were recorded.</p>" +
        "</div>";
      refreshIcons();
      return;
    }

    var shown = list.slice(0, 6);
    container.innerHTML =
      shown
        .map(function (transaction) {
          return (
            '<div class="bd-unlinked-row">' +
            '<div class="bd-unlinked-copy"><strong>' +
            escapeHtml(
              transaction.description ||
                transaction.category ||
                "Unlinked expense"
            ) +
            "</strong><small>" +
            escapeHtml(formatDate(transaction.date)) +
            " · " +
            escapeHtml(accountName(transaction.accountId)) +
            "</small></div>" +
            '<span class="bd-unlinked-amount">-' +
            escapeHtml(formatMoney(transaction.amount)) +
            "</span>" +
            "</div>"
          );
        })
        .join("") +
      (list.length > shown.length
        ? '<p class="bd-details-note">' +
          escapeHtml(
            "+" +
              (list.length - shown.length) +
              " more unlinked " +
              pluralize(list.length - shown.length, "expense", "expenses") +
              " this month"
          ) +
          "</p>"
        : "");
    refreshIcons();
  }

  /* ---------- Details ---------- */

  function renderDetails() {
    if (!state.detailId) return;
    var allocation = data.getAllocation(state.detailId);
    if (!allocation) {
      state.detailId = null;
      hideModal("bd-details-modal");
      return;
    }

    var actual = data.getAllocationActualSpending(allocation.id);
    var remaining = roundMoney(Number(allocation.plannedAmount || 0) - actual);
    var percentage = allocationProgress(allocation, actual);
    var status = statusDetails(allocation.status);
    var purpose = purposeDetails(allocation);
    var linked = linkedExpenses(allocation.id);
    var eligibleLinked = linked.filter(function (transaction) {
      return isExpenseInAllocationPeriod(transaction, allocation);
    });
    var linkedTotal = eligibleLinked.reduce(function (sum, transaction) {
      return sum + Number(transaction.amount || 0);
    }, 0);
    var incompatibleCount = linked.length - eligibleLinked.length;
    var width = percentage === null ? 0 : Math.min(percentage, 100);
    var availableToLink =
      allocation.status === "cancelled"
        ? []
        : unlinkedExpenses(allocation.financialMonth);

    var description =
      String(allocation.description || "").trim() ||
      String(allocation.notes || "").trim() ||
      "No description added.";

    var linkedMarkup = linked.length
      ? '<div class="bd-expense-list">' +
        linked
          .map(function (transaction) {
            var compatible = isExpenseInAllocationPeriod(
              transaction,
              allocation
            );
            return (
              '<div class="bd-expense-row' +
              (compatible ? "" : " is-outside-period") +
              '">' +
              '<span class="bd-expense-icon">' +
              iconMarkup("arrow-up-right", "w-4 h-4") +
              "</span>" +
              '<div class="bd-expense-copy"><strong>' +
              escapeHtml(
                transaction.description ||
                  transaction.category ||
                  "Linked expense"
              ) +
              "</strong><small>" +
              escapeHtml(formatDate(transaction.date)) +
              " · " +
              escapeHtml(accountName(transaction.accountId)) +
              (compatible
                ? ""
                : " · Outside " +
                  escapeHtml(formatMonth(allocation.financialMonth)) +
                  " — not counted") +
              "</small></div>" +
              '<span class="bd-expense-amount">-' +
              escapeHtml(formatMoney(transaction.amount)) +
              "</span>" +
              '<button type="button" class="bd-icon-button is-danger" data-bd-unlink="' +
              escapeHtml(transaction.id) +
              '" title="Unlink this expense" aria-label="Unlink expense">' +
              iconMarkup("unlink", "w-4 h-4") +
              "</button>" +
              "</div>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="bd-details-note">No expenses are linked yet. Actual spending stays at ' +
        escapeHtml(formatMoney(0)) +
        " until a real expense is linked.</p>";

    var linkMarkup = "";
    if (allocation.status !== "cancelled") {
      if (availableToLink.length) {
        linkMarkup =
          '<div class="bd-link-picker">' +
          '<select aria-label="Select an unlinked expense">' +
          '<option value="">Select an unlinked expense…</option>' +
          availableToLink
            .map(function (transaction) {
              var label =
                formatDate(transaction.date) +
                " · " +
                (transaction.description ||
                  transaction.category ||
                  "Expense") +
                " · " +
                formatMoney(transaction.amount);
              return (
                '<option value="' +
                escapeHtml(transaction.id) +
                '">' +
                escapeHtml(label) +
                "</option>"
              );
            })
            .join("") +
          "</select>" +
          '<button type="button" class="bd-btn bd-btn-soft bd-btn-small" data-bd-link="' +
          escapeHtml(allocation.id) +
          '">Link expense</button>' +
          "</div>" +
          '<p class="bd-details-note is-spaced">Linking does not move money. The expense already affected your account balance when it was recorded in My Finances.</p>';
      } else {
        linkMarkup =
          '<p class="bd-details-note">There are no unlinked expenses available for ' +
          escapeHtml(formatMonth(allocation.financialMonth)) +
          '. Record an expense in that month in My Finances first, then link it here.</p>';
      }
    }

    var deleteMarkup =
      linked.length === 0
        ? '<button type="button" class="bd-btn bd-btn-danger bd-btn-small bd-details-delete" data-bd-delete="' +
          escapeHtml(allocation.id) +
          '">Delete allocation</button>'
        : "";

    var cancelLabel =
      allocation.status === "cancelled"
        ? "Restore allocation"
        : "Cancel allocation";
    var cancelAttr =
      allocation.status === "cancelled"
        ? 'data-bd-restore="' + escapeHtml(allocation.id) + '"'
        : 'data-bd-cancel="' + escapeHtml(allocation.id) + '"';

    byId("bd-details-title").textContent = "Allocation details";
    byId("bd-details-subtitle").textContent =
      "Planned amount, actual spending and linked expenses.";

    byId("bd-details-body").innerHTML =
      '<div class="bd-details-head">' +
      '<span class="bd-allocation-icon ' +
      purpose.tone +
      '">' +
      iconMarkup(purpose.icon, "w-5 h-5") +
      "</span>" +
      '<div class="bd-details-identity"><h4>' +
      escapeHtml(allocation.name || "Untitled allocation") +
      "</h4><p>" +
      escapeHtml(allocation.purpose || allocation.category || "General purpose") +
      " · " +
      escapeHtml(formatMonth(allocation.financialMonth)) +
      "</p></div>" +
      '<span class="bd-status-pill ' +
      status.tone +
      '">' +
      iconMarkup(status.icon, "w-3 h-3") +
      escapeHtml(status.label) +
      "</span>" +
      "</div>" +
      '<div class="bd-details-stats">' +
      '<div class="bd-details-stat"><span>Planned</span><strong>' +
      escapeHtml(formatMoney(allocation.plannedAmount)) +
      "</strong></div>" +
      '<div class="bd-details-stat"><span>Spent</span><strong>' +
      escapeHtml(formatMoney(actual)) +
      "</strong></div>" +
      '<div class="bd-details-stat"><span>Remaining</span><strong class="' +
      (remaining < 0 ? "is-negative" : "is-positive") +
      '">' +
      escapeHtml(formatMoney(remaining)) +
      "</strong></div>" +
      "</div>" +
      '<div class="bd-details-progress"><div class="bd-details-progress-head"><span>Allocation used</span><strong>' +
      escapeHtml(percentage === null ? "—" : percentage.toFixed(1) + "%") +
      '</strong></div><div class="bd-progress"><div class="bd-progress-fill ' +
      progressTone(percentage) +
      '" style="width: ' +
      width +
      '%"></div></div></div>' +
      '<dl class="bd-details-list">' +
      "<div class=\"bd-details-row\"><dt>Financial month</dt><dd>" +
      escapeHtml(formatMonth(allocation.financialMonth)) +
      "</dd></div>" +
      '<div class="bd-details-row"><dt>Purpose</dt><dd>' +
      escapeHtml(allocation.purpose || allocation.category || "—") +
      "</dd></div>" +
      '<div class="bd-details-row"><dt>Status</dt><dd>' +
      escapeHtml(status.label) +
      "</dd></div>" +
      '<div class="bd-details-row"><dt>Description</dt><dd>' +
      escapeHtml(description) +
      "</dd></div>" +
      "</dl>" +
      '<div class="bd-details-section"><div class="bd-details-section-head"><h4>Linked expenses</h4><span>' +
      escapeHtml(
        eligibleLinked.length +
          " " +
          pluralize(eligibleLinked.length, "expense", "expenses") +
          " · " +
          formatMoney(linkedTotal)
      ) +
      "</span></div>" +
      (incompatibleCount
        ? '<p class="bd-period-warning">' +
          escapeHtml(
            incompatibleCount +
              " linked " +
              pluralize(incompatibleCount, "expense", "expenses") +
              " outside " +
              formatMonth(allocation.financialMonth) +
              " " +
              (incompatibleCount === 1 ? "is" : "are") +
              " not counted. Unlink or move the expense to this allocation's month."
          ) +
          "</p>"
        : "") +
      linkedMarkup +
      linkMarkup +
      "</div>" +
      '<div class="bd-details-actions"><div class="bd-details-actions-group">' +
      '<button type="button" class="bd-btn bd-btn-ghost bd-btn-small" data-bd-edit="' +
      escapeHtml(allocation.id) +
      '">' +
      iconMarkup("edit-3", "w-4 h-4") +
      "<span>Edit allocation</span></button>" +
      '<button type="button" class="bd-btn bd-btn-soft bd-btn-small" ' +
      cancelAttr +
      ">" +
      escapeHtml(cancelLabel) +
      "</button>" +
      deleteMarkup +
      "</div></div>";

    refreshIcons();
  }

  /* ---------- Modals, toast & confirmation ---------- */

  function showModal(id) {
    var modal = byId(id);
    if (!modal) return;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    refreshIcons();
  }

  function hideModal(id) {
    var modal = byId(id);
    if (!modal) return;
    modal.classList.remove("open");
    if (!document.querySelector(".modal.open")) {
      document.body.style.overflow = "";
    }
  }

  function closeAllModals() {
    document.querySelectorAll(".modal.open").forEach(function (modal) {
      modal.classList.remove("open");
    });
    document.body.style.overflow = "";
  }

  function showToast(title, message, type) {
    var toast = byId("toast");
    var toastTitle = byId("toast-title");
    var toastMessage = byId("toast-message");
    var toastIcon = byId("toast-icon");
    if (!toast || !toastTitle || !toastMessage) return;
    var toastType = type || "success";
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toast.className = "toast bd-toast show";
    if (toastIcon) {
      toastIcon.className =
        "bd-toast-icon is-" +
        toastType +
        " flex items-center justify-center flex-shrink-0";
      toastIcon.innerHTML = iconMarkup(
        TOAST_ICONS[toastType] || "check",
        "w-5 h-5"
      );
    }
    refreshIcons();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  function openConfirm(options) {
    var settings = options || {};
    byId("bd-confirm-title").textContent = settings.title || "Confirm action";
    byId("bd-confirm-subtitle").textContent =
      settings.subtitle || "This action needs your confirmation.";
    byId("bd-confirm-copy").textContent = settings.message || "";
    var action = byId("bd-confirm-action");
    action.textContent = settings.confirmLabel || "Confirm";
    action.className =
      "bd-btn " +
      (settings.danger === false ? "bd-btn-primary" : "bd-btn-danger");
    confirmHandler = settings.onConfirm || null;
    showModal("bd-confirm-modal");
  }

  /* ---------- Form ---------- */

  function ensureOption(select, value, label) {
    if (!select || !value) return;
    var found = false;
    Array.prototype.forEach.call(select.options, function (option) {
      if (option.value === value) found = true;
    });
    if (!found) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = label || value;
      select.appendChild(option);
    }
  }

  function setFormError(message) {
    var error = byId("bd-form-error");
    if (!error) return;
    if (message) {
      error.textContent = message;
      error.classList.add("is-visible");
    } else {
      error.textContent = "";
      error.classList.remove("is-visible");
    }
  }

  function openAddModal() {
    state.editingId = null;
    var form = byId("bd-allocation-form");
    if (!form) return;
    form.reset();
    setFormError("");
    byId("bd-form-month").value = state.selectedMonth;
    byId("bd-form-status").value = "planned";
    byId("bd-form-purpose").value = "Feeding";
    byId("bd-modal-title").textContent = "Add allocation";
    byId("bd-modal-subtitle").textContent =
      "Create a planned use of income for a financial month.";
    byId("bd-form-submit").innerHTML =
      iconMarkup("check", "w-4 h-4") + "<span>Create allocation</span>";
    showModal("bd-allocation-modal");
    var name = byId("bd-form-name");
    window.setTimeout(function () {
      if (name) name.focus();
    }, 80);
  }

  function openEditModal(allocationId) {
    var allocation = data.getAllocation(allocationId);
    if (!allocation) return;
    state.editingId = allocationId;
    var form = byId("bd-allocation-form");
    if (!form) return;
    form.reset();
    setFormError("");
    byId("bd-form-month").value = allocation.financialMonth;
    byId("bd-form-name").value = allocation.name || "";
    byId("bd-form-amount").value = Number(allocation.plannedAmount || 0);
    byId("bd-form-description").value =
      allocation.description || allocation.notes || "";

    var purposeSelect = byId("bd-form-purpose");
    var purposeValue = allocation.purpose || allocation.category || "Other";
    ensureOption(purposeSelect, purposeValue, purposeValue);
    purposeSelect.value = purposeValue;

    var statusSelect = byId("bd-form-status");
    ensureOption(
      statusSelect,
      allocation.status,
      statusDetails(allocation.status).label
    );
    statusSelect.value = allocation.status || "planned";

    byId("bd-modal-title").textContent = "Edit allocation";
    byId("bd-modal-subtitle").textContent =
      "Update the plan. Editing never creates a duplicate allocation.";
    byId("bd-form-submit").innerHTML =
      iconMarkup("check", "w-4 h-4") + "<span>Save changes</span>";
    showModal("bd-allocation-modal");
  }

  function submitAllocation(event) {
    event.preventDefault();
    var month = byId("bd-form-month").value;
    var name = byId("bd-form-name").value.trim();
    var purpose = byId("bd-form-purpose").value;
    var amountValue = byId("bd-form-amount").value;
    var amount = Number(amountValue);
    var status = byId("bd-form-status").value;
    var description = byId("bd-form-description").value.trim();

    if (!isMonthKey(month)) {
      setFormError("Choose a valid financial month.");
      return;
    }
    if (!name) {
      setFormError("Allocation name is required.");
      byId("bd-form-name").focus();
      return;
    }
    if (!purpose) {
      setFormError("Choose a purpose for this allocation.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Planned amount must be a valid number greater than zero.");
      byId("bd-form-amount").focus();
      return;
    }
    if (STATUS_ORDER.indexOf(status) === -1) {
      setFormError("Choose a valid allocation status.");
      return;
    }

    var payload = {
      financialMonth: month,
      name: name,
      purpose: purpose,
      plannedAmount: roundMoney(amount),
      description: description,
      status: status,
    };

    try {
      if (state.editingId) {
        data.updateAllocation(state.editingId, payload);
      } else {
        data.createAllocation(payload);
      }
    } catch (error) {
      setFormError(
        "Could not save this allocation. " +
          (error && error.message ? error.message : "Please try again.")
      );
      return;
    }

    var wasEditing = Boolean(state.editingId);
    state.editingId = null;
    hideModal("bd-allocation-modal");
    state.selectedMonth = month;
    buildMonthOptions();
    renderAll();
    showToast(
      wasEditing ? "Allocation updated" : "Allocation created",
      wasEditing
        ? name + " was updated without creating a duplicate."
        : name + " is now part of your " + formatMonth(month) + " plan.",
      "success"
    );
  }

  /* ---------- Allocation actions ---------- */

  function openDetails(allocationId) {
    if (!data.getAllocation(allocationId)) return;
    state.detailId = allocationId;
    renderDetails();
    showModal("bd-details-modal");
  }

  function requestCancel(allocationId) {
    var allocation = data.getAllocation(allocationId);
    if (!allocation) return;
    openConfirm({
      title: "Cancel allocation",
      subtitle: "The plan will remain in history.",
      message:
        'Cancel "' +
        allocation.name +
        '"? It will be excluded from totals and summary cards, but linked expenses and the record itself will be kept.',
      confirmLabel: "Cancel allocation",
      danger: true,
      onConfirm: function () {
        try {
          data.updateAllocation(allocationId, { status: "cancelled" });
          renderAll();
          showToast(
            "Allocation cancelled",
            allocation.name + " was cancelled and kept in history.",
            "info"
          );
        } catch (error) {
          showToast(
            "Could not cancel allocation",
            error && error.message ? error.message : "Please try again.",
            "error"
          );
        }
      },
    });
  }

  function requestRestore(allocationId) {
    var allocation = data.getAllocation(allocationId);
    if (!allocation) return;
    try {
      data.updateAllocation(allocationId, { status: "active" });
      renderAll();
      showToast(
        "Allocation restored",
        allocation.name + " is active again and counted in totals.",
        "success"
      );
    } catch (error) {
      showToast(
        "Could not restore allocation",
        error && error.message ? error.message : "Please try again.",
        "error"
      );
    }
  }

  function requestDelete(allocationId) {
    var allocation = data.getAllocation(allocationId);
    if (!allocation) return;
    var references = data.getTransactions({ allocationId: allocationId });
    if (references.length) {
      showToast(
        "Allocation still has linked expenses",
        "Unlink its expenses first, or cancel the allocation to keep its history.",
        "error"
      );
      return;
    }
    openConfirm({
      title: "Delete allocation",
      subtitle: "This cannot be undone.",
      message:
        'Permanently delete "' +
        allocation.name +
        '"? This removes the plan from every month view and from history.',
      confirmLabel: "Delete allocation",
      danger: true,
      onConfirm: function () {
        try {
          data.deleteAllocation(allocationId);
          if (state.detailId === allocationId) {
            state.detailId = null;
            hideModal("bd-details-modal");
          }
          renderAll();
          showToast(
            "Allocation deleted",
            allocation.name + " was permanently removed.",
            "success"
          );
        } catch (error) {
          showToast(
            "Could not delete allocation",
            error && error.message ? error.message : "Please try again.",
            "error"
          );
        }
      },
    });
  }

  function linkExpense(allocationId, transactionId) {
    if (!transactionId) {
      showToast(
        "Select an expense",
        "Choose an unlinked expense before linking it to this allocation.",
        "warning"
      );
      return;
    }
    var allocation = data.getAllocation(allocationId);
    if (!allocation) return;
    var transaction = data.getTransaction(transactionId);
    if (!transaction || transaction.type !== "expense") {
      showToast(
        "Select an expense",
        "Only expense transactions can be linked to an allocation.",
        "error"
      );
      return;
    }
    if (!isExpenseInAllocationPeriod(transaction, allocation)) {
      showToast(
        "Expense is outside this period",
        "An expense dated " +
          formatDate(transaction.date) +
          " cannot fund the " +
          formatMonth(allocation.financialMonth) +
          " allocation.",
        "error"
      );
      return;
    }
    try {
      data.updateTransaction(transactionId, { allocationId: allocationId });
      renderAll();
      showToast(
        "Expense linked",
        "Actual spending for " + allocation.name + " was recalculated.",
        "success"
      );
    } catch (error) {
      showToast(
        "Could not link expense",
        error && error.message ? error.message : "Please try again.",
        "error"
      );
    }
  }

  function unlinkExpense(transactionId) {
    try {
      data.updateTransaction(transactionId, { allocationId: null });
      renderAll();
      showToast(
        "Expense unlinked",
        "The expense remains an ordinary expense in My Finances.",
        "success"
      );
    } catch (error) {
      showToast(
        "Could not unlink expense",
        error && error.message ? error.message : "Please try again.",
        "error"
      );
    }
  }

  /* ---------- Rendering orchestration ---------- */

  function renderAll() {
    accountMap = Object.create(null);
    data.getAccounts().forEach(function (account) {
      accountMap[account.id] = account;
    });
    buildMonthOptions();
    renderShell();
    renderOverview();
    renderAllocations();
    renderHistory();
    renderUnlinked();
    if (state.detailId && byId("bd-details-modal").classList.contains("open")) {
      renderDetails();
    }
  }

  function selectMonth(month) {
    if (!isMonthKey(month)) return;
    state.selectedMonth = month;
    buildMonthOptions();
    renderAll();
  }

  /* ---------- Event handling ---------- */

  function handleDocumentClick(event) {
    var target = event.target;

    var detailsButton = target.closest("[data-bd-details]");
    if (detailsButton) {
      openDetails(detailsButton.getAttribute("data-bd-details"));
      return;
    }

    var historyButton = target.closest("[data-bd-history]");
    if (historyButton) {
      selectMonth(historyButton.getAttribute("data-bd-history"));
      return;
    }

    var editButton = target.closest("[data-bd-edit]");
    if (editButton) {
      hideModal("bd-details-modal");
      openEditModal(editButton.getAttribute("data-bd-edit"));
      return;
    }

    var deleteButton = target.closest("[data-bd-delete]");
    if (deleteButton) {
      requestDelete(deleteButton.getAttribute("data-bd-delete"));
      return;
    }

    var cancelButton = target.closest("[data-bd-cancel]");
    if (cancelButton) {
      requestCancel(cancelButton.getAttribute("data-bd-cancel"));
      return;
    }

    var restoreButton = target.closest("[data-bd-restore]");
    if (restoreButton) {
      requestRestore(restoreButton.getAttribute("data-bd-restore"));
      return;
    }

    var unlinkButton = target.closest("[data-bd-unlink]");
    if (unlinkButton) {
      unlinkExpense(unlinkButton.getAttribute("data-bd-unlink"));
      return;
    }

    var linkButton = target.closest("[data-bd-link]");
    if (linkButton) {
      var picker = linkButton.closest(".bd-link-picker");
      var select = picker ? picker.querySelector("select") : null;
      linkExpense(
        linkButton.getAttribute("data-bd-link"),
        select ? select.value : ""
      );
      return;
    }

    var closeButton = target.closest("[data-bd-close]");
    if (closeButton) {
      var closeId = closeButton.getAttribute("data-bd-close");
      hideModal(closeId);
      if (closeId === "bd-details-modal") state.detailId = null;
      return;
    }

    if (target.closest("[data-bd-empty-add]")) {
      openAddModal();
      return;
    }

    if (target.closest("[data-bd-empty-clear]")) {
      state.status = "all";
      state.search = "";
      var searchInput = byId("bd-search");
      if (searchInput) searchInput.value = "";
      document.querySelectorAll("[data-bd-status]").forEach(function (chip) {
        chip.classList.toggle(
          "active",
          chip.getAttribute("data-bd-status") === "all"
        );
      });
      renderAllocations();
      return;
    }

    if (
      target.classList &&
      target.classList.contains("modal") &&
      target.classList.contains("bd-overlay-modal")
    ) {
      hideModal(target.id);
      if (target.id === "bd-details-modal") state.detailId = null;
    }
  }

  function bindEvents() {
    byId("bd-add-allocation").addEventListener("click", openAddModal);

    byId("bd-month-select").addEventListener("change", function (event) {
      selectMonth(event.target.value);
    });

    byId("bd-search").addEventListener("input", function (event) {
      state.search = event.target.value.trim().toLowerCase();
      renderAllocations();
    });

    document.querySelectorAll("[data-bd-status]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.status = chip.getAttribute("data-bd-status");
        document.querySelectorAll("[data-bd-status]").forEach(function (item) {
          item.classList.toggle("active", item === chip);
        });
        renderAllocations();
      });
    });

    byId("bd-allocation-form").addEventListener("submit", submitAllocation);

    byId("bd-confirm-action").addEventListener("click", function () {
      var handler = confirmHandler;
      confirmHandler = null;
      hideModal("bd-confirm-modal");
      if (handler) handler();
    });

    document.addEventListener("click", handleDocumentClick);

    document.querySelectorAll(".bd-overlay-modal").forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) {
          hideModal(modal.id);
          if (modal.id === "bd-details-modal") state.detailId = null;
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAllModals();
    });

    if (typeof data.subscribe === "function") {
      data.subscribe(function () {
        renderAll();
      });
    }

    window.addEventListener("storage", function (event) {
      if (event.key === data.STORAGE_KEY) window.location.reload();
    });
  }

  function init() {
    document.title = "Gabsweb CashFlow · Budget & Money Allocation";
    var pageTitle = byId("page-title");
    if (pageTitle) pageTitle.textContent = "Budget & Money Allocation";
    state.selectedMonth = currentMonthKey;
    bindEvents();
    renderAll();
    refreshIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

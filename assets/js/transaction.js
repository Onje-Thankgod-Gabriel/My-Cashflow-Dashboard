(function () {
  "use strict";

  var data = window.GabswebCashFlowData;
  if (!data) return;

  var PAGE_SIZE = 8;
  var accountMap = Object.create(null);
  var confirmHandler = null;
  var toastTimer = null;
  var currentMonthKey = getTodayKey().slice(0, 7);
  var pageState = {
    type: "all",
    search: "",
    accountId: "",
    month: "",
    category: "",
    sort: "date-desc",
    page: 1,
    editingTransactionId: null,
    editingAccountId: null,
  };

  var ACCOUNT_TYPES = {
    bank: { label: "Bank account", icon: "landmark", tone: "transfer" },
    cash: { label: "Cash wallet", icon: "wallet", tone: "warning" },
    savings: { label: "Savings account", icon: "piggy-bank", tone: "income" },
    mobile: { label: "Mobile money", icon: "smartphone", tone: "purple" },
    investment: { label: "Investment", icon: "trending-up", tone: "transfer" },
    other: { label: "Other account", icon: "circle", tone: "neutral" },
  };

  var CATEGORY_ICONS = {
    salary: "briefcase",
    freelance: "briefcase",
    business: "briefcase",
    investment: "trending-up",
    gift: "gift",
    food: "utensils",
    groceries: "shopping-cart",
    transport: "car",
    travel: "plane",
    housing: "house",
    rent: "house",
    utilities: "zap",
    bills: "file-text",
    shopping: "shopping-bag",
    health: "heart",
    healthcare: "heart",
    education: "book-open",
    entertainment: "film",
    family: "users",
    savings: "piggy-bank",
    other: "circle",
  };

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

  function formatDate(value, options) {
    var parsed = parseDateOnly(value);
    if (!parsed) return "—";
    try {
      return new Intl.DateTimeFormat(
        "en-NG",
        options || { month: "short", day: "numeric", year: "numeric" }
      ).format(parsed);
    } catch (error) {
      return value;
    }
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

  function typeLabel(type) {
    if (type === "income") return "Income";
    if (type === "expense") return "Expense";
    return "Transfer";
  }

  function typeTone(type) {
    if (type === "income") return "income";
    if (type === "expense") return "expense";
    return "transfer";
  }

  function typeIcon(type) {
    if (type === "income") return "arrow-down-left";
    if (type === "expense") return "arrow-up-right";
    return "arrow-right-left";
  }

  function categoryIcon(category, type) {
    var key = String(category || "").trim().toLowerCase();
    if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
    return type === "income" ? "arrow-down-left" : "arrow-up-right";
  }

  function accountDetails(account) {
    var key = account && account.type ? String(account.type).toLowerCase() : "";
    return ACCOUNT_TYPES[key] || ACCOUNT_TYPES.other;
  }

  function accountName(accountId) {
    var account = accountMap[accountId];
    return account ? account.name : "Unknown account";
  }

  function getAccounts() {
    return data.getAccounts().slice();
  }

  function getTransactions() {
    return data.getTransactions().slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function showMessage(elementId, message) {
    var element = byId(elementId);
    if (!element) return;
    element.textContent = message;
    element.classList.add("is-visible");
  }

  function clearMessage(elementId) {
    var element = byId(elementId);
    if (!element) return;
    element.textContent = "";
    element.classList.remove("is-visible");
  }

  function setStorageStatus() {
    var chip = byId("mf-storage-chip");
    var label = byId("mf-storage-label");
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
      chip.title = "Your finance data is stored privately in this browser.";
    }
  }

  function renderOverview(accounts, transactions) {
    var income = data.getTotalIncome({ month: currentMonthKey });
    var expenses = data.getTotalExpenses({ month: currentMonthKey });
    var totalBalance = data.getTotalBalance();
    var availableBalance = data.getAvailableBalance();
    var netFlow = roundMoney(income - expenses);
    var monthTransactions = transactions.filter(function (transaction) {
      return getMonthKey(transaction.date) === currentMonthKey;
    });
    var incomeCount = monthTransactions.filter(function (transaction) {
      return transaction.type === "income";
    }).length;
    var expenseCount = monthTransactions.filter(function (transaction) {
      return transaction.type === "expense";
    }).length;
    var transferCount = monthTransactions.filter(function (transaction) {
      return transaction.type === "transfer";
    }).length;
    var transferTotal = monthTransactions.reduce(function (sum, transaction) {
      if (transaction.type !== "transfer") return sum;
      return sum + Number(transaction.amount || 0);
    }, 0);
    var totalBalanceElement = byId("mf-total-balance");
    var availableElement = byId("mf-available-balance");
    var netFlowElement = byId("mf-net-flow");

    totalBalanceElement.textContent = formatMoney(totalBalance);
    totalBalanceElement.classList.toggle("is-negative", totalBalance < 0);
    availableElement.textContent = formatMoney(availableBalance);
    availableElement.classList.toggle(
      "mf-negative",
      Number(availableBalance) < 0
    );
    netFlowElement.textContent =
      (netFlow > 0 ? "+" : "") + formatMoney(netFlow);
    netFlowElement.classList.toggle("mf-positive", netFlow > 0);
    netFlowElement.classList.toggle("mf-negative", netFlow < 0);

    byId("mf-account-count").textContent =
      accounts.length + " " + pluralize(accounts.length, "account");
    var sidebarBalance = byId("sidebar-total-balance");
    var sidebarNote = byId("sidebar-balance-note");
    if (sidebarBalance) {
      sidebarBalance.textContent = formatMoney(totalBalance);
    }
    if (sidebarNote) {
      sidebarNote.textContent =
        netFlow === 0
          ? "No change this month"
          : (netFlow > 0 ? "+" : "") +
            formatMoney(netFlow) +
            " net this month";
    }
    byId("mf-overview-month").textContent = formatMonth(currentMonthKey);
    byId("mf-month-income").textContent = formatMoney(income);
    byId("mf-month-expense").textContent = formatMoney(expenses);
    byId("mf-month-transfer").textContent = formatMoney(transferTotal);
    byId("mf-month-income-note").textContent = incomeCount
      ? incomeCount + " " + pluralize(incomeCount, "entry", "entries") + " this month"
      : "No income recorded this month";
    byId("mf-month-expense-note").textContent = expenseCount
      ? expenseCount + " " + pluralize(expenseCount, "entry", "entries") + " this month"
      : "No spending recorded this month";
    byId("mf-month-transfer-note").textContent = transferCount
      ? transferCount +
        " " +
        pluralize(transferCount, "transfer") +
        " moved between accounts"
      : "No transfers made this month";
  }

  function renderAccounts(accounts, transactions) {
    var grid = byId("mf-accounts-grid");
    if (!accounts.length) {
      grid.innerHTML =
        '<div class="mf-empty">' +
        '<span class="mf-empty-icon">' +
        iconMarkup("wallet", "w-5 h-5") +
        "</span>" +
        "<h3>Create your first account</h3>" +
        "<p>Add a bank, cash or savings account so income and spending can be tracked accurately.</p>" +
        '<button type="button" class="mf-btn mf-btn-primary" data-mf-add-account>' +
        iconMarkup("plus", "w-4 h-4") +
        "<span>Add account</span>" +
        "</button>" +
        "</div>";
      return;
    }

    grid.innerHTML = accounts
      .map(function (account) {
        var details = accountDetails(account);
        var balance = data.getAccountBalance(account.id);
        var activityCount = transactions.filter(function (transaction) {
          return (
            transaction.accountId === account.id ||
            transaction.toAccountId === account.id
          );
        }).length;
        var openingDate = formatDate(account.openingBalanceDate);
        var status =
          account.status && account.status !== "active"
            ? " · " + escapeHtml(account.status)
            : "";

        return (
          '<article class="mf-account-card" data-account-id="' +
          escapeHtml(account.id) +
          '">' +
          '<div class="mf-account-top">' +
          '<span class="mf-account-icon mf-tone-' +
          escapeHtml(details.tone) +
          '">' +
          iconMarkup(details.icon, "w-5 h-5") +
          "</span>" +
          '<div class="mf-account-actions">' +
          '<button type="button" class="mf-icon-button" data-mf-account-edit="' +
          escapeHtml(account.id) +
          '" aria-label="Edit ' +
          escapeHtml(account.name) +
          '">' +
          iconMarkup("pencil", "w-4 h-4") +
          "</button>" +
          '<button type="button" class="mf-icon-button is-danger" data-mf-account-delete="' +
          escapeHtml(account.id) +
          '" aria-label="Delete ' +
          escapeHtml(account.name) +
          '">' +
          iconMarkup("trash-2", "w-4 h-4") +
          "</button>" +
          "</div>" +
          "</div>" +
          "<div>" +
          '<span class="mf-account-type">' +
          escapeHtml(details.label) +
          status +
          "</span>" +
          '<h3 class="mf-account-name" title="' +
          escapeHtml(account.name) +
          '">' +
          escapeHtml(account.name) +
          "</h3>" +
          '<p class="mf-account-balance' +
          (balance < 0 ? " mf-negative" : "") +
          '">' +
          formatMoney(balance) +
          "</p>" +
          "</div>" +
          '<div class="mf-account-footer">' +
          "<span>Opened " +
          escapeHtml(openingDate) +
          "</span>" +
          "<span>" +
          activityCount +
          " " +
          pluralize(activityCount, "entry", "entries") +
          "</span>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderMiniRow(transaction) {
    var description = transaction.description || typeLabel(transaction.type);
    var meta =
      transaction.type === "transfer"
        ? accountName(transaction.accountId) +
          " → " +
          accountName(transaction.toAccountId)
        : accountName(transaction.accountId);
    var amount =
      transaction.type === "income"
        ? "+" + formatMoney(transaction.amount)
        : transaction.type === "expense"
          ? "-" + formatMoney(transaction.amount)
          : formatMoney(transaction.amount);
    var amountClass =
      transaction.type === "income"
        ? "mf-positive"
        : transaction.type === "expense"
          ? "mf-negative"
          : "mf-transfer-amount";

    return (
      '<button type="button" class="mf-mini-row" data-mf-view="' +
      escapeHtml(transaction.id) +
      '">' +
      '<span class="mf-mini-main">' +
      '<span class="mf-mini-icon mf-tone-' +
      typeTone(transaction.type) +
      '">' +
      iconMarkup(
        categoryIcon(transaction.category, transaction.type),
        "w-3.5 h-3.5"
      ) +
      "</span>" +
      '<span class="mf-mini-copy">' +
      "<strong>" +
      escapeHtml(description) +
      "</strong>" +
      "<small>" +
      escapeHtml(meta + " · " + formatDate(transaction.date)) +
      "</small>" +
      "</span>" +
      "</span>" +
      '<span class="mf-mini-amount ' +
      amountClass +
      '">' +
      escapeHtml(amount) +
      "</span>" +
      "</button>"
    );
  }

  function renderMiniList(type, transactions) {
    var list = byId("mf-recent-" + type);
    var totalElement = byId("mf-" + type + "-total");
    var countElement = byId("mf-" + type + "-count");
    var monthTransactions = transactions.filter(function (transaction) {
      return (
        transaction.type === type &&
        getMonthKey(transaction.date) === currentMonthKey
      );
    });
    var total = monthTransactions.reduce(function (sum, transaction) {
      return sum + Number(transaction.amount || 0);
    }, 0);

    totalElement.textContent = formatMoney(total);
    countElement.textContent = monthTransactions.length
      ? monthTransactions.length +
        " " +
        pluralize(monthTransactions.length, "entry", "entries") +
        " this month"
      : "Nothing recorded yet";

    if (!monthTransactions.length) {
      list.innerHTML =
        '<div class="mf-mini-empty">' +
        iconMarkup("inbox", "w-3.5 h-3.5") +
        "<span>No " +
        (type === "transfer" ? "transfers" : type) +
        " recorded this month.</span>" +
        "</div>";
      return;
    }

    list.innerHTML = monthTransactions.slice(0, 3).map(renderMiniRow).join("");
  }

  function renderMoneySections(transactions) {
    renderMiniList("income", transactions);
    renderMiniList("expense", transactions);
    renderMiniList("transfer", transactions);
  }

  function buildOption(value, label, selected) {
    return (
      '<option value="' +
      escapeHtml(value) +
      '"' +
      (selected ? " selected" : "") +
      ">" +
      escapeHtml(label) +
      "</option>"
    );
  }

  function setSelectOptions(select, options, selectedValue) {
    if (!select) return;
    select.innerHTML = options
      .map(function (option) {
        return buildOption(
          option.value,
          option.label,
          option.value === selectedValue
        );
      })
      .join("");
    if (
      selectedValue &&
      !options.some(function (option) {
        return option.value === selectedValue;
      })
    ) {
      select.value = "";
      return "";
    }
    select.value = selectedValue || "";
    return select.value;
  }

  function populateFilters(accounts, transactions) {
    var accountSelect = byId("mf-filter-account");
    var monthSelect = byId("mf-filter-month");
    var categorySelect = byId("mf-filter-category");
    var accountOptions = [{ value: "", label: "All accounts" }].concat(
      accounts.map(function (account) {
        return { value: account.id, label: account.name };
      })
    );
    var monthSet = Object.create(null);
    monthSet[currentMonthKey] = true;
    transactions.forEach(function (transaction) {
      if (transaction.date) monthSet[getMonthKey(transaction.date)] = true;
    });
    var monthOptions = [{ value: "", label: "All months" }].concat(
      Object.keys(monthSet)
        .filter(Boolean)
        .sort()
        .reverse()
        .map(function (month) {
          return { value: month, label: formatMonth(month) };
        })
    );
    var categories = [];
    transactions.forEach(function (transaction) {
      var category = String(transaction.category || "").trim();
      if (category && categories.indexOf(category) === -1) {
        categories.push(category);
      }
    });
    categories.sort(function (a, b) {
      return a.localeCompare(b);
    });
    var categoryOptions = [{ value: "", label: "All categories" }].concat(
      categories.map(function (category) {
        return { value: category, label: category };
      })
    );

    pageState.accountId = setSelectOptions(
      accountSelect,
      accountOptions,
      pageState.accountId
    );
    pageState.month = setSelectOptions(
      monthSelect,
      monthOptions,
      pageState.month
    );
    pageState.category = setSelectOptions(
      categorySelect,
      categoryOptions,
      pageState.category
    );
  }

  function getFilteredTransactions(transactions) {
    var search = pageState.search.trim().toLowerCase();
    var filtered = transactions.filter(function (transaction) {
      if (pageState.type !== "all" && transaction.type !== pageState.type) {
        return false;
      }
      if (
        pageState.accountId &&
        transaction.accountId !== pageState.accountId &&
        transaction.toAccountId !== pageState.accountId
      ) {
        return false;
      }
      if (
        pageState.month &&
        getMonthKey(transaction.date) !== pageState.month
      ) {
        return false;
      }
      if (pageState.category && transaction.category !== pageState.category) {
        return false;
      }
      if (search) {
        var haystack = [
          transaction.description,
          transaction.notes,
          transaction.category,
          transaction.paymentMethod,
          accountName(transaction.accountId),
          transaction.toAccountId ? accountName(transaction.toAccountId) : "",
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      if (pageState.sort === "date-asc") {
        return a.date.localeCompare(b.date);
      }
      if (pageState.sort === "amount-desc") {
        return Math.abs(Number(b.amount)) - Math.abs(Number(a.amount));
      }
      if (pageState.sort === "amount-asc") {
        return Math.abs(Number(a.amount)) - Math.abs(Number(b.amount));
      }
      if (pageState.sort === "description-asc") {
        return String(a.description || "").localeCompare(
          String(b.description || "")
        );
      }
      if (pageState.sort === "description-desc") {
        return String(b.description || "").localeCompare(
          String(a.description || "")
        );
      }
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return filtered;
  }

  function renderHistoryRow(transaction) {
    var description = transaction.description || typeLabel(transaction.type);
    var category = transaction.category || "Uncategorized";
    var secondary =
      transaction.type === "transfer"
        ? "Transfer · " +
          accountName(transaction.accountId) +
          " → " +
          accountName(transaction.toAccountId)
        : typeLabel(transaction.type) + " · " + accountName(transaction.accountId);
    var amount =
      transaction.type === "income"
        ? "+" + formatMoney(transaction.amount)
        : transaction.type === "expense"
          ? "-" + formatMoney(transaction.amount)
          : formatMoney(transaction.amount);
    var amountClass =
      transaction.type === "income"
        ? "mf-positive"
        : transaction.type === "expense"
          ? "mf-negative"
          : "mf-transfer-amount";

    return (
      '<button type="button" class="mf-tx-row" data-mf-view="' +
      escapeHtml(transaction.id) +
      '" aria-label="View ' +
      escapeHtml(description) +
      '">' +
      '<span class="mf-tx-main">' +
      '<span class="mf-tx-icon mf-tone-' +
      typeTone(transaction.type) +
      '">' +
      iconMarkup(
        categoryIcon(transaction.category, transaction.type),
        "w-4 h-4"
      ) +
      "</span>" +
      '<span class="mf-tx-copy">' +
      "<strong>" +
      escapeHtml(description) +
      "</strong>" +
      "<small>" +
      escapeHtml(secondary) +
      "</small>" +
      "</span>" +
      "</span>" +
      '<span class="mf-tx-account">' +
      escapeHtml(
        transaction.type === "transfer"
          ? accountName(transaction.accountId) +
              " → " +
              accountName(transaction.toAccountId)
          : accountName(transaction.accountId)
      ) +
      "</span>" +
      '<span class="mf-tx-category">' +
      escapeHtml(category) +
      "</span>" +
      '<span class="mf-tx-date">' +
      escapeHtml(formatDate(transaction.date)) +
      "</span>" +
      '<span class="mf-tx-amount ' +
      amountClass +
      '">' +
      escapeHtml(amount) +
      "</span>" +
      iconMarkup("chevron-right", "mf-tx-chevron") +
      "</button>"
    );
  }

  function getPageSequence(current, total) {
    if (total <= 7) {
      var all = [];
      for (var index = 1; index <= total; index += 1) all.push(index);
      return all;
    }
    var pages = [1];
    if (current > 3) pages.push(null);
    for (
      var page = Math.max(2, current - 1);
      page <= Math.min(total - 1, current + 1);
      page += 1
    ) {
      pages.push(page);
    }
    if (current < total - 2) pages.push(null);
    pages.push(total);
    return pages;
  }

  function renderPagination(totalPages) {
    var pagination = byId("mf-pagination");
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }
    var pages = getPageSequence(pageState.page, totalPages);
    var markup =
      '<button type="button" class="mf-page-btn" data-mf-page="prev" aria-label="Previous page"' +
      (pageState.page === 1 ? " disabled" : "") +
      ">" +
      iconMarkup("chevron-left", "w-4 h-4") +
      "</button>";
    pages.forEach(function (page) {
      if (page === null) {
        markup += '<span class="mf-page-gap">…</span>';
        return;
      }
      markup +=
        '<button type="button" class="mf-page-btn' +
        (page === pageState.page ? " active" : "") +
        '" data-mf-page="' +
        page +
        '" aria-label="Page ' +
        page +
        '"' +
        (page === pageState.page ? ' aria-current="page"' : "") +
        ">" +
        page +
        "</button>";
    });
    markup +=
      '<button type="button" class="mf-page-btn" data-mf-page="next" aria-label="Next page"' +
      (pageState.page === totalPages ? " disabled" : "") +
      ">" +
      iconMarkup("chevron-right", "w-4 h-4") +
      "</button>";
    pagination.innerHTML = markup;
  }

  function renderHistory(transactions) {
    var list = byId("mf-history-list");
    var summary = byId("mf-history-summary");
    var filtered = getFilteredTransactions(transactions);
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    pageState.page = Math.min(Math.max(1, pageState.page), totalPages);
    var start = (pageState.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (!filtered.length) {
      summary.textContent = transactions.length
        ? "No transactions match the current filters."
        : "Your recorded income, expenses and transfers will appear here.";
      list.innerHTML =
        '<div class="mf-empty">' +
        '<span class="mf-empty-icon">' +
        iconMarkup(transactions.length ? "search-x" : "receipt-text", "w-5 h-5") +
        "</span>" +
        "<h3>" +
        (transactions.length ? "No matching transactions" : "No transactions yet") +
        "</h3>" +
        "<p>" +
        (transactions.length
          ? "Try clearing a filter or searching for a different description."
          : "Record your first income or expense to start building a clear financial history.") +
        "</p>" +
        (transactions.length
          ? '<button type="button" class="mf-btn mf-btn-ghost" id="mf-empty-clear">Clear filters</button>'
          : '<button type="button" class="mf-btn mf-btn-primary" data-mf-new="expense">' +
            iconMarkup("plus", "w-4 h-4") +
            "<span>Add transaction</span>" +
            "</button>") +
        "</div>";
      renderPagination(0);
      refreshIcons();
      return;
    }

    var end = Math.min(start + PAGE_SIZE, filtered.length);
    summary.textContent =
      "Showing " +
      (start + 1) +
      "–" +
      end +
      " of " +
      filtered.length +
      " " +
      pluralize(filtered.length, "transaction") +
      ".";
    list.innerHTML =
      '<div class="mf-table-head" aria-hidden="true">' +
      "<span>Transaction</span>" +
      "<span>Account</span>" +
      "<span>Category</span>" +
      "<span>Date</span>" +
      "<span>Amount</span>" +
      "<span></span>" +
      "</div>" +
      '<div class="mf-table-body">' +
      pageItems.map(renderHistoryRow).join("") +
      "</div>";
    renderPagination(totalPages);
    refreshIcons();
  }

  function syncTypeTabs() {
    document.querySelectorAll("[data-mf-type]").forEach(function (button) {
      var isActive = button.getAttribute("data-mf-type") === pageState.type;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function renderAll() {
    var accounts = getAccounts();
    var transactions = getTransactions();
    accountMap = Object.create(null);
    accounts.forEach(function (account) {
      accountMap[account.id] = account;
    });

    setStorageStatus();
    renderOverview(accounts, transactions);
    renderAccounts(accounts, transactions);
    renderMoneySections(transactions);
    populateFilters(accounts, transactions);
    syncTypeTabs();
    renderHistory(transactions);
    refreshIcons();
  }

  function showModal(id) {
    var modal = byId(id);
    if (!modal) return;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    refreshIcons();
  }

  function closeModal(id) {
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
    var iconNames = {
      success: "check",
      error: "x",
      info: "info",
      warning: "alert-triangle",
    };
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toast.className = "toast " + toastType + " show";
    if (toastIcon) {
      toastIcon.className =
        "mf-toast-icon is-" + toastType + " flex items-center justify-center flex-shrink-0";
      toastIcon.innerHTML = iconMarkup(
        iconNames[toastType] || "check",
        "w-5 h-5"
      );
    }
    refreshIcons();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 3400);
  }

  function setFieldOptions(select, options, selectedValue) {
    if (!select) return "";
    var values = options.map(function (option) {
      return option.value;
    });
    select.innerHTML = options
      .map(function (option) {
        return buildOption(
          option.value,
          option.label,
          option.value === selectedValue
        );
      })
      .join("");
    if (selectedValue && values.indexOf(selectedValue) !== -1) {
      select.value = selectedValue;
      return selectedValue;
    }
    select.value = options.length ? options[0].value : "";
    return select.value;
  }

  function fillTransactionAccountSelects(selectedAccount, selectedDestination) {
    var accounts = getAccounts();
    var source = byId("mf-tx-account");
    var destination = byId("mf-tx-destination");
    var accountOptions = accounts.map(function (account) {
      return { value: account.id, label: account.name };
    });
    if (!accountOptions.length) {
      accountOptions = [{ value: "", label: "No accounts available" }];
    }
    var sourceValue = setFieldOptions(
      source,
      accountOptions,
      selectedAccount || accountOptions[0].value
    );
    var destinationOptions = [{ value: "", label: "Select destination" }].concat(
      accounts.map(function (account) {
        return { value: account.id, label: account.name };
      })
    );
    setFieldOptions(
      destination,
      destinationOptions,
      selectedDestination || ""
    );
    if (source) source.value = sourceValue;
    syncDestinationOptions(selectedDestination);
  }

  function syncDestinationOptions(preferredValue) {
    var source = byId("mf-tx-account");
    var destination = byId("mf-tx-destination");
    if (!source || !destination) return;
    var current = preferredValue || destination.value;
    var options = [{ value: "", label: "Select destination" }].concat(
      getAccounts()
        .filter(function (account) {
          return account.id !== source.value;
        })
        .map(function (account) {
          return { value: account.id, label: account.name };
        })
    );
    setFieldOptions(destination, options, current);
  }

  function getSelectedTransactionType() {
    var selected = document.querySelector(
      'input[name="mf-transaction-type"]:checked'
    );
    return selected ? selected.value : "expense";
  }

  function updateTransactionTypeUI() {
    var type = getSelectedTransactionType();
    var destinationField = byId("mf-destination-field");
    var categoryField = byId("mf-category-field");
    var title = byId("mf-transaction-title");
    var subtitle = byId("mf-transaction-subtitle");
    var submit = byId("mf-transaction-submit");
    var editing = Boolean(pageState.editingTransactionId);
    destinationField.hidden = type !== "transfer";
    categoryField.hidden = type === "transfer";
    title.textContent = (editing ? "Edit " : "Add ") + typeLabel(type).toLowerCase();
    subtitle.textContent =
      type === "transfer"
        ? "Move money between two accounts without changing your total balance."
        : type === "income"
          ? "Record money received and add it to an account balance."
          : "Record money spent and subtract it from an account balance.";
    submit.textContent = editing ? "Save changes" : "Add " + typeLabel(type).toLowerCase();
    if (type === "transfer") syncDestinationOptions();
  }

  function ensureSelectOption(select, value) {
    if (!select || !value) return;
    var exists = Array.prototype.some.call(select.options, function (option) {
      return option.value === value;
    });
    if (!exists) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value;
  }

  function openTransactionModal(type, transactionId) {
    if (!getAccounts().length) {
      showToast(
        "Add an account first",
        "Create an account before recording income, expenses or transfers.",
        "info"
      );
      openAccountModal();
      return;
    }
    var transaction = transactionId ? data.getTransaction(transactionId) : null;
    pageState.editingTransactionId = transaction ? transaction.id : null;
    var selectedType = transaction ? transaction.type : type || "expense";
    var form = byId("mf-transaction-form");
    form.reset();
    clearMessage("mf-transaction-error");
    byId("mf-transaction-id").value = transaction ? transaction.id : "";
    document
      .querySelectorAll('input[name="mf-transaction-type"]')
      .forEach(function (input) {
        input.checked = input.value === selectedType;
      });
    byId("mf-tx-description").value = transaction
      ? transaction.description || ""
      : "";
    byId("mf-tx-amount").value = transaction ? transaction.amount : "";
    byId("mf-tx-date").value = transaction ? transaction.date : getTodayKey();
    fillTransactionAccountSelects(
      transaction ? transaction.accountId : "",
      transaction ? transaction.toAccountId : ""
    );
    byId("mf-tx-category").value = transaction
      ? transaction.category || ""
      : "";
    ensureSelectOption(
      byId("mf-tx-method"),
      transaction ? transaction.paymentMethod || "" : ""
    );
    byId("mf-tx-notes").value = transaction ? transaction.notes || "" : "";
    updateTransactionTypeUI();
    closeModal("mf-details-modal");
    showModal("mf-transaction-modal");
    window.setTimeout(function () {
      byId("mf-tx-description").focus();
    }, 80);
  }

  function submitTransaction(event) {
    event.preventDefault();
    clearMessage("mf-transaction-error");
    var type = getSelectedTransactionType();
    var description = byId("mf-tx-description").value.trim();
    var amount = Number(byId("mf-tx-amount").value);
    var date = byId("mf-tx-date").value;
    var accountId = byId("mf-tx-account").value;
    var toAccountId = byId("mf-tx-destination").value;
    var category = byId("mf-tx-category").value.trim();
    var paymentMethod = byId("mf-tx-method").value;
    var notes = byId("mf-tx-notes").value.trim();

    if (!description) {
      showMessage("mf-transaction-error", "Enter a description for this transaction.");
      byId("mf-tx-description").focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("mf-transaction-error", "Enter an amount greater than zero.");
      byId("mf-tx-amount").focus();
      return;
    }
    if (!date) {
      showMessage("mf-transaction-error", "Choose a valid transaction date.");
      byId("mf-tx-date").focus();
      return;
    }
    if (!accountId) {
      showMessage("mf-transaction-error", "Choose the account for this transaction.");
      byId("mf-tx-account").focus();
      return;
    }
    if (type === "transfer" && !toAccountId) {
      showMessage("mf-transaction-error", "Choose a destination account.");
      byId("mf-tx-destination").focus();
      return;
    }
    if (type === "transfer" && toAccountId === accountId) {
      showMessage(
        "mf-transaction-error",
        "Choose two different accounts for a transfer."
      );
      byId("mf-tx-destination").focus();
      return;
    }

    var payload = {
      type: type,
      description: description,
      amount: roundMoney(amount),
      date: date,
      accountId: accountId,
      category: type === "transfer" ? "" : category,
      paymentMethod: paymentMethod,
      notes: notes,
    };
    if (type === "transfer") payload.toAccountId = toAccountId;

    try {
      if (pageState.editingTransactionId) {
        data.updateTransaction(pageState.editingTransactionId, payload);
      } else if (type === "income") {
        data.createIncome(payload);
      } else if (type === "expense") {
        data.createExpense(payload);
      } else {
        data.createTransfer(payload);
      }
      closeModal("mf-transaction-modal");
      showToast(
        pageState.editingTransactionId ? "Transaction updated" : typeLabel(type) + " added",
        description + " has been saved.",
        "success"
      );
    } catch (error) {
      showMessage(
        "mf-transaction-error",
        error && error.message
          ? error.message
          : "The transaction could not be saved."
      );
    }
  }

  function openAccountModal(accountId) {
    var account = accountId ? data.getAccount(accountId) : null;
    pageState.editingAccountId = account ? account.id : null;
    var form = byId("mf-account-form");
    form.reset();
    clearMessage("mf-account-error");
    byId("mf-account-id").value = account ? account.id : "";
    byId("mf-account-name").value = account ? account.name : "";
    byId("mf-account-type").value = account ? account.type : "bank";
    byId("mf-account-opening").value = account ? account.openingBalance : "0";
    byId("mf-account-date").value = account
      ? account.openingBalanceDate
      : getTodayKey();
    byId("mf-account-description").value = account
      ? account.description || ""
      : "";
    byId("mf-account-title").textContent = account
      ? "Edit account"
      : "Add an account";
    byId("mf-account-subtitle").textContent = account
      ? "Update the account details. Existing transactions remain linked."
      : "Track a bank, cash, savings or mobile money balance.";
    byId("mf-account-submit").textContent = account
      ? "Save changes"
      : "Create account";
    showModal("mf-account-modal");
    window.setTimeout(function () {
      byId("mf-account-name").focus();
    }, 80);
  }

  function submitAccount(event) {
    event.preventDefault();
    clearMessage("mf-account-error");
    var name = byId("mf-account-name").value.trim();
    var type = byId("mf-account-type").value;
    var openingValue = byId("mf-account-opening").value;
    var openingBalance = openingValue === "" ? 0 : Number(openingValue);
    var openingDate = byId("mf-account-date").value;
    var description = byId("mf-account-description").value.trim();

    if (!name) {
      showMessage("mf-account-error", "Enter a name for this account.");
      byId("mf-account-name").focus();
      return;
    }
    if (!type) {
      showMessage("mf-account-error", "Choose an account type.");
      byId("mf-account-type").focus();
      return;
    }
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      showMessage(
        "mf-account-error",
        "Opening balance must be zero or a positive amount."
      );
      byId("mf-account-opening").focus();
      return;
    }
    if (!openingDate) {
      showMessage("mf-account-error", "Choose an opening balance date.");
      byId("mf-account-date").focus();
      return;
    }

    var payload = {
      name: name,
      type: type,
      openingBalance: roundMoney(openingBalance),
      openingBalanceDate: openingDate,
      description: description,
    };

    try {
      if (pageState.editingAccountId) {
        data.updateAccount(pageState.editingAccountId, payload);
      } else {
        data.createAccount(payload);
      }
      closeModal("mf-account-modal");
      showToast(
        pageState.editingAccountId ? "Account updated" : "Account created",
        name + " is ready to use.",
        "success"
      );
    } catch (error) {
      showMessage(
        "mf-account-error",
        error && error.message
          ? error.message
          : "The account could not be saved."
      );
    }
  }

  function detailRow(label, value) {
    return (
      "<div class=\"mf-detail-row\"><dt>" +
      escapeHtml(label) +
      "</dt><dd>" +
      escapeHtml(value) +
      "</dd></div>"
    );
  }

  function openTransactionDetails(transactionId) {
    var transaction = data.getTransaction(transactionId);
    if (!transaction) {
      showToast("Transaction not found", "It may have already been removed.", "error");
      return;
    }
    var amount =
      transaction.type === "income"
        ? "+" + formatMoney(transaction.amount)
        : transaction.type === "expense"
          ? "-" + formatMoney(transaction.amount)
          : formatMoney(transaction.amount);
    var amountClass =
      transaction.type === "income"
        ? "mf-positive"
        : transaction.type === "expense"
          ? "mf-negative"
          : "mf-transfer-amount";
    var detailRows = [];
    if (transaction.type === "transfer") {
      detailRows.push(detailRow("From", accountName(transaction.accountId)));
      detailRows.push(detailRow("To", accountName(transaction.toAccountId)));
    } else {
      detailRows.push(detailRow("Account", accountName(transaction.accountId)));
      detailRows.push(detailRow("Category", transaction.category || "Uncategorized"));
    }
    detailRows.push(detailRow("Date", formatDate(transaction.date, {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    })));
    if (transaction.paymentMethod) {
      detailRows.push(detailRow("Payment method", transaction.paymentMethod));
    }
    detailRows.push(detailRow("Notes", transaction.notes || "No notes added"));
    detailRows.push(
      detailRow(
        "Recorded",
        transaction.createdAt
          ? formatDate(
              String(transaction.createdAt).slice(0, 10),
              { month: "short", day: "numeric", year: "numeric" }
            )
          : "—"
      )
    );

    byId("mf-details-content").innerHTML =
      '<div class="mf-detail-hero">' +
      '<span class="mf-detail-icon mf-tone-' +
      typeTone(transaction.type) +
      '">' +
      iconMarkup(
        categoryIcon(transaction.category, transaction.type),
        "w-6 h-6"
      ) +
      "</span>" +
      '<span class="mf-detail-type">' +
      typeLabel(transaction.type) +
      "</span>" +
      '<h3 class="mf-detail-title">' +
      escapeHtml(transaction.description || typeLabel(transaction.type)) +
      "</h3>" +
      '<strong class="mf-detail-amount ' +
      amountClass +
      '">' +
      escapeHtml(amount) +
      "</strong>" +
      "</div>" +
      '<dl class="mf-detail-list">' +
      detailRows.join("") +
      "</dl>" +
      '<div class="mf-modal-actions">' +
      '<button type="button" class="mf-btn mf-btn-ghost" data-mf-close="mf-details-modal">Close</button>' +
      '<button type="button" class="mf-btn mf-btn-soft" data-mf-edit="' +
      escapeHtml(transaction.id) +
      '">' +
      iconMarkup("pencil", "w-4 h-4") +
      "<span>Edit</span>" +
      "</button>" +
      '<button type="button" class="mf-btn mf-btn-danger" data-mf-delete="' +
      escapeHtml(transaction.id) +
      '">' +
      iconMarkup("trash-2", "w-4 h-4") +
      "<span>Delete</span>" +
      "</button>" +
      "</div>";
    showModal("mf-details-modal");
    refreshIcons();
  }

  function askConfirm(options) {
    byId("mf-confirm-title").textContent = options.title;
    byId("mf-confirm-copy").textContent = options.message;
    var action = byId("mf-confirm-action");
    action.textContent = options.confirmLabel || "Delete";
    action.className =
      "mf-btn " + (options.primary ? "mf-btn-primary" : "mf-btn-danger");
    confirmHandler = options.onConfirm;
    showModal("mf-confirm-modal");
  }

  function confirmTransactionDelete(transactionId) {
    var transaction = data.getTransaction(transactionId);
    if (!transaction) return;
    var description = transaction.description || typeLabel(transaction.type);
    askConfirm({
      title: "Delete transaction?",
      message:
        '"' +
        description +
        '" will be permanently removed and account balances will update.',
      confirmLabel: "Delete transaction",
      onConfirm: function () {
        try {
          data.deleteTransaction(transactionId);
          closeModal("mf-details-modal");
          showToast("Transaction deleted", description + " was removed.", "success");
        } catch (error) {
          showToast(
            "Could not delete transaction",
            error && error.message ? error.message : "Please try again.",
            "error"
          );
        }
      },
    });
  }

  function confirmAccountDelete(accountId) {
    var account = data.getAccount(accountId);
    if (!account) return;
    var references = data.getTransactions({ accountId: accountId });
    if (references.length) {
      showToast(
        "Account is in use",
        "Remove or move its transactions before deleting this account.",
        "warning"
      );
      return;
    }
    askConfirm({
      title: "Delete account?",
      message:
        '"' +
        account.name +
        '" will be permanently removed. This cannot be undone.',
      confirmLabel: "Delete account",
      onConfirm: function () {
        try {
          data.deleteAccount(accountId);
          showToast("Account deleted", account.name + " was removed.", "success");
        } catch (error) {
          showToast(
            "Could not delete account",
            error && error.message ? error.message : "Please try again.",
            "error"
          );
        }
      },
    });
  }

  function clearFilters() {
    pageState.type = "all";
    pageState.search = "";
    pageState.accountId = "";
    pageState.month = "";
    pageState.category = "";
    pageState.sort = "date-desc";
    pageState.page = 1;
    byId("mf-search").value = "";
    byId("mf-filter-account").value = "";
    byId("mf-filter-month").value = "";
    byId("mf-filter-category").value = "";
    byId("mf-sort").value = "date-desc";
    syncTypeTabs();
    renderHistory(getTransactions());
  }

  function handleDocumentClick(event) {
    var closeButton = event.target.closest("[data-mf-close]");
    if (closeButton) {
      closeModal(closeButton.getAttribute("data-mf-close"));
      return;
    }

    var newButton = event.target.closest("[data-mf-new]");
    if (newButton) {
      openTransactionModal(newButton.getAttribute("data-mf-new"));
      return;
    }

    var addAccountButton = event.target.closest("[data-mf-add-account]");
    if (addAccountButton) {
      openAccountModal();
      return;
    }

    var typeButton = event.target.closest("[data-mf-type]");
    if (typeButton) {
      pageState.type = typeButton.getAttribute("data-mf-type");
      pageState.page = 1;
      syncTypeTabs();
      renderHistory(getTransactions());
      return;
    }

    var viewButton = event.target.closest("[data-mf-view]");
    if (viewButton) {
      openTransactionDetails(viewButton.getAttribute("data-mf-view"));
      return;
    }

    var editButton = event.target.closest("[data-mf-edit]");
    if (editButton) {
      openTransactionModal(null, editButton.getAttribute("data-mf-edit"));
      return;
    }

    var deleteButton = event.target.closest("[data-mf-delete]");
    if (deleteButton) {
      confirmTransactionDelete(deleteButton.getAttribute("data-mf-delete"));
      return;
    }

    var accountEditButton = event.target.closest("[data-mf-account-edit]");
    if (accountEditButton) {
      openAccountModal(accountEditButton.getAttribute("data-mf-account-edit"));
      return;
    }

    var accountDeleteButton = event.target.closest(
      "[data-mf-account-delete]"
    );
    if (accountDeleteButton) {
      confirmAccountDelete(
        accountDeleteButton.getAttribute("data-mf-account-delete")
      );
      return;
    }

    var pageButton = event.target.closest("[data-mf-page]");
    if (pageButton && !pageButton.disabled) {
      var target = pageButton.getAttribute("data-mf-page");
      var totalPages = Math.max(
        1,
        Math.ceil(getFilteredTransactions(getTransactions()).length / PAGE_SIZE)
      );
      if (target === "prev") {
        pageState.page = Math.max(1, pageState.page - 1);
      } else if (target === "next") {
        pageState.page = Math.min(totalPages, pageState.page + 1);
      } else {
        pageState.page = Number(target);
      }
      renderHistory(getTransactions());
      byId("mf-history-list").scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      return;
    }

    if (event.target.closest("#mf-clear-filters, #mf-empty-clear")) {
      clearFilters();
      return;
    }

    if (
      event.target.classList &&
      event.target.classList.contains("modal") &&
      event.target.classList.contains("mf-overlay-modal")
    ) {
      closeModal(event.target.id);
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);

    byId("mf-search").addEventListener("input", function (event) {
      pageState.search = event.target.value;
      pageState.page = 1;
      renderHistory(getTransactions());
    });
    byId("mf-filter-account").addEventListener("change", function (event) {
      pageState.accountId = event.target.value;
      pageState.page = 1;
      renderHistory(getTransactions());
    });
    byId("mf-filter-month").addEventListener("change", function (event) {
      pageState.month = event.target.value;
      pageState.page = 1;
      renderHistory(getTransactions());
    });
    byId("mf-filter-category").addEventListener("change", function (event) {
      pageState.category = event.target.value;
      pageState.page = 1;
      renderHistory(getTransactions());
    });
    byId("mf-sort").addEventListener("change", function (event) {
      pageState.sort = event.target.value;
      pageState.page = 1;
      renderHistory(getTransactions());
    });

    document
      .querySelectorAll('input[name="mf-transaction-type"]')
      .forEach(function (input) {
        input.addEventListener("change", updateTransactionTypeUI);
      });
    byId("mf-tx-account").addEventListener("change", function () {
      syncDestinationOptions();
    });
    byId("mf-transaction-form").addEventListener("submit", submitTransaction);
    byId("mf-account-form").addEventListener("submit", submitAccount);

    byId("mf-confirm-action").addEventListener("click", function () {
      var handler = confirmHandler;
      confirmHandler = null;
      closeModal("mf-confirm-modal");
      if (handler) handler();
    });

    document.querySelectorAll(".mf-overlay-modal").forEach(function (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAllModals();
      }
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
    document.title = "Gabsweb CashFlow · My Finances";
    var pageTitle = byId("page-title");
    if (pageTitle) pageTitle.textContent = "My Finances";
    bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

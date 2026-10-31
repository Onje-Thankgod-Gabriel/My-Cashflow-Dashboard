/* Gabsweb CashFlow — Reports & Insights */
(function () {
  "use strict";

  var data = window.GabswebCashFlowData;
  if (!data) return;

  var MONTHS_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  var DAY_MS = 86400000;
  var CHART_COLORS = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#3b82f6",
    "#14b8a6",
    "#f97316",
    "#ec4899",
    "#64748b"
  ];

  var charts = Object.create(null);
  var state = {
    preset: "this-month",
    customStart: null,
    customEnd: null,
    categoryFocus: "all"
  };
  var lastReport = null;
  var renderTimer = null;

  /* ---------- Basic helpers ---------- */

  function byId(id) {
    return document.getElementById(id);
  }

  function roundMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function currencyCode() {
    try {
      return data.getSettings().currency || data.DEFAULT_CURRENCY;
    } catch (error) {
      return data.DEFAULT_CURRENCY;
    }
  }

  function formatMoney(amount) {
    return data.formatCurrency(Number(amount) || 0, { currency: currencyCode() });
  }

  function formatSignedMoney(amount) {
    var number = roundMoney(amount);
    if (number === 0) return formatMoney(0);
    return (number > 0 ? "+" : "−") + formatMoney(Math.abs(number));
  }

  function formatAxisMoney(amount) {
    try {
      return data.formatCurrency(Number(amount) || 0, {
        currency: currencyCode(),
        notation: "compact",
        maximumFractionDigits: 1
      });
    } catch (error) {
      return formatMoney(amount);
    }
  }

  function formatPercent(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "—";
    }
    return Number(value).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function parseDateKey(key) {
    if (typeof key !== "string") return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
  }

  function keyFromDate(date) {
    return (
      date.getUTCFullYear() +
      "-" +
      pad2(date.getUTCMonth() + 1) +
      "-" +
      pad2(date.getUTCDate())
    );
  }

  function addDaysKey(key, days) {
    var date = parseDateKey(key);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return keyFromDate(date);
  }

  function shiftMonthKey(key, months) {
    var date = parseDateKey(key);
    if (!date) return null;
    var day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    var lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return keyFromDate(date);
  }

  function shiftYearKey(key, years) {
    var date = parseDateKey(key);
    if (!date) return null;
    var month = date.getUTCMonth();
    var day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    var lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
    date.setUTCMonth(month);
    date.setUTCDate(Math.min(day, lastDay));
    return keyFromDate(date);
  }

  function monthStart(key) {
    return key.slice(0, 7) + "-01";
  }

  function monthEnd(key) {
    var date = parseDateKey(monthStart(key));
    if (!date) return null;
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(0);
    return keyFromDate(date);
  }

  function diffDays(start, end) {
    var startDate = parseDateKey(start);
    var endDate = parseDateKey(end);
    if (!startDate || !endDate) return 0;
    return Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
  }

  function formatShortDate(key) {
    var date = parseDateKey(key);
    if (!date) return "";
    return MONTHS_SHORT[date.getUTCMonth()] + " " + date.getUTCDate();
  }

  function formatLongDate(key) {
    var date = parseDateKey(key);
    if (!date) return "";
    return (
      MONTHS_SHORT[date.getUTCMonth()] +
      " " +
      date.getUTCDate() +
      ", " +
      date.getUTCFullYear()
    );
  }

  function formatRangeLabel(start, end) {
    var startDate = parseDateKey(start);
    var endDate = parseDateKey(end);
    if (!startDate || !endDate) return "—";
    var sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
    var left =
      MONTHS_SHORT[startDate.getUTCMonth()] +
      " " +
      startDate.getUTCDate() +
      (sameYear ? "" : ", " + startDate.getUTCFullYear());
    var right =
      MONTHS_SHORT[endDate.getUTCMonth()] +
      " " +
      endDate.getUTCDate() +
      ", " +
      endDate.getUTCFullYear();
    return left + " – " + right;
  }

  function monthLabel(key) {
    var date = parseDateKey(key);
    if (!date) return key;
    return (
      MONTHS_SHORT[date.getUTCMonth()] +
      " " +
      String(date.getUTCFullYear()).slice(2)
    );
  }

  /* ---------- Period resolution ---------- */

  function resolveRange() {
    var today = data.todayKey();
    var range = null;

    if (state.preset === "last-month") {
      var lastStart = monthStart(shiftMonthKey(today, -1));
      var lastEnd = monthEnd(lastStart);
      var beforeStart = monthStart(shiftMonthKey(lastStart, -1));
      range = {
        start: lastStart,
        end: lastEnd,
        prevStart: beforeStart,
        prevEnd: monthEnd(beforeStart),
        comparison: "Compared with the month before"
      };
    } else if (state.preset === "last-3-months") {
      var threeStart = monthStart(shiftMonthKey(today, -2));
      var length = diffDays(threeStart, today) + 1;
      var prevEnd = addDaysKey(threeStart, -1);
      range = {
        start: threeStart,
        end: today,
        prevStart: addDaysKey(prevEnd, -(length - 1)),
        prevEnd: prevEnd,
        comparison: "Compared with the previous three months"
      };
    } else if (state.preset === "this-year") {
      var yearStart = today.slice(0, 4) + "-01-01";
      range = {
        start: yearStart,
        end: today,
        prevStart: shiftYearKey(yearStart, -1),
        prevEnd: shiftYearKey(today, -1),
        comparison: "Compared with the same period last year"
      };
    } else if (
      state.preset === "custom" &&
      state.customStart &&
      state.customEnd &&
      data.isDateOnly(state.customStart) &&
      data.isDateOnly(state.customEnd)
    ) {
      var customStart = state.customStart;
      var customEnd = state.customEnd;
      if (customStart > customEnd) {
        customStart = state.customEnd;
        customEnd = state.customStart;
      }
      var span = diffDays(customStart, customEnd) + 1;
      var customPrevEnd = addDaysKey(customStart, -1);
      range = {
        start: customStart,
        end: customEnd,
        prevStart: addDaysKey(customPrevEnd, -(span - 1)),
        prevEnd: customPrevEnd,
        comparison: "Compared with the previous period of equal length"
      };
    } else {
      var monthFirst = monthStart(today);
      var monthLength = diffDays(monthFirst, today) + 1;
      var prevMonthStart = monthStart(shiftMonthKey(monthFirst, -1));
      var prevMonthEnd = addDaysKey(prevMonthStart, monthLength - 1);
      var prevMonthLimit = monthEnd(prevMonthStart);
      if (prevMonthEnd > prevMonthLimit) prevMonthEnd = prevMonthLimit;
      range = {
        start: monthFirst,
        end: today,
        prevStart: prevMonthStart,
        prevEnd: prevMonthEnd,
        comparison: "Compared with the same days last month"
      };
    }

    range.preset = state.preset;
    range.label = formatRangeLabel(range.start, range.end);
    return range;
  }

  /* ---------- Data preparation ---------- */

  function categoryName(transaction) {
    var value = transaction.category ? String(transaction.category).trim() : "";
    return value || "Uncategorised";
  }

  function sumTransactions(transactions, type) {
    return roundMoney(
      transactions.reduce(function (total, transaction) {
        if (transaction.type !== type) return total;
        return total + Number(transaction.amount || 0);
      }, 0)
    );
  }

  function sumMovements(movements, type) {
    return roundMoney(
      movements.reduce(function (total, movement) {
        if (movement.type !== type) return total;
        return total + Number(movement.amount || 0);
      }, 0)
    );
  }

  function analyseCategories(currentTransactions, previousTransactions, type) {
    var currentMap = Object.create(null);
    var previousMap = Object.create(null);

    currentTransactions.forEach(function (transaction) {
      if (transaction.type !== type) return;
      var name = categoryName(transaction);
      if (!currentMap[name]) currentMap[name] = { amount: 0, count: 0 };
      currentMap[name].amount += Number(transaction.amount || 0);
      currentMap[name].count += 1;
    });

    previousTransactions.forEach(function (transaction) {
      if (transaction.type !== type) return;
      var name = categoryName(transaction);
      if (!previousMap[name]) previousMap[name] = { amount: 0, count: 0 };
      previousMap[name].amount += Number(transaction.amount || 0);
      previousMap[name].count += 1;
    });

    var total = 0;
    Object.keys(currentMap).forEach(function (name) {
      total += currentMap[name].amount;
    });
    total = roundMoney(total);

    var list = Object.keys(currentMap)
      .map(function (name) {
        var amount = roundMoney(currentMap[name].amount);
        var previousAmount = roundMoney((previousMap[name] || {}).amount || 0);
        return {
          category: name,
          amount: amount,
          count: currentMap[name].count,
          previousAmount: previousAmount,
          change: roundMoney(amount - previousAmount),
          changePercent:
            previousAmount > 0
              ? roundMoney(((amount - previousAmount) / previousAmount) * 100)
              : null,
          percentage: total > 0 ? roundMoney((amount / total) * 100) : null
        };
      })
      .sort(function (a, b) {
        return b.amount - a.amount;
      });

    return { total: total, list: list, previousTotal: 0 };
  }

  function buildSeries(start, end, transactions) {
    var days = diffDays(start, end) + 1;
    var mode = days <= 45 ? "day" : days <= 186 ? "week" : "month";
    var buckets = [];
    var cursor;

    if (mode === "day") {
      for (cursor = start; cursor <= end; cursor = addDaysKey(cursor, 1)) {
        buckets.push({
          start: cursor,
          end: cursor,
          label: formatShortDate(cursor),
          income: 0,
          expenses: 0,
          net: 0
        });
      }
    } else if (mode === "week") {
      cursor = start;
      while (cursor <= end) {
        var weekEnd = addDaysKey(cursor, 6);
        if (weekEnd > end) weekEnd = end;
        buckets.push({
          start: cursor,
          end: weekEnd,
          label: formatShortDate(cursor),
          income: 0,
          expenses: 0,
          net: 0
        });
        cursor = addDaysKey(weekEnd, 1);
      }
    } else {
      cursor = monthStart(start);
      while (cursor <= end) {
        var monthFinish = monthEnd(cursor);
        var bucketStart = cursor < start ? start : cursor;
        var bucketEnd = monthFinish > end ? end : monthFinish;
        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: monthLabel(cursor),
          income: 0,
          expenses: 0,
          net: 0
        });
        cursor = addDaysKey(monthFinish, 1);
      }
    }

    transactions.forEach(function (transaction) {
      if (transaction.type !== "income" && transaction.type !== "expense") return;
      for (var index = 0; index < buckets.length; index += 1) {
        var bucket = buckets[index];
        if (transaction.date < bucket.start) continue;
        if (transaction.date > bucket.end) continue;
        if (transaction.type === "income") {
          bucket.income += Number(transaction.amount || 0);
        } else {
          bucket.expenses += Number(transaction.amount || 0);
        }
        break;
      }
    });

    buckets.forEach(function (bucket) {
      bucket.income = roundMoney(bucket.income);
      bucket.expenses = roundMoney(bucket.expenses);
      bucket.net = roundMoney(bucket.income - bucket.expenses);
    });

    return { mode: mode, buckets: buckets };
  }

  function buildAllocations(range, transactions) {
    var startMonth = range.start.slice(0, 7);
    var endMonth = range.end.slice(0, 7);
    var plans = data
      .getAllocations({})
      .filter(function (allocation) {
        return (
          allocation.financialMonth >= startMonth &&
          allocation.financialMonth <= endMonth &&
          allocation.status !== "cancelled"
        );
      })
      .sort(function (a, b) {
        if (a.financialMonth !== b.financialMonth) {
          return a.financialMonth < b.financialMonth ? -1 : 1;
        }
        return String(a.name).localeCompare(String(b.name));
      });

    var actualByAllocation = Object.create(null);
    var linkedTotal = 0;

    transactions.forEach(function (transaction) {
      if (transaction.type !== "expense") return;
      if (!transaction.allocationId) return;
      linkedTotal += Number(transaction.amount || 0);
      if (!actualByAllocation[transaction.allocationId]) {
        actualByAllocation[transaction.allocationId] = 0;
      }
      actualByAllocation[transaction.allocationId] += Number(
        transaction.amount || 0
      );
    });

    var totalPlanned = 0;
    var totalActual = 0;
    var rows = plans.map(function (allocation) {
      var planned = roundMoney(Number(allocation.plannedAmount || 0));
      var actual = roundMoney(actualByAllocation[allocation.id] || 0);
      totalPlanned += planned;
      totalActual += actual;
      return {
        id: allocation.id,
        name: allocation.name,
        financialMonth: allocation.financialMonth,
        planned: planned,
        actual: actual,
        remaining: roundMoney(planned - actual),
        usage:
          planned > 0 ? roundMoney((actual / planned) * 100) : null,
        status: allocation.status
      };
    });

    totalPlanned = roundMoney(totalPlanned);
    totalActual = roundMoney(totalActual);

    return {
      rows: rows,
      totalPlanned: totalPlanned,
      totalActual: totalActual,
      totalRemaining: roundMoney(totalPlanned - totalActual),
      linkedTotal: roundMoney(linkedTotal),
      unlinkedTotal: roundMoney(
        sumTransactions(transactions, "expense") - linkedTotal
      ),
      monthCount: rows.reduce(function (months, row) {
        if (months.indexOf(row.financialMonth) === -1) {
          months.push(row.financialMonth);
        }
        return months;
      }, []).length
    };
  }

  function buildSavings(movements) {
    var plans = data.getSavingsPlans();
    var progressList = plans.map(function (plan) {
      var progress = data.getSavingsPlanProgress(plan.id);
      return {
        id: plan.id,
        name: plan.name,
        purpose: plan.purpose || "",
        status: plan.status,
        saved: progress ? progress.savedAmount : 0,
        target: progress ? progress.targetAmount : 0,
        remaining: progress ? progress.remainingAmount : 0,
        percentage: progress ? progress.percentage : null,
        progressAvailable: progress ? progress.progressAvailable : false
      };
    });

    var activeProgress = progressList.filter(function (plan) {
      return plan.progressAvailable;
    });
    var completed = progressList.filter(function (plan) {
      return (
        plan.progressAvailable &&
        (plan.status === "completed" || plan.saved >= plan.target)
      );
    });

    return {
      totalBalance: data.getSavingsBalance(),
      contributions: sumMovements(movements, "contribution"),
      withdrawals: sumMovements(movements, "withdrawal"),
      contributionCount: movements.filter(function (movement) {
        return movement.type === "contribution";
      }).length,
      withdrawalCount: movements.filter(function (movement) {
        return movement.type === "withdrawal";
      }).length,
      plans: progressList,
      activeProgress: activeProgress,
      completedCount: completed.length,
      movements: movements
    };
  }

  function buildComparison(current, previous) {
    var items = [
      {
        label: "Income",
        current: current.income,
        previous: previous.income,
        favourableWhenUp: true
      },
      {
        label: "Expenses",
        current: current.expenses,
        previous: previous.expenses,
        favourableWhenUp: false
      },
      {
        label: "Net income",
        current: current.net,
        previous: previous.net,
        favourableWhenUp: true
      },
      {
        label: "Savings contributions",
        current: current.savingsContributions,
        previous: previous.savingsContributions,
        favourableWhenUp: true
      }
    ];

    return {
      items: items,
      hasActivity:
        items.some(function (item) {
          return item.current !== 0 || item.previous !== 0;
        })
    };
  }

  function buildReport() {
    var range = resolveRange();
    var currentTransactions = data.getTransactions({
      dateFrom: range.start,
      dateTo: range.end
    });
    var previousTransactions = data.getTransactions({
      dateFrom: range.prevStart,
      dateTo: range.prevEnd
    });
    var currentMovements = data.getSavingsMovements({
      dateFrom: range.start,
      dateTo: range.end
    });
    var previousMovements = data.getSavingsMovements({
      dateFrom: range.prevStart,
      dateTo: range.prevEnd
    });

    var current = {
      transactions: currentTransactions,
      movements: currentMovements,
      income: sumTransactions(currentTransactions, "income"),
      expenses: sumTransactions(currentTransactions, "expense"),
      savingsContributions: sumMovements(currentMovements, "contribution"),
      savingsWithdrawals: sumMovements(currentMovements, "withdrawal")
    };
    current.net = roundMoney(current.income - current.expenses);

    var previous = {
      transactions: previousTransactions,
      movements: previousMovements,
      income: sumTransactions(previousTransactions, "income"),
      expenses: sumTransactions(previousTransactions, "expense"),
      savingsContributions: sumMovements(previousMovements, "contribution"),
      savingsWithdrawals: sumMovements(previousMovements, "withdrawal")
    };
    previous.net = roundMoney(previous.income - previous.expenses);

    var expenseCategories = analyseCategories(
      currentTransactions,
      previousTransactions,
      "expense"
    );
    expenseCategories.previousTotal = previous.expenses;

    var incomeCategories = analyseCategories(
      currentTransactions,
      previousTransactions,
      "income"
    );
    incomeCategories.previousTotal = previous.income;

    var report = {
      range: range,
      current: current,
      previous: previous,
      series: buildSeries(range.start, range.end, currentTransactions),
      categories: {
        expense: expenseCategories,
        income: incomeCategories
      },
      allocations: buildAllocations(range, currentTransactions),
      savings: buildSavings(currentMovements),
      comparison: buildComparison(current, previous)
    };

    report.insights = buildInsights(report);
    return report;
  }

  /* ---------- Insight generation ---------- */

  function buildInsights(report) {
    var insights = [];
    var topExpense = report.categories.expense.list[0];
    var topIncome = report.categories.income.list[0];

    if (topExpense && topExpense.amount > 0) {
      insights.push({
        icon: "trending-down",
        tone: "expense",
        title: "Highest spending category",
        text:
          "<strong>" +
          escapeHtml(topExpense.category) +
          "</strong> accounts for " +
          formatPercent(topExpense.percentage) +
          " of expenses (" +
          formatMoney(topExpense.amount) +
          ") across " +
          topExpense.count +
          " expense" +
          (topExpense.count === 1 ? "" : "s") +
          "."
      });
    }

    if (topIncome && topIncome.amount > 0) {
      insights.push({
        icon: "trending-up",
        tone: "income",
        title: "Largest income source",
        text:
          "<strong>" +
          escapeHtml(topIncome.category) +
          "</strong> provided " +
          formatPercent(topIncome.percentage) +
          " of income (" +
          formatMoney(topIncome.amount) +
          ") across " +
          topIncome.count +
          " income record" +
          (topIncome.count === 1 ? "" : "s") +
          "."
      });
    }

    var allExpenses = data.getTransactions({ type: "expense" });
    var byMonth = Object.create(null);
    allExpenses.forEach(function (transaction) {
      if (!transaction.date) return;
      var key = transaction.date.slice(0, 7);
      if (!byMonth[key]) byMonth[key] = 0;
      byMonth[key] += Number(transaction.amount || 0);
    });
    var monthKeys = Object.keys(byMonth);
    if (monthKeys.length) {
      monthKeys.sort(function (a, b) {
        return byMonth[b] - byMonth[a];
      });
      insights.push({
        icon: "calendar",
        tone: "",
        title: "Highest expense month on record",
        text:
          "<strong>" +
          escapeHtml(monthLabel(monthKeys[0] + "-01")) +
          "</strong> has the highest recorded expenses at " +
          formatMoney(byMonth[monthKeys[0]]) +
          "."
      });
    }

    var allocations = report.allocations;
    if (allocations.totalPlanned > 0) {
      var overRows = allocations.rows.filter(function (row) {
        return row.actual > row.planned;
      });
      if (overRows.length) {
        overRows.sort(function (a, b) {
          return b.actual - b.planned - (a.actual - a.planned);
        });
        insights.push({
          icon: "alert-triangle",
          tone: "warning",
          title: "Allocation over plan",
          text:
            "<strong>" +
            escapeHtml(overRows[0].name) +
            "</strong> is over its planned amount by " +
            formatMoney(overRows[0].actual - overRows[0].planned) +
            (overRows.length > 1
              ? ". " + overRows.length + " allocations are above plan."
              : ".")
        });
      } else {
        var usage =
          allocations.totalPlanned > 0
            ? (allocations.totalActual / allocations.totalPlanned) * 100
            : 0;
        insights.push({
          icon: "target",
          tone: "",
          title: "Allocation use",
          text:
            "Linked expenses use <strong>" +
            formatPercent(usage) +
            "</strong> of the " +
            formatMoney(allocations.totalPlanned) +
            " planned for this period."
        });
      }
    }

    var closest = report.savings.activeProgress
      .filter(function (plan) {
        return plan.target > 0 && plan.saved > 0 && plan.saved < plan.target;
      })
      .sort(function (a, b) {
        return (b.percentage || 0) - (a.percentage || 0);
      })[0];

    if (closest) {
      insights.push({
        icon: "coins",
        tone: "savings",
        title: "Savings progress",
        text:
          "<strong>" +
          escapeHtml(closest.name) +
          "</strong> is " +
          formatPercent(closest.percentage) +
          " funded, with " +
          formatMoney(closest.remaining) +
          " left to reach its target."
      });
    }

    if (report.savings.completedCount > 0) {
      insights.push({
        icon: "check-circle",
        tone: "income",
        title: "Savings targets reached",
        text:
          "<strong>" +
          report.savings.completedCount +
          "</strong> savings plan" +
          (report.savings.completedCount === 1 ? " has" : "s have") +
          " reached " +
          (report.savings.completedCount === 1 ? "its" : "their") +
          " target."
      });
    }

    if (
      report.previous.expenses > 0 &&
      (report.current.expenses > 0 || report.previous.expenses > 0)
    ) {
      var expenseChange =
        ((report.current.expenses - report.previous.expenses) /
          report.previous.expenses) *
        100;
      insights.push({
        icon: expenseChange > 0 ? "trending-up" : "trending-down",
        tone: expenseChange > 0 ? "warning" : "income",
        title: "Spending change",
        text:
          "Overall expenses " +
          (expenseChange > 0 ? "increased" : "decreased") +
          " by <strong>" +
          formatPercent(Math.abs(expenseChange)) +
          "</strong> compared with the previous period."
      });
    }

    return insights.slice(0, 6);
  }

  /* ---------- Rendering: shell & controls ---------- */

  function changeBadge(current, previous, favourableWhenUp) {
    var change = roundMoney(current - previous);
    if (previous <= 0) {
      if (current <= 0) return { text: "No activity", className: "" };
      return { text: "No prior data", className: "" };
    }
    if (change === 0) return { text: "No change", className: "" };
    var percent = (change / previous) * 100;
    var favourable = favourableWhenUp ? change > 0 : change < 0;
    return {
      text: (change > 0 ? "+" : "−") + formatPercent(Math.abs(percent)),
      className: favourable ? "is-positive" : "is-negative"
    };
  }

  function renderShell(report) {
    var balanceEl = byId("sidebar-total-balance");
    var noteEl = byId("sidebar-balance-note");
    var nameEl = byId("sidebar-user-name");
    var subtitleEl = byId("ri-header-subtitle");

    if (balanceEl) {
      balanceEl.textContent = formatMoney(data.getTotalBalance());
    }
    if (noteEl) {
      noteEl.textContent =
        report.current.net === 0
          ? "No net movement this period"
          : (report.current.net > 0 ? "+" : "") +
            formatMoney(report.current.net) +
            " net this period";
    }

    try {
      var settings = data.getSettings();
      if (nameEl) nameEl.textContent = settings.name || "Your profile";
      if (subtitleEl) {
        subtitleEl.textContent = settings.name
          ? "Financial reporting for " + settings.name
          : "Financial reporting workspace";
      }
    } catch (error) {
      /* keep shell defaults */
    }

    var chip = byId("ri-storage-chip");
    var label = byId("ri-storage-label");
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
      chip.title = "Your report data is stored privately in this browser.";
    }
  }

  function syncControls(report) {
    var rangeLabel = byId("ri-range-label");
    var compareLabel = byId("ri-compare-label");
    var fromInput = byId("ri-date-from");
    var toInput = byId("ri-date-to");

    if (rangeLabel) rangeLabel.textContent = report.range.label;
    if (compareLabel) {
      compareLabel.textContent =
        report.range.comparison +
        " · " +
        formatRangeLabel(report.range.prevStart, report.range.prevEnd);
    }
    if (fromInput) fromInput.value = report.range.start;
    if (toInput) toInput.value = report.range.end;

    document.querySelectorAll(".ri-preset-btn").forEach(function (button) {
      var isActive = button.getAttribute("data-preset") === state.preset;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  /* ---------- Rendering: overview ---------- */

  function renderOverview(report) {
    var grid = byId("ri-overview-grid");
    if (!grid) return;

    var incomeBadge = changeBadge(
      report.current.income,
      report.previous.income,
      true
    );
    var expenseBadge = changeBadge(
      report.current.expenses,
      report.previous.expenses,
      false
    );
    var netBadge = changeBadge(
      report.current.net,
      report.previous.net,
      true
    );
    var savingsBadge = changeBadge(
      report.current.savingsContributions,
      report.previous.savingsContributions,
      true
    );

    var allocationUse =
      report.allocations.totalPlanned > 0
        ? (report.allocations.totalActual / report.allocations.totalPlanned) *
          100
        : null;
    var allocationBadge =
      allocationUse === null
        ? { text: "No plans", className: "" }
        : {
            text: formatPercent(allocationUse, 0) + " used",
            className:
              allocationUse > 100
                ? "is-negative"
                : allocationUse >= 80
                  ? ""
                  : "is-positive"
          };

    var cards = [
      {
        label: "Total income",
        value: formatMoney(report.current.income),
        icon: "trending-up",
        tone: "is-income",
        note: "vs " + formatMoney(report.previous.income) + " previous period",
        badge: incomeBadge
      },
      {
        label: "Total expenses",
        value: formatMoney(report.current.expenses),
        icon: "trending-down",
        tone: "is-expense",
        note: "vs " + formatMoney(report.previous.expenses) + " previous period",
        badge: expenseBadge
      },
      {
        label: "Net income",
        value: formatMoney(report.current.net),
        valueClass:
          report.current.net < 0
            ? "is-negative"
            : report.current.net > 0
              ? "is-positive"
              : "",
        icon: "scale",
        tone: "is-net",
        note: "Income minus actual expenses",
        badge: netBadge
      },
      {
        label: "Savings contributions",
        value: formatMoney(report.current.savingsContributions),
        icon: "coins",
        tone: "is-savings",
        note:
          report.savings.contributionCount +
          " contribution" +
          (report.savings.contributionCount === 1 ? "" : "s") +
          " this period",
        badge: savingsBadge
      },
      {
        label: "Savings withdrawals",
        value: formatMoney(report.current.savingsWithdrawals),
        icon: "arrow-down-left",
        tone: "is-warning",
        note:
          report.savings.withdrawalCount +
          " withdrawal" +
          (report.savings.withdrawalCount === 1 ? "" : "s") +
          " this period",
        badge: {
          text:
            report.savings.withdrawalCount +
            (report.savings.withdrawalCount === 1 ? " movement" : " movements"),
          className: ""
        }
      },
      {
        label: "Spending against allocations",
        value: formatMoney(report.allocations.totalActual),
        icon: "target",
        tone: "is-warning",
        note:
          report.allocations.totalPlanned > 0
            ? "of " +
              formatMoney(report.allocations.totalPlanned) +
              " planned · " +
              formatMoney(report.allocations.totalRemaining) +
              " remaining"
            : "No allocation plans in this period",
        badge: allocationBadge
      }
    ];

    grid.innerHTML = cards
      .map(function (card) {
        return (
          '<article class="ri-stat-card">' +
          '<div class="ri-stat-top">' +
          '<span class="ri-stat-icon ' +
          card.tone +
          '"><i data-lucide="' +
          card.icon +
          '" class="w-5 h-5"></i></span>' +
          '<span class="ri-stat-badge ' +
          card.badge.className +
          '">' +
          escapeHtml(card.badge.text) +
          "</span>" +
          "</div>" +
          '<p class="ri-stat-label">' +
          escapeHtml(card.label) +
          "</p>" +
          '<strong class="ri-stat-value ' +
          (card.valueClass || "") +
          '">' +
          escapeHtml(card.value) +
          "</strong>" +
          '<p class="ri-stat-note">' +
          escapeHtml(card.note) +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  /* ---------- Rendering: charts ---------- */

  function themeColors() {
    var isDark = document.documentElement.classList.contains("dark");
    return {
      isDark: isDark,
      text: isDark ? "#cbd5e1" : "#475569",
      strong: isDark ? "#f1f5f9" : "#0f172a",
      grid: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.07)",
      tooltipBg: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
      tooltipBorder: isDark
        ? "rgba(148, 163, 184, 0.28)"
        : "rgba(15, 23, 42, 0.1)"
    };
  }

  function destroyChart(key) {
    if (charts[key]) {
      try {
        charts[key].destroy();
      } catch (error) {
        /* noop */
      }
      delete charts[key];
    }
  }

  function createChart(key, canvasId, config) {
    if (typeof Chart === "undefined") return null;
    destroyChart(key);
    var canvas = byId(canvasId);
    if (!canvas) return null;
    if (typeof Chart.getChart === "function") {
      var existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
    }
    canvas.style.display = "block";
    try {
      charts[key] = new Chart(canvas.getContext("2d"), config);
      return charts[key];
    } catch (error) {
      if (window.console && console.error) {
        console.error("Unable to render report chart", error);
      }
      return null;
    }
  }

  function renderAnalysis(report) {
    var empty = byId("ri-cashflow-empty");
    var canvas = byId("ri-cashflow-chart");
    var caption = byId("ri-analysis-caption");
    var note = byId("ri-analysis-note");
    if (!canvas) return;

    var buckets = report.series.buckets;
    var hasActivity = buckets.some(function (bucket) {
      return bucket.income !== 0 || bucket.expenses !== 0;
    });
    var modeLabel =
      report.series.mode === "day"
        ? "daily"
        : report.series.mode === "week"
          ? "weekly"
          : "monthly";

    if (caption) {
      caption.textContent =
        buckets.length + " " + modeLabel + " bucket" + (buckets.length === 1 ? "" : "s");
    }
    if (note) {
      note.textContent =
        "Income and expenses are grouped by " +
        modeLabel +
        " bucket across " +
        report.range.label +
        ".";
    }

    if (!hasActivity) {
      destroyChart("cashflow");
      canvas.style.display = "none";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var colors = themeColors();
    createChart("cashflow", "ri-cashflow-chart", {
      type: "bar",
      data: {
        labels: buckets.map(function (bucket) {
          return bucket.label;
        }),
        datasets: [
          {
            type: "bar",
            label: "Income",
            data: buckets.map(function (bucket) {
              return bucket.income;
            }),
            backgroundColor: "#10b981",
            borderRadius: 6,
            maxBarThickness: 28
          },
          {
            type: "bar",
            label: "Expenses",
            data: buckets.map(function (bucket) {
              return bucket.expenses;
            }),
            backgroundColor: "#ef4444",
            borderRadius: 6,
            maxBarThickness: 28
          },
          {
            type: "line",
            label: "Net income",
            data: buckets.map(function (bucket) {
              return bucket.net;
            }),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99, 102, 241, 0.08)",
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "#6366f1",
            pointBorderColor: colors.isDark ? "#0c0d11" : "#ffffff",
            pointBorderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.strong,
            bodyColor: colors.text,
            borderColor: colors.tooltipBorder,
            borderWidth: 1,
            padding: 11,
            callbacks: {
              label: function (context) {
                return (
                  context.dataset.label + ": " + formatMoney(context.parsed.y)
                );
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: colors.text,
              font: { size: 10, weight: "600" },
              maxRotation: 0,
              autoSkip: true
            }
          },
          y: {
            grid: { color: colors.grid },
            border: { display: false },
            ticks: {
              color: colors.text,
              font: { size: 10, weight: "600" },
              callback: function (value) {
                return formatAxisMoney(value);
              }
            }
          }
        }
      }
    });
  }

  function expenseColorMap(list) {
    var map = Object.create(null);
    list.forEach(function (item, index) {
      map[item.category] = CHART_COLORS[index % CHART_COLORS.length];
    });
    return map;
  }

  function renderCategories(report) {
    var focusSelect = byId("ri-category-focus");
    var expenseList = report.categories.expense.list;

    if (focusSelect) {
      var desired = state.categoryFocus;
      var options = ['<option value="all">All categories</option>'];
      expenseList.forEach(function (item) {
        options.push(
          '<option value="' +
            escapeHtml(item.category) +
            '">' +
            escapeHtml(item.category) +
            "</option>"
        );
      });
      focusSelect.innerHTML = options.join("");
      var exists = expenseList.some(function (item) {
        return item.category === desired;
      });
      if (desired !== "all" && !exists) {
        state.categoryFocus = "all";
        desired = "all";
      }
      focusSelect.value = desired;
      focusSelect.disabled = expenseList.length === 0;
    }

    renderExpenseCategoryView(report);

    renderCategoryTable(
      "ri-income-category-table",
      report.categories.income.list,
      "income",
      null,
      "No income categories in this period",
      "Record income in My Finances or choose another reporting period."
    );
  }

  function renderExpenseCategoryView(report) {
    var expenseList = report.categories.expense.list;

    renderCategoryTable(
      "ri-expense-category-table",
      expenseList.filter(function (item) {
        return (
          state.categoryFocus === "all" ||
          item.category === state.categoryFocus
        );
      }),
      "expense",
      expenseColorMap(expenseList),
      "No expense categories in this period",
      "Record expenses in My Finances or choose another reporting period."
    );

    renderExpenseDoughnut(report);
  }

  function renderCategoryTable(
    containerId,
    list,
    type,
    colorMap,
    emptyTitle,
    emptyMessage
  ) {
    var container = byId(containerId);
    if (!container) return;

    if (!list.length) {
      container.innerHTML =
        '<div class="ri-table-empty"><strong>' +
        escapeHtml(emptyTitle) +
        "</strong><p>" +
        escapeHtml(emptyMessage) +
        "</p></div>";
      return;
    }

    var rows = list
      .map(function (item) {
        var dot =
          type === "expense" && colorMap
            ? '<i class="ri-cat-dot" style="background:' +
              colorMap[item.category] +
              '"></i>'
            : type === "income"
              ? '<i class="ri-cat-dot" style="background:#10b981"></i>'
              : "";
        var change;
        if (item.previousAmount <= 0) {
          change =
            item.amount > 0
              ? '<span class="ri-change is-muted">New</span>'
              : '<span class="ri-change is-muted">—</span>';
        } else if (item.change === 0) {
          change = '<span class="ri-change is-muted">No change</span>';
        } else {
          var favourable =
            type === "income" ? item.change > 0 : item.change < 0;
          change =
            '<span class="ri-change ' +
            (favourable ? "is-positive" : "is-negative") +
            '">' +
            escapeHtml(formatSignedMoney(item.change)) +
            "</span>";
        }

        return (
          "<tr>" +
          '<td data-label="Category"><span class="ri-cell-title">' +
          dot +
          escapeHtml(item.category) +
          '</span><span class="ri-cell-sub">' +
          item.count +
          " transaction" +
          (item.count === 1 ? "" : "s") +
          "</span></td>" +
          '<td class="is-right" data-label="Amount"><span class="ri-amount">' +
          escapeHtml(formatMoney(item.amount)) +
          "</span></td>" +
          '<td class="is-right" data-label="Share">' +
          escapeHtml(formatPercent(item.percentage)) +
          "</td>" +
          '<td class="is-right" data-label="vs previous">' +
          change +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    container.innerHTML =
      '<table class="ri-table"><thead><tr>' +
      "<th>Category</th>" +
      '<th class="is-right">Amount</th>' +
      '<th class="is-right">Share</th>' +
      '<th class="is-right">vs previous</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  function renderExpenseDoughnut(report) {
    var empty = byId("ri-expense-category-empty");
    var canvas = byId("ri-expense-category-chart");
    var totalEl = byId("ri-doughnut-total");
    var list = report.categories.expense.list;
    var total = report.categories.expense.total;

    if (totalEl) totalEl.textContent = formatMoney(total);
    if (!canvas) return;

    if (total <= 0 || !list.length) {
      destroyChart("expenseCategory");
      canvas.style.display = "none";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var colorMap = expenseColorMap(list);
    var labels = [];
    var values = [];
    var colors = [];

    if (state.categoryFocus !== "all") {
      var selected = list.filter(function (item) {
        return item.category === state.categoryFocus;
      })[0];
      if (selected) {
        labels.push(selected.category);
        values.push(selected.amount);
        colors.push(colorMap[selected.category]);
        var remainder = roundMoney(total - selected.amount);
        if (remainder > 0) {
          labels.push("Other categories");
          values.push(remainder);
          colors.push("#94a3b8");
        }
      }
    }

    if (!labels.length) {
      list.forEach(function (item) {
        labels.push(item.category);
        values.push(item.amount);
        colors.push(colorMap[item.category]);
      });
    }

    createChart("expenseCategory", "ri-expense-category-chart", {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "70%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: themeColors().tooltipBg,
            titleColor: themeColors().strong,
            bodyColor: themeColors().text,
            borderColor: themeColors().tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function (context) {
                var value = Number(context.parsed) || 0;
                var share = total > 0 ? (value / total) * 100 : null;
                return (
                  context.label +
                  ": " +
                  formatMoney(value) +
                  " (" +
                  formatPercent(share) +
                  ")"
                );
              }
            }
          }
        }
      }
    });
  }

  /* ---------- Rendering: allocations ---------- */

  function renderAllocations(report) {
    var stats = byId("ri-allocation-stats");
    var table = byId("ri-allocation-table");
    var caption = byId("ri-allocation-caption");
    var note = byId("ri-allocation-note");
    var allocations = report.allocations;

    if (stats) {
      stats.innerHTML = [
        {
          label: "Planned allocations",
          value: formatMoney(allocations.totalPlanned),
          note:
            allocations.rows.length +
            " allocation" +
            (allocations.rows.length === 1 ? "" : "s") +
            " in " +
            allocations.monthCount +
            " month" +
            (allocations.monthCount === 1 ? "" : "s"),
          tone: ""
        },
        {
          label: "Actual linked spending",
          value: formatMoney(allocations.totalActual),
          note: "Expenses explicitly linked to allocations",
          tone: ""
        },
        {
          label: "Remaining allocated",
          value: formatMoney(allocations.totalRemaining),
          note:
            allocations.totalRemaining < 0
              ? "Allocations are over their planned amounts"
              : "Planned amount not yet spent",
          tone:
            allocations.totalRemaining < 0
              ? "is-negative"
              : allocations.totalRemaining > 0
                ? "is-positive"
                : ""
        },
        {
          label: "Unlinked expenses",
          value: formatMoney(allocations.unlinkedTotal),
          note: "Included in total expenses, not assigned to an allocation",
          tone: ""
        }
      ]
        .map(function (item) {
          return (
            '<div class="ri-mini-stat"><span>' +
            escapeHtml(item.label) +
            "</span><strong class=\"" +
            item.tone +
            '">' +
            escapeHtml(item.value) +
            "</strong><small>" +
            escapeHtml(item.note) +
            "</small></div>"
          );
        })
        .join("");
    }

    if (caption) {
      caption.textContent = allocations.rows.length
        ? allocations.rows.length +
          " allocation plan" +
          (allocations.rows.length === 1 ? "" : "s") +
          " across " +
          allocations.monthCount +
          " month" +
          (allocations.monthCount === 1 ? "" : "s")
        : "No allocation plans in this reporting period";
    }

    if (note) {
      note.innerHTML =
        '<i data-lucide="info" class="w-4 h-4"></i>' +
        "<span>Actual allocation spending here is limited to linked expenses dated inside the selected reporting period. The shared data layer's getAllocationActualSpending is not date-scoped, so this report filters linked expenses by date.</span>";
    }

    if (!table) return;

    if (!allocations.rows.length) {
      table.innerHTML =
        '<div class="ri-table-empty"><strong>No allocations in this period</strong>' +
        "<p>Create allocation plans in Budget &amp; Money Allocation to report on planned versus actual spending.</p></div>";
      return;
    }

    var rows = allocations.rows
      .map(function (row) {
        var progressWidth =
          row.usage === null ? 0 : Math.min(Math.max(row.usage, 0), 100);
        var fillClass =
          row.actual > row.planned
            ? "is-over"
            : row.planned > 0 && row.actual >= row.planned
              ? "is-complete"
              : "";
        var statusText =
          row.usage === null
            ? "No plan amount"
            : row.actual > row.planned
              ? "Over plan"
              : formatPercent(row.usage, 0) + " used";
        var statusClass =
          row.actual > row.planned
            ? "is-negative"
            : row.actual > 0
              ? "is-positive"
              : "";

        return (
          "<tr>" +
          '<td data-label="Allocation"><span class="ri-cell-title">' +
          escapeHtml(row.name) +
          '</span><span class="ri-cell-sub">' +
          escapeHtml(monthLabel(row.financialMonth + "-01")) +
          "</span></td>" +
          '<td class="is-right" data-label="Planned"><span class="ri-amount">' +
          escapeHtml(formatMoney(row.planned)) +
          "</span></td>" +
          '<td class="is-right" data-label="Actual"><span class="ri-amount">' +
          escapeHtml(formatMoney(row.actual)) +
          "</span></td>" +
          '<td class="is-right" data-label="Remaining"><span class="ri-change ' +
          (row.remaining < 0 ? "is-negative" : "is-muted") +
          '">' +
          escapeHtml(formatMoney(row.remaining)) +
          "</span></td>" +
          '<td data-label="Use">' +
          '<div class="ri-progress"><div class="ri-progress-fill ' +
          fillClass +
          '" style="width:' +
          progressWidth +
          '%"></div></div>' +
          '<span class="ri-cell-sub ' +
          statusClass +
          '">' +
          escapeHtml(statusText) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");

    table.innerHTML =
      '<table class="ri-table"><thead><tr>' +
      "<th>Allocation</th>" +
      '<th class="is-right">Planned</th>' +
      '<th class="is-right">Actual</th>' +
      '<th class="is-right">Remaining</th>' +
      "<th>Use</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  /* ---------- Rendering: savings ---------- */

  function renderSavings(report) {
    var stats = byId("ri-savings-stats");
    var plansContainer = byId("ri-savings-plans");
    var activityContainer = byId("ri-savings-activity");
    var savings = report.savings;

    if (stats) {
      stats.innerHTML = [
        {
          label: "Total savings balance",
          value: formatMoney(savings.totalBalance),
          note: "Current balance across all savings plans",
          tone: ""
        },
        {
          label: "Contributions this period",
          value: formatMoney(savings.contributions),
          note:
            savings.contributionCount +
            " contribution" +
            (savings.contributionCount === 1 ? "" : "s"),
          tone: savings.contributions > 0 ? "is-positive" : ""
        },
        {
          label: "Withdrawals this period",
          value: formatMoney(savings.withdrawals),
          note:
            savings.withdrawalCount +
            " withdrawal" +
            (savings.withdrawalCount === 1 ? "" : "s"),
          tone: savings.withdrawals > 0 ? "is-negative" : ""
        },
        {
          label: "Completed targets",
          value: String(savings.completedCount),
          note:
            savings.activeProgress.length +
            " plan" +
            (savings.activeProgress.length === 1 ? "" : "s") +
            " with progress available",
          tone: savings.completedCount > 0 ? "is-positive" : ""
        }
      ]
        .map(function (item) {
          return (
            '<div class="ri-mini-stat"><span>' +
            escapeHtml(item.label) +
            "</span><strong class=\"" +
            item.tone +
            '">' +
            escapeHtml(item.value) +
            "</strong><small>" +
            escapeHtml(item.note) +
            "</small></div>"
          );
        })
        .join("");
    }

    if (plansContainer) {
      if (!savings.plans.length) {
        plansContainer.innerHTML =
          '<div class="ri-table-empty "><strong>No savings plans yet</strong>' +
          "<p>Create a savings plan on the Savings page to track contributions against a target.</p></div>";
      } else {
        var planCards = savings.plans
          .slice()
          .sort(function (a, b) {
            return (b.percentage || 0) - (a.percentage || 0);
          })
          .map(function (plan) {
            var width =
              plan.percentage === null
                ? 0
                : Math.min(Math.max(plan.percentage, 0), 100);
            var pillClass =
              plan.status === "archived"
                ? "is-archived"
                : plan.progressAvailable && plan.saved >= plan.target
                  ? "is-complete"
                  : "";
            var pillText =
              plan.status === "archived"
                ? "Archived"
                : plan.progressAvailable && plan.saved >= plan.target
                  ? "Target reached"
                  : plan.progressAvailable
                    ? formatPercent(plan.percentage, 0) + " funded"
                    : "No target";
            return (
              '<div class="ri-plan-card">' +
              '<div class="ri-plan-top"><div><strong>' +
              escapeHtml(plan.name) +
              "</strong><span>" +
              escapeHtml(
                plan.progressAvailable
                  ? formatMoney(plan.saved) +
                      " saved of " +
                      formatMoney(plan.target)
                  : "No target amount set"
              ) +
              '</span></div><span class="ri-plan-pill ' +
              pillClass +
              '">' +
              escapeHtml(pillText) +
              "</span></div>" +
              '<div class="ri-progress"><div class="ri-progress-fill ' +
              (plan.progressAvailable && plan.saved >= plan.target
                ? "is-complete"
                : "") +
              '" style="width:' +
              width +
              '%"></div></div>' +
              '<div class="ri-plan-meta"><span>' +
              escapeHtml(plan.purpose || plan.status || "Savings plan") +
              "</span><strong>" +
              escapeHtml(
                plan.progressAvailable
                  ? formatPercent(plan.percentage)
                  : "—"
              ) +
              "</strong></div>" +
              "</div>"
            );
          })
          .join("");
        plansContainer.innerHTML = planCards;
      }
    }

    if (!activityContainer) return;

    if (!savings.movements.length) {
      activityContainer.innerHTML =
        '<div class="ri-table-empty"><strong>No savings movements this period</strong>' +
        "<p>Contributions and withdrawals recorded in the selected period will appear here.</p></div>";
      return;
    }

    var planNames = Object.create(null);
    savings.plans.forEach(function (plan) {
      planNames[plan.id] = plan.name;
    });

    var rows = savings.movements
      .slice()
      .sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      })
      .map(function (movement) {
        var isContribution = movement.type === "contribution";
        return (
          "<tr>" +
          '<td data-label="Date"><span class="ri-cell-title">' +
          escapeHtml(formatShortDate(movement.date)) +
          "</span></td>" +
          '<td data-label="Plan"><span class="ri-cell-title">' +
          escapeHtml(planNames[movement.savingsPlanId] || "Savings plan") +
          "</span></td>" +
          '<td data-label="Type"><span class="ri-change ' +
          (isContribution ? "is-positive" : "is-negative") +
          '">' +
          (isContribution ? "Contribution" : "Withdrawal") +
          "</span></td>" +
          '<td class="is-right" data-label="Amount"><span class="ri-amount">' +
          escapeHtml(
            (isContribution ? "+" : "−") + formatMoney(movement.amount)
          ) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");

    activityContainer.innerHTML =
      '<table class="ri-table"><thead><tr>' +
      "<th>Date</th><th>Plan</th><th>Type</th>" +
      '<th class="is-right">Amount</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  /* ---------- Rendering: comparison ---------- */

  function comparisonChangeText(item) {
    if (item.previous <= 0) {
      return item.current <= 0
        ? "No activity in either period"
        : "No previous-period activity";
    }
    if (item.current === item.previous) {
      return "Previous " + formatMoney(item.previous) + " · no change";
    }
    var percent = ((item.current - item.previous) / item.previous) * 100;
    return (
      "Previous " +
      formatMoney(item.previous) +
      " · " +
      (percent > 0 ? "+" : "−") +
      formatPercent(Math.abs(percent))
    );
  }

  function renderComparison(report) {
    var comparison = report.comparison;
    var canvas = byId("ri-comparison-chart");
    var empty = byId("ri-comparison-empty");
    var caption = byId("ri-comparison-caption");
    var changes = byId("ri-category-changes");

    if (caption) {
      caption.textContent =
        "Current: " +
        formatRangeLabel(report.range.start, report.range.end) +
        " · Previous: " +
        formatRangeLabel(report.range.prevStart, report.range.prevEnd);
    }

    if (changes) {
      var summary = comparison.items
        .map(function (item) {
          var change = roundMoney(item.current - item.previous);
          var tone =
            item.previous <= 0
              ? ""
              : (item.favourableWhenUp ? change > 0 : change < 0)
                ? "is-positive"
                : change < 0 || item.favourableWhenUp === false
                  ? change === 0
                    ? ""
                    : "is-negative"
                  : "";
          return (
            '<div class="ri-mini-stat"><span>' +
            escapeHtml(item.label) +
            "</span><strong class=\"" +
            tone +
            '">' +
            escapeHtml(formatMoney(item.current)) +
            "</strong><small>" +
            escapeHtml(comparisonChangeText(item)) +
            "</small></div>"
          );
        })
        .join("");

      var categoryRows = buildCategoryChangeRows(report);
      changes.innerHTML =
        '<div class="ri-mini-stat-grid">' +
        summary +
        "</div>" +
        '<p class="ri-subhead">Expense category changes</p>' +
        categoryRows;
    }

    if (!canvas) return;

    if (!comparison.hasActivity) {
      destroyChart("comparison");
      canvas.style.display = "none";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var colors = themeColors();
    createChart("comparison", "ri-comparison-chart", {
      type: "bar",
      data: {
        labels: comparison.items.map(function (item) {
          return item.label;
        }),
        datasets: [
          {
            label: "This period",
            data: comparison.items.map(function (item) {
              return item.current;
            }),
            backgroundColor: "#6366f1",
            borderRadius: 6,
            maxBarThickness: 30
          },
          {
            label: "Previous period",
            data: comparison.items.map(function (item) {
              return item.previous;
            }),
            backgroundColor: colors.isDark
              ? "rgba(148, 163, 184, 0.35)"
              : "rgba(100, 116, 139, 0.28)",
            borderRadius: 6,
            maxBarThickness: 30
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              color: colors.text,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: { size: 10, weight: "600" },
              padding: 14
            }
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.strong,
            bodyColor: colors.text,
            borderColor: colors.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function (context) {
                return (
                  context.dataset.label + ": " + formatMoney(context.parsed.y)
                );
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: colors.text,
              font: { size: 10, weight: "600" },
              maxRotation: 0
            }
          },
          y: {
            grid: { color: colors.grid },
            border: { display: false },
            ticks: {
              color: colors.text,
              font: { size: 10, weight: "600" },
              callback: function (value) {
                return formatAxisMoney(value);
              }
            }
          }
        }
      }
    });
  }

  function buildCategoryChangeRows(report) {
    var map = Object.create(null);

    report.current.transactions.forEach(function (transaction) {
      if (transaction.type !== "expense") return;
      var name = categoryName(transaction);
      if (!map[name]) map[name] = { current: 0, previous: 0 };
      map[name].current += Number(transaction.amount || 0);
    });

    report.previous.transactions.forEach(function (transaction) {
      if (transaction.type !== "expense") return;
      var name = categoryName(transaction);
      if (!map[name]) map[name] = { current: 0, previous: 0 };
      map[name].previous += Number(transaction.amount || 0);
    });

    var rows = Object.keys(map)
      .map(function (name) {
        return {
          category: name,
          current: roundMoney(map[name].current),
          previous: roundMoney(map[name].previous),
          change: roundMoney(map[name].current - map[name].previous)
        };
      })
      .filter(function (row) {
        return row.current !== 0 || row.previous !== 0;
      })
      .sort(function (a, b) {
        return Math.abs(b.change) - Math.abs(a.change);
      })
      .slice(0, 8);

    if (!rows.length) {
      return (
        '<div class="ri-table-empty"><strong>No category changes</strong>' +
        "<p>There are no actual expenses in either period to compare.</p></div>"
      );
    }

    var body = rows
      .map(function (row) {
        return (
          "<tr>" +
          '<td data-label="Category"><span class="ri-cell-title">' +
          escapeHtml(row.category) +
          "</span></td>" +
          '<td class="is-right" data-label="Current"><span class="ri-amount">' +
          escapeHtml(formatMoney(row.current)) +
          "</span></td>" +
          '<td class="is-right" data-label="Previous">' +
          escapeHtml(formatMoney(row.previous)) +
          "</td>" +
          '<td class="is-right" data-label="Change"><span class="ri-change ' +
          (row.change > 0 ? "is-negative" : row.change < 0 ? "is-positive" : "is-muted") +
          '">' +
          escapeHtml(formatSignedMoney(row.change)) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="ri-table-wrap"><table class="ri-table"><thead><tr>' +
      "<th>Category</th>" +
      '<th class="is-right">Current</th>' +
      '<th class="is-right">Previous</th>' +
      '<th class="is-right">Change</th>' +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  /* ---------- Rendering: insights ---------- */

  function renderInsights(report) {
    var grid = byId("ri-insights-grid");
    if (!grid) return;

    if (!report.insights.length) {
      grid.innerHTML =
        '<div class="ri-table-empty ri-insights-empty"><strong>Not enough data for insights yet</strong>' +
        "<p>Insights appear only when stored income, expenses, allocations or savings activity support them. Add records or choose a period with activity.</p></div>";
      return;
    }

    grid.innerHTML = report.insights
      .map(function (insight) {
        return (
          '<article class="ri-insight-card">' +
          '<span class="ri-insight-icon ' +
          (insight.tone || "") +
          '"><i data-lucide="' +
          insight.icon +
          '" class="w-5 h-5"></i></span>' +
          "<h3>" +
          escapeHtml(insight.title) +
          "</h3>" +
          "<p>" +
          insight.text +
          "</p>" +
          "</article>"
        );
      })
      .join("");
  }

  /* ---------- Main render ---------- */

  function renderAll() {
    if (!document.getElementById("ri-overview-grid")) return;
    var report = buildReport();
    lastReport = report;

    renderShell(report);
    syncControls(report);
    renderOverview(report);
    renderAnalysis(report);
    renderCategories(report);
    renderAllocations(report);
    renderSavings(report);
    renderComparison(report);
    renderInsights(report);

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  /* ---------- Export ---------- */

  function csvCell(value) {
    var text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportReport() {
    var report = lastReport || buildReport();
    var accountMap = Object.create(null);
    data.getAccounts().forEach(function (account) {
      accountMap[account.id] = account.name;
    });
    var allocationMap = Object.create(null);
    data.getAllocations({}).forEach(function (allocation) {
      allocationMap[allocation.id] = allocation.name;
    });

    var rows = report.current.transactions
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });

    var header = [
      "Date",
      "Type",
      "Category",
      "Description",
      "Account",
      "Amount",
      "Allocation"
    ];
    var lines = [header.map(csvCell).join(",")];

    rows.forEach(function (transaction) {
      var accountLabel = accountMap[transaction.accountId] || "";
      if (transaction.type === "transfer") {
        accountLabel =
          (accountMap[transaction.accountId] || "") +
          " -> " +
          (accountMap[transaction.toAccountId] || "");
      }
      lines.push(
        [
          transaction.date,
          transaction.type,
          transaction.category || "",
          transaction.description || "",
          accountLabel,
          Number(transaction.amount || 0).toFixed(2),
          transaction.allocationId
            ? allocationMap[transaction.allocationId] || ""
            : ""
        ]
          .map(csvCell)
          .join(",")
      );
    });

    var blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download =
      "gabsweb-report_" + report.range.start + "_to_" + report.range.end + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  }

  /* ---------- Events ---------- */

  function markInvalid(input, invalid) {
    if (!input) return;
    input.classList.toggle("is-invalid", Boolean(invalid));
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function applyCustomRange() {
    var fromInput = byId("ri-date-from");
    var toInput = byId("ri-date-to");
    if (!fromInput || !toInput) return;

    var from = fromInput.value;
    var to = toInput.value;
    var invalid = false;

    if (!data.isDateOnly(from)) {
      markInvalid(fromInput, true);
      invalid = true;
    } else {
      markInvalid(fromInput, false);
    }
    if (!data.isDateOnly(to)) {
      markInvalid(toInput, true);
      invalid = true;
    } else {
      markInvalid(toInput, false);
    }
    if (invalid) return;

    if (from > to) {
      var swap = from;
      from = to;
      to = swap;
    }

    state.customStart = from;
    state.customEnd = to;
    state.preset = "custom";
    state.categoryFocus = "all";
    renderAll();
  }

  function bindEvents() {
    var presetGroup = byId("ri-preset-group");
    if (presetGroup) {
      presetGroup.addEventListener("click", function (event) {
        var button = event.target.closest("[data-preset]");
        if (!button) return;
        var preset = button.getAttribute("data-preset");
        if (preset === "custom") {
          var current = lastReport ? lastReport.range : resolveRange();
          if (!state.customStart || !state.customEnd) {
            state.customStart = current.start;
            state.customEnd = current.end;
          }
        }
        state.preset = preset;
        if (preset !== "custom") state.categoryFocus = "all";
        renderAll();
      });
    }

    var apply = byId("ri-apply-range");
    if (apply) apply.addEventListener("click", applyCustomRange);

    ["ri-date-from", "ri-date-to"].forEach(function (id) {
      var input = byId(id);
      if (!input) return;
      input.addEventListener("input", function () {
        markInvalid(input, false);
      });
    });

    var reset = byId("ri-reset-btn");
    if (reset) {
      reset.addEventListener("click", function () {
        state.preset = "this-month";
        state.customStart = null;
        state.customEnd = null;
        state.categoryFocus = "all";
        markInvalid(byId("ri-date-from"), false);
        markInvalid(byId("ri-date-to"), false);
        renderAll();
      });
    }

    var exportBtn = byId("ri-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", exportReport);

    var categoryFocus = byId("ri-category-focus");
    if (categoryFocus) {
      categoryFocus.addEventListener("change", function () {
        state.categoryFocus = categoryFocus.value || "all";
        renderExpenseCategoryView(lastReport || buildReport());
      });
    }

    if (data.subscribe) {
      data.subscribe(function () {
        renderAll();
      });
    }

    var lastDark = document.documentElement.classList.contains("dark");
    var observer = new MutationObserver(function () {
      var isDark = document.documentElement.classList.contains("dark");
      if (isDark === lastDark) return;
      lastDark = isDark;
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderAll, 120);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function init() {
    bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

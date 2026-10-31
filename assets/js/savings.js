/* Gabsweb CashFlow — Savings */
(function () {
  "use strict";

  var data = window.GabswebCashFlowData;
  if (!data) return;

  var DAY_MS = 24 * 60 * 60 * 1000;
  var TOAST_ICONS = {
    success: "check",
    error: "alert-circle",
    info: "info",
    warning: "alert-triangle"
  };
  var STATUS_META = {
    active: { label: "Active", tone: "active", icon: "vault" },
    paused: { label: "Paused", tone: "paused", icon: "pause" },
    completed: { label: "Completed", tone: "completed", icon: "check-circle-2" },
    archived: { label: "Archived", tone: "archived", icon: "archive" }
  };
  var PLAN_TONES = {
    active: "transfer",
    paused: "warning",
    completed: "income",
    archived: "neutral"
  };

  var state = {
    search: "",
    sort: "updated",
    filterStatus: "all",
    editingId: null,
    detailsId: null,
    movementPlanId: null,
    movementType: "contribution",
    activitySearch: "",
    activityType: "all",
    activityPlan: "all",
    activityFrom: "",
    activityTo: "",
    activitySort: "newest",
    confirmHandler: null,
    balanceChart: null
  };

  var toastTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
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

  function iconMarkup(name, className) {
    return (
      '<i data-lucide="' +
      escapeHtml(name) +
      '" class="' +
      escapeHtml(className || "w-4 h-4") +
      '"></i>'
    );
  }

  function money(value) {
    return data.formatNaira(Number(value) || 0);
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function percentText(value) {
    return Math.round(Number(value) || 0) + "%";
  }

  function today() {
    return data.todayKey();
  }

  function dateText(value) {
    return data.formatDate(value);
  }

  function timeText(value) {
    return data.formatDate(value, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function statusMeta(status) {
    return STATUS_META[status] || {
      label: String(status || "Active"),
      tone: "neutral",
      icon: "vault"
    };
  }

  function planTone(status) {
    return PLAN_TONES[status] || "neutral";
  }

  function setText(id, value) {
    var element = byId(id);
    if (element) element.textContent = value;
  }

  function setAmountTone(element, value) {
    if (!element) return;
    element.classList.toggle("is-positive", Number(value) > 0);
    element.classList.toggle("is-negative", Number(value) < 0);
  }

  function setFormError(id, message) {
    var error = byId(id);
    if (!error) return;
    if (message) {
      error.textContent = message;
      error.classList.add("is-visible");
    } else {
      error.textContent = "";
      error.classList.remove("is-visible");
    }
  }

  function goalLinkedToPlan(planId) {
    return data.getGoals().find(function (goal) {
      return goal.savingsPlanId === planId;
    }) || null;
  }

  function accountName(accountId) {
    if (!accountId) return "";
    var account = data.getAccount(accountId);
    return account ? account.name : "";
  }

  function movementTypeLabel(type) {
    return type === "withdrawal" ? "Withdrawal" : "Contribution";
  }

  function daysUntil(dateOnly) {
    if (!data.isDateOnly(dateOnly)) return null;
    var parts = dateOnly.split("-");
    var target = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var now = new Date(today() + "T00:00:00Z").getTime();
    return Math.round((target - now) / DAY_MS);
  }

  function movementSortOldest(a, b) {
    var dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  }

  function movementSortNewest(a, b) {
    return movementSortOldest(b, a);
  }

  /* ---------- Shell, position and overview ---------- */

  function renderStorageStatus() {
    var chip = byId("sv-storage-chip");
    var label = byId("sv-storage-label");
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
      chip.title = "Savings plans are stored privately in this browser.";
    }
  }

  function renderShell() {
    var total = data.getTotalBalance();
    var available = data.getAvailableBalance();
    var balanceEl = byId("sidebar-total-balance");
    var noteEl = byId("sidebar-balance-note");
    if (balanceEl) balanceEl.textContent = money(total);
    if (noteEl) {
      noteEl.textContent =
        available === null
          ? "Available balance unavailable"
          : money(available) + " available";
    }
    renderStorageStatus();
  }

  function renderPosition() {
    var total = data.getTotalBalance();
    var setAside = data.getSavingsBalance();
    var available = data.getAvailableBalance();
    var totalEl = byId("sv-position-total");
    var setAsideEl = byId("sv-position-set-aside");
    var availableEl = byId("sv-position-available");
    var ratioNote = byId("sv-position-ratio-note");
    var bar = byId("sv-position-bar");

    if (totalEl) totalEl.textContent = money(total);
    if (setAsideEl) setAsideEl.textContent = money(setAside);
    if (availableEl) availableEl.textContent = money(available);

    var ratio = total > 0 ? clamp((setAside / total) * 100, 0, 100) : 0;
    if (ratioNote) {
      if (total <= 0) {
        ratioNote.textContent = "No account balance yet";
      } else if (setAside <= 0) {
        ratioNote.textContent = "No savings set aside yet";
      } else {
        ratioNote.textContent = percentText(ratio) + " of total balance set aside";
      }
    }
    if (bar) bar.style.width = ratio.toFixed(2) + "%";
  }

  function buildPlanModels() {
    var goals = data.getGoals();
    return data.getSavingsPlans().map(function (plan) {
      var progress = data.getSavingsPlanProgress(plan.id) || {};
      var movements = data.getSavingsMovements({ savingsPlanId: plan.id });
      var linkedGoal = goals.find(function (goal) {
        return goal.savingsPlanId === plan.id;
      }) || null;
      var contributionTotal = movements.reduce(function (sum, movement) {
        return movement.type === "contribution" ? sum + Number(movement.amount || 0) : sum;
      }, 0);
      var withdrawalTotal = movements.reduce(function (sum, movement) {
        return movement.type === "withdrawal" ? sum + Number(movement.amount || 0) : sum;
      }, 0);
      var sorted = movements.slice().sort(movementSortNewest);
      return {
        plan: plan,
        saved: roundMoney(progress.savedAmount || 0),
        target: roundMoney(progress.targetAmount || plan.targetAmount || 0),
        remaining: roundMoney(progress.remainingAmount || 0),
        percent: progress.percentage == null ? null : roundMoney(progress.percentage),
        movementCount: movements.length,
        movements: movements,
        contributionTotal: roundMoney(contributionTotal),
        withdrawalTotal: roundMoney(withdrawalTotal),
        lastMovement: sorted.length ? sorted[0] : null,
        linkedGoal: linkedGoal
      };
    });
  }

  function renderOverview(models) {
    var allMovements = data.getSavingsMovements();
    var totalSaved = data.getSavingsBalance();
    var totalTargets = models.reduce(function (sum, model) {
      return sum + model.target;
    }, 0);
    var contributions = allMovements.reduce(function (sum, movement) {
      return movement.type === "contribution" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    var withdrawals = allMovements.reduce(function (sum, movement) {
      return movement.type === "withdrawal" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    var contributionCount = allMovements.filter(function (movement) {
      return movement.type === "contribution";
    }).length;
    var withdrawalCount = allMovements.filter(function (movement) {
      return movement.type === "withdrawal";
    }).length;
    var activeCount = models.filter(function (model) {
      return model.plan.status === "active";
    }).length;
    var pausedCount = models.filter(function (model) {
      return model.plan.status === "paused";
    }).length;
    var completedCount = models.filter(function (model) {
      return model.plan.status === "completed";
    }).length;

    var totalSavedEl = byId("sv-total-saved");
    if (totalSavedEl) {
      totalSavedEl.textContent = money(totalSaved);
      setAmountTone(totalSavedEl, totalSaved);
    }
    setText("sv-total-targets", money(totalTargets));
    setText("sv-total-contributions", money(contributions));
    setText("sv-total-withdrawals", money(withdrawals));
    setText("sv-active-plans", String(activeCount));

    setText(
      "sv-total-saved-note",
      allMovements.length
        ? money(contributions) + " in · " + money(withdrawals) + " out"
        : "Contributions minus withdrawals"
    );
    setText(
      "sv-total-targets-note",
      models.length
        ? "Across " + models.length + " savings plan" + (models.length === 1 ? "" : "s")
        : "Across all savings plans"
    );
    setText(
      "sv-total-contributions-note",
      contributionCount
        ? contributionCount + " contribution" + (contributionCount === 1 ? "" : "s") + " recorded"
        : "No contributions recorded yet"
    );
    setText(
      "sv-total-withdrawals-note",
      withdrawalCount
        ? withdrawalCount + " withdrawal" + (withdrawalCount === 1 ? "" : "s") + " recorded"
        : "No withdrawals recorded yet"
    );
    setText(
      "sv-active-plans-note",
      models.length
        ? pausedCount + " paused · " + completedCount + " completed"
        : "No active plans yet"
    );

    var overallEl = byId("sv-overall-progress");
    if (overallEl) {
      if (totalTargets > 0) {
        var overall = clamp((totalSaved / totalTargets) * 100, 0, 100);
        overallEl.textContent = percentText(overall);
        overallEl.classList.remove("is-muted");
        setAmountTone(overallEl, totalSaved);
      } else {
        overallEl.textContent = "—";
        overallEl.classList.add("is-muted");
        overallEl.classList.remove("is-positive", "is-negative");
      }
    }
    setText(
      "sv-overall-note",
      totalTargets > 0
        ? money(totalSaved) + " saved of " + money(totalTargets) + " planned"
        : "Create a plan with a target to measure progress"
    );
  }

  /* ---------- Plan cards ---------- */

  function actionButton(action, id, icon, label, extraClass) {
    return (
      '<button type="button" class="sv-icon-button ' +
      escapeHtml(extraClass || "") +
      '" data-sv-action="' +
      escapeHtml(action) +
      '" data-sv-id="' +
      escapeHtml(id) +
      '" title="' +
      escapeHtml(label) +
      '" aria-label="' +
      escapeHtml(label) +
      '">' +
      iconMarkup(icon, "w-4 h-4") +
      "</button>"
    );
  }

  function planTag(icon, text, className) {
    return (
      '<span class="sv-tag ' +
      escapeHtml(className || "") +
      '">' +
      iconMarkup(icon, "w-4 h-4") +
      "<span>" +
      escapeHtml(text) +
      "</span></span>"
    );
  }

  function renderPlanCard(model) {
    var plan = model.plan;
    var status = statusMeta(plan.status);
    var linkedGoal = model.linkedGoal;
    var protectedPlan = model.movementCount > 0 || Boolean(linkedGoal);
    var percent = model.percent == null ? 0 : model.percent;
    var progressWidth = clamp(percent, 0, 100);
    var fillClass = "sv-progress-fill";
    if (model.saved < 0) {
      fillClass += " is-negative";
    } else if (percent >= 100) {
      fillClass += " is-complete";
    } else if (plan.status === "paused") {
      fillClass += " is-warning";
    }

    var tags = "";
    if (linkedGoal) {
      tags += planTag("target", "Linked: " + linkedGoal.name, "is-goal");
    }
    if (percent >= 100) {
      tags += planTag("check-circle-2", "Target reached", "is-success");
    } else if (model.saved < 0) {
      tags += planTag("alert-triangle", "Withdrawals exceed contributions", "is-warning");
    }

    var cardClass =
      "sv-plan-card" +
      (plan.status === "completed" ? " is-completed" : "") +
      (plan.status === "archived" ? " is-archived" : "");

    var actions = "";
    if (plan.status !== "archived") {
      actions += actionButton("add", plan.id, "plus", "Add funds");
      if (model.saved > 0) {
        actions += actionButton("withdraw", plan.id, "arrow-up-right", "Record withdrawal");
      }
    }
    actions += actionButton("edit", plan.id, "pencil", "Edit plan");
    if (protectedPlan) {
      if (plan.status !== "archived") {
        actions += actionButton("archive", plan.id, "archive", "Archive plan");
      }
    } else {
      actions += actionButton("delete", plan.id, "trash-2", "Delete plan", "is-danger");
    }

    return (
      '<article class="' +
      cardClass +
      '">' +
      '<div class="sv-plan-top">' +
      '<div class="sv-plan-identity">' +
      '<span class="sv-plan-icon is-' +
      escapeHtml(planTone(plan.status)) +
      '">' +
      iconMarkup(status.icon, "w-4 h-4") +
      "</span>" +
      '<div class="sv-plan-copy">' +
      '<h3 class="sv-plan-name">' +
      escapeHtml(plan.name) +
      "</h3>" +
      (plan.purpose
        ? '<p class="sv-plan-purpose">' + escapeHtml(plan.purpose) + "</p>"
        : "") +
      "</div></div>" +
      '<span class="sv-status-pill is-' +
      escapeHtml(status.tone) +
      '">' +
      escapeHtml(status.label) +
      "</span>" +
      "</div>" +
      (tags ? '<div class="sv-plan-tags">' + tags + "</div>" : "") +
      '<div class="sv-plan-amounts">' +
      "<div><span>Saved</span><strong" +
      (model.saved > 0 ? ' class="is-positive"' : model.saved < 0 ? ' class="is-negative"' : "") +
      ">" +
      money(model.saved) +
      "</strong></div>" +
      "<div><span>Target</span><strong>" +
      money(model.target) +
      "</strong></div>" +
      "<div><span>Remaining</span><strong" +
      (model.remaining < 0 ? ' class="is-negative"' : "") +
      ">" +
      money(model.remaining) +
      "</strong></div>" +
      "</div>" +
      '<div class="sv-progress" role="progressbar" aria-label="' +
      escapeHtml(plan.name) +
      ' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      Math.round(progressWidth) +
      '">' +
      '<div class="' +
      fillClass +
      '" style="width: ' +
      progressWidth.toFixed(2) +
      '%"></div>' +
      "</div>" +
      '<div class="sv-plan-meta"><span><strong>' +
      (model.percent == null ? "No target" : percentText(model.percent)) +
      "</strong> funded</span><span>" +
      model.movementCount +
      " movement" +
      (model.movementCount === 1 ? "" : "s") +
      "</span></div>" +
      (linkedGoal
        ? '<div class="sv-plan-goal-link">' +
          iconMarkup("link", "w-4 h-4") +
          "<span>Supports " +
          escapeHtml(linkedGoal.name) +
          "</span></div>"
        : "") +
      '<div class="sv-plan-footer">' +
      '<button type="button" class="sv-plan-link" data-sv-action="details" data-sv-id="' +
      escapeHtml(plan.id) +
      '">View details ' +
      iconMarkup("arrow-right", "w-4 h-4") +
      "</button>" +
      '<div class="sv-plan-actions">' +
      actions +
      "</div></div></article>"
    );
  }

  function getVisiblePlans(models) {
    var search = state.search.trim().toLowerCase();
    var visible = models.filter(function (model) {
      if (state.filterStatus !== "all" && model.plan.status !== state.filterStatus) {
        return false;
      }
      if (!search) return true;
      var haystack = [
        model.plan.name,
        model.plan.purpose,
        model.plan.notes,
        model.linkedGoal ? model.linkedGoal.name : ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(search) !== -1;
    });

    visible.sort(function (a, b) {
      if (state.sort === "progress") {
        return (b.percent == null ? -1 : b.percent) - (a.percent == null ? -1 : a.percent);
      }
      if (state.sort === "saved") return b.saved - a.saved;
      if (state.sort === "target") return b.target - a.target;
      if (state.sort === "name") return a.plan.name.localeCompare(b.plan.name);
      return String(b.plan.updatedAt || b.plan.createdAt || "").localeCompare(
        String(a.plan.updatedAt || a.plan.createdAt || "")
      );
    });
    return visible;
  }

  function updatePlanCounts(models) {
    var counts = { all: models.length, active: 0, paused: 0, completed: 0, archived: 0 };
    models.forEach(function (model) {
      if (counts[model.plan.status] != null) counts[model.plan.status] += 1;
    });
    Object.keys(counts).forEach(function (key) {
      setText("sv-count-" + key, String(counts[key]));
    });
  }

  function renderPlans(models) {
    var grid = byId("sv-plan-grid");
    if (!grid) return;
    updatePlanCounts(models);

    var totalSetAside = models.reduce(function (sum, model) {
      return sum + model.saved;
    }, 0);
    var activeCount = models.filter(function (model) {
      return model.plan.status === "active";
    }).length;
    setText(
      "sv-plan-summary",
      models.length
        ? models.length +
            " plan" +
            (models.length === 1 ? "" : "s") +
            " · " +
            activeCount +
            " active · " +
            money(totalSetAside) +
            " set aside"
        : "No savings plans created yet."
    );

    var visible = getVisiblePlans(models);
    if (!visible.length) {
      var filtered = models.length > 0;
      grid.innerHTML =
        '<div class="sv-empty is-grid">' +
        '<span class="sv-empty-icon">' +
        iconMarkup(filtersEmptyIcon(), "w-5 h-5") +
        "</span>" +
        "<h3>" +
        (filtered ? "No plans match these filters" : "Start your first savings plan") +
        "</h3>" +
        "<p>" +
        (filtered
          ? "Try a different status, search term or sort order."
          : "Create a plan, set a target and record contributions. Savings plans are amounts set aside inside your existing accounts.") +
        "</p>" +
        '<button type="button" class="sv-btn ' +
        (filtered ? "sv-btn-ghost" : "sv-btn-primary") +
        '" data-sv-action="' +
        (filtered ? "reset-plans" : "new") +
        '">' +
        iconMarkup(filtered ? "rotate-ccw" : "plus", "w-4 h-4") +
        "<span>" +
        (filtered ? "Clear filters" : "New savings plan") +
        "</span></button></div>";
      return;
    }

    grid.innerHTML = visible.map(renderPlanCard).join("");
  }

  function filtersEmptyIcon() {
    return state.search || state.filterStatus !== "all" ? "search-x" : "vault";
  }

  /* ---------- Insights ---------- */

  function renderInsights(models) {
    var mostFunded = null;
    models.forEach(function (model) {
      if (model.saved > 0 && (!mostFunded || model.saved > mostFunded.saved)) {
        mostFunded = model;
      }
    });
    if (mostFunded) {
      setText("sv-insight-funded", mostFunded.plan.name);
      setText(
        "sv-insight-funded-note",
        money(mostFunded.saved) +
          " saved" +
          (mostFunded.percent == null ? "" : " · " + percentText(mostFunded.percent) + " of target")
      );
    } else {
      setText("sv-insight-funded", "No funded plans yet");
      setText("sv-insight-funded-note", "Record a contribution to see this insight.");
    }

    var closest = null;
    models.forEach(function (model) {
      if (model.saved <= 0 || model.percent == null) return;
      if (!closest || model.percent > closest.percent) closest = model;
    });
    if (closest) {
      setText("sv-insight-closest", closest.plan.name);
      setText(
        "sv-insight-closest-note",
        percentText(closest.percent) +
          " funded · " +
          money(Math.max(closest.remaining, 0)) +
          " left"
      );
    } else {
      setText("sv-insight-closest", "No plans with savings yet");
      setText(
        "sv-insight-closest-note",
        "Progress appears once a plan has a target and savings."
      );
    }

    var goals = data.getGoals();
    var linkedGoals = goals.filter(function (goal) {
      return goal.savingsPlanId && data.isDateOnly(goal.targetDate);
    });
    var upcoming = linkedGoals
      .filter(function (goal) {
        return (
          goal.status !== "completed" &&
          goal.status !== "archived" &&
          daysUntil(goal.targetDate) >= 0
        );
      })
      .sort(function (a, b) {
        return String(a.targetDate).localeCompare(String(b.targetDate));
      });
    if (upcoming.length) {
      var nextGoal = upcoming[0];
      var days = daysUntil(nextGoal.targetDate);
      setText("sv-insight-deadline", nextGoal.name);
      setText(
        "sv-insight-deadline-note",
        "Due " +
          dateText(nextGoal.targetDate) +
          " · " +
          (days === 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " left")
      );
    } else {
      setText("sv-insight-deadline", "No linked goal deadlines");
      setText(
        "sv-insight-deadline-note",
        linkedGoals.length
          ? "Linked goal deadlines have passed or are completed."
          : "Link a savings plan to a goal to see its target date."
      );
    }

    var monthKey = data.getMonthKey(today());
    var monthMovements = data.getSavingsMovements({ month: monthKey });
    var monthContributions = monthMovements.reduce(function (sum, movement) {
      return movement.type === "contribution" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    var monthWithdrawals = monthMovements.reduce(function (sum, movement) {
      return movement.type === "withdrawal" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    var monthCount = monthMovements.filter(function (movement) {
      return movement.type === "contribution";
    }).length;
    setText("sv-insight-month", money(monthContributions) + " contributed");
    setText(
      "sv-insight-month-note",
      monthMovements.length
        ? monthCount +
            " contribution" +
            (monthCount === 1 ? "" : "s") +
            (monthWithdrawals > 0 ? " · " + money(monthWithdrawals) + " withdrawn" : "")
        : "No movements recorded this month."
    );
  }

  /* ---------- Activity ---------- */

  function renderActivityPlanOptions() {
    var select = byId("sv-activity-plan");
    if (!select) return;
    var plans = data.getSavingsPlans();
    var known = plans.some(function (plan) {
      return plan.id === state.activityPlan;
    });
    if (!known && state.activityPlan !== "all") state.activityPlan = "all";
    var html = '<option value="all">All plans</option>';
    plans
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .forEach(function (plan) {
        html +=
          '<option value="' +
          escapeHtml(plan.id) +
          '">' +
          escapeHtml(plan.name) +
          "</option>";
      });
    select.innerHTML = html;
    select.value = state.activityPlan;
  }

  function activityRows() {
    var plans = data.getSavingsPlans();
    var planMap = {};
    plans.forEach(function (plan) {
      planMap[plan.id] = plan;
    });
    var search = state.activitySearch.trim().toLowerCase();
    var rows = data.getSavingsMovements().filter(function (movement) {
      if (state.activityType !== "all" && movement.type !== state.activityType) {
        return false;
      }
      if (state.activityPlan !== "all" && movement.savingsPlanId !== state.activityPlan) {
        return false;
      }
      if (state.activityFrom && movement.date < state.activityFrom) return false;
      if (state.activityTo && movement.date > state.activityTo) return false;
      if (!search) return true;
      var plan = planMap[movement.savingsPlanId];
      var haystack = [
        plan ? plan.name : "",
        movement.description,
        movementTypeLabel(movement.type),
        accountName(movement.accountId),
        movement.date,
        dateText(movement.date)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(search) !== -1;
    });

    rows.sort(function (a, b) {
      if (state.activitySort === "oldest") return movementSortOldest(a, b);
      if (state.activitySort === "highest") return Number(b.amount) - Number(a.amount);
      if (state.activitySort === "lowest") return Number(a.amount) - Number(b.amount);
      return movementSortNewest(a, b);
    });
    return { rows: rows, planMap: planMap };
  }

  function renderActivityRow(movement, planMap) {
    var plan = planMap[movement.savingsPlanId];
    var withdrawal = movement.type === "withdrawal";
    var meta = [dateText(movement.date)];
    if (movement.description) meta.push(movement.description);
    var account = accountName(movement.accountId);
    if (account) meta.push(account);

    return (
      '<div class="sv-activity-row">' +
      '<span class="sv-activity-icon' +
      (withdrawal ? " is-withdrawal" : "") +
      '">' +
      iconMarkup(withdrawal ? "arrow-up-right" : "arrow-down-left", "w-4 h-4") +
      "</span>" +
      '<div class="sv-activity-copy"><div class="sv-activity-title"><span>' +
      (withdrawal ? "Withdrawal from" : "Contribution to") +
      "</span>" +
      (plan
        ? '<button type="button" class="sv-activity-plan" data-sv-action="details" data-sv-id="' +
          escapeHtml(plan.id) +
          '">' +
          escapeHtml(plan.name) +
          "</button>"
        : "<strong>Unknown plan</strong>") +
      "</div><small>" +
      escapeHtml(meta.join(" · ")) +
      "</small></div>" +
      '<span class="sv-activity-amount' +
      (withdrawal ? " is-negative" : "") +
      '">' +
      (withdrawal ? "-" : "+") +
      money(movement.amount) +
      "<small>" +
      escapeHtml(movementTypeLabel(movement.type)) +
      "</small></span></div>"
    );
  }

  function renderActivity() {
    var result = activityRows();
    var list = byId("sv-activity-list");
    var summary = byId("sv-activity-summary");
    if (!list) return;

    var totalIn = result.rows.reduce(function (sum, movement) {
      return movement.type === "contribution" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    var totalOut = result.rows.reduce(function (sum, movement) {
      return movement.type === "withdrawal" ? sum + Number(movement.amount || 0) : sum;
    }, 0);
    if (summary) {
      summary.textContent = result.rows.length
        ? result.rows.length +
          " movement" +
          (result.rows.length === 1 ? "" : "s") +
          " · " +
          money(totalIn) +
          " in · " +
          money(totalOut) +
          " out"
        : "Every contribution and withdrawal stored in your savings plans.";
    }

    if (!result.rows.length) {
      list.innerHTML =
        '<div class="sv-activity-empty">No savings movements match these filters. Contributions and withdrawals will appear here.</div>';
      return;
    }
    list.innerHTML = result.rows
      .map(function (movement) {
        return renderActivityRow(movement, result.planMap);
      })
      .join("");
  }

  function resetActivityFilters() {
    state.activitySearch = "";
    state.activityType = "all";
    state.activityPlan = "all";
    state.activityFrom = "";
    state.activityTo = "";
    state.activitySort = "newest";
    if (byId("sv-activity-search")) byId("sv-activity-search").value = "";
    if (byId("sv-activity-type")) byId("sv-activity-type").value = "all";
    if (byId("sv-activity-from")) byId("sv-activity-from").value = "";
    if (byId("sv-activity-to")) byId("sv-activity-to").value = "";
    if (byId("sv-activity-sort")) byId("sv-activity-sort").value = "newest";
    renderActivityPlanOptions();
    renderActivity();
  }

  /* ---------- Plan form ---------- */

  function goalOptionsForPlan(planId, selectedGoalId) {
    var goals = data.getGoals().filter(function (goal) {
      return !goal.savingsPlanId || goal.savingsPlanId === planId;
    });
    goals.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    var html = '<option value="">No linked goal</option>';
    goals.forEach(function (goal) {
      html +=
        '<option value="' +
        escapeHtml(goal.id) +
        '">' +
        escapeHtml(goal.name) +
        " · " +
        escapeHtml(money(goal.targetAmount)) +
        "</option>";
    });
    var select = byId("sv-plan-goal");
    var hint = byId("sv-plan-goal-hint");
    if (!select) return;
    select.innerHTML = html;
    select.value = selectedGoalId || "";
    if (hint) {
      hint.textContent = goals.length
        ? "A linked goal reads this plan's saved balance. One plan can support one goal."
        : "No unlinked goals are available. Create a goal from Goals first, or save this plan without a goal.";
    }
  }

  function openPlanModal(planId) {
    var plan = planId ? data.getSavingsPlan(planId) : null;
    if (planId && !plan) return;
    var form = byId("sv-plan-form");
    if (!form) return;

    state.editingId = planId || null;
    form.reset();
    setFormError("sv-plan-error", "");

    var linkedGoal = plan ? goalLinkedToPlan(plan.id) : null;
    if (plan) {
      byId("sv-plan-name").value = plan.name || "";
      byId("sv-plan-target").value = Number(plan.targetAmount || 0);
      byId("sv-plan-status").value = plan.status || "active";
      byId("sv-plan-purpose").value = plan.purpose || "";
      byId("sv-plan-notes").value = plan.notes || "";
    }
    goalOptionsForPlan(planId || null, linkedGoal ? linkedGoal.id : "");

    setText(
      "sv-plan-modal-title",
      plan ? "Edit savings plan" : "New savings plan"
    );
    setText(
      "sv-plan-modal-subtitle",
      plan
        ? "Update the plan or change the goal it supports."
        : "Set a target and choose whether this plan supports a goal."
    );
    byId("sv-plan-submit").innerHTML =
      iconMarkup("check", "w-4 h-4") +
      "<span>" +
      (plan ? "Save changes" : "Create plan") +
      "</span>";

    showModal("sv-plan-modal");
    window.setTimeout(function () {
      var name = byId("sv-plan-name");
      if (name) name.focus();
    }, 80);
  }

  function submitPlanForm(event) {
    event.preventDefault();
    var editingId = state.editingId;
    var name = byId("sv-plan-name").value.trim();
    var target = Number(byId("sv-plan-target").value);
    var status = byId("sv-plan-status").value;
    var purpose = byId("sv-plan-purpose").value.trim();
    var notes = byId("sv-plan-notes").value.trim();
    var selectedGoalId = byId("sv-plan-goal").value;

    if (!name) {
      setFormError("sv-plan-error", "Enter a name for this savings plan.");
      return;
    }
    if (name.length > 80) {
      setFormError("sv-plan-error", "Plan name must be 80 characters or fewer.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setFormError("sv-plan-error", "Target amount must be greater than zero.");
      return;
    }
    if (!STATUS_META[status]) {
      setFormError("sv-plan-error", "Choose a valid plan status.");
      return;
    }
    if (purpose.length > 240) {
      setFormError("sv-plan-error", "Purpose must be 240 characters or fewer.");
      return;
    }
    if (notes.length > 300) {
      setFormError("sv-plan-error", "Notes must be 300 characters or fewer.");
      return;
    }

    var selectedGoal = selectedGoalId ? data.getGoal(selectedGoalId) : null;
    if (selectedGoalId && !selectedGoal) {
      setFormError("sv-plan-error", "The selected goal could not be found.");
      return;
    }
    if (
      selectedGoal &&
      selectedGoal.savingsPlanId &&
      selectedGoal.savingsPlanId !== editingId
    ) {
      setFormError(
        "sv-plan-error",
        "That goal is already linked to another savings plan."
      );
      return;
    }

    var payload = {
      name: name,
      purpose: purpose,
      targetAmount: roundMoney(target),
      status: status,
      notes: notes
    };
    var createdId = null;

    try {
      var plan;
      if (editingId) {
        plan = data.updateSavingsPlan(editingId, payload);
      } else {
        plan = data.createSavingsPlan(payload);
        createdId = plan.id;
      }

      data.getGoals().forEach(function (goal) {
        if (goal.savingsPlanId === plan.id && goal.id !== selectedGoalId) {
          data.updateGoal(goal.id, { savingsPlanId: null });
        }
      });
      if (selectedGoalId) {
        data.updateGoal(selectedGoalId, { savingsPlanId: plan.id });
      }

      hideModal("sv-plan-modal");
      state.editingId = null;
      showToast(
        editingId ? "Savings plan updated" : "Savings plan created",
        "“" + name + "” has been saved.",
        "success"
      );
      renderAll();
    } catch (error) {
      if (createdId) {
        try {
          data.deleteSavingsPlan(createdId);
        } catch (rollbackError) {
          /* Keep the original error visible. */
        }
      }
      setFormError(
        "sv-plan-error",
        error.message || "Could not save this savings plan."
      );
    }
  }

  /* ---------- Movement form ---------- */

  function renderMovementAccounts() {
    var select = byId("sv-movement-account");
    if (!select) return;
    var accounts = data.getAccounts();
    var html = '<option value="">No source account</option>';
    accounts.forEach(function (account) {
      html +=
        '<option value="' +
        escapeHtml(account.id) +
        '">' +
        escapeHtml(account.name) +
        "</option>";
    });
    select.innerHTML = html;
  }

  function openMovementModal(planId, type) {
    var plan = data.getSavingsPlan(planId);
    if (!plan) {
      showToast("Plan not found", "This savings plan may have been removed.", "error");
      return;
    }
    var movementType = type === "withdrawal" ? "withdrawal" : "contribution";
    var saved = data.getSavingsPlanSavedAmount(plan.id);
    if (movementType === "withdrawal" && saved <= 0) {
      showToast(
        "Nothing to withdraw",
        "This plan has no saved balance available to withdraw.",
        "info"
      );
      return;
    }

    state.movementPlanId = plan.id;
    state.movementType = movementType;
    var form = byId("sv-movement-form");
    if (!form) return;
    form.reset();
    setFormError("sv-movement-error", "");
    renderMovementAccounts();
    byId("sv-movement-date").value = today();
    byId("sv-movement-amount").value = "";

    var summary = byId("sv-movement-summary");
    if (summary) {
      summary.innerHTML =
        '<span class="sv-plan-icon is-' +
        escapeHtml(planTone(plan.status)) +
        '">' +
        iconMarkup(statusMeta(plan.status).icon, "w-4 h-4") +
        "</span>" +
        '<div class="sv-movement-summary-copy"><strong>' +
        escapeHtml(plan.name) +
        "</strong><span>" +
        (movementType === "withdrawal" ? "Current plan balance" : "Saved toward target") +
        "</span></div>" +
        '<div class="sv-movement-summary-amount">' +
        money(saved) +
        "<small>" +
        (plan.targetAmount ? money(plan.targetAmount) + " target" : "No target") +
        "</small></div>";
    }

    setText(
      "sv-movement-title",
      movementType === "withdrawal" ? "Withdraw funds" : "Add funds"
    );
    setText(
      "sv-movement-subtitle",
      movementType === "withdrawal"
        ? "Record a withdrawal from “" + plan.name + "”."
        : "Record a contribution into “" + plan.name + "”."
    );

    var amount = byId("sv-movement-amount");
    if (amount) {
      amount.min = "0.01";
      amount.max = movementType === "withdrawal" ? String(saved) : "";
    }
    setText(
      "sv-movement-available",
      movementType === "withdrawal"
        ? "Available to withdraw: " + money(saved)
        : "Must be greater than zero."
    );

    var note = byId("sv-movement-note");
    if (note) {
      note.className =
        "sv-movement-note" + (movementType === "withdrawal" ? " is-warning" : "");
      note.innerHTML =
        iconMarkup("info") +
        "<span>" +
        (movementType === "withdrawal"
          ? "This records a savings withdrawal only. It cannot exceed the plan balance, and no income, expense or transaction is created."
          : "This records a savings contribution only. No income, expense or transaction is created.") +
        "</span>";
    }

    byId("sv-movement-submit").innerHTML =
      iconMarkup(movementType === "withdrawal" ? "arrow-up-right" : "plus", "w-4 h-4") +
      "<span>" +
      (movementType === "withdrawal" ? "Record withdrawal" : "Add contribution") +
      "</span>";

    showModal("sv-movement-modal");
    window.setTimeout(function () {
      if (amount) amount.focus();
    }, 80);
  }

  function submitMovementForm(event) {
    event.preventDefault();
    var plan = data.getSavingsPlan(state.movementPlanId);
    if (!plan) {
      setFormError("sv-movement-error", "This savings plan could not be found.");
      return;
    }

    var movementType = state.movementType;
    var amount = Number(byId("sv-movement-amount").value);
    var date = byId("sv-movement-date").value;
    var accountId = byId("sv-movement-account").value;
    var description = byId("sv-movement-description").value.trim();
    var saved = data.getSavingsPlanSavedAmount(plan.id);

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("sv-movement-error", "Amount must be greater than zero.");
      return;
    }
    if (!data.isDateOnly(date)) {
      setFormError("sv-movement-error", "Choose a valid movement date.");
      return;
    }
    if (movementType === "withdrawal" && amount > saved + 0.005) {
      setFormError(
        "sv-movement-error",
        "Withdrawal cannot exceed the available plan balance of " + money(saved) + "."
      );
      return;
    }
    if (accountId && !data.getAccount(accountId)) {
      setFormError("sv-movement-error", "The selected source account could not be found.");
      return;
    }

    try {
      data.createSavingsMovement({
        type: movementType,
        savingsPlanId: plan.id,
        amount: roundMoney(amount),
        date: date,
        accountId: accountId || undefined,
        description: description
      });

      var newSaved = roundMoney(
        saved + (movementType === "contribution" ? amount : -amount)
      );
      var statusUpdate = null;
      if (
        movementType === "contribution" &&
        plan.status === "active" &&
        plan.targetAmount > 0 &&
        newSaved >= Number(plan.targetAmount)
      ) {
        statusUpdate = "completed";
      } else if (
        movementType === "withdrawal" &&
        plan.status === "completed" &&
        newSaved < Number(plan.targetAmount)
      ) {
        statusUpdate = "active";
      }
      if (statusUpdate) {
        try {
          data.updateSavingsPlan(plan.id, { status: statusUpdate });
        } catch (statusError) {
          /* The movement is still valid even if the status update fails. */
        }
      }

      hideModal("sv-movement-modal");
      state.movementPlanId = null;
      showToast(
        movementType === "contribution" ? "Contribution recorded" : "Withdrawal recorded",
        money(amount) +
          (movementType === "contribution" ? " added to " : " withdrawn from ") +
          "“" +
          plan.name +
          "”. No income or expense was created.",
        "success"
      );
      renderAll();
    } catch (error) {
      setFormError(
        "sv-movement-error",
        error.message || "Could not record this savings movement."
      );
    }
  }

  /* ---------- Plan details ---------- */

  function buildBalanceSeries(movements) {
    if (!movements.length) return [];
    var grouped = {};
    movements.slice().sort(movementSortOldest).forEach(function (movement) {
      var amount =
        movement.type === "contribution"
          ? Number(movement.amount || 0)
          : -Number(movement.amount || 0);
      grouped[movement.date] = (grouped[movement.date] || 0) + amount;
    });

    var running = 0;
    return Object.keys(grouped)
      .sort()
      .map(function (date) {
        running = roundMoney(running + grouped[date]);
        return { date: date, value: running };
      });
  }

  function chartPalette() {
    var styles = window.getComputedStyle(document.documentElement);
    var dark = document.documentElement.classList.contains("dark");
    return {
      muted: (styles.getPropertyValue("--muted") || "").trim() || "#64748b",
      border: (styles.getPropertyValue("--border") || "").trim() || "#e2e8f0",
      grid: dark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.07)",
      tooltipBg: dark ? "rgba(2, 6, 23, 0.94)" : "rgba(255, 255, 255, 0.97)",
      tooltipText: dark ? "#e2e8f0" : "#0f172a",
      pointBorder: dark ? "#0c0d11" : "#ffffff"
    };
  }

  function axisMoney(value) {
    var number = Number(value) || 0;
    try {
      return data.formatCurrency(number, {
        currency: data.getSettings().currency || data.DEFAULT_CURRENCY,
        notation: "compact",
        maximumFractionDigits: 1
      });
    } catch (error) {
      return money(number);
    }
  }

  function destroyBalanceChart() {
    if (state.balanceChart) {
      try {
        state.balanceChart.destroy();
      } catch (error) {
        /* noop */
      }
      state.balanceChart = null;
    }
  }

  function renderBalanceChart(movements) {
    var canvas = byId("sv-balance-chart");
    if (!canvas || typeof Chart === "undefined") return;
    var series = buildBalanceSeries(movements);
    if (!series.length) return;
    var palette = chartPalette();
    var context = canvas.getContext("2d");
    var gradient = context.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.24)");
    gradient.addColorStop(1, "rgba(99, 102, 241, 0)");
    destroyBalanceChart();
    if (typeof Chart.getChart === "function") {
      var stale = Chart.getChart(canvas);
      if (stale) stale.destroy();
    }
    state.balanceChart = new Chart(context, {
      type: "line",
      data: {
        labels: series.map(function (point) {
          return dateText(point.date);
        }),
        datasets: [
          {
            label: "Plan balance",
            data: series.map(function (point) {
              return point.value;
            }),
            borderColor: "#6366f1",
            backgroundColor: gradient,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "#6366f1",
            pointBorderColor: palette.pointBorder,
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
            padding: 11,
            callbacks: {
              label: function (context) {
                return "Balance: " + money(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: palette.muted,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 6,
              font: { size: 9, weight: "600" }
            }
          },
          y: {
            grid: { color: palette.grid },
            border: { display: false },
            ticks: {
              color: palette.muted,
              font: { size: 9, weight: "600" },
              callback: axisMoney
            }
          }
        }
      }
    });
  }

  function buildChart(movements) {
    var series = buildBalanceSeries(movements);
    if (!series.length) {
      return (
        '<div class="sv-chart-card"><div class="sv-chart-empty">' +
        iconMarkup("line-chart", "w-5 h-5") +
        "<strong>No movements recorded yet</strong>" +
        "<p>The balance chart appears after your first contribution or withdrawal.</p>" +
        "</div></div>"
      );
    }
    var lastPoint = series[series.length - 1];
    return (
      '<div class="sv-chart-card">' +
      '<div class="sv-chart-canvas"><canvas id="sv-balance-chart" role="img" aria-label="' +
      escapeHtml("Savings balance over time, current balance " + money(lastPoint.value)) +
      '"></canvas></div>' +
      '<div class="sv-chart-meta"><span>' +
      escapeHtml(dateText(series[0].date)) +
      "</span><span><strong>" +
      money(lastPoint.value) +
      "</strong> current balance</span><span>" +
      escapeHtml(dateText(lastPoint.date)) +
      "</span></div></div>"
    );
  }

  function movementRow(movement) {
    var withdrawal = movement.type === "withdrawal";
    var meta = [dateText(movement.date)];
    if (movement.description) meta.push(movement.description);
    var account = accountName(movement.accountId);
    if (account) meta.push(account);
    return (
      '<div class="sv-movement-row">' +
      '<span class="sv-movement-icon' +
      (withdrawal ? " is-withdrawal" : "") +
      '">' +
      iconMarkup(withdrawal ? "arrow-up-right" : "arrow-down-left", "w-4 h-4") +
      "</span>" +
      '<div class="sv-movement-copy"><strong>' +
      escapeHtml(movementTypeLabel(movement.type)) +
      "</strong><small>" +
      escapeHtml(meta.join(" · ")) +
      "</small></div>" +
      '<span class="sv-movement-amount' +
      (withdrawal ? " is-negative" : "") +
      '">' +
      (withdrawal ? "-" : "+") +
      money(movement.amount) +
      "</span></div>"
    );
  }

  function goalCard(goal) {
    var progress = data.getGoalProgress(goal.id);
    var noteParts = ["Target " + money(goal.targetAmount)];
    if (data.isDateOnly(goal.targetDate)) {
      noteParts.push("Due " + dateText(goal.targetDate));
    }
    if (progress && progress.percentage != null) {
      noteParts.push(percentText(progress.percentage) + " funded");
    }
    return (
      '<div class="sv-goal-card">' +
      '<span class="sv-goal-card-icon">' +
      iconMarkup("target", "w-4 h-4") +
      "</span>" +
      '<div class="sv-goal-card-copy"><strong>' +
      escapeHtml(goal.name) +
      "</strong><p>" +
      escapeHtml(noteParts.join(" · ")) +
      "</p></div>" +
      '<a class="sv-btn sv-btn-ghost sv-btn-small sv-goal-card-action" href="./goals.html">Open goal</a>' +
      "</div>"
    );
  }

  function renderDetails() {
    if (!state.detailsId) return;
    var plan = data.getSavingsPlan(state.detailsId);
    if (!plan) {
      state.detailsId = null;
      hideModal("sv-details-modal");
      return;
    }

    var model = buildPlanModels().find(function (item) {
      return item.plan.id === plan.id;
    });
    if (!model) return;
    var status = statusMeta(plan.status);
    var percent = model.percent == null ? 0 : model.percent;
    var progressWidth = clamp(percent, 0, 100);
    var protectedPlan = model.movementCount > 0 || Boolean(model.linkedGoal);
    var movementRows = model.movements.slice().sort(movementSortNewest);

    setText("sv-details-title", "Savings plan details");
    setText(
      "sv-details-subtitle",
      plan.purpose || "Progress, goal connection and recorded activity."
    );

    var destructiveAction = "";
    if (protectedPlan) {
      if (plan.status !== "archived") {
        destructiveAction =
          '<button type="button" class="sv-btn sv-btn-ghost sv-btn-small" data-sv-action="archive" data-sv-id="' +
          escapeHtml(plan.id) +
          '">' +
          iconMarkup("archive", "w-4 h-4") +
          "<span>Archive</span></button>";
      }
    } else {
      destructiveAction =
        '<button type="button" class="sv-btn sv-btn-danger sv-btn-small" data-sv-action="delete" data-sv-id="' +
        escapeHtml(plan.id) +
        '">' +
        iconMarkup("trash-2", "w-4 h-4") +
        "<span>Delete</span></button>";
    }

    var infoRows =
      '<dl class="sv-details-list">' +
      '<div class="sv-details-row"><dt>Status</dt><dd>' +
      escapeHtml(status.label) +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Purpose</dt><dd>' +
      escapeHtml(plan.purpose || "No purpose added") +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Created</dt><dd>' +
      escapeHtml(timeText(plan.createdAt) || "Unknown") +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Last updated</dt><dd>' +
      escapeHtml(timeText(plan.updatedAt) || "Unknown") +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Contributions</dt><dd>' +
      escapeHtml(model.contributionTotal ? money(model.contributionTotal) : money(0)) +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Withdrawals</dt><dd>' +
      escapeHtml(model.withdrawalTotal ? money(model.withdrawalTotal) : money(0)) +
      "</dd></div>" +
      '<div class="sv-details-row"><dt>Notes</dt><dd>' +
      (plan.notes
        ? escapeHtml(plan.notes).replace(/\n/g, "<br>")
        : "No notes added") +
      "</dd></div></div>";

    var body =
      '<div class="sv-details-head">' +
      '<span class="sv-plan-icon is-' +
      escapeHtml(planTone(plan.status)) +
      '">' +
      iconMarkup(status.icon, "w-4 h-4") +
      "</span>" +
      '<div class="sv-details-identity"><h4>' +
      escapeHtml(plan.name) +
      "</h4><p>" +
      escapeHtml(plan.purpose || "No purpose added") +
      '</p><div class="sv-details-pills"><span class="sv-status-pill is-' +
      escapeHtml(status.tone) +
      '">' +
      escapeHtml(status.label) +
      "</span>" +
      (model.linkedGoal
        ? '<span class="sv-tag is-goal">' +
          iconMarkup("target", "w-4 h-4") +
          "<span>" +
          escapeHtml(model.linkedGoal.name) +
          "</span></span>"
        : "") +
      "</div></div></div>" +
      '<div class="sv-details-stats">' +
      '<div class="sv-details-stat"><span>Saved</span><strong' +
      (model.saved > 0 ? ' class="is-positive"' : model.saved < 0 ? ' class="is-negative"' : "") +
      ">" +
      money(model.saved) +
      "</strong></div>" +
      '<div class="sv-details-stat"><span>Target</span><strong>' +
      money(model.target) +
      "</strong></div>" +
      '<div class="sv-details-stat"><span>Remaining</span><strong' +
      (model.remaining < 0 ? ' class="is-negative"' : "") +
      ">" +
      money(model.remaining) +
      "</strong></div></div>" +
      '<div class="sv-details-progress"><div class="sv-details-progress-head"><span>' +
      (model.percent == null ? "No target set" : percentText(model.percent) + " funded") +
      "</span><strong>" +
      (model.target > 0 ? money(model.saved) + " of " + money(model.target) : "No target") +
      '</strong></div><div class="sv-progress"><div class="' +
      (model.saved < 0
        ? "sv-progress-fill is-negative"
        : percent >= 100
          ? "sv-progress-fill is-complete"
          : plan.status === "paused"
            ? "sv-progress-fill is-warning"
            : "sv-progress-fill") +
      '" style="width: ' +
      progressWidth.toFixed(2) +
      '%"></div></div></div>' +
      '<section class="sv-details-section"><div class="sv-details-section-head"><h4>Balance over time</h4><span>' +
      model.movementCount +
      " movement" +
      (model.movementCount === 1 ? "" : "s") +
      "</span></div>" +
      buildChart(model.movements) +
      "</section>" +
      '<section class="sv-details-section"><div class="sv-details-section-head"><h4>Linked financial goal</h4></div>' +
      (model.linkedGoal
        ? goalCard(model.linkedGoal)
        : '<div class="sv-details-empty">Not linked to a financial goal. Edit this plan to connect one.</div>') +
      "</section>" +
      '<section class="sv-details-section"><div class="sv-details-section-head"><h4>Plan information</h4></div>' +
      infoRows +
      "</section>" +
      '<section class="sv-details-section"><div class="sv-details-section-head"><h4>Contribution &amp; withdrawal history</h4><span>' +
      movementRows.length +
      " record" +
      (movementRows.length === 1 ? "" : "s") +
      "</span></div>" +
      (movementRows.length
        ? '<div class="sv-movement-list">' +
          movementRows
            .map(function (movement) {
              return movementRow(movement);
            })
            .join("") +
          "</div>"
        : '<div class="sv-details-empty">No contributions or withdrawals recorded yet.</div>') +
      "</section>" +
      '<p class="sv-details-note">Savings plans are amounts set aside inside your accounts. Contributions and withdrawals change only the plan balance; they do not create income, expenses or transactions.</p>' +
      '<div class="sv-details-actions"><div class="sv-details-actions-group">' +
      (plan.status !== "archived"
        ? '<button type="button" class="sv-btn sv-btn-primary sv-btn-small" data-sv-action="add" data-sv-id="' +
          escapeHtml(plan.id) +
          '">' +
          iconMarkup("plus", "w-4 h-4") +
          "<span>Add funds</span></button>"
        : "") +
      (plan.status !== "archived" && model.saved > 0
        ? '<button type="button" class="sv-btn sv-btn-ghost sv-btn-small" data-sv-action="withdraw" data-sv-id="' +
          escapeHtml(plan.id) +
          '">' +
          iconMarkup("arrow-up-right", "w-4 h-4") +
          "<span>Withdraw</span></button>"
        : "") +
      '<button type="button" class="sv-btn sv-btn-ghost sv-btn-small" data-sv-action="edit" data-sv-id="' +
      escapeHtml(plan.id) +
      '">' +
      iconMarkup("pencil", "w-4 h-4") +
      "<span>Edit</span></button></div>" +
      '<div class="sv-details-actions-group">' +
      destructiveAction +
      "</div></div>";

    destroyBalanceChart();
    var bodyEl = byId("sv-details-body");
    if (bodyEl) bodyEl.innerHTML = body;
    renderBalanceChart(model.movements);
    refreshIcons();
  }

  function openDetails(planId) {
    if (!data.getSavingsPlan(planId)) return;
    state.detailsId = planId;
    renderDetails();
    showModal("sv-details-modal");
  }

  /* ---------- Confirm, modal and toast ---------- */

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
    if (id === "sv-details-modal") {
      state.detailsId = null;
      destroyBalanceChart();
    }
    if (!document.querySelector(".modal.open")) {
      document.body.style.overflow = "";
    }
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
    toast.className = "toast sv-toast show";
    if (toastIcon) {
      toastIcon.className =
        "sv-toast-icon is-" +
        toastType +
        " flex items-center justify-center flex-shrink-0";
      toastIcon.innerHTML = iconMarkup(TOAST_ICONS[toastType] || "check", "w-5 h-5");
    }
    refreshIcons();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  function openConfirm(options) {
    var settings = options || {};
    setText("sv-confirm-title", settings.title || "Confirm action");
    setText(
      "sv-confirm-subtitle",
      settings.subtitle || "This action needs your confirmation."
    );
    setText("sv-confirm-copy", settings.message || "");
    var action = byId("sv-confirm-action");
    if (action) {
      action.textContent = settings.confirmLabel || "Confirm";
      action.className =
        "sv-btn " + (settings.danger === false ? "sv-btn-primary" : "sv-btn-danger");
    }
    state.confirmHandler = settings.onConfirm || null;
    showModal("sv-confirm-modal");
  }

  function requestDelete(planId) {
    var plan = data.getSavingsPlan(planId);
    if (!plan) return;
    var movements = data.getSavingsMovements({ savingsPlanId: planId });
    var linkedGoal = goalLinkedToPlan(planId);
    if (movements.length || linkedGoal) {
      requestArchive(planId);
      return;
    }
    openConfirm({
      title: "Delete savings plan?",
      subtitle: "This removes the plan record permanently.",
      message:
        "“" +
        plan.name +
        "” will be deleted. It has no movements or linked goals, so no savings balance will change.",
      confirmLabel: "Delete plan",
      onConfirm: function () {
        try {
          data.deleteSavingsPlan(planId);
          hideModal("sv-confirm-modal");
          if (state.detailsId === planId) hideModal("sv-details-modal");
          showToast("Savings plan deleted", "“" + plan.name + "” was removed.", "success");
          renderAll();
        } catch (error) {
          hideModal("sv-confirm-modal");
          showToast("Could not delete plan", error.message, "error");
        }
      }
    });
  }

  function requestArchive(planId) {
    var plan = data.getSavingsPlan(planId);
    if (!plan) return;
    if (plan.status === "archived") {
      showToast("Plan already archived", "This plan is already archived.", "info");
      return;
    }
    var movements = data.getSavingsMovements({ savingsPlanId: planId });
    var linkedGoal = goalLinkedToPlan(planId);
    var protection = [];
    if (movements.length) {
      protection.push(
        movements.length + " recorded movement" + (movements.length === 1 ? "" : "s")
      );
    }
    if (linkedGoal) protection.push("a linked goal (“" + linkedGoal.name + "”)");
    openConfirm({
      title: "Archive savings plan?",
      subtitle: "Archiving keeps the plan and its history.",
      message:
        "“" +
        plan.name +
        "” will be archived" +
        (protection.length ? " with " + protection.join(" and ") + " kept intact" : "") +
        ". You can reactivate it by editing its status.",
      confirmLabel: "Archive plan",
      danger: false,
      onConfirm: function () {
        try {
          data.updateSavingsPlan(planId, { status: "archived" });
          hideModal("sv-confirm-modal");
          if (state.detailsId === planId) hideModal("sv-details-modal");
          showToast(
            "Savings plan archived",
            "“" + plan.name + "” was archived without changing its balance.",
            "success"
          );
          renderAll();
        } catch (error) {
          hideModal("sv-confirm-modal");
          showToast("Could not archive plan", error.message, "error");
        }
      }
    });
  }

  /* ---------- Actions and events ---------- */

  function handleAction(event) {
    var target = event.target.closest("[data-sv-action]");
    if (!target) return;
    var action = target.getAttribute("data-sv-action");
    var planId = target.getAttribute("data-sv-id");

    if (action === "new") {
      openPlanModal(null);
      return;
    }
    if (action === "reset-plans") {
      state.search = "";
      state.sort = "updated";
      state.filterStatus = "all";
      if (byId("sv-plan-search")) byId("sv-plan-search").value = "";
      if (byId("sv-plan-sort")) byId("sv-plan-sort").value = "updated";
      document.querySelectorAll("[data-sv-status]").forEach(function (chip) {
        chip.classList.toggle(
          "active",
          chip.getAttribute("data-sv-status") === state.filterStatus
        );
      });
      renderPlans(buildPlanModels());
      refreshIcons();
      return;
    }
    if (action === "reset-activity") {
      resetActivityFilters();
      refreshIcons();
      return;
    }
    if (!planId) return;

    if (action === "details") {
      openDetails(planId);
    } else if (action === "add" || action === "withdraw") {
      hideModal("sv-details-modal");
      openMovementModal(planId, action === "withdraw" ? "withdrawal" : "contribution");
    } else if (action === "edit") {
      hideModal("sv-details-modal");
      openPlanModal(planId);
    } else if (action === "archive") {
      requestArchive(planId);
    } else if (action === "delete") {
      requestDelete(planId);
    }
  }

  function bindEvents() {
    var newPlan = byId("sv-new-plan");
    if (newPlan) {
      newPlan.addEventListener("click", function () {
        openPlanModal(null);
      });
    }

    var search = byId("sv-plan-search");
    if (search) {
      search.addEventListener("input", function () {
        state.search = search.value;
        renderPlans(buildPlanModels());
        refreshIcons();
      });
    }

    var sort = byId("sv-plan-sort");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        renderPlans(buildPlanModels());
        refreshIcons();
      });
    }

    var statusFilters = byId("sv-status-filters");
    if (statusFilters) {
      statusFilters.addEventListener("click", function (event) {
        var chip = event.target.closest("[data-sv-status]");
        if (!chip) return;
        state.filterStatus = chip.getAttribute("data-sv-status");
        statusFilters.querySelectorAll("[data-sv-status]").forEach(function (item) {
          item.classList.toggle("active", item === chip);
        });
        renderPlans(buildPlanModels());
        refreshIcons();
      });
    }

    var planGrid = byId("sv-plan-grid");
    if (planGrid) planGrid.addEventListener("click", handleAction);

    var detailsBody = byId("sv-details-body");
    if (detailsBody) detailsBody.addEventListener("click", handleAction);

    var activityList = byId("sv-activity-list");
    if (activityList) activityList.addEventListener("click", handleAction);

    var activitySearch = byId("sv-activity-search");
    if (activitySearch) {
      activitySearch.addEventListener("input", function () {
        state.activitySearch = activitySearch.value;
        renderActivity();
      });
    }

    var activityType = byId("sv-activity-type");
    if (activityType) {
      activityType.addEventListener("change", function () {
        state.activityType = activityType.value;
        renderActivity();
      });
    }

    var activityPlan = byId("sv-activity-plan");
    if (activityPlan) {
      activityPlan.addEventListener("change", function () {
        state.activityPlan = activityPlan.value;
        renderActivity();
      });
    }

    var activityFrom = byId("sv-activity-from");
    if (activityFrom) {
      activityFrom.addEventListener("change", function () {
        state.activityFrom = activityFrom.value;
        renderActivity();
      });
    }

    var activityTo = byId("sv-activity-to");
    if (activityTo) {
      activityTo.addEventListener("change", function () {
        state.activityTo = activityTo.value;
        renderActivity();
      });
    }

    var activitySort = byId("sv-activity-sort");
    if (activitySort) {
      activitySort.addEventListener("change", function () {
        state.activitySort = activitySort.value;
        renderActivity();
      });
    }

    var resetActivity = byId("sv-activity-reset");
    if (resetActivity) {
      resetActivity.addEventListener("click", function () {
        resetActivityFilters();
        refreshIcons();
      });
    }

    var planForm = byId("sv-plan-form");
    if (planForm) planForm.addEventListener("submit", submitPlanForm);

    var movementForm = byId("sv-movement-form");
    if (movementForm) movementForm.addEventListener("submit", submitMovementForm);

    var confirmAction = byId("sv-confirm-action");
    if (confirmAction) {
      confirmAction.addEventListener("click", function () {
        if (typeof state.confirmHandler === "function") {
          state.confirmHandler();
        }
      });
    }

    document.addEventListener("click", function (event) {
      var close = event.target.closest("[data-sv-close]");
      if (close) {
        hideModal(close.getAttribute("data-sv-close"));
        return;
      }
      if (event.target.classList && event.target.classList.contains("modal")) {
        hideModal(event.target.id);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      document.querySelectorAll(".modal.open").forEach(function (modal) {
        modal.classList.remove("open");
      });
      state.detailsId = null;
      document.body.style.overflow = "";
    });

    if (data.subscribe) {
      data.subscribe(function () {
        renderAll();
      });
    }
    window.addEventListener("storage", function (event) {
      if (event.key === data.STORAGE_KEY) window.location.reload();
    });
  }

  function renderAll() {
    renderShell();
    renderPosition();
    var models = buildPlanModels();
    renderOverview(models);
    renderInsights(models);
    renderPlans(models);
    renderActivityPlanOptions();
    renderActivity();
    if (state.detailsId) renderDetails();
    refreshIcons();
  }

  function installThemeObserver() {
    if (!window.MutationObserver) return;
    var dark = document.documentElement.classList.contains("dark");
    var observer = new MutationObserver(function () {
      var next = document.documentElement.classList.contains("dark");
      if (next === dark) return;
      dark = next;
      if (state.detailsId) {
        var plan = data.getSavingsPlan(state.detailsId);
        if (plan) {
          renderBalanceChart(
            data.getSavingsMovements({ savingsPlanId: plan.id })
          );
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function init() {
    bindEvents();
    renderAll();
    installThemeObserver();
    refreshIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

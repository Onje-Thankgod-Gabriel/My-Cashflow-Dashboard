/* Gabsweb CashFlow — Goals & Planned Purchases */
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
  var GOAL_TYPES = {
    Savings: { icon: "coins", tone: "transfer" },
    "Emergency fund": { icon: "shield-check", tone: "warning" },
    Education: { icon: "graduation-cap", tone: "purple" },
    Travel: { icon: "plane", tone: "transfer" },
    Home: { icon: "home", tone: "income" },
    Vehicle: { icon: "car", tone: "warning" },
    Technology: { icon: "laptop", tone: "transfer" },
    Business: { icon: "briefcase", tone: "purple" },
    Family: { icon: "users", tone: "income" },
    Health: { icon: "heart-pulse", tone: "expense" },
    Other: { icon: "target", tone: "neutral" }
  };
  var PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  var state = {
    editingId: null,
    detailsId: null,
    addFundsGoalId: null,
    fundingMode: "create",
    filterStatus: "all",
    search: "",
    sort: "deadline",
    confirmHandler: null,
    progressChart: null
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

  function dateText(value) {
    return data.formatDate(value);
  }

  function today() {
    return data.todayKey();
  }

  function dateUtc(value) {
    if (!data.isDateOnly(value)) return null;
    var parts = value.split("-");
    return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function daysBetween(from, to) {
    var start = dateUtc(from);
    var end = dateUtc(to);
    if (start === null || end === null) return 0;
    return Math.round((end - start) / DAY_MS);
  }

  function goalCreatedDate(goal) {
    var parsed = goal.createdAt ? new Date(goal.createdAt) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
      var month = String(parsed.getMonth() + 1).padStart(2, "0");
      var day = String(parsed.getDate()).padStart(2, "0");
      return parsed.getFullYear() + "-" + month + "-" + day;
    }
    var created = String(goal.createdAt || "").slice(0, 10);
    return data.isDateOnly(created) ? created : today();
  }

  function statusLabel(status) {
    var value = String(status || "active");
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function typeConfig(goalType) {
    return GOAL_TYPES[goalType] || { icon: "target", tone: "neutral" };
  }

  function goalIcon(goalType, extraClass) {
    var config = typeConfig(goalType);
    return (
      '<span class="gl-goal-icon is-' +
      escapeHtml(config.tone) +
      " " +
      escapeHtml(extraClass || "") +
      '">' +
      iconMarkup(config.icon, "w-4 h-4") +
      "</span>"
    );
  }

  function getAccountName(accountId) {
    if (!accountId) return "";
    var account = data.getAccount(accountId);
    return account ? account.name : "";
  }

  /* ---------- Goal models ---------- */

  function assessGoal(goal, model) {
    if (goal.status === "completed") {
      return {
        key: "complete",
        label: "Completed",
        detail: "Marked completed. Linked savings remain in the savings plan."
      };
    }
    if (goal.status === "archived") {
      return {
        key: "neutral",
        label: "Archived",
        detail: "This goal is archived and excluded from active planning."
      };
    }
    if (!model.progressAvailable) {
      return {
        key: "neutral",
        label: "Funding not linked",
        detail: "Link or create a savings plan before progress can be assessed."
      };
    }
    if (model.percent >= 100) {
      return {
        key: "complete",
        label: "Target reached",
        detail: "Saved contributions cover the full goal target."
      };
    }
    if (model.daysLeft < 0) {
      return {
        key: "danger",
        label: "Overdue",
        detail:
          "The target date passed " +
          Math.abs(model.daysLeft) +
          " day" +
          (Math.abs(model.daysLeft) === 1 ? "" : "s") +
          " ago."
      };
    }
    if (model.daysLeft === 0) {
      return {
        key: "warning",
        label: "Due today",
        detail: model.percent + "% of the target is funded."
      };
    }

    var created = goalCreatedDate(goal);
    var totalDays = daysBetween(created, goal.targetDate);
    var elapsedDays = daysBetween(created, today());
    var expected =
      totalDays > 0 ? clamp((elapsedDays / totalDays) * 100, 0, 100) : 100;

    if (model.percent + 5 >= expected) {
      return {
        key: "success",
        label: "On track",
        detail:
          "About " +
          Math.round(expected) +
          "% expected by today; " +
          model.percent +
          "% funded."
      };
    }
    return {
      key: "warning",
      label: "Behind schedule",
      detail:
        "About " +
        Math.round(expected) +
        "% expected by today; " +
        model.percent +
        "% funded."
    };
  }

  function buildGoalModel(goal) {
    var progress = data.getGoalProgress(goal.id);
    var plan = goal.savingsPlanId ? data.getSavingsPlan(goal.savingsPlanId) : null;
    var movements = plan
      ? data.getSavingsMovements({ savingsPlanId: plan.id })
      : [];
    var progressAvailable = Boolean(progress && progress.available);
    var percent = progressAvailable
      ? Math.max(0, Number(progress.percentage || 0))
      : null;
    var daysLeft = daysBetween(today(), goal.targetDate);
    var model = {
      goal: goal,
      progress: progress,
      plan: plan,
      movements: movements,
      progressAvailable: progressAvailable,
      percent: percent,
      saved: progressAvailable ? Number(progress.currentAmount || 0) : null,
      target: Number(goal.targetAmount || 0),
      remaining:
        progressAvailable && progress.remainingAmount !== null
          ? Math.max(0, Number(progress.remainingAmount || 0))
          : null,
      daysLeft: daysLeft
    };
    model.assessment = assessGoal(goal, model);
    model.saved = model.saved === null ? null : roundMoney(model.saved);
    model.remaining = model.remaining === null ? null : roundMoney(model.remaining);
    return model;
  }

  function buildGoalModels() {
    return data.getGoals().map(buildGoalModel);
  }

  function deadlineLabel(model) {
    if (model.goal.status === "completed" || model.goal.status === "archived") {
      return "Target date " + dateText(model.goal.targetDate);
    }
    if (model.daysLeft > 0) {
      return "Due in " + model.daysLeft + (model.daysLeft === 1 ? " day" : " days");
    }
    if (model.daysLeft === 0) return "Due today";
    return (
      Math.abs(model.daysLeft) +
      (Math.abs(model.daysLeft) === 1 ? " day" : " days") +
      " overdue"
    );
  }

  function deadlineClass(model) {
    if (model.goal.status === "completed" || model.progressAvailable && model.percent >= 100) {
      return "is-done";
    }
    if (model.daysLeft < 0) return "is-overdue";
    if (model.daysLeft <= 30) return "is-soon";
    return "";
  }

  function attentionReason(model) {
    if (model.goal.status === "completed" || model.goal.status === "archived") {
      return null;
    }
    if (!model.progressAvailable) {
      return { reason: "Funding not linked", tone: "warning" };
    }
    if (model.percent >= 100) return null;
    if (model.daysLeft < 0) {
      return {
        reason:
          "Overdue by " +
          Math.abs(model.daysLeft) +
          " day" +
          (Math.abs(model.daysLeft) === 1 ? "" : "s"),
        tone: "danger"
      };
    }
    if (model.assessment.label === "Behind schedule") {
      return { reason: "Behind schedule", tone: "warning" };
    }
    return null;
  }

  /* ---------- Overview & shell ---------- */

  function renderShell() {
    var balanceEl = byId("sidebar-total-balance");
    var noteEl = byId("sidebar-balance-note");
    var available = data.getAvailableBalance();

    if (balanceEl) balanceEl.textContent = money(data.getTotalBalance());
    if (noteEl) {
      noteEl.textContent =
        available === null
          ? "Balance unavailable"
          : money(available) + " available after savings";
    }

    var chip = byId("gl-storage-chip");
    var label = byId("gl-storage-label");
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
      chip.title = "Your goal data is stored privately in this browser.";
    }
  }

  function renderOverview(models) {
    var active = models.filter(function (model) {
      return model.goal.status === "active";
    });
    var completed = models.filter(function (model) {
      return model.goal.status === "completed";
    });
    var paused = models.filter(function (model) {
      return model.goal.status === "paused";
    });
    var totalTarget = active.reduce(function (sum, model) {
      return sum + model.target;
    }, 0);
    var linkedTarget = 0;
    var totalSaved = 0;
    var linkedCount = 0;
    var seenPlans = {};

    active.forEach(function (model) {
      if (!model.progressAvailable || !model.goal.savingsPlanId) return;
      if (seenPlans[model.goal.savingsPlanId]) return;
      seenPlans[model.goal.savingsPlanId] = true;
      linkedCount += 1;
      linkedTarget += model.target;
      totalSaved += Number(model.saved || 0);
    });

    var overall =
      linkedTarget > 0 ? clamp((totalSaved / linkedTarget) * 100, 0, 999) : null;
    var next30 = active
      .filter(function (model) {
        return model.daysLeft >= 0 && model.daysLeft <= 30;
      })
      .sort(function (a, b) {
        return a.daysLeft - b.daysLeft;
      });

    var activeCountEl = byId("gl-active-count");
    var activeNoteEl = byId("gl-active-note");
    var targetEl = byId("gl-total-target");
    var targetNoteEl = byId("gl-target-note");
    var savedEl = byId("gl-total-saved");
    var savedNoteEl = byId("gl-saved-note");
    var overallEl = byId("gl-overall-progress");
    var overallNoteEl = byId("gl-overall-note");
    var upcomingEl = byId("gl-upcoming-count");
    var upcomingNoteEl = byId("gl-upcoming-note");

    if (activeCountEl) activeCountEl.textContent = String(active.length);
    if (activeNoteEl) {
      var activityBits = [];
      if (completed.length) activityBits.push(completed.length + " completed");
      if (paused.length) activityBits.push(paused.length + " paused");
      activeNoteEl.textContent = activityBits.length
        ? activityBits.join(" · ")
        : active.length
          ? "All active goals are in progress"
          : "No active goals yet";
    }
    if (targetEl) targetEl.textContent = money(totalTarget);
    if (targetNoteEl) {
      targetNoteEl.textContent =
        "Across " + active.length + " active goal" + (active.length === 1 ? "" : "s");
    }
    if (savedEl) savedEl.textContent = money(totalSaved);
    if (savedNoteEl) {
      savedNoteEl.textContent = linkedCount
        ? "From " + linkedCount + " linked savings plan" + (linkedCount === 1 ? "" : "s")
        : "No linked savings plans yet";
    }
    if (overallEl) {
      overallEl.textContent = overall === null ? "—" : percentText(overall);
      overallEl.classList.toggle("is-muted", overall === null);
    }
    if (overallNoteEl) {
      overallNoteEl.textContent = linkedCount
        ? "Based on " + linkedCount + " linked active goal" + (linkedCount === 1 ? "" : "s")
        : "Link a savings plan to measure progress";
    }
    if (upcomingEl) upcomingEl.textContent = String(next30.length);
    if (upcomingNoteEl) {
      upcomingNoteEl.textContent = next30.length
        ? "Nearest: " + next30[0].goal.name + " · " + dateText(next30[0].goal.targetDate)
        : "No deadlines in the next 30 days";
    }
  }

  /* ---------- Goal cards ---------- */

  function renderGoalCard(model) {
    var goal = model.goal;
    var config = typeConfig(goal.goalType);
    var cardClass =
      goal.status === "completed"
        ? " is-completed"
        : goal.status === "archived"
          ? " is-archived"
          : "";
    var fundingMarkup = "";

    if (model.progressAvailable) {
      var barClass =
        model.percent >= 100
          ? " is-complete"
          : model.assessment.label === "Overdue" ||
              model.assessment.label === "Behind schedule"
            ? " is-warning"
            : "";
      var remainingText =
        model.saved !== null && model.target > 0 && model.saved >= model.target
          ? "Target reached"
          : money(model.remaining || 0) + " left";
      var metaClass =
        model.saved !== null && model.saved >= model.target ? " is-positive" : "";
      fundingMarkup =
        '<div class="gl-goal-amount">' +
        "<span>Saved of target</span>" +
        "<strong>" +
        money(model.saved || 0) +
        " <small>of " +
        money(model.target) +
        "</small></strong>" +
        "</div>" +
        '<div class="gl-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        Math.min(100, Math.round(model.percent || 0)) +
        '" aria-label="' +
        escapeHtml(goal.name) +
        ' progress">' +
        '<div class="gl-progress-fill' +
        barClass +
        '" style="width:' +
        clamp(model.percent || 0, 0, 100) +
        '%"></div>' +
        "</div>" +
        '<div class="gl-goal-meta"><span>' +
        percentText(model.percent) +
        " funded</span><span class=\"" +
        metaClass.trim() +
        '">' +
        escapeHtml(remainingText) +
        "</span></div>";
    } else {
      fundingMarkup =
        '<div class="gl-funding-empty">' +
        iconMarkup("unlink", "w-4 h-4") +
        '<div class="gl-funding-empty-copy">' +
        "<strong>Funding not linked</strong>" +
        "<span>Link a savings plan to track this goal.</span>" +
        "</div>" +
        "</div>";
    }

    return (
      '<article class="gl-goal-card' +
      cardClass +
      '" data-gl-goal-id="' +
      escapeHtml(goal.id) +
      '">' +
      '<div class="gl-goal-top">' +
      '<div class="gl-goal-identity">' +
      goalIcon(goal.goalType) +
      '<div class="gl-goal-copy">' +
      '<h3 class="gl-goal-name">' +
      escapeHtml(goal.name) +
      "</h3>" +
      '<p class="gl-goal-type">' +
      iconMarkup(config.icon, "w-3 h-3") +
      escapeHtml(goal.goalType) +
      "</p>" +
      "</div></div>" +
      '<span class="gl-status-pill is-' +
      escapeHtml(goal.status) +
      '">' +
      escapeHtml(statusLabel(goal.status)) +
      "</span>" +
      "</div>" +
      (goal.objective
        ? '<p class="gl-goal-objective">' + escapeHtml(goal.objective) + "</p>"
        : "") +
      '<div class="gl-goal-funding">' +
      fundingMarkup +
      "</div>" +
      '<div class="gl-goal-meta">' +
      '<span class="gl-deadline ' +
      deadlineClass(model) +
      '">' +
      iconMarkup("calendar", "w-3 h-3") +
      escapeHtml(deadlineLabel(model)) +
      "</span>" +
      '<span class="gl-priority is-' +
      escapeHtml(goal.priority || "medium") +
      '">' +
      escapeHtml(goal.priority || "medium") +
      "</span>" +
      "</div>" +
      '<div class="gl-goal-footer">' +
      '<button type="button" class="gl-goal-link" data-gl-action="view" data-gl-id="' +
      escapeHtml(goal.id) +
      '">View details ' +
      iconMarkup("arrow-up-right", "w-3 h-3") +
      "</button>" +
      '<div class="gl-goal-actions">' +
      '<button type="button" class="gl-btn gl-btn-soft gl-btn-small" data-gl-action="fund" data-gl-id="' +
      escapeHtml(goal.id) +
      '">' +
      iconMarkup(model.progressAvailable ? "plus" : "link", "w-3 h-3") +
      (model.progressAvailable ? "Add funds" : "Set up funding") +
      "</button>" +
      '<button type="button" class="gl-icon-button" data-gl-action="edit" data-gl-id="' +
      escapeHtml(goal.id) +
      '" aria-label="Edit ' +
      escapeHtml(goal.name) +
      '" title="Edit goal">' +
      iconMarkup("pencil", "w-4 h-4") +
      "</button>" +
      '<button type="button" class="gl-icon-button is-danger" data-gl-action="delete" data-gl-id="' +
      escapeHtml(goal.id) +
      '" aria-label="Delete ' +
      escapeHtml(goal.name) +
      '" title="Delete goal">' +
      iconMarkup("trash-2", "w-4 h-4") +
      "</button>" +
      "</div></div></article>"
    );
  }

  function renderGoals(models) {
    var grid = byId("gl-goal-grid");
    if (!grid) return;

    var counts = { all: models.length, active: 0, paused: 0, completed: 0, archived: 0 };
    models.forEach(function (model) {
      if (counts[model.goal.status] !== undefined) counts[model.goal.status] += 1;
    });
    ["all", "active", "paused", "completed", "archived"].forEach(function (status) {
      var el = byId("gl-count-" + status);
      if (el) el.textContent = String(counts[status]);
    });

    var query = state.search.trim().toLowerCase();
    var filtered = models.filter(function (model) {
      var goal = model.goal;
      if (state.filterStatus !== "all" && goal.status !== state.filterStatus) {
        return false;
      }
      if (!query) return true;
      return (
        String(goal.name || "").toLowerCase().indexOf(query) !== -1 ||
        String(goal.goalType || "").toLowerCase().indexOf(query) !== -1 ||
        String(goal.objective || "").toLowerCase().indexOf(query) !== -1
      );
    });

    filtered.sort(function (a, b) {
      var aDone = a.goal.status === "completed" || a.goal.status === "archived";
      var bDone = b.goal.status === "completed" || b.goal.status === "archived";
      if (state.sort === "priority") {
        var priorityDiff =
          (PRIORITY_RANK[a.goal.priority] === undefined ? 9 : PRIORITY_RANK[a.goal.priority]) -
          (PRIORITY_RANK[b.goal.priority] === undefined ? 9 : PRIORITY_RANK[b.goal.priority]);
        if (priorityDiff !== 0) return priorityDiff;
        return a.goal.targetDate.localeCompare(b.goal.targetDate);
      }
      if (state.sort === "updated") {
        return String(b.goal.updatedAt || "").localeCompare(String(a.goal.updatedAt || ""));
      }
      if (state.sort === "progress") {
        var aPercent = a.percent === null ? -1 : a.percent;
        var bPercent = b.percent === null ? -1 : b.percent;
        if (bPercent !== aPercent) return bPercent - aPercent;
        return a.goal.targetDate.localeCompare(b.goal.targetDate);
      }
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.goal.targetDate.localeCompare(b.goal.targetDate);
    });

    var summary = byId("gl-goal-summary");
    if (summary) {
      if (!models.length) {
        summary.textContent = "No goals created yet.";
      } else if (filtered.length !== models.length) {
        summary.textContent =
          filtered.length +
          " of " +
          models.length +
          " goal" +
          (models.length === 1 ? "" : "s") +
          " shown.";
      } else {
        var activeCount = models.filter(function (model) {
          return model.goal.status === "active";
        }).length;
        summary.textContent =
          models.length +
          " goal" +
          (models.length === 1 ? "" : "s") +
          " · " +
          activeCount +
          " active";
      }
    }

    if (!filtered.length) {
      if (!models.length) {
        grid.innerHTML =
          '<div class="gl-empty gl-empty-wide">' +
          '<span class="gl-empty-icon">' +
          iconMarkup("target", "w-5 h-5") +
          "</span>" +
          "<h3>No goals yet</h3>" +
          "<p>Create a goal for a planned purchase, then link it to a savings plan so progress reflects real money set aside.</p>" +
          '<button type="button" class="gl-btn gl-btn-primary" data-gl-action="empty-add">' +
          iconMarkup("plus", "w-4 h-4") +
          "Add your first goal</button>" +
          "</div>";
      } else {
        grid.innerHTML =
          '<div class="gl-empty gl-empty-wide">' +
          '<span class="gl-empty-icon">' +
          iconMarkup("search", "w-5 h-5") +
          "</span>" +
          "<h3>No matching goals</h3>" +
          "<p>Try a different search or status filter. Your goals are still saved.</p>" +
          '<button type="button" class="gl-btn gl-btn-ghost" data-gl-action="clear-filters">Clear filters</button>' +
          "</div>";
      }
    } else {
      grid.innerHTML = filtered.map(renderGoalCard).join("");
    }

    refreshIcons();
  }

  /* ---------- Milestones ---------- */

  function milestoneRow(model, detail, valueText, valueTone, dotTone) {
    return (
      '<button type="button" class="gl-milestone-row" data-gl-goal-id="' +
      escapeHtml(model.goal.id) +
      '">' +
      '<span class="gl-milestone-dot is-' +
      escapeHtml(dotTone || "primary") +
      '"></span>' +
      '<span class="gl-milestone-copy"><strong>' +
      escapeHtml(model.goal.name) +
      "</strong><small>" +
      escapeHtml(detail) +
      "</small></span>" +
      '<span class="gl-milestone-value is-' +
      escapeHtml(valueTone || "") +
      '">' +
      escapeHtml(valueText) +
      "</span>" +
      "</button>"
    );
  }

  function renderMilestones(models) {
    var upcoming = models
      .filter(function (model) {
        return (
          (model.goal.status === "active" || model.goal.status === "paused") &&
          model.daysLeft >= 0
        );
      })
      .sort(function (a, b) {
        return a.goal.targetDate.localeCompare(b.goal.targetDate);
      })
      .slice(0, 4);

    var reached = models
      .filter(function (model) {
        return (
          model.goal.status === "completed" ||
          (model.progressAvailable && model.percent >= 100)
        );
      })
      .sort(function (a, b) {
        return String(b.goal.updatedAt || "").localeCompare(String(a.goal.updatedAt || ""));
      })
      .slice(0, 4);

    var attention = models
      .filter(function (model) {
        return attentionReason(model) !== null;
      })
      .sort(function (a, b) {
        return a.daysLeft - b.daysLeft;
      })
      .slice(0, 4);

    var upcomingEl = byId("gl-milestone-upcoming");
    if (upcomingEl) {
      upcomingEl.innerHTML = upcoming.length
        ? upcoming
            .map(function (model) {
              return milestoneRow(
                model,
                dateText(model.goal.targetDate) +
                  (model.progressAvailable
                    ? " · " + percentText(model.percent) + " funded"
                    : " · Funding not linked"),
                model.daysLeft === 0 ? "Today" : model.daysLeft + "d",
                model.daysLeft <= 30 ? "warning" : "",
                model.daysLeft <= 7 ? "warning" : "primary"
              );
            })
            .join("")
        : '<div class="gl-milestone-empty">No upcoming deadlines.</div>';
    }

    var reachedEl = byId("gl-milestone-reached");
    if (reachedEl) {
      reachedEl.innerHTML = reached.length
        ? reached
            .map(function (model) {
              var detail = model.progressAvailable
                ? money(model.saved || 0) + " of " + money(model.target)
                : "Marked completed";
              return milestoneRow(
                model,
                detail,
                model.progressAvailable ? percentText(model.percent) : "Done",
                "success",
                "success"
              );
            })
            .join("")
        : '<div class="gl-milestone-empty">No targets reached yet.</div>';
    }

    var attentionEl = byId("gl-milestone-attention");
    if (attentionEl) {
      attentionEl.innerHTML = attention.length
        ? attention
            .map(function (model) {
              var issue = attentionReason(model);
              return milestoneRow(
                model,
                issue.reason,
                model.daysLeft < 0
                  ? Math.abs(model.daysLeft) + "d over"
                  : model.progressAvailable
                    ? percentText(model.percent)
                    : "Set up",
                issue.tone,
                issue.tone
              );
            })
            .join("")
        : '<div class="gl-milestone-empty">Nothing needs attention.</div>';
    }

    var upcomingCount = byId("gl-milestone-upcoming-count");
    var reachedCount = byId("gl-milestone-reached-count");
    var attentionCount = byId("gl-milestone-attention-count");
    if (upcomingCount) upcomingCount.textContent = String(upcoming.length);
    if (reachedCount) reachedCount.textContent = String(reached.length);
    if (attentionCount) attentionCount.textContent = String(attention.length);

    refreshIcons();
  }

  /* ---------- Details & analysis ---------- */

  function movementRows(model) {
    var movements = model.movements.slice().sort(function (a, b) {
      var dateDiff = String(b.date).localeCompare(String(a.date));
      if (dateDiff !== 0) return dateDiff;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

    if (!movements.length) {
      return '<div class="gl-details-empty">No savings movements yet. Add funds to start the history.</div>';
    }

    return (
      '<div class="gl-movement-list">' +
      movements
        .map(function (movement) {
          var isWithdrawal = movement.type === "withdrawal";
          var description =
            movement.description ||
            (isWithdrawal ? "Savings withdrawal" : "Savings contribution");
          var accountName = getAccountName(movement.accountId);
          var meta = dateText(movement.date) + (accountName ? " · " + accountName : "");
          return (
            '<div class="gl-movement-row">' +
            '<span class="gl-movement-icon' +
            (isWithdrawal ? " is-withdrawal" : "") +
            '">' +
            iconMarkup(isWithdrawal ? "arrow-up-right" : "arrow-down-left", "w-4 h-4") +
            "</span>" +
            '<span class="gl-movement-copy"><strong>' +
            escapeHtml(description) +
            "</strong><small>" +
            escapeHtml(meta) +
            "</small></span>" +
            '<span class="gl-movement-amount' +
            (isWithdrawal ? " is-negative" : "") +
            '">' +
            escapeHtml((isWithdrawal ? "−" : "+") + money(movement.amount)) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function buildProgressSeries(model) {
    if (!model.movements.length) return [];
    var sorted = model.movements.slice().sort(function (a, b) {
      var dateDiff = String(a.date).localeCompare(String(b.date));
      if (dateDiff !== 0) return dateDiff;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    var start = goalCreatedDate(model.goal);
    if (sorted[0].date < start) start = sorted[0].date;
    var series = [{ date: start, value: 0 }];
    var running = 0;
    sorted.forEach(function (movement) {
      running +=
        movement.type === "withdrawal"
          ? -Number(movement.amount || 0)
          : Number(movement.amount || 0);
      var value = roundMoney(running);
      var last = series[series.length - 1];
      if (last && last.date === movement.date) {
        last.value = value;
      } else {
        series.push({ date: movement.date, value: value });
      }
    });
    return series;
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

  function destroyProgressChart() {
    if (state.progressChart) {
      try {
        state.progressChart.destroy();
      } catch (error) {
        /* noop */
      }
      state.progressChart = null;
    }
  }

  function renderProgressChart(model) {
    var canvas = byId("gl-progress-chart");
    if (!canvas || typeof Chart === "undefined") return;
    var movements = model.movements.slice().sort(function (a, b) {
      var dateDiff = String(a.date).localeCompare(String(b.date));
      if (dateDiff !== 0) return dateDiff;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    if (!movements.length) return;
    var grouped = {};
    movements.forEach(function (movement) {
      if (!grouped[movement.date]) {
        grouped[movement.date] = { contributions: 0, withdrawals: 0 };
      }
      if (movement.type === "withdrawal") {
        grouped[movement.date].withdrawals += Number(movement.amount || 0);
      } else {
        grouped[movement.date].contributions += Number(movement.amount || 0);
      }
    });
    var dates = Object.keys(grouped).sort();
    var palette = chartPalette();
    var context = canvas.getContext("2d");
    destroyProgressChart();
    if (typeof Chart.getChart === "function") {
      var stale = Chart.getChart(canvas);
      if (stale) stale.destroy();
    }
    state.progressChart = new Chart(context, {
      type: "bar",
      data: {
        labels: dates.map(dateText),
        datasets: [
          {
            type: "bar",
            label: "Contributions",
            data: dates.map(function (date) { return grouped[date].contributions; }),
            backgroundColor: "#10b981",
            borderRadius: 6,
            maxBarThickness: 28
          },
          {
            type: "bar",
            label: "Withdrawals",
            data: dates.map(function (date) { return grouped[date].withdrawals; }),
            backgroundColor: "#ef4444",
            borderRadius: 6,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            display: true,
            labels: { color: palette.muted, boxWidth: 10, font: { size: 9, weight: "600" } }
          },
          tooltip: {
            backgroundColor: palette.tooltipBg,
            titleColor: palette.tooltipText,
            bodyColor: palette.tooltipText,
            borderColor: palette.border,
            borderWidth: 1,
            padding: 11,
            callbacks: {
              label: function (context) {
                return context.dataset.label + ": " + money(context.parsed.y);
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

  function buildProgressChart(model) {
    var series = buildProgressSeries(model);
    if (!series.length) {
      return (
        '<div class="gl-chart-card"><div class="gl-chart-empty">' +
        iconMarkup("line-chart", "w-5 h-5") +
        "<strong>No history yet</strong>" +
        "<p>Actual contributions and withdrawals from the linked savings plan will build this chart.</p>" +
        "</div></div>"
      );
    }
    var lastPoint = series[series.length - 1];
    return (
      '<div class="gl-chart-card">' +
      '<div class="gl-chart-canvas"><canvas id="gl-progress-chart" role="img" aria-label="' +
      escapeHtml(
        "Savings progress for " +
          model.goal.name +
          " from " +
          dateText(series[0].date) +
          " to " +
          dateText(lastPoint.date) +
          ", current amount " +
          money(lastPoint.value)
      ) +
      '"></canvas></div>' +
      '<div class="gl-chart-meta"><span>' +
      escapeHtml(dateText(series[0].date)) +
      "</span><strong>" +
      escapeHtml(money(lastPoint.value)) +
      "</strong><span>" +
      escapeHtml(dateText(lastPoint.date)) +
      "</span></div>" +
      "</div>"
    );
  }

  function renderDetails() {
    if (!state.detailsId) return;
    var goal = data.getGoal(state.detailsId);
    if (!goal) {
      state.detailsId = null;
      hideModal("gl-details-modal");
      return;
    }

    var model = buildGoalModel(goal);
    var body = byId("gl-details-body");
    if (!body) return;

    var analysisIconTone =
      model.assessment.key === "complete"
        ? "is-success"
        : model.assessment.key === "danger"
          ? "is-danger"
          : model.assessment.key === "warning"
            ? "is-warning"
            : model.assessment.key === "neutral"
              ? "is-neutral"
              : "";
    var analysisIcon =
      model.assessment.key === "complete"
        ? "badge-check"
        : model.assessment.key === "danger"
          ? "alert-triangle"
          : model.assessment.key === "warning"
            ? "clock"
            : model.progressAvailable
              ? "activity"
              : "unlink";

    var fundingMarkup = model.progressAvailable
      ? '<div class="gl-details-progress">' +
        '<div class="gl-details-progress-head"><span>' +
        percentText(model.percent) +
        " funded</span><strong>" +
        (model.remaining > 0 ? money(model.remaining) + " remaining" : "Target reached") +
        "</strong></div>" +
        '<div class="gl-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        Math.min(100, Math.round(model.percent || 0)) +
        '"><div class="gl-progress-fill' +
        (model.percent >= 100
          ? " is-complete"
          : model.assessment.label === "Overdue" ||
              model.assessment.label === "Behind schedule"
            ? " is-warning"
            : "") +
        '" style="width:' +
        clamp(model.percent || 0, 0, 100) +
        '%"></div></div></div>'
      : '<p class="gl-details-note">' +
        "Funding is not linked yet. Create a savings plan or link an existing one to track progress. No separate goal balance is used." +
        "</p>";

    var planMarkup = model.plan
      ? '<div class="gl-details-section"><div class="gl-details-section-head"><h4>Linked savings plan</h4><span>' +
        escapeHtml(statusLabel(model.plan.status)) +
        "</span></div>" +
        '<dl class="gl-details-list">' +
        "<div class=\"gl-details-row\"><dt>Plan name</dt><dd>" +
        escapeHtml(model.plan.name) +
        "</dd></div>" +
        "<div class=\"gl-details-row\"><dt>Plan target</dt><dd>" +
        money(model.plan.targetAmount) +
        "</dd></div>" +
        "<div class=\"gl-details-row\"><dt>Plan balance</dt><dd>" +
        money(model.saved || 0) +
        "</dd></div>" +
        "</dl>" +
        '<p class="gl-details-note is-spaced">Goal progress uses contributions minus withdrawals in this plan. Changes to the plan balance update this goal automatically.</p>' +
        "</div>"
      : '<div class="gl-details-section"><div class="gl-details-section-head"><h4>Linked savings plan</h4><span>Not linked</span></div>' +
        '<p class="gl-details-note">No savings plan is linked. Use Add funds to create a plan or link an existing one.</p></div>';

    destroyProgressChart();
    body.innerHTML =
      '<div class="gl-details-head">' +
      goalIcon(goal.goalType) +
      '<div class="gl-details-identity"><h4>' +
      escapeHtml(goal.name) +
      "</h4><p>" +
      escapeHtml(goal.goalType) +
      " · " +
      escapeHtml(goal.priority || "medium") +
      " priority</p>" +
      '<div class="gl-details-pills"><span class="gl-status-pill is-' +
      escapeHtml(goal.status) +
      '">' +
      escapeHtml(statusLabel(goal.status)) +
      '</span><span class="gl-deadline ' +
      deadlineClass(model) +
      '">' +
      iconMarkup("calendar", "w-3 h-3") +
      escapeHtml(deadlineLabel(model)) +
      "</span></div></div>" +
      "</div>" +
      (goal.objective
        ? '<p class="gl-details-note">' + escapeHtml(goal.objective) + "</p>"
        : "") +
      '<div class="gl-details-stats">' +
      '<div class="gl-details-stat"><span>Target</span><strong>' +
      money(model.target) +
      "</strong></div>" +
      '<div class="gl-details-stat"><span>Saved</span><strong class="' +
      (model.progressAvailable ? "is-positive" : "") +
      '">' +
      (model.progressAvailable ? money(model.saved || 0) : "Not linked") +
      "</strong></div>" +
      '<div class="gl-details-stat"><span>Remaining</span><strong>' +
      (model.progressAvailable ? money(model.remaining || 0) : "—") +
      "</strong></div>" +
      "</div>" +
      fundingMarkup +
      '<div class="gl-analysis-card">' +
      '<span class="gl-analysis-icon ' +
      analysisIconTone +
      '">' +
      iconMarkup(analysisIcon, "w-4 h-4") +
      "</span>" +
      '<div class="gl-analysis-copy"><strong>Schedule assessment: ' +
      escapeHtml(model.assessment.label) +
      "</strong><p>" +
      escapeHtml(model.assessment.detail) +
      "</p></div></div>" +
      planMarkup +
      '<div class="gl-details-section"><div class="gl-details-section-head"><h4>Contribution history</h4><span>' +
      model.movements.length +
      " movement" +
      (model.movements.length === 1 ? "" : "s") +
      "</span></div>" +
      movementRows(model) +
      "</div>" +
      '<div class="gl-details-section"><div class="gl-details-section-head"><h4>Savings movements</h4><span>Contributions and withdrawals</span></div>' +
      buildProgressChart(model) +
      "</div>" +
      '<p class="gl-details-note">Savings contributions do not create income, expenses or transactions, and account balances are not changed by this page.</p>' +
      '<div class="gl-details-actions">' +
      '<div class="gl-details-actions-group">' +
      '<button type="button" class="gl-btn gl-btn-primary" data-gl-action="fund" data-gl-id="' +
      escapeHtml(goal.id) +
      '">' +
      iconMarkup("plus", "w-4 h-4") +
      (model.progressAvailable ? "Add funds" : "Set up funding") +
      "</button>" +
      '<button type="button" class="gl-btn gl-btn-ghost" data-gl-action="edit" data-gl-id="' +
      escapeHtml(goal.id) +
      '">' +
      iconMarkup("pencil", "w-4 h-4") +
      "Edit goal</button>" +
      "</div>" +
      '<button type="button" class="gl-btn gl-btn-danger" data-gl-action="delete" data-gl-id="' +
      escapeHtml(goal.id) +
      '">' +
      iconMarkup("trash-2", "w-4 h-4") +
      "Delete goal</button>" +
      "</div>";

    renderProgressChart(model);
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
    if (id === "gl-details-modal") {
      state.detailsId = null;
      destroyProgressChart();
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
    toast.className = "toast gl-toast show";
    if (toastIcon) {
      toastIcon.className =
        "gl-toast-icon is-" +
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
    byId("gl-confirm-title").textContent = settings.title || "Confirm action";
    byId("gl-confirm-subtitle").textContent =
      settings.subtitle || "This action needs your confirmation.";
    byId("gl-confirm-copy").textContent = settings.message || "";
    var action = byId("gl-confirm-action");
    action.textContent = settings.confirmLabel || "Confirm";
    action.className =
      "gl-btn " + (settings.danger === false ? "gl-btn-primary" : "gl-btn-danger");
    state.confirmHandler = settings.onConfirm || null;
    showModal("gl-confirm-modal");
  }

  /* ---------- Goal form ---------- */

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

  function renderPlanSelect(currentPlanId) {
    var select = byId("gl-form-plan");
    var hint = byId("gl-form-plan-hint");
    if (!select) return;

    var goals = data.getGoals();
    var plans = data.getSavingsPlans();
    var linkedByOther = {};
    goals.forEach(function (goal) {
      if (goal.id !== state.editingId && goal.savingsPlanId) {
        linkedByOther[goal.savingsPlanId] = goal.name;
      }
    });

    var available = plans.filter(function (plan) {
      return plan.id === currentPlanId || !linkedByOther[plan.id];
    });

    var html = '<option value="">No linked savings plan</option>';
    available.forEach(function (plan) {
      var saved = data.getSavingsPlanSavedAmount(plan.id);
      html +=
        '<option value="' +
        escapeHtml(plan.id) +
        '">' +
        escapeHtml(plan.name) +
        (saved > 0 ? " · " + escapeHtml(money(saved)) + " saved" : "") +
        "</option>";
    });
    select.innerHTML = html;
    select.value = currentPlanId || "";

    if (hint) {
      if (currentPlanId) {
        hint.textContent = "Progress will use this plan's savings balance.";
      } else if (!plans.length) {
        hint.textContent =
          "No savings plans yet. Save this goal, then use Add funds to create one.";
      } else if (available.length <= 1) {
        hint.textContent =
          "No unlinked savings plans available. Use Add funds to create a new plan.";
      } else {
        hint.textContent =
          "Funding comes from a savings plan. You can create one later.";
      }
    }
  }

  function openGoalModal(goalId) {
    state.editingId = goalId || null;
    var goal = goalId ? data.getGoal(goalId) : null;
    var form = byId("gl-goal-form");
    if (!form) return;
    form.reset();
    setFormError("gl-form-error", "");
    renderPlanSelect(goal ? goal.savingsPlanId : "");

    if (goal) {
      byId("gl-form-name").value = goal.name || "";
      byId("gl-form-type").value = goal.goalType || "Savings";
      byId("gl-form-priority").value = goal.priority || "medium";
      byId("gl-form-target").value = Number(goal.targetAmount || 0);
      byId("gl-form-date").value = goal.targetDate || "";
      byId("gl-form-status").value = goal.status || "active";
      byId("gl-form-objective").value = goal.objective || "";
      byId("gl-form-plan").value = goal.savingsPlanId || "";
      byId("gl-modal-title").textContent = "Edit goal";
      byId("gl-modal-subtitle").textContent =
        "Update the target, schedule or linked savings plan.";
      byId("gl-form-submit").innerHTML =
        iconMarkup("check", "w-4 h-4") + "<span>Save changes</span>";
    } else {
      byId("gl-form-type").value = "Savings";
      byId("gl-form-priority").value = "medium";
      byId("gl-form-status").value = "active";
      byId("gl-form-date").value = "";
      byId("gl-modal-title").textContent = "Add goal";
      byId("gl-modal-subtitle").textContent =
        "Create a planned purchase or savings target.";
      byId("gl-form-submit").innerHTML =
        iconMarkup("check", "w-4 h-4") + "<span>Create goal</span>";
    }

    showModal("gl-goal-modal");
    var name = byId("gl-form-name");
    window.setTimeout(function () {
      if (name) name.focus();
    }, 80);
  }

  function submitGoalForm(event) {
    event.preventDefault();
    var name = byId("gl-form-name").value.trim();
    var goalType = byId("gl-form-type").value;
    var priority = byId("gl-form-priority").value;
    var target = Number(byId("gl-form-target").value);
    var targetDate = byId("gl-form-date").value;
    var status = byId("gl-form-status").value;
    var objective = byId("gl-form-objective").value.trim();
    var savingsPlanId = byId("gl-form-plan").value;

    if (!name) {
      setFormError("gl-form-error", "Enter a name for this goal.");
      return;
    }
    if (!data.isDateOnly(targetDate)) {
      setFormError("gl-form-error", "Choose a valid target date.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setFormError("gl-form-error", "Target amount must be greater than zero.");
      return;
    }
    if (savingsPlanId) {
      var plan = data.getSavingsPlan(savingsPlanId);
      if (!plan) {
        setFormError("gl-form-error", "The selected savings plan could not be found.");
        return;
      }
      var linkedGoal = data.getGoals().find(function (goal) {
        return (
          goal.savingsPlanId === savingsPlanId &&
          goal.id !== state.editingId
        );
      });
      if (linkedGoal) {
        setFormError(
          "gl-form-error",
          "That savings plan is already linked to “" + linkedGoal.name + "”. Choose another plan."
        );
        return;
      }
    }

    var payload = {
      name: name,
      goalType: goalType,
      objective: objective,
      targetAmount: roundMoney(target),
      targetDate: targetDate,
      priority: priority,
      status: status,
      savingsPlanId: savingsPlanId || null
    };

    try {
      if (state.editingId) {
        data.updateGoal(state.editingId, payload);
        showToast(
          "Goal updated",
          "“" + name + "” has been saved.",
          "success"
        );
      } else {
        data.createGoal(payload);
        showToast(
          "Goal created",
          "“" + name + "” is ready. Link funding with Add funds.",
          "success"
        );
      }
      hideModal("gl-goal-modal");
      state.editingId = null;
      renderAll();
    } catch (error) {
      setFormError("gl-form-error", error.message || "Could not save this goal.");
    }
  }

  /* ---------- Add funds ---------- */

  function renderLinkPlanSelect() {
    var select = byId("gl-link-plan");
    var hint = byId("gl-link-hint");
    if (!select) return;
    var goals = data.getGoals();
    var linked = {};
    goals.forEach(function (goal) {
      if (goal.savingsPlanId) linked[goal.savingsPlanId] = true;
    });
    var available = data.getSavingsPlans().filter(function (plan) {
      return !linked[plan.id];
    });

    var html = "";
    available.forEach(function (plan) {
      html +=
        '<option value="' +
        escapeHtml(plan.id) +
        '">' +
        escapeHtml(plan.name) +
        " · " +
        escapeHtml(money(data.getSavingsPlanSavedAmount(plan.id))) +
        " saved</option>";
    });
    if (!html) {
      html = '<option value="">No unlinked savings plans available</option>';
    }
    select.innerHTML = html;
    if (hint) {
      hint.textContent = available.length
        ? "Plans already linked to another goal are not listed."
        : "There are no unlinked savings plans yet. Create a new plan instead.";
    }
  }

  function renderAccountSelect() {
    var select = byId("gl-funds-account");
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

  function setFundingMode(mode) {
    state.fundingMode = mode;
    var createFields = byId("gl-create-fields");
    var linkFields = byId("gl-link-fields");
    var createButton = document.querySelector('[data-gl-funding-mode="create"]');
    var linkButton = document.querySelector('[data-gl-funding-mode="link"]');
    if (createFields) createFields.hidden = mode !== "create";
    if (linkFields) linkFields.hidden = mode !== "link";
    if (createButton) createButton.classList.toggle("active", mode === "create");
    if (linkButton) linkButton.classList.toggle("active", mode === "link");
  }

  function updateFundsSubmitLabel(hasPlan) {
    var submit = byId("gl-funds-submit");
    if (!submit) return;
    submit.innerHTML = hasPlan
      ? iconMarkup("plus", "w-4 h-4") + "<span>Add contribution</span>"
      : iconMarkup("plus", "w-4 h-4") + "<span>Set up &amp; add funds</span>";
  }

  function openFundsModal(goalId, mode) {
    var goal = data.getGoal(goalId);
    if (!goal) return;

    state.addFundsGoalId = goalId;
    state.fundingMode = goal.savingsPlanId ? "linked" : mode === "link" ? "link" : "create";

    var form = byId("gl-funds-form");
    if (!form) return;
    form.reset();
    setFormError("gl-funds-error", "");
    renderAccountSelect();
    renderLinkPlanSelect();

    var summary = byId("gl-funds-summary");
    var plan = goal.savingsPlanId ? data.getSavingsPlan(goal.savingsPlanId) : null;
    if (summary) {
      var saved = plan ? data.getSavingsPlanSavedAmount(plan.id) : null;
      summary.innerHTML =
        goalIcon(goal.goalType) +
        '<div class="gl-funds-summary-copy"><strong>' +
        escapeHtml(goal.name) +
        "</strong><span>" +
        (plan
          ? "Linked plan: " + escapeHtml(plan.name)
          : "No linked savings plan yet") +
        "</span></div>" +
        '<div class="gl-funds-summary-amount">' +
        (plan ? money(saved) : money(0)) +
        "<small>" +
        (plan ? "plan balance" : "unfunded") +
        "</small></div>";
    }

    var source = byId("gl-funding-source");
    if (source) source.hidden = Boolean(plan);
    if (!plan) {
      byId("gl-create-plan-name").value = goal.name + " plan";
      byId("gl-create-plan-target").value = Number(goal.targetAmount || 0);
      setFundingMode(state.fundingMode);
    }
    byId("gl-funds-date").value = today();
    byId("gl-funds-amount").value = "";
    byId("gl-funds-description").value = "";
    updateFundsSubmitLabel(Boolean(plan));

    var title = byId("gl-funds-title");
    var subtitle = byId("gl-funds-subtitle");
    if (title) title.textContent = "Add funds";
    if (subtitle) {
      subtitle.textContent = plan
        ? "Record a contribution into “" + plan.name + "”."
        : "Create or link a savings plan, then record the first contribution.";
    }

    var note = byId("gl-funds-note");
    if (note) {
      note.className = "gl-funds-note" + (plan ? "" : " is-warning");
      note.innerHTML =
        iconMarkup("info") +
        (plan
          ? "This records a savings contribution only. No income, expense or transaction is created."
          : "This creates a savings plan, links it to the goal, and records the contribution. No income, expense or transaction is created.");
    }

    showModal("gl-funds-modal");
    var amount = byId("gl-funds-amount");
    window.setTimeout(function () {
      if (amount) amount.focus();
    }, 80);
  }

  function submitFundsForm(event) {
    event.preventDefault();
    var goal = data.getGoal(state.addFundsGoalId);
    if (!goal) {
      setFormError("gl-funds-error", "This goal could not be found.");
      return;
    }

    var amount = Number(byId("gl-funds-amount").value);
    var date = byId("gl-funds-date").value;
    var accountId = byId("gl-funds-account").value;
    var description = byId("gl-funds-description").value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("gl-funds-error", "Contribution amount must be greater than zero.");
      return;
    }
    if (!data.isDateOnly(date)) {
      setFormError("gl-funds-error", "Choose a valid contribution date.");
      return;
    }

    var planId = goal.savingsPlanId || "";
    var createdPlanId = null;
    var linkedExisting = false;

    try {
      if (!planId) {
        if (state.fundingMode === "create") {
          var planName = byId("gl-create-plan-name").value.trim();
          var planTarget = Number(byId("gl-create-plan-target").value);
          if (!planName) {
            setFormError("gl-funds-error", "Enter a name for the savings plan.");
            return;
          }
          if (!Number.isFinite(planTarget) || planTarget <= 0) {
            setFormError("gl-funds-error", "Plan target must be greater than zero.");
            return;
          }
          var created = data.createSavingsPlan({
            name: planName,
            purpose: goal.goalType,
            targetAmount: roundMoney(planTarget),
            status: "active",
            notes: "Created from goal: " + goal.name
          });
          createdPlanId = created.id;
          planId = created.id;
        } else {
          planId = byId("gl-link-plan").value;
          if (!planId) {
            setFormError(
              "gl-funds-error",
              "Choose a savings plan or create a new one."
            );
            return;
          }
          var linkedGoal = data.getGoals().find(function (item) {
            return item.savingsPlanId === planId;
          });
          if (linkedGoal) {
            setFormError(
              "gl-funds-error",
              "That savings plan is already linked to “" + linkedGoal.name + "”."
            );
            return;
          }
          linkedExisting = true;
        }
        data.updateGoal(goal.id, { savingsPlanId: planId });
      }

      data.createSavingsMovement({
        type: "contribution",
        savingsPlanId: planId,
        amount: roundMoney(amount),
        date: date,
        accountId: accountId || undefined,
        description: description
      });

      hideModal("gl-funds-modal");
      state.addFundsGoalId = null;
      showToast(
        "Contribution recorded",
        money(amount) +
          " added to “" +
          goal.name +
          "”. No income or expense was created.",
        "success"
      );
      renderAll();
    } catch (error) {
      if (createdPlanId) {
        try {
          data.updateGoal(goal.id, { savingsPlanId: null });
        } catch (rollbackGoalError) {
          /* Keep the original error visible. */
        }
        try {
          data.deleteSavingsPlan(createdPlanId);
        } catch (rollbackPlanError) {
          /* Keep the original error visible. */
        }
      } else if (linkedExisting) {
        try {
          data.updateGoal(goal.id, { savingsPlanId: null });
        } catch (rollbackLinkError) {
          /* Keep the original error visible. */
        }
      }
      setFormError(
        "gl-funds-error",
        error.message || "Could not record this contribution."
      );
    }
  }

  /* ---------- Delete ---------- */

  function requestDelete(goalId) {
    var goal = data.getGoal(goalId);
    if (!goal) return;
    var planNote = goal.savingsPlanId
      ? "The linked savings plan and its contributions will remain, and your savings balance will not change."
      : "No savings or account balance will change.";
    openConfirm({
      title: "Delete goal?",
      subtitle: "This removes the goal record permanently.",
      message: "“" + goal.name + "” will be deleted. " + planNote,
      confirmLabel: "Delete goal",
      onConfirm: function () {
        try {
          data.deleteGoal(goalId);
          hideModal("gl-confirm-modal");
          if (state.detailsId === goalId) {
            state.detailsId = null;
            hideModal("gl-details-modal");
          }
          showToast("Goal deleted", "“" + goal.name + "” was removed.", "success");
          renderAll();
        } catch (error) {
          hideModal("gl-confirm-modal");
          showToast("Could not delete goal", error.message, "error");
        }
      }
    });
  }

  /* ---------- Details opening ---------- */

  function openDetails(goalId) {
    if (!data.getGoal(goalId)) return;
    state.detailsId = goalId;
    showModal("gl-details-modal");
    renderDetails();
    window.requestAnimationFrame(function () {
      if (state.detailsId !== goalId) return;
      var goal = data.getGoal(goalId);
      if (goal) renderProgressChart(buildGoalModel(goal));
    });
  }

  /* ---------- Global render & events ---------- */

  function renderAll() {
    renderShell();
    var models = buildGoalModels();
    renderOverview(models);
    renderGoals(models);
    renderMilestones(models);
    if (state.detailsId) renderDetails();
    refreshIcons();
  }

  function handleGoalAction(event) {
    var target = event.target.closest("[data-gl-action]");
    if (!target) return;
    var action = target.getAttribute("data-gl-action");
    var goalId = target.getAttribute("data-gl-id");

    if (action === "empty-add") {
      openGoalModal(null);
      return;
    }
    if (action === "clear-filters") {
      state.filterStatus = "all";
      state.search = "";
      var search = byId("gl-search");
      if (search) search.value = "";
      document.querySelectorAll("[data-gl-status]").forEach(function (chip) {
        chip.classList.toggle(
          "active",
          chip.getAttribute("data-gl-status") === state.filterStatus
        );
      });
      renderGoals(buildGoalModels());
      return;
    }
    if (!goalId) return;

    if (action === "view") {
      openDetails(goalId);
    } else if (action === "edit") {
      if (state.detailsId) {
        state.detailsId = null;
        hideModal("gl-details-modal");
      }
      openGoalModal(goalId);
    } else if (action === "fund") {
      if (state.detailsId) {
        state.detailsId = null;
        hideModal("gl-details-modal");
      }
      openFundsModal(goalId, "create");
    } else if (action === "delete") {
      requestDelete(goalId);
    }
  }

  function bindEvents() {
    var addGoal = byId("gl-add-goal");
    if (addGoal) {
      addGoal.addEventListener("click", function () {
        openGoalModal(null);
      });
    }

    var search = byId("gl-search");
    if (search) {
      search.addEventListener("input", function () {
        state.search = search.value;
        renderGoals(buildGoalModels());
      });
    }

    var sort = byId("gl-sort");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        renderGoals(buildGoalModels());
      });
    }

    var filters = byId("gl-status-filters");
    if (filters) {
      filters.addEventListener("click", function (event) {
        var chip = event.target.closest("[data-gl-status]");
        if (!chip) return;
        state.filterStatus = chip.getAttribute("data-gl-status");
        filters.querySelectorAll("[data-gl-status]").forEach(function (item) {
          item.classList.toggle("active", item === chip);
        });
        renderGoals(buildGoalModels());
      });
    }

    var grid = byId("gl-goal-grid");
    if (grid) grid.addEventListener("click", handleGoalAction);

    var detailsBody = byId("gl-details-body");
    if (detailsBody) detailsBody.addEventListener("click", handleGoalAction);

    var milestoneLists = [
      byId("gl-milestone-upcoming"),
      byId("gl-milestone-reached"),
      byId("gl-milestone-attention")
    ];
    milestoneLists.forEach(function (list) {
      if (!list) return;
      list.addEventListener("click", function (event) {
        var row = event.target.closest("[data-gl-goal-id]");
        if (!row) return;
        openDetails(row.getAttribute("data-gl-goal-id"));
      });
    });

    document.querySelectorAll("[data-gl-funding-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setFundingMode(button.getAttribute("data-gl-funding-mode"));
      });
    });

    var goalForm = byId("gl-goal-form");
    if (goalForm) goalForm.addEventListener("submit", submitGoalForm);

    var fundsForm = byId("gl-funds-form");
    if (fundsForm) fundsForm.addEventListener("submit", submitFundsForm);

    var confirmAction = byId("gl-confirm-action");
    if (confirmAction) {
      confirmAction.addEventListener("click", function () {
        if (typeof state.confirmHandler === "function") {
          state.confirmHandler();
        }
      });
    }

    document.addEventListener("click", function (event) {
      var close = event.target.closest("[data-gl-close]");
      if (close) {
        hideModal(close.getAttribute("data-gl-close"));
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
      document.body.style.overflow = "";
    });

    if (data.subscribe) {
      data.subscribe(function () {
        renderAll();
      });
    }
  }

  function installThemeObserver() {
    if (!window.MutationObserver) return;
    var dark = document.documentElement.classList.contains("dark");
    var observer = new MutationObserver(function () {
      var next = document.documentElement.classList.contains("dark");
      if (next === dark) return;
      dark = next;
      if (state.detailsId) {
        var goal = data.getGoal(state.detailsId);
        if (goal) renderProgressChart(buildGoalModel(goal));
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

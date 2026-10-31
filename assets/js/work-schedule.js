/* Gabsweb CashFlow — Work Schedule */
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
  var SHIFT_META = {
    morning: {
      label: "Morning",
      icon: "sunrise",
      tone: "morning",
      start: "07:00",
      end: "13:00"
    },
    afternoon: {
      label: "Afternoon",
      icon: "cloud-sun",
      tone: "afternoon",
      start: "13:00",
      end: "19:00"
    },
    night: {
      label: "Night",
      icon: "moon",
      tone: "night",
      start: "19:00",
      end: "07:00"
    },
    off: {
      label: "Day off",
      icon: "calendar-off",
      tone: "off",
      start: "",
      end: ""
    }
  };
  var SHIFT_TYPES = ["morning", "afternoon", "night", "off"];
  var DEFAULT_TIMES = {
    morning: { start: "07:00", end: "13:00" },
    afternoon: { start: "13:00", end: "19:00" },
    night: { start: "19:00", end: "07:00" }
  };
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var JOINING_RECORDS = [
    {
      date: "2026-11-01",
      shiftType: "afternoon",
      status: "working",
      startTime: "13:00",
      endTime: "19:00",
      notes: "Confirmed joining schedule."
    },
    {
      date: "2026-11-02",
      shiftType: "afternoon",
      status: "working",
      startTime: "13:00",
      endTime: "19:00",
      notes: "Confirmed joining schedule."
    },
    {
      date: "2026-11-03",
      shiftType: "off",
      status: "off",
      startTime: "",
      endTime: "",
      notes: "Confirmed joining schedule: day off."
    },
    {
      date: "2026-11-04",
      shiftType: "off",
      status: "off",
      startTime: "",
      endTime: "",
      notes: "Confirmed joining schedule: day off."
    }
  ];

  var state = {
    view: "month",
    selectedDate: today(),
    periodDate: today(),
    editingId: null,
    confirmHandler: null,
    generationPlan: null
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

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function dateKey(date) {
    return (
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
    );
  }

  function today() {
    return data.todayKey ? data.todayKey() : dateKey(new Date());
  }

  function parseDateKey(value) {
    if (!data.isDateOnly(value)) return null;
    var parts = value.split("-");
    return new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
      12,
      0,
      0,
      0
    );
  }

  function addDays(value, days) {
    var date = parseDateKey(value);
    if (!date) return value;
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function addMonths(value, months) {
    var date = parseDateKey(value);
    if (!date) return value;
    var day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return dateKey(date);
  }

  function startOfMonth(value) {
    var date = parseDateKey(value);
    if (!date) return value;
    return dateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0));
  }

  function endOfMonth(value) {
    var date = parseDateKey(value);
    if (!date) return value;
    return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0));
  }

  function startOfWeek(value) {
    var date = parseDateKey(value);
    if (!date) return value;
    return addDays(value, -date.getDay());
  }

  function isSameMonth(a, b) {
    return String(a || "").slice(0, 7) === String(b || "").slice(0, 7);
  }

  function daysInRange(from, to) {
    var start = parseDateKey(from);
    var end = parseDateKey(to);
    if (!start || !end) return [];
    var days = [];
    var cursor = dateKey(start);
    var guard = 0;
    while (cursor <= to && guard < 370) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return days;
  }

  function formatMonth(value) {
    var date = parseDateKey(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("en-NG", {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatMonthShort(value) {
    var date = parseDateKey(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("en-NG", {
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function formatDate(value, options) {
    if (!value) return "";
    return data.formatDate(
      value,
      options || { month: "short", day: "numeric", year: "numeric" }
    );
  }

  function formatFullDate(value) {
    return data.formatDate(value, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function formatWeekRange(start) {
    var end = addDays(start, 6);
    var startDate = parseDateKey(start);
    var endDate = parseDateKey(end);
    if (!startDate || !endDate) return "—";
    var sameYear = startDate.getFullYear() === endDate.getFullYear();
    var sameMonth = isSameMonth(start, end);
    var startText = new Intl.DateTimeFormat("en-NG", {
      month: "short",
      day: "numeric",
      year: sameYear && sameMonth ? undefined : "numeric"
    }).format(startDate);
    var endText = new Intl.DateTimeFormat("en-NG", {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric"
    }).format(endDate);
    return startText + " – " + endText;
  }

  function formatTime12(value) {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
    var parts = value.split(":");
    var hours = Number(parts[0]);
    var suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return hours + ":" + parts[1] + " " + suffix;
  }

  function timeRange(start, end) {
    var startText = formatTime12(start);
    var endText = formatTime12(end);
    if (!startText || !endText) return "Time not set";
    var overnight = end <= start;
    return startText + " – " + endText + (overnight ? " next day" : "");
  }

  function shiftMeta(shiftType) {
    return SHIFT_META[shiftType] || {
      label: "Shift",
      icon: "clock",
      tone: "neutral",
      start: "",
      end: ""
    };
  }

  function recordMeta(record) {
    if (!record) return SHIFT_META.off;
    if (record.status === "off" || record.shiftType === "off") {
      return SHIFT_META.off;
    }
    return shiftMeta(record.shiftType);
  }

  function recordRange(record) {
    if (!record || record.status === "off" || record.shiftType === "off") {
      return "No working hours";
    }
    var meta = shiftMeta(record.shiftType);
    return timeRange(
      record.startTime || meta.start,
      record.endTime || meta.end
    );
  }

  function recordsByDate(records) {
    var map = Object.create(null);
    records.forEach(function (record) {
      map[record.date] = record;
    });
    return map;
  }

  function getRecords() {
    return data.getWorkScheduleRecords();
  }

  function getRecordForDate(value) {
    return (
      data.getWorkScheduleRecords().find(function (record) {
        return record.date === value;
      }) || null
    );
  }

  function monthKeyOf(value) {
    return String(value || "").slice(0, 7);
  }

  function monthDays(monthKey) {
    var first = monthKey + "-01";
    return daysInRange(first, endOfMonth(first));
  }

  function isOffRecord(record) {
    return Boolean(
      record && (record.status === "off" || record.shiftType === "off")
    );
  }

  function isGeneratedRecord(record) {
    return Boolean(record && record.source === "generated");
  }

  function recordTimes(record) {
    var meta = shiftMeta(record && record.shiftType);
    return {
      start: (record && record.startTime) || meta.start || "",
      end: (record && record.endTime) || meta.end || ""
    };
  }

  function sameSchedule(record, proposed) {
    if (!record || !proposed) return false;
    if (isOffRecord(record) || proposed.status === "off") {
      return isOffRecord(record) && proposed.status === "off";
    }
    if (record.shiftType !== proposed.shiftType) return false;
    var times = recordTimes(record);
    return times.start === proposed.startTime && times.end === proposed.endTime;
  }

  function dayOffset(from, to) {
    var start = parseDateKey(from);
    var end = parseDateKey(to);
    if (!start || !end) return 0;
    return Math.round((end.getTime() - start.getTime()) / DAY_MS);
  }

  function validateCycle(records) {
    var working = records.filter(function (record) {
      return !isOffRecord(record);
    });
    var off = records.filter(isOffRecord);
    if (working.length !== 3 || off.length !== 2) {
      return {
        valid: false,
        reason:
          "This five-day block has " +
          working.length +
          " working day" +
          (working.length === 1 ? "" : "s") +
          " and " +
          off.length +
          " day" +
          (off.length === 1 ? "" : "s") +
          " off. The cycle must contain exactly 3 working days and 2 days off."
      };
    }
    for (var index = 0; index < working.length; index += 1) {
      var times = recordTimes(working[index]);
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(times.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(times.end) ||
        times.start === times.end
      ) {
        return {
          valid: false,
          reason:
            "Each working day in the first cycle needs valid start and end times that are not the same."
        };
      }
    }
    return { valid: true, reason: "" };
  }

  function cyclePattern(records) {
    return records.map(function (record) {
      if (isOffRecord(record)) {
        return {
          shiftType: "off",
          status: "off",
          startTime: "",
          endTime: "",
          team: record.team || "",
          notes: ""
        };
      }
      var times = recordTimes(record);
      return {
        shiftType: record.shiftType,
        status: "working",
        startTime: times.start,
        endTime: times.end,
        team: record.team || "",
        notes: ""
      };
    });
  }

  function findFirstCycle(monthKey) {
    var map = recordsByDate(
      getRecords().filter(function (record) {
        return monthKeyOf(record.date) === monthKey && !isGeneratedRecord(record);
      })
    );
    var dates = Object.keys(map).sort();
    var runs = [];
    var run = [];

    dates.forEach(function (date) {
      var previous = run[run.length - 1];
      if (previous && addDays(previous, 1) !== date) {
        if (run.length) runs.push(run);
        run = [];
      }
      run.push(date);
    });
    if (run.length) runs.push(run);

    var anchorDate = data.getWorkScheduleConfig().anchor.date || "";
    var invalid = null;

    for (var runIndex = 0; runIndex < runs.length; runIndex += 1) {
      var current = runs[runIndex];
      if (current.length < 5) continue;
      var starts = [];
      var anchorIndex = current.indexOf(anchorDate);
      if (anchorIndex >= 0 && anchorIndex + 4 < current.length) {
        starts.push(current[anchorIndex]);
      }
      for (var index = 0; index + 4 < current.length; index += 1) {
        var candidateStart = current[index];
        if (starts.indexOf(candidateStart) === -1) starts.push(candidateStart);
      }
      for (var startIndex = 0; startIndex < starts.length; startIndex += 1) {
        var start = starts[startIndex];
        var windowRecords = [];
        for (var offset = 0; offset < 5; offset += 1) {
          windowRecords.push(map[addDays(start, offset)]);
        }
        var result = validateCycle(windowRecords);
        if (result.valid) {
          return {
            valid: true,
            start: start,
            records: windowRecords,
            pattern: cyclePattern(windowRecords),
            reason: ""
          };
        }
        if (!invalid) invalid = { start: start, reason: result.reason };
      }
    }

    if (invalid) {
      return {
        valid: false,
        start: invalid.start,
        records: [],
        pattern: [],
        reason: invalid.reason
      };
    }
    return {
      valid: false,
      start: "",
      records: [],
      pattern: [],
      reason: ""
    };
  }

  function buildGenerationPlan(monthKey, cycle) {
    var map = recordsByDate(getRecords());
    var dates = daysInRange(cycle.start, endOfMonth(monthKey + "-01"));
    var actions = [];
    var conflicts = [];
    var preserved = 0;

    dates.forEach(function (date) {
      var offset = dayOffset(cycle.start, date);
      var slot = ((offset % 5) + 5) % 5;
      var template = cycle.pattern[slot];
      var proposed = {
        date: date,
        shiftType: template.shiftType,
        status: template.status,
        startTime: template.startTime,
        endTime: template.endTime,
        team: template.team,
        notes: template.notes,
        source: "generated"
      };
      var existing = map[date] || null;

      if (existing && !isGeneratedRecord(existing)) {
        if (sameSchedule(existing, proposed)) {
          preserved += 1;
        } else {
          conflicts.push({
            date: date,
            existing: existing,
            proposed: proposed,
            type: "conflict"
          });
        }
        return;
      }

      if (existing && isGeneratedRecord(existing)) {
        if (sameSchedule(existing, proposed)) return;
        actions.push({
          date: date,
          existing: existing,
          proposed: proposed,
          type: "update"
        });
        return;
      }

      actions.push({
        date: date,
        existing: null,
        proposed: proposed,
        type: "create"
      });
    });

    return {
      monthKey: monthKey,
      cycle: cycle,
      actions: actions,
      conflicts: conflicts,
      preserved: preserved
    };
  }

  function updateGenerationNote(cycle) {
    var note = byId("ws-generation-note-copy");
    if (!note) return;
    if (cycle.valid && cycle.start) {
      note.textContent =
        "Your first five-day cycle starts on " +
        formatFullDate(cycle.start) +
        ". Preview the remaining dates before anything is written.";
    } else if (cycle.reason) {
      note.textContent =
        "The five consecutive dates starting " +
        formatFullDate(cycle.start) +
        " cannot be used yet. " +
        cycle.reason;
    } else {
      note.textContent =
        "Enter five consecutive dates in the calendar (three working days and two days off) to unlock monthly completion. If the first cycle starts later than your joining dates, set the rotation anchor to its first date. Nothing is generated until you preview and confirm it.";
    }
  }

  function setText(id, value) {
    var element = byId(id);
    if (element) element.textContent = value;
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

  function shiftTimesFromConfig(config) {
    var rotation = config && config.rotation ? config.rotation : {};
    var stored = rotation.shiftTimes || {};
    var times = {
      morning: Object.assign({}, DEFAULT_TIMES.morning),
      afternoon: Object.assign({}, DEFAULT_TIMES.afternoon),
      night: Object.assign({}, DEFAULT_TIMES.night)
    };
    ["morning", "afternoon", "night"].forEach(function (type) {
      var value = stored[type];
      if (
        value &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value.start || "") &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value.end || "")
      ) {
        times[type] = { start: value.start, end: value.end };
      }
    });
    return times;
  }

  function entryDefaults(shiftType) {
    var config = data.getWorkScheduleConfig();
    var times = shiftTimesFromConfig(config);
    return times[shiftType] || DEFAULT_TIMES.morning;
  }

  /* ---------- Initial confirmed schedule ---------- */

  function seedInitialSchedule() {
    var settings = data.getSettings();
    var preferences = settings.preferences || {};
    if (preferences.workScheduleInitialized) return;

    var records = getRecords();
    if (!records.length) {
      JOINING_RECORDS.forEach(function (record) {
        data.addWorkScheduleRecord(
          Object.assign({}, record, {
            team: settings.workTeam || ""
          })
        );
      });
    }

    data.updateSettings({
      preferences: Object.assign({}, preferences, {
        workScheduleInitialized: true
      })
    });
  }

  /* ---------- Shell ---------- */

  function renderStorageStatus() {
    var chip = byId("ws-storage-chip");
    var label = byId("ws-storage-label");
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
      chip.title = "Your work schedule is stored privately in this browser.";
    }
  }

  function renderShell() {
    var total = data.getTotalBalance();
    var available = data.getAvailableBalance();
    var balanceEl = byId("sidebar-total-balance");
    var noteEl = byId("sidebar-balance-note");
    if (balanceEl) balanceEl.textContent = data.formatNaira(total);
    if (noteEl) {
      noteEl.textContent =
        available === null
          ? "Available balance unavailable"
          : data.formatNaira(available) + " available";
    }
    renderStorageStatus();
  }

  /* ---------- Overview ---------- */

  function setIconTone(id, tone) {
    var element = byId(id);
    if (!element) return;
    element.className = "ws-overview-icon is-" + (tone || "neutral");
  }

  function renderOverview() {
    var todayValue = today();
    var records = getRecords();
    var map = recordsByDate(records);
    var todayRecord = map[todayValue] || null;
    var upcoming = records
      .filter(function (record) {
        return record.status === "working" && record.date >= todayValue;
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });
    var nextShift = upcoming[0] || null;
    var upcomingOff = records
      .filter(function (record) {
        return record.status === "off" && record.date >= todayValue;
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      })[0] || null;
    var monthKey = todayValue.slice(0, 7);
    var monthRecords = records.filter(function (record) {
      return record.date.slice(0, 7) === monthKey;
    });
    var monthWorking = monthRecords.filter(function (record) {
      return record.status === "working";
    });

    if (todayRecord) {
      var todayMeta = recordMeta(todayRecord);
      setText("ws-today-value", todayMeta.label);
      setText(
        "ws-today-note",
        todayRecord.status === "off"
          ? "Confirmed day off."
          : recordRange(todayRecord) + "."
      );
      setIconTone("ws-today-icon", todayMeta.tone);
    } else {
      setText("ws-today-value", "No schedule recorded");
      setText("ws-today-note", "Today has not been confirmed yet.");
      setIconTone("ws-today-icon", "transfer");
    }

    if (nextShift) {
      var nextMeta = recordMeta(nextShift);
      setText(
        "ws-next-shift-value",
        nextMeta.label + " · " + formatDate(nextShift.date, { month: "short", day: "numeric" })
      );
      setText("ws-next-shift-note", formatFullDate(nextShift.date) + " · " + recordRange(nextShift) + ".");
      setIconTone("ws-next-shift-icon", nextMeta.tone);
    } else {
      setText("ws-next-shift-value", "No confirmed shift");
      setText("ws-next-shift-note", "Add a schedule entry to confirm a shift.");
      setIconTone("ws-next-shift-icon", "morning");
    }

    if (upcomingOff) {
      setText(
        "ws-next-off-value",
        formatDate(upcomingOff.date, { weekday: "short", month: "short", day: "numeric" })
      );
      setText(
        "ws-next-off-note",
        upcomingOff.date === todayValue
          ? "Today is a confirmed day off."
          : "Confirmed day off · " + formatFullDate(upcomingOff.date) + "."
      );
      setIconTone("ws-next-off-icon", "off");
    } else {
      setText("ws-next-off-value", "No upcoming day off");
      setText("ws-next-off-note", "Confirmed days off will appear here.");
      setIconTone("ws-next-off-icon", "off");
    }

    setText("ws-month-work-value", String(monthWorking.length));
    setText(
      "ws-month-work-note",
      monthWorking.length
        ? "Confirmed working day" + (monthWorking.length === 1 ? "" : "s") + " in this month."
        : "No confirmed working days in this month."
    );
    setText("ws-month-entry-value", String(monthRecords.length));
    setText(
      "ws-month-entry-note",
      monthRecords.length
        ? "Schedule entr" + (monthRecords.length === 1 ? "y" : "ies") + " saved for this month."
        : "No schedule entries saved for this month."
    );
    setText("ws-month-tag", formatMonthShort(todayValue));
  }

  /* ---------- Calendar ---------- */

  function periodRange() {
    if (state.view === "week") {
      var start = startOfWeek(state.periodDate);
      return { from: start, to: addDays(start, 6) };
    }
    return { from: startOfMonth(state.periodDate), to: endOfMonth(state.periodDate) };
  }

  function periodLabel() {
    if (state.view === "week") {
      return formatWeekRange(startOfWeek(state.periodDate));
    }
    return formatMonth(state.periodDate);
  }

  function calendarButtonClass(value, record, extra) {
    var classes = ["ws-day"];
    if (extra) classes.push(extra);
    if (!isSameMonth(value, state.periodDate)) classes.push("is-outside");
    if (value === state.selectedDate) classes.push("is-selected");
    if (value === today()) classes.push("is-today");
    if (record) {
      classes.push(record.status === "off" ? "is-off" : "is-working");
      classes.push("is-" + recordMeta(record).tone);
    }
    return classes.join(" ");
  }

  function renderMonthView() {
    var first = startOfMonth(state.periodDate);
    var gridStart = startOfWeek(first);
    var days = daysInRange(gridStart, addDays(gridStart, 41));
    var map = recordsByDate(getRecords());
    var html = '<div class="ws-month">';

    html += '<div class="ws-weekday-row">';
    WEEKDAYS.forEach(function (day) {
      html += '<span class="ws-weekday">' + day + "</span>";
    });
    html += "</div>";

    html += '<div class="ws-month-grid">';
    days.forEach(function (value) {
      var record = map[value] || null;
      var meta = record ? recordMeta(record) : null;
      var dayNumber = Number(value.slice(-2));
      var aria = formatFullDate(value) + ", " + (record ? meta.label : "unconfirmed");
      html +=
        '<button type="button" class="' +
        calendarButtonClass(value, record) +
        '" data-ws-date="' +
        value +
        '" aria-label="' +
        escapeHtml(aria) +
        '">';
      html += '<span class="ws-day-number">' + dayNumber + "</span>";
      if (record) {
        html +=
          '<span class="ws-day-shift is-' +
          meta.tone +
          '">' +
          iconMarkup(meta.icon, "w-3 h-3") +
          "<span>" +
          escapeHtml(meta.label) +
          "</span></span>";
        if (record.status === "working") {
          html +=
            '<span class="ws-day-time">' +
            escapeHtml(recordRange(record)) +
            "</span>";
        }
      } else {
        html +=
          '<span class="ws-day-empty"><span class="ws-day-empty-dot" aria-hidden="true"></span><span class="ws-day-empty-text">No entry</span></span>';
      }
      html += "</button>";
    });
    html += "</div></div>";
    return html;
  }

  function renderWeekView() {
    var start = startOfWeek(state.periodDate);
    var days = daysInRange(start, addDays(start, 6));
    var map = recordsByDate(getRecords());
    var html = '<div class="ws-week-view">';
    days.forEach(function (value) {
      var record = map[value] || null;
      var meta = record ? recordMeta(record) : null;
      var date = parseDateKey(value);
      var aria = formatFullDate(value) + ", " + (record ? meta.label : "unconfirmed");
      html +=
        '<button type="button" class="' +
        calendarButtonClass(value, record, "ws-week-day") +
        '" data-ws-date="' +
        value +
        '" aria-label="' +
        escapeHtml(aria) +
        '">';
      html +=
        '<span class="ws-week-day-name">' +
        WEEKDAYS[date.getDay()] +
        "</span>";
      html += '<span class="ws-week-day-number">' + date.getDate() + "</span>";
      if (record) {
        html +=
          '<span class="ws-week-shift is-' +
          meta.tone +
          '">' +
          iconMarkup(meta.icon, "w-4 h-4") +
          "<strong>" +
          escapeHtml(meta.label) +
          "</strong></span>";
        html +=
          '<span class="ws-week-time">' +
          escapeHtml(record.status === "off" ? "No working hours" : recordRange(record)) +
          "</span>";
        if (record.notes) {
          html +=
            '<span class="ws-week-note">' + escapeHtml(record.notes) + "</span>";
        }
      } else {
        html +=
          '<span class="ws-week-unconfirmed">' +
          iconMarkup("calendar-plus", "w-4 h-4") +
          "<span>Unconfirmed</span></span>";
      }
      html += "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderListView() {
    var range = periodRange();
    var days = daysInRange(range.from, range.to);
    var map = recordsByDate(getRecords());
    var html = '<div class="ws-list-view">';
    days.forEach(function (value) {
      var record = map[value] || null;
      var meta = record ? recordMeta(record) : null;
      var date = parseDateKey(value);
      var aria = formatFullDate(value) + ", " + (record ? meta.label : "unconfirmed");
      html +=
        '<button type="button" class="ws-list-row ' +
        calendarButtonClass(value, record).replace(/ws-day\s?/g, "") +
        '" data-ws-date="' +
        value +
        '" aria-label="' +
        escapeHtml(aria) +
        '">';
      html +=
        '<span class="ws-list-date"><strong>' +
        WEEKDAYS[date.getDay()] +
        "</strong><span>" +
        escapeHtml(formatDate(value, { month: "short", day: "numeric" })) +
        "</span></span>";
      if (record) {
        html +=
          '<span class="ws-list-shift is-' +
          meta.tone +
          '">' +
          iconMarkup(meta.icon, "w-4 h-4") +
          "<span><strong>" +
          escapeHtml(meta.label) +
          "</strong><small>" +
          escapeHtml(record.status === "off" ? "No working hours" : recordRange(record)) +
          "</small></span></span>";
      } else {
        html +=
          '<span class="ws-list-shift is-unconfirmed">' +
          iconMarkup("calendar-plus", "w-4 h-4") +
          "<span><strong>Unconfirmed</strong><small>No schedule entry</small></span></span>";
      }
      html +=
        '<span class="ws-list-meta">' +
        (record && record.team ? escapeHtml(record.team) : "No team recorded") +
        "</span>";
      html +=
        '<span class="ws-list-arrow">' +
        iconMarkup("chevron-right", "w-4 h-4") +
        "</span>";
      html += "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderCalendar() {
    var container = byId("ws-calendar-view");
    if (!container) return;
    if (state.view === "week") {
      container.innerHTML = renderWeekView();
    } else if (state.view === "list") {
      container.innerHTML = renderListView();
    } else {
      container.innerHTML = renderMonthView();
    }
    setText("ws-period-label", periodLabel());
    var jump = byId("ws-jump-date");
    if (jump) jump.value = state.selectedDate;
    document.querySelectorAll("[data-ws-view]").forEach(function (button) {
      button.classList.toggle(
        "active",
        button.getAttribute("data-ws-view") === state.view
      );
    });
  }

  /* ---------- Details ---------- */

  function detailRow(label, value) {
    return (
      '<div class="ws-details-row"><dt>' +
      escapeHtml(label) +
      "</dt><dd>" +
      escapeHtml(value || "Not recorded") +
      "</dd></div>"
    );
  }

  function renderDetails() {
    var container = byId("ws-details-panel");
    if (!container) return;
    var record = getRecordForDate(state.selectedDate);
    var html = '<div class="ws-details-inner">';
    html +=
      '<span class="ws-details-kicker">Selected date</span>';
    html +=
      '<div class="ws-details-head"><div><h3>' +
      escapeHtml(formatDate(state.selectedDate, { weekday: "long", month: "long", day: "numeric" })) +
      "</h3><p>" +
      escapeHtml(state.selectedDate.slice(0, 4)) +
      "</p></div>";

    if (record) {
      var meta = recordMeta(record);
      html +=
        '<span class="ws-status-pill is-' +
        meta.tone +
        '">' +
        iconMarkup(meta.icon, "w-3 h-3") +
        "<span>" +
        escapeHtml(record.status === "off" ? "Confirmed off" : "Confirmed") +
        "</span></span>";
      html += "</div>";
      html +=
        '<div class="ws-details-shift is-' +
        meta.tone +
        '"><span class="ws-details-shift-icon">' +
        iconMarkup(meta.icon, "w-5 h-5") +
        "</span><div><strong>" +
        escapeHtml(meta.label) +
        "</strong><small>" +
        escapeHtml(recordRange(record)) +
        "</small></div></div>";
      html += '<dl class="ws-details-list">';
      html += detailRow("Status", record.status === "off" ? "Day off" : "Working day");
      html += detailRow(
        "Entry type",
        isGeneratedRecord(record)
          ? "Generated from the first five-day cycle"
          : "Manual entry"
      );
      html += detailRow("Team / department", record.team);
      var settings = data.getSettings();
      html += detailRow("Supervisor", settings.supervisor);
      html += detailRow("Notes", record.notes);
      html += "</dl>";
      html += '<div class="ws-details-actions">';
      html +=
        '<button type="button" class="ws-btn ws-btn-primary" data-ws-action="edit">' +
        iconMarkup("pencil", "w-4 h-4") +
        "<span>Edit entry</span></button>";
      html +=
        '<button type="button" class="ws-btn ws-btn-danger" data-ws-action="delete">' +
        iconMarkup("trash-2", "w-4 h-4") +
        "<span>Delete</span></button>";
      html += "</div>";
    } else {
      html += "</div>";
      html +=
        '<div class="ws-details-empty"><span class="ws-details-empty-icon">' +
        iconMarkup("calendar-plus", "w-5 h-5") +
        "</span><strong>Unconfirmed date</strong><p>No schedule entry has been saved for this date. It stays unassigned until you add one.</p></div>";
      html +=
        '<div class="ws-details-actions"><button type="button" class="ws-btn ws-btn-primary" data-ws-action="add">' +
        iconMarkup("plus", "w-4 h-4") +
        "<span>Add entry for this date</span></button></div>";
    }

    html += "</div>";
    container.innerHTML = html;
  }

  /* ---------- Rotation ---------- */

  function renderRotation() {
    var config = data.getWorkScheduleConfig();
    var rotation = config.rotation || {};
    var anchor = config.anchor || {};
    var times = shiftTimesFromConfig(config);
    var anchorMeta = shiftMeta(anchor.shiftType);

    setText(
      "ws-shift-morning-time",
      timeRange(times.morning.start, times.morning.end)
    );
    setText(
      "ws-shift-afternoon-time",
      timeRange(times.afternoon.start, times.afternoon.end)
    );
    setText(
      "ws-shift-night-time",
      timeRange(times.night.start, times.night.end)
    );
    setText("ws-cycle-working", String(rotation.workingDaysPerCycle || 0));
    setText("ws-cycle-off", String(rotation.offDaysPerCycle || 0));
    setText(
      "ws-anchor-value",
      anchor.date && anchor.shiftType
        ? anchorMeta.label + " · " + formatDate(anchor.date)
        : "Not set"
    );
    setText(
      "ws-anchor-note",
      anchor.date && anchor.shiftType
        ? "The first complete five-day cycle that includes this date is used for monthly completion."
        : "No rotation anchor is stored. The first complete five-day cycle in the month is used."
    );

    var workdays = byId("ws-rotation-workdays");
    var offdays = byId("ws-rotation-offdays");
    var anchorDate = byId("ws-anchor-date");
    var anchorShift = byId("ws-anchor-shift");
    if (workdays) workdays.value = rotation.workingDaysPerCycle || 3;
    if (offdays) offdays.value = rotation.offDaysPerCycle || 2;
    if (anchorDate) anchorDate.value = anchor.date || "";
    if (anchorShift) anchorShift.value = anchor.shiftType || "";

    var sequence =
      Array.isArray(rotation.shiftSequence) && rotation.shiftSequence.length
        ? rotation.shiftSequence
        : ["morning", "afternoon", "night"];
    [1, 2, 3].forEach(function (index) {
      var select = byId("ws-sequence-" + index);
      if (select) select.value = sequence[index - 1] || sequence[0] || "morning";
    });

    ["morning", "afternoon", "night"].forEach(function (type) {
      var start = byId("ws-time-" + type + "-start");
      var end = byId("ws-time-" + type + "-end");
      if (start) start.value = times[type].start;
      if (end) end.value = times[type].end;
    });
  }

  function renderGenerationSuggestion() {
    var card = byId("ws-generation-card");
    var note = byId("ws-generation-card-note");
    var badge = byId("ws-generation-state");
    var monthKey = monthKeyOf(state.periodDate);
    var cycle = findFirstCycle(monthKey);
    updateGenerationNote(cycle);

    if (!card) return;
    if (!cycle.valid) {
      card.hidden = true;
      state.generationPlan = null;
      if (badge) {
        badge.textContent = "Future generation off";
        badge.classList.remove("is-complete");
        badge.classList.add("is-off");
      }
      return;
    }

    var plan = buildGenerationPlan(monthKey, cycle);
    state.generationPlan = plan;
    if (!plan.actions.length) {
      card.hidden = true;
      if (badge) {
        badge.textContent = plan.conflicts.length
          ? "Month complete · overrides kept"
          : "Month complete";
        badge.classList.remove("is-off");
        badge.classList.add("is-complete");
      }
      return;
    }

    card.hidden = false;
    if (badge) {
      badge.textContent = "Ready to complete";
      badge.classList.remove("is-off", "is-complete");
    }
    if (note) {
      note.textContent =
        "Your first five-day cycle starts " +
        formatDate(cycle.start, { month: "short", day: "numeric" }) +
        ". It can fill " +
        plan.actions.length +
        " remaining date" +
        (plan.actions.length === 1 ? "" : "s") +
        " in " +
        formatMonth(state.periodDate) +
        ". Manual entries stay exactly as entered.";
    }
  }

  function generationRow(item) {
    var proposed = item.proposed;
    var meta = recordMeta(proposed);
    var date = parseDateKey(item.date);
    var dayName = date ? WEEKDAYS[date.getDay()] : "";
    var shiftText =
      proposed.status === "off"
        ? "Day off"
        : meta.label;
    var timesText =
      proposed.status === "off" ? "No working hours" : timeRange(proposed.startTime, proposed.endTime);
    var actionText = item.type === "create" ? "New" : "Update generated";
    if (item.type === "conflict") {
      var existingMeta = recordMeta(item.existing);
      actionText = "Manual kept · currently " + existingMeta.label;
    }
    return (
      '<tr class="ws-generate-row' +
      (item.type === "conflict" ? " is-conflict" : "") +
      '">' +
      "<td><strong>" +
      escapeHtml(formatDate(item.date, { month: "short", day: "numeric", year: "numeric" })) +
      "</strong></td>" +
      "<td>" +
      escapeHtml(dayName) +
      "</td>" +
      '<td><span class="ws-generate-shift is-' +
      meta.tone +
      '">' +
      iconMarkup(meta.icon, "w-3 h-3") +
      "<span>" +
      escapeHtml(shiftText) +
      "</span></span></td>" +
      "<td>" +
      escapeHtml(timesText) +
      "</td>" +
      '<td class="ws-generate-action">' +
      escapeHtml(actionText) +
      "</td></tr>"
    );
  }

  function openGenerationPreview() {
    var monthKey = monthKeyOf(state.periodDate);
    var cycle = findFirstCycle(monthKey);
    if (!cycle.valid) {
      renderGenerationSuggestion();
      return;
    }
    var plan = buildGenerationPlan(monthKey, cycle);
    state.generationPlan = plan;
    if (!plan.actions.length) {
      renderGenerationSuggestion();
      return;
    }

    var rows = plan.actions
      .concat(plan.conflicts)
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      })
      .map(generationRow)
      .join("");

    setText("ws-generate-title", "Complete " + formatMonth(state.periodDate));
    setText(
      "ws-generate-subtitle",
      "Review every proposed date before applying the five-day cycle."
    );
    var summary = byId("ws-generate-summary");
    if (summary) {
      summary.innerHTML =
        '<div class="ws-generate-summary-item"><span>Cycle start</span><strong>' +
        escapeHtml(formatDate(cycle.start, { month: "short", day: "numeric", year: "numeric" })) +
        "</strong></div>" +
        '<div class="ws-generate-summary-item"><span>New entries</span><strong>' +
        plan.actions.filter(function (item) {
          return item.type === "create";
        }).length +
        "</strong></div>" +
        '<div class="ws-generate-summary-item"><span>Generated updates</span><strong>' +
        plan.actions.filter(function (item) {
          return item.type === "update";
        }).length +
        "</strong></div>" +
        '<div class="ws-generate-summary-item"><span>Manual conflicts</span><strong>' +
        plan.conflicts.length +
        "</strong></div>";
    }
    var rowsBody = byId("ws-generate-rows");
    if (rowsBody) rowsBody.innerHTML = rows;
    setFormError("ws-generate-error", "");
    var confirm = byId("ws-generate-confirm");
    if (confirm) {
      confirm.disabled = false;
      confirm.innerHTML =
        iconMarkup("check", "w-4 h-4") +
        "<span>Apply " +
        plan.actions.length +
        " date" +
        (plan.actions.length === 1 ? "" : "s") +
        "</span>";
    }
    showModal("ws-generate-modal");
    refreshIcons();
  }

  function applyGeneration() {
    var plan = state.generationPlan;
    if (!plan) return;
    var confirm = byId("ws-generate-confirm");
    if (confirm) confirm.disabled = true;
    setFormError("ws-generate-error", "");

    var applied = 0;
    var skipped = 0;
    try {
      plan.actions.forEach(function (item) {
        var latest = getRecordForDate(item.date);
        if (latest && !isGeneratedRecord(latest)) {
          skipped += 1;
          return;
        }
        var payload = {
          date: item.proposed.date,
          shiftType: item.proposed.shiftType,
          status: item.proposed.status,
          startTime: item.proposed.startTime,
          endTime: item.proposed.endTime,
          team: item.proposed.team,
          notes: item.proposed.notes,
          source: "generated"
        };
        if (latest) {
          data.updateWorkScheduleRecord(latest.id, payload);
        } else {
          data.addWorkScheduleRecord(payload);
        }
        applied += 1;
      });
    } catch (error) {
      if (confirm) confirm.disabled = false;
      setFormError("ws-generate-error", error.message);
      return;
    }

    hideModal("ws-generate-modal");
    state.generationPlan = null;
    renderAll();
    var monthLabel = formatMonth(state.periodDate);
    showToast(
      "Month schedule completed",
      applied +
        " date" +
        (applied === 1 ? "" : "s") +
        " added or updated in " +
        monthLabel +
        ". " +
        (skipped ? skipped + " manual entr" + (skipped === 1 ? "y was" : "ies were") + " kept." : "Manual entries were preserved."),
      "success"
    );
  }

  function saveRotation(event) {
    event.preventDefault();
    setFormError("ws-rotation-error", "");

    var workdays = Number(byId("ws-rotation-workdays").value);
    var offdays = Number(byId("ws-rotation-offdays").value);
    if (!Number.isInteger(workdays) || workdays < 1 || workdays > 14) {
      setFormError("ws-rotation-error", "Working days per cycle must be a whole number from 1 to 14.");
      return;
    }
    if (!Number.isInteger(offdays) || offdays < 1 || offdays > 14) {
      setFormError("ws-rotation-error", "Days off per cycle must be a whole number from 1 to 14.");
      return;
    }

    var sequence = [];
    for (var index = 1; index <= 3; index += 1) {
      var value = byId("ws-sequence-" + index).value;
      if (SHIFT_TYPES.indexOf(value) === -1 || value === "off") {
        setFormError("ws-rotation-error", "Choose a valid shift for each step in the sequence.");
        return;
      }
      sequence.push(value);
    }

    var times = {};
    var timeTypes = ["morning", "afternoon", "night"];
    for (var t = 0; t < timeTypes.length; t += 1) {
      var type = timeTypes[t];
      var start = byId("ws-time-" + type + "-start").value;
      var end = byId("ws-time-" + type + "-end").value;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
        setFormError("ws-rotation-error", "Enter a valid start and end time for every shift.");
        return;
      }
      if (start === end) {
        setFormError("ws-rotation-error", shiftMeta(type).label + " start and end times cannot be the same.");
        return;
      }
      times[type] = { start: start, end: end };
    }

    var anchorDate = byId("ws-anchor-date").value;
    var anchorShift = byId("ws-anchor-shift").value;
    if (anchorDate && !data.isDateOnly(anchorDate)) {
      setFormError("ws-rotation-error", "Choose a valid rotation anchor date.");
      return;
    }
    if ((anchorDate && !anchorShift) || (!anchorDate && anchorShift)) {
      setFormError("ws-rotation-error", "Set both the rotation anchor date and anchor shift, or clear both.");
      return;
    }

    try {
      data.updateWorkScheduleConfig({
        rotation: {
          workingDaysPerCycle: workdays,
          offDaysPerCycle: offdays,
          shiftSequence: sequence,
          shiftTimes: times
        },
        anchor: {
          date: anchorDate || "",
          shiftType: anchorShift || "",
          startTime: anchorShift ? times[anchorShift].start : "",
          endTime: anchorShift ? times[anchorShift].end : ""
        }
      });
      renderAll();
      showToast(
        "Rotation settings saved",
        "The stored rotation was updated without creating future schedule entries.",
        "success"
      );
    } catch (error) {
      setFormError("ws-rotation-error", error.message);
    }
  }

  /* ---------- History ---------- */

  function historyRow(record) {
    var meta = recordMeta(record);
    return (
      '<button type="button" class="ws-history-row" data-ws-history-date="' +
      escapeHtml(record.date) +
      '">' +
      '<span class="ws-history-icon is-' +
      meta.tone +
      '">' +
      iconMarkup(meta.icon, "w-4 h-4") +
      "</span>" +
      '<span class="ws-history-copy"><strong>' +
      escapeHtml(formatDate(record.date, { weekday: "short", month: "short", day: "numeric" })) +
      "</strong><small>" +
      escapeHtml(meta.label + (record.status === "off" ? "" : " · " + recordRange(record))) +
      "</small></span>" +
      '<span class="ws-history-arrow">' +
      iconMarkup("chevron-right", "w-4 h-4") +
      "</span></button>"
    );
  }

  function historyEmpty(message) {
    return (
      '<div class="ws-history-empty">' +
      iconMarkup("calendar-days", "w-5 h-5") +
      "<span>" +
      escapeHtml(message) +
      "</span></div>"
    );
  }

  function renderHistory() {
    var todayValue = today();
    var records = getRecords();
    var upcoming = records
      .filter(function (record) {
        return record.date >= todayValue;
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });
    var previous = records
      .filter(function (record) {
        return record.date < todayValue;
      })
      .sort(function (a, b) {
        return b.date.localeCompare(a.date);
      });

    setText(
      "ws-upcoming-count",
      upcoming.length + " entr" + (upcoming.length === 1 ? "y" : "ies")
    );
    setText(
      "ws-previous-count",
      previous.length + " entr" + (previous.length === 1 ? "y" : "ies")
    );

    var upcomingList = byId("ws-upcoming-list");
    var previousList = byId("ws-previous-list");
    if (upcomingList) {
      upcomingList.innerHTML = upcoming.length
        ? upcoming.map(historyRow).join("")
        : historyEmpty("No confirmed upcoming entries.");
    }
    if (previousList) {
      previousList.innerHTML = previous.length
        ? previous.map(historyRow).join("")
        : historyEmpty("No previous entries yet.");
    }
  }

  /* ---------- Entry form ---------- */

  function updateEntryTimeFields() {
    var shift = byId("ws-entry-shift").value;
    var startField = byId("ws-start-field");
    var endField = byId("ws-end-field");
    var start = byId("ws-entry-start");
    var end = byId("ws-entry-end");
    var isOff = shift === "off";
    if (startField) startField.classList.toggle("is-hidden", isOff);
    if (endField) endField.classList.toggle("is-hidden", isOff);
    if (start) {
      start.disabled = isOff;
      if (isOff) start.value = "";
    }
    if (end) {
      end.disabled = isOff;
      if (isOff) end.value = "";
    }
  }

  function openEntryForm(recordId, date) {
    var record = recordId ? data.getWorkScheduleRecord(recordId) : null;
    state.editingId = record ? record.id : null;
    setFormError("ws-entry-error", "");
    setText("ws-entry-title", record ? "Edit schedule entry" : "Add schedule entry");
    setText(
      "ws-entry-subtitle",
      record
        ? "Update the confirmed details for this date."
        : "Confirm a shift or day off for a specific date."
    );
    setText("ws-entry-submit", record ? "Save changes" : "Save entry");
    var submit = byId("ws-entry-submit");
    if (submit) {
      submit.innerHTML =
        iconMarkup("check", "w-4 h-4") +
        "<span>" + (record ? "Save changes" : "Save entry") + "</span>";
    }
    var dateInput = byId("ws-entry-date");
    var shiftInput = byId("ws-entry-shift");
    var startInput = byId("ws-entry-start");
    var endInput = byId("ws-entry-end");
    var teamInput = byId("ws-entry-team");
    var notesInput = byId("ws-entry-notes");
    if (dateInput) dateInput.value = record ? record.date : date || state.selectedDate;
    if (shiftInput) shiftInput.value = record ? record.shiftType : "";
    if (startInput) startInput.value = record ? record.startTime || "" : "";
    if (endInput) endInput.value = record ? record.endTime || "" : "";
    if (teamInput) teamInput.value = record ? record.team || "" : "";
    if (notesInput) notesInput.value = record ? record.notes || "" : "";
    updateEntryTimeFields();
    showModal("ws-entry-modal");
    window.setTimeout(function () {
      if (dateInput) dateInput.focus();
    }, 80);
  }

  function handleEntryShiftChange() {
    var shift = byId("ws-entry-shift").value;
    var start = byId("ws-entry-start");
    var end = byId("ws-entry-end");
    if (shift && shift !== "off") {
      var defaults = entryDefaults(shift);
      if (start) start.value = defaults.start;
      if (end) end.value = defaults.end;
    }
    updateEntryTimeFields();
  }

  function submitEntry(event) {
    event.preventDefault();
    setFormError("ws-entry-error", "");
    var date = byId("ws-entry-date").value;
    var shiftType = byId("ws-entry-shift").value;
    var start = byId("ws-entry-start").value;
    var end = byId("ws-entry-end").value;
    var team = byId("ws-entry-team").value.trim();
    var notes = byId("ws-entry-notes").value.trim();

    if (!data.isDateOnly(date)) {
      setFormError("ws-entry-error", "Choose a valid work date.");
      return;
    }
    if (SHIFT_TYPES.indexOf(shiftType) === -1) {
      setFormError("ws-entry-error", "Choose a shift or day off.");
      return;
    }
    var duplicate = getRecords().some(function (record) {
      return record.date === date && record.id !== state.editingId;
    });
    if (duplicate) {
      setFormError("ws-entry-error", "A schedule entry already exists for this date. Edit that entry instead.");
      return;
    }

    var isOff = shiftType === "off";
    if (!isOff) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
        setFormError("ws-entry-error", "Enter a valid start and end time for this shift.");
        return;
      }
      if (start === end) {
        setFormError("ws-entry-error", "Start and end times cannot be the same.");
        return;
      }
    }

    var payload = {
      date: date,
      shiftType: shiftType,
      status: isOff ? "off" : "working",
      startTime: isOff ? "" : start,
      endTime: isOff ? "" : end,
      team: team,
      notes: notes,
      source: "manual"
    };

    var editing = Boolean(state.editingId);
    try {
      if (editing) {
        data.updateWorkScheduleRecord(state.editingId, payload);
      } else {
        data.addWorkScheduleRecord(payload);
      }
      hideModal("ws-entry-modal");
      state.selectedDate = date;
      state.periodDate = date;
      state.editingId = null;
      renderAll();
      showToast(
        editing ? "Schedule updated" : "Schedule entry saved",
        formatFullDate(date) + (editing ? " was updated." : " was confirmed."),
        "success"
      );
    } catch (error) {
      setFormError("ws-entry-error", error.message);
    }
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
    toast.className = "toast ws-toast show";
    if (toastIcon) {
      toastIcon.className =
        "ws-toast-icon is-" +
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
    setText("ws-confirm-title", settings.title || "Confirm action");
    setText(
      "ws-confirm-subtitle",
      settings.subtitle || "This action needs your confirmation."
    );
    setText("ws-confirm-copy", settings.message || "");
    var action = byId("ws-confirm-action");
    if (action) {
      action.textContent = settings.confirmLabel || "Confirm";
      action.className =
        "ws-btn " + (settings.danger === false ? "ws-btn-primary" : "ws-btn-danger");
    }
    state.confirmHandler = settings.onConfirm || null;
    showModal("ws-confirm-modal");
  }

  function requestDelete() {
    var record = getRecordForDate(state.selectedDate);
    if (!record) return;
    var meta = recordMeta(record);
    openConfirm({
      title: "Delete schedule entry?",
      subtitle: "This removes the record for the selected date.",
      message:
        formatFullDate(record.date) +
        " is currently saved as " +
        meta.label.toLowerCase() +
        ". Deleting it leaves the date unconfirmed.",
      confirmLabel: "Delete entry",
      onConfirm: function () {
        try {
          data.deleteWorkScheduleRecord(record.id);
          hideModal("ws-confirm-modal");
          renderAll();
          showToast("Schedule entry deleted", formatFullDate(record.date) + " is now unconfirmed.", "success");
        } catch (error) {
          hideModal("ws-confirm-modal");
          showToast("Could not delete entry", error.message, "error");
        }
      }
    });
  }

  /* ---------- Actions and events ---------- */

  function selectDate(value) {
    if (!data.isDateOnly(value)) return;
    state.selectedDate = value;
    state.periodDate = value;
    renderCalendar();
    renderDetails();
    renderGenerationSuggestion();
    refreshIcons();
  }

  function revealMobileDetails() {
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    var details = byId("ws-details-panel");
    if (!details) return;
    window.setTimeout(function () {
      var reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      var header = document.querySelector("header.sticky");
      var headerOffset = header
        ? header.getBoundingClientRect().height + 16
        : 16;
      var rect = details.getBoundingClientRect();
      var pageTop = window.pageYOffset + rect.top;
      var available = window.innerHeight - headerOffset - 16;
      var targetTop =
        rect.height >= available
          ? pageTop - headerOffset
          : pageTop - (window.innerHeight - rect.height) / 2;
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: reduceMotion ? "auto" : "smooth"
      });
      details.classList.remove("is-revealed");
      void details.offsetWidth;
      details.classList.add("is-revealed");
      window.setTimeout(function () {
        details.classList.remove("is-revealed");
      }, 500);
    }, 60);
  }

  function handleCalendarClick(event) {
    var target = event.target.closest("[data-ws-date]");
    if (!target) return;
    selectDate(target.getAttribute("data-ws-date"));
    revealMobileDetails();
  }

  function handleDetailsClick(event) {
    var target = event.target.closest("[data-ws-action]");
    if (!target) return;
    var action = target.getAttribute("data-ws-action");
    if (action === "add") {
      openEntryForm(null, state.selectedDate);
    } else if (action === "edit") {
      var record = getRecordForDate(state.selectedDate);
      if (record) openEntryForm(record.id);
    } else if (action === "delete") {
      requestDelete();
    }
  }

  function navigate(direction) {
    if (state.view === "week") {
      state.periodDate = addDays(state.periodDate, direction * 7);
    } else {
      state.periodDate = addMonths(state.periodDate, direction);
    }
    state.selectedDate = state.periodDate;
    renderCalendar();
    renderDetails();
    renderGenerationSuggestion();
    refreshIcons();
  }

  function bindEvents() {
    var addButton = byId("ws-add-entry");
    if (addButton) {
      addButton.addEventListener("click", function () {
        openEntryForm(null, state.selectedDate);
      });
    }

    var viewSwitch = byId("ws-view-switch");
    if (viewSwitch) {
      viewSwitch.addEventListener("click", function (event) {
        var button = event.target.closest("[data-ws-view]");
        if (!button) return;
        state.view = button.getAttribute("data-ws-view");
        renderCalendar();
        refreshIcons();
      });
    }

    document.querySelectorAll("[data-ws-nav]").forEach(function (button) {
      button.addEventListener("click", function () {
        navigate(Number(button.getAttribute("data-ws-nav")) || 1);
      });
    });

    document.querySelectorAll("[data-ws-today]").forEach(function (button) {
      button.addEventListener("click", function () {
        selectDate(today());
      });
    });

    var jump = byId("ws-jump-date");
    if (jump) {
      jump.addEventListener("change", function () {
        if (data.isDateOnly(jump.value)) selectDate(jump.value);
      });
    }

    var calendarView = byId("ws-calendar-view");
    if (calendarView) calendarView.addEventListener("click", handleCalendarClick);

    var detailsPanel = byId("ws-details-panel");
    if (detailsPanel) detailsPanel.addEventListener("click", handleDetailsClick);

    document.addEventListener("click", function (event) {
      var historyTarget = event.target.closest("[data-ws-history-date]");
      if (historyTarget) {
        selectDate(historyTarget.getAttribute("data-ws-history-date"));
        var calendar = byId("ws-calendar-view");
        if (calendar) {
          calendar.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });

    var generateOpen = byId("ws-generate-open");
    if (generateOpen) generateOpen.addEventListener("click", openGenerationPreview);

    var generateConfirm = byId("ws-generate-confirm");
    if (generateConfirm) generateConfirm.addEventListener("click", applyGeneration);

    var rotationForm = byId("ws-rotation-form");
    if (rotationForm) rotationForm.addEventListener("submit", saveRotation);

    var entryForm = byId("ws-entry-form");
    if (entryForm) entryForm.addEventListener("submit", submitEntry);

    var entryShift = byId("ws-entry-shift");
    if (entryShift) entryShift.addEventListener("change", handleEntryShiftChange);

    var confirmAction = byId("ws-confirm-action");
    if (confirmAction) {
      confirmAction.addEventListener("click", function () {
        if (typeof state.confirmHandler === "function") {
          state.confirmHandler();
        }
      });
    }

    document.addEventListener("click", function (event) {
      var close = event.target.closest("[data-ws-close]");
      if (close) {
        hideModal(close.getAttribute("data-ws-close"));
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
    window.addEventListener("storage", function (event) {
      if (event.key === data.STORAGE_KEY) window.location.reload();
    });
  }

  function renderAll() {
    renderShell();
    renderOverview();
    renderCalendar();
    renderDetails();
    renderRotation();
    renderGenerationSuggestion();
    renderHistory();
    refreshIcons();
  }

  function init() {
    seedInitialSchedule();
    bindEvents();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

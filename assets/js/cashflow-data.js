(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : globalThis;
  var STORAGE_KEY = "gabsweb-cashflow-data";
  var BACKUP_PREFIX = "gabsweb-cashflow-data:backup:";
  var SCHEMA_VERSION = 1;
  var INITIAL_FINANCIAL_DATE = "2026-11-01";
  var DEFAULT_CURRENCY = "NGN";
  var memoryStore = Object.create(null);
  var storageAvailable = true;
  var state = null;
  var readOnly = false;
  var pendingCorruptRaw = null;
  var loadInfo = {
    status: "uninitialized",
    warning: null,
    storageAvailable: true,
    corruptBackupKey: null
  };
  var listeners = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function roundMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function roundPercent(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function generateId(prefix) {
    var suffix;
    try {
      if (root.crypto && typeof root.crypto.randomUUID === "function") {
        suffix = root.crypto.randomUUID();
      }
    } catch (error) {
      suffix = null;
    }
    if (!suffix) {
      suffix =
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
    }
    return (prefix ? prefix + "_" : "") + suffix;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function toDateKey(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate())
    );
  }

  function todayKey() {
    return toDateKey(new Date());
  }

  function isDateOnly(value) {
    if (typeof value !== "string") return false;
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    var date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function isMonthKey(value) {
    return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  }

  function isTimeValue(value) {
    return (
      typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    );
  }

  function isIsoTimestamp(value) {
    if (typeof value !== "string" || !value) return false;
    var parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  }

  function dateOnlyToLocalDate(value) {
    if (!isDateOnly(value)) return null;
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

  function addDaysToDateKey(value, days) {
    var date = dateOnlyToLocalDate(value);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return toDateKey(date);
  }

  function getMonthKey(value) {
    if (value instanceof Date) {
      return value.getFullYear() + "-" + pad2(value.getMonth() + 1);
    }
    if (typeof value === "string" && isDateOnly(value)) {
      return value.slice(0, 7);
    }
    if (typeof value === "string" && isMonthKey(value)) {
      return value;
    }
    if (typeof value === "string" && isIsoTimestamp(value)) {
      return getMonthKey(new Date(value));
    }
    return getMonthKey(todayKey());
  }

  function formatDate(value, options) {
    if (!value) return "";
    var date = isDateOnly(value) ? dateOnlyToLocalDate(value) : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return "";
    var settings = Object.assign(
      { year: "numeric", month: "short", day: "numeric" },
      options || {}
    );
    try {
      return new Intl.DateTimeFormat("en-NG", settings).format(date);
    } catch (error) {
      return toDateKey(date);
    }
  }

  function formatCurrency(amount, options) {
    var value = Number(amount);
    if (!Number.isFinite(value)) value = 0;
    var settings = Object.assign(
      {
        style: "currency",
        currency: DEFAULT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      },
      options || {}
    );
    try {
      return new Intl.NumberFormat("en-NG", settings).format(value);
    } catch (error) {
      return (settings.currency || DEFAULT_CURRENCY) + " " + value.toFixed(2);
    }
  }

  function formatNaira(amount) {
    return formatCurrency(amount, { currency: "NGN" });
  }

  function isPlainObject(value) {
    return (
      value !== null && typeof value === "object" && !Array.isArray(value)
    );
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isValidAmount(value) {
    return isFiniteNumber(value) && value > 0;
  }

  function isValidNonNegativeAmount(value) {
    return isFiniteNumber(value) && value >= 0;
  }

  function storageGet(key) {
    try {
      if (root.localStorage) {
        return root.localStorage.getItem(key);
      }
    } catch (error) {
      storageAvailable = false;
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key)
      ? memoryStore[key]
      : null;
  }

  function storageSet(key, value) {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(key, value);
        return true;
      }
    } catch (error) {
      storageAvailable = false;
    }
    memoryStore[key] = value;
    return true;
  }

  function storageRemove(key) {
    try {
      if (root.localStorage) root.localStorage.removeItem(key);
    } catch (error) {
      storageAvailable = false;
    }
    delete memoryStore[key];
  }

  function backupRaw(raw, reason) {
    var safeReason = String(reason || "backup").replace(/[^a-z0-9_-]/gi, "-");
    var key = BACKUP_PREFIX + safeReason + ":" + Date.now();
    try {
      storageSet(key, raw);
      return key;
    } catch (error) {
      return null;
    }
  }

  function createDefaultState() {
    var timestamp = nowIso();
    return {
      schemaVersion: SCHEMA_VERSION,
      accounts: [],
      transactions: [],
      allocations: [],
      savingsPlans: [],
      savingsMovements: [],
      goals: [],
      dailyPlans: [],
      projects: [],
      workSchedule: {
        profileId: "local",
        records: [],
        rotation: {
          configured: false,
          workingDaysPerCycle: 3,
          offDaysPerCycle: 2,
          shiftSequence: ["morning", "afternoon", "night"],
          shiftTimes: {
            morning: { start: "07:00", end: "13:00" },
            afternoon: { start: "13:00", end: "19:00" },
            night: { start: "19:00", end: "07:00" }
          }
        },
        anchor: {
          date: "",
          shiftType: "",
          cyclePosition: 0,
          startTime: "",
          endTime: ""
        }
      },
      settings: {
        name: "",
        email: "",
        currency: DEFAULT_CURRENCY,
        financialMonthPreference: "calendar",
        workTeam: "",
        supervisor: "",
        shiftPreferences: {},
        preferences: {}
      },
      meta: {
        createdAt: timestamp,
        updatedAt: timestamp
      }
    };
  }

  function normalizeState(source) {
    var defaults = createDefaultState();
    var incoming = isPlainObject(source) ? deepClone(source) : {};
    var normalized = Object.assign({}, defaults, incoming);
    var collections = [
      "accounts",
      "transactions",
      "allocations",
      "savingsPlans",
      "savingsMovements",
      "goals",
      "dailyPlans",
      "projects"
    ];
    collections.forEach(function (collection) {
      normalized[collection] = Array.isArray(incoming[collection])
        ? incoming[collection]
        : [];
    });
    var incomingWork = isPlainObject(incoming.workSchedule)
      ? incoming.workSchedule
      : {};
    normalized.workSchedule = Object.assign(
      {},
      defaults.workSchedule,
      incomingWork
    );
    normalized.workSchedule.records = Array.isArray(incomingWork.records)
      ? incomingWork.records
      : [];
    normalized.workSchedule.profileId =
      typeof incomingWork.profileId === "string" && incomingWork.profileId
        ? incomingWork.profileId
        : "local";
    var incomingRotation = isPlainObject(incomingWork.rotation)
      ? incomingWork.rotation
      : {};
    normalized.workSchedule.rotation = Object.assign(
      {},
      defaults.workSchedule.rotation,
      incomingRotation
    );
    normalized.workSchedule.rotation.shiftTimes = Object.assign(
      {},
      defaults.workSchedule.rotation.shiftTimes,
      isPlainObject(incomingRotation.shiftTimes)
        ? incomingRotation.shiftTimes
        : {}
    );
    normalized.workSchedule.rotation.shiftSequence =
      Array.isArray(incomingRotation.shiftSequence) &&
      incomingRotation.shiftSequence.length
        ? incomingRotation.shiftSequence
        : defaults.workSchedule.rotation.shiftSequence.slice();
    normalized.workSchedule.anchor = Object.assign(
      {},
      defaults.workSchedule.anchor,
      isPlainObject(incomingWork.anchor) ? incomingWork.anchor : {}
    );
    normalized.workSchedule.anchor.cyclePosition = Number.isInteger(
      normalized.workSchedule.anchor.cyclePosition
    )
      ? normalized.workSchedule.anchor.cyclePosition
      : 0;
    normalized.settings = Object.assign(
      {},
      defaults.settings,
      isPlainObject(incoming.settings) ? incoming.settings : {}
    );
    normalized.settings.preferences = isPlainObject(
      normalized.settings.preferences
    )
      ? normalized.settings.preferences
      : {};
    normalized.settings.shiftPreferences = isPlainObject(
      normalized.settings.shiftPreferences
    )
      ? normalized.settings.shiftPreferences
      : {};
    normalized.meta = Object.assign(
      {},
      defaults.meta,
      isPlainObject(incoming.meta) ? incoming.meta : {}
    );
    normalized.schemaVersion =
      typeof incoming.schemaVersion === "number"
        ? incoming.schemaVersion
        : SCHEMA_VERSION;
    return normalized;
  }

  function migrateState(source) {
    var data = deepClone(source);
    var version =
      typeof data.schemaVersion === "number"
        ? data.schemaVersion
        : SCHEMA_VERSION;
    if (version < SCHEMA_VERSION) {
      data.schemaVersion = SCHEMA_VERSION;
    }
    return data;
  }

  function saveState(nextState) {
    if (readOnly) {
      throw new Error(
        "Cashflow data uses a newer schema version and cannot be overwritten."
      );
    }
    if (pendingCorruptRaw !== null) {
      var recoveryKey = backupRaw(pendingCorruptRaw, "corrupt");
      if (!recoveryKey) {
        throw new Error(
          "Unable to back up unreadable cashflow data before saving."
        );
      }
      loadInfo.corruptBackupKey = recoveryKey;
      pendingCorruptRaw = null;
    }
    nextState.schemaVersion = SCHEMA_VERSION;
    nextState.meta = isPlainObject(nextState.meta) ? nextState.meta : {};
    if (!nextState.meta.createdAt) nextState.meta.createdAt = nowIso();
    nextState.meta.updatedAt = nowIso();
    var written = storageSet(STORAGE_KEY, JSON.stringify(nextState));
    if (!written) {
      throw new Error("Unable to persist cashflow data.");
    }
  }

  function loadState() {
    var raw = storageGet(STORAGE_KEY);
    if (raw === null || raw === undefined) {
      var fresh = createDefaultState();
      saveState(fresh);
      loadInfo = {
        status: "initialized",
        warning: null,
        storageAvailable: storageAvailable,
        corruptBackupKey: null
      };
      return fresh;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      pendingCorruptRaw = raw;
      loadInfo = {
        status: "corrupt",
        warning:
          "Stored cashflow data could not be read. It will be backed up before any new data is saved.",
        storageAvailable: storageAvailable,
        corruptBackupKey: null
      };
      return createDefaultState();
    }
    if (!isPlainObject(parsed)) {
      pendingCorruptRaw = raw;
      loadInfo = {
        status: "corrupt",
        warning:
          "Stored cashflow data has an invalid shape. It will be backed up before any new data is saved.",
        storageAvailable: storageAvailable,
        corruptBackupKey: null
      };
      return createDefaultState();
    }
    if (
      typeof parsed.schemaVersion === "number" &&
      parsed.schemaVersion > SCHEMA_VERSION
    ) {
      readOnly = true;
      loadInfo = {
        status: "incompatible",
        warning:
          "Stored cashflow data was created by a newer version. Changes are disabled to avoid data loss.",
        storageAvailable: storageAvailable,
        corruptBackupKey: null
      };
      return normalizeState(parsed);
    }
    var migrated = migrateState(parsed);
    var normalized = normalizeState(migrated);
    if (migrated.schemaVersion !== parsed.schemaVersion) {
      var migrationBackup = backupRaw(
        raw,
        "schema-v" + String(parsed.schemaVersion || "unknown")
      );
      if (migrationBackup) {
        loadInfo.corruptBackupKey = migrationBackup;
        saveState(normalized);
      }
    }
    loadInfo = {
      status: "loaded",
      warning: null,
      storageAvailable: storageAvailable,
      corruptBackupKey: loadInfo.corruptBackupKey || null
    };
    return normalized;
  }

  state = loadState();

  function notify() {
    var snapshot = deepClone(state);
    listeners.slice().forEach(function (listener) {
      try {
        listener(snapshot);
      } catch (error) {
        if (root.console && typeof root.console.error === "function") {
          root.console.error("GabswebCashFlowData listener failed", error);
        }
      }
    });
  }

  function commit(draft) {
    saveState(draft);
    state = draft;
    loadInfo.status = loadInfo.status === "corrupt" ? "recovered" : "ready";
    loadInfo.storageAvailable = storageAvailable;
    notify();
  }

  function mutate(mutator) {
    var draft = deepClone(state);
    var result = mutator(draft);
    commit(draft);
    return result;
  }

  function findById(collection, id) {
    for (var index = 0; index < collection.length; index += 1) {
      if (collection[index].id === id) return collection[index];
    }
    return null;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function validateErrors(errors) {
    return { valid: errors.length === 0, errors: errors };
  }

  function validateAccountRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Account must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Account id is required.");
    if (!isNonEmptyString(record.name)) errors.push("Account name is required.");
    if (!isNonEmptyString(record.type)) errors.push("Account type is required.");
    if (!isValidNonNegativeAmount(record.openingBalance)) {
      errors.push("Opening balance must be a non-negative number.");
    }
    if (!isDateOnly(record.openingBalanceDate)) {
      errors.push("Opening balance date must be a valid date.");
    }
    if (record.status !== undefined && !isNonEmptyString(record.status)) {
      errors.push("Account status must be a non-empty string.");
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Account description must be a string.");
    }
    return validateErrors(errors);
  }

  function validateTransactionRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Transaction must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Transaction id is required.");
    if (["income", "expense", "transfer"].indexOf(record.type) === -1) {
      errors.push("Transaction type must be income, expense or transfer.");
    }
    if (!isValidAmount(record.amount)) {
      errors.push("Transaction amount must be a positive number.");
    }
    if (!isDateOnly(record.date)) errors.push("Transaction date must be valid.");
    if (!isNonEmptyString(record.accountId)) {
      errors.push("Transaction account is required.");
    }
    if (record.type === "transfer") {
      if (!isNonEmptyString(record.toAccountId)) {
        errors.push("Transfer destination account is required.");
      }
      if (record.accountId === record.toAccountId) {
        errors.push("Transfer accounts must be different.");
      }
    }
    if (record.category !== undefined && typeof record.category !== "string") {
      errors.push("Transaction category must be a string.");
    }
    if (
      record.allocationId !== undefined &&
      record.allocationId !== null &&
      record.allocationId !== "" &&
      !isNonEmptyString(record.allocationId)
    ) {
      errors.push("Transaction allocation reference is invalid.");
    }
    if (
      record.paymentMethod !== undefined &&
      typeof record.paymentMethod !== "string"
    ) {
      errors.push("Transaction payment method must be a string.");
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Transaction description must be a string.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Transaction notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateAllocationRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Allocation must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Allocation id is required.");
    if (!isMonthKey(record.financialMonth)) {
      errors.push("Allocation financial month must use YYYY-MM.");
    }
    if (!isNonEmptyString(record.name)) {
      errors.push("Allocation name is required.");
    }
    if (!isValidNonNegativeAmount(record.plannedAmount)) {
      errors.push("Allocation planned amount must be a non-negative number.");
    }
    if (!isNonEmptyString(record.status)) {
      errors.push("Allocation status is required.");
    }
    if (record.purpose !== undefined && typeof record.purpose !== "string") {
      errors.push("Allocation purpose must be a string.");
    }
    if (record.category !== undefined && typeof record.category !== "string") {
      errors.push("Allocation category must be a string.");
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Allocation description must be a string.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Allocation notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateSavingsPlanRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Savings plan must be an object."]);
    }
    if (!isNonEmptyString(record.id)) {
      errors.push("Savings plan id is required.");
    }
    if (!isNonEmptyString(record.name)) {
      errors.push("Savings plan name is required.");
    }
    if (!isValidNonNegativeAmount(record.targetAmount)) {
      errors.push("Savings plan target amount must be a non-negative number.");
    }
    if (!isNonEmptyString(record.status)) {
      errors.push("Savings plan status is required.");
    }
    if (record.purpose !== undefined && typeof record.purpose !== "string") {
      errors.push("Savings plan purpose must be a string.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Savings plan notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateSavingsMovementRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Savings movement must be an object."]);
    }
    if (!isNonEmptyString(record.id)) {
      errors.push("Savings movement id is required.");
    }
    if (["contribution", "withdrawal"].indexOf(record.type) === -1) {
      errors.push("Savings movement type must be contribution or withdrawal.");
    }
    if (!isValidAmount(record.amount)) {
      errors.push("Savings movement amount must be a positive number.");
    }
    if (!isDateOnly(record.date)) {
      errors.push("Savings movement date must be valid.");
    }
    if (!isNonEmptyString(record.savingsPlanId)) {
      errors.push("Savings movement plan is required.");
    }
    if (
      record.accountId !== undefined &&
      record.accountId !== null &&
      record.accountId !== ""
    ) {
      if (!isNonEmptyString(record.accountId)) {
        errors.push("Savings movement account reference is invalid.");
      }
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Savings movement description must be a string.");
    }
    return validateErrors(errors);
  }

  function validateGoalRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) return validateErrors(["Goal must be an object."]);
    if (!isNonEmptyString(record.id)) errors.push("Goal id is required.");
    if (!isNonEmptyString(record.name)) errors.push("Goal name is required.");
    if (!isNonEmptyString(record.goalType)) {
      errors.push("Goal type is required.");
    }
    if (!isValidNonNegativeAmount(record.targetAmount)) {
      errors.push("Goal target amount must be a non-negative number.");
    }
    if (!isDateOnly(record.targetDate)) {
      errors.push("Goal target date must be valid.");
    }
    if (!isNonEmptyString(record.priority)) {
      errors.push("Goal priority is required.");
    }
    if (!isNonEmptyString(record.status)) errors.push("Goal status is required.");
    if (record.objective !== undefined && typeof record.objective !== "string") {
      errors.push("Goal objective must be a string.");
    }
    if (
      record.savingsPlanId !== undefined &&
      record.savingsPlanId !== null &&
      record.savingsPlanId !== ""
    ) {
      if (!isNonEmptyString(record.savingsPlanId)) {
        errors.push("Goal savings plan reference is invalid.");
      }
    }
    return validateErrors(errors);
  }

  function validateTaskRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) return validateErrors(["Task must be an object."]);
    if (!isNonEmptyString(record.id)) errors.push("Task id is required.");
    if (!isNonEmptyString(record.title)) errors.push("Task title is required.");
    if (typeof record.completed !== "boolean") {
      errors.push("Task completion status must be boolean.");
    }
    if (typeof record.isTopThree !== "boolean") {
      errors.push("Task top-three flag must be boolean.");
    }
    if (record.priority !== undefined && !isNonEmptyString(record.priority)) {
      errors.push("Task priority must be a non-empty string.");
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Task description must be a string.");
    }
    if (
      record.completedAt !== undefined &&
      record.completedAt !== null &&
      record.completedAt !== "" &&
      !isIsoTimestamp(record.completedAt)
    ) {
      errors.push("Task completion timestamp is invalid.");
    }
    return validateErrors(errors);
  }

  function validateMeetingRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Meeting must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Meeting id is required.");
    if (!isNonEmptyString(record.title)) errors.push("Meeting title is required.");
    if (!isDateOnly(record.date)) errors.push("Meeting date must be valid.");
    if (
      record.startTime !== undefined &&
      record.startTime !== "" &&
      !isTimeValue(record.startTime)
    ) {
      errors.push("Meeting start time must use HH:MM.");
    }
    if (
      record.endTime !== undefined &&
      record.endTime !== "" &&
      !isTimeValue(record.endTime)
    ) {
      errors.push("Meeting end time must use HH:MM.");
    }
    if (
      record.startTime &&
      record.endTime &&
      isTimeValue(record.startTime) &&
      isTimeValue(record.endTime) &&
      record.endTime < record.startTime
    ) {
      errors.push("Meeting end time must not be before start time.");
    }
    if (record.location !== undefined && typeof record.location !== "string") {
      errors.push("Meeting location must be a string.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Meeting notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateDailyPlanRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Daily plan must be an object."]);
    }
    if (!isNonEmptyString(record.id)) {
      errors.push("Daily plan id is required.");
    }
    if (!isDateOnly(record.date)) errors.push("Daily plan date must be valid.");
    if (!isNonEmptyString(record.dayStatus)) {
      errors.push("Daily plan day status is required.");
    }
    if (!Array.isArray(record.tasks)) {
      errors.push("Daily plan tasks must be an array.");
    }
    if (!Array.isArray(record.meetings)) {
      errors.push("Daily plan meetings must be an array.");
    }
    if (!Array.isArray(record.topThreeTaskIds)) {
      errors.push("Daily plan top three task references must be an array.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Daily plan notes must be a string.");
    }
    if (Array.isArray(record.tasks)) {
      record.tasks.forEach(function (task) {
        var result = validateTaskRecord(task);
        errors = errors.concat(result.errors);
      });
    }
    if (Array.isArray(record.meetings)) {
      record.meetings.forEach(function (meeting) {
        var result = validateMeetingRecord(meeting);
        errors = errors.concat(result.errors);
      });
    }
    if (Array.isArray(record.topThreeTaskIds)) {
      var seen = {};
      record.topThreeTaskIds.forEach(function (taskId) {
        if (seen[taskId]) {
          errors.push("Top three task references must be unique.");
        }
        seen[taskId] = true;
      });
      if (record.topThreeTaskIds.length > 3) {
        errors.push("Top three may contain at most three tasks.");
      }
    }
    return validateErrors(errors);
  }

  function validateMilestoneRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Milestone must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Milestone id is required.");
    if (!isNonEmptyString(record.title)) {
      errors.push("Milestone title is required.");
    }
    if (!isDateOnly(record.dueDate)) {
      errors.push("Milestone due date must be valid.");
    }
    if (!isNonEmptyString(record.status)) {
      errors.push("Milestone status is required.");
    }
    if (
      record.description !== undefined &&
      typeof record.description !== "string"
    ) {
      errors.push("Milestone description must be a string.");
    }
    if (
      record.completionDate !== undefined &&
      record.completionDate !== null &&
      record.completionDate !== "" &&
      !isDateOnly(record.completionDate)
    ) {
      errors.push("Milestone completion date must be valid.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Milestone notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateProjectRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Project must be an object."]);
    }
    if (!isNonEmptyString(record.id)) errors.push("Project id is required.");
    if (!isNonEmptyString(record.name)) errors.push("Project name is required.");
    if (!isDateOnly(record.startDate)) {
      errors.push("Project start date must be valid.");
    }
    if (!isDateOnly(record.endDate)) {
      errors.push("Project end date must be valid.");
    }
    if (!isDateOnly(record.deadline)) {
      errors.push("Project deadline must be valid.");
    }
    if (!isValidNonNegativeAmount(record.estimatedCost)) {
      errors.push("Project estimated cost must be a non-negative number.");
    }
    if (!isNonEmptyString(record.status)) {
      errors.push("Project status is required.");
    }
    if (
      record.objectives !== undefined &&
      typeof record.objectives !== "string"
    ) {
      errors.push("Project objectives must be a string.");
    }
    if (
      record.executionPlan !== undefined &&
      typeof record.executionPlan !== "string"
    ) {
      errors.push("Project execution plan must be a string.");
    }
    if (!Array.isArray(record.milestones)) {
      errors.push("Project milestones must be an array.");
    }
    if (Array.isArray(record.milestones)) {
      record.milestones.forEach(function (milestone) {
        var result = validateMilestoneRecord(milestone);
        errors = errors.concat(result.errors);
      });
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Project notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateWorkScheduleRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Work schedule record must be an object."]);
    }
    if (!isNonEmptyString(record.id)) {
      errors.push("Work schedule id is required.");
    }
    if (!isDateOnly(record.date)) {
      errors.push("Work schedule date must be valid.");
    }
    if (!isNonEmptyString(record.shiftType)) {
      errors.push("Work schedule shift type is required.");
    }
    if (["working", "off", "unassigned"].indexOf(record.status) === -1) {
      errors.push("Work schedule status must be working, off or unassigned.");
    }
    if (
      record.source !== undefined &&
      ["manual", "generated"].indexOf(record.source) === -1
    ) {
      errors.push("Work schedule source must be manual or generated.");
    }
    if (
      record.startTime !== undefined &&
      record.startTime !== "" &&
      !isTimeValue(record.startTime)
    ) {
      errors.push("Work schedule start time must use HH:MM.");
    }
    if (
      record.endTime !== undefined &&
      record.endTime !== "" &&
      !isTimeValue(record.endTime)
    ) {
      errors.push("Work schedule end time must use HH:MM.");
    }
    if (record.team !== undefined && typeof record.team !== "string") {
      errors.push("Work schedule team must be a string.");
    }
    if (record.notes !== undefined && typeof record.notes !== "string") {
      errors.push("Work schedule notes must be a string.");
    }
    return validateErrors(errors);
  }

  function validateSettingsRecord(record) {
    var errors = [];
    if (!isPlainObject(record)) {
      return validateErrors(["Settings must be an object."]);
    }
    if (record.name !== undefined && typeof record.name !== "string") {
      errors.push("Profile name must be a string.");
    }
    if (record.email !== undefined && typeof record.email !== "string") {
      errors.push("Profile email must be a string.");
    }
    if (!isNonEmptyString(record.currency)) {
      errors.push("Currency is required.");
    }
    if (!isNonEmptyString(record.financialMonthPreference)) {
      errors.push("Financial month preference is required.");
    }
    if (record.workTeam !== undefined && typeof record.workTeam !== "string") {
      errors.push("Work team must be a string.");
    }
    if (
      record.supervisor !== undefined &&
      typeof record.supervisor !== "string"
    ) {
      errors.push("Supervisor must be a string.");
    }
    if (!isPlainObject(record.preferences)) {
      errors.push("Preferences must be an object.");
    }
    if (!isPlainObject(record.shiftPreferences)) {
      errors.push("Shift preferences must be an object.");
    }
    return validateErrors(errors);
  }

  var validators = {
    account: validateAccountRecord,
    transaction: validateTransactionRecord,
    allocation: validateAllocationRecord,
    savingsPlan: validateSavingsPlanRecord,
    savingsMovement: validateSavingsMovementRecord,
    goal: validateGoalRecord,
    dailyPlan: validateDailyPlanRecord,
    task: validateTaskRecord,
    meeting: validateMeetingRecord,
    project: validateProjectRecord,
    milestone: validateMilestoneRecord,
    workScheduleRecord: validateWorkScheduleRecord,
    settings: validateSettingsRecord
  };

  function validateRecord(type, record) {
    var validator = validators[type];
    if (!validator) {
      return validateErrors(["Unknown record type: " + String(type)]);
    }
    return validator(record);
  }

  function assertValid(type, record) {
    var result = validateRecord(type, record);
    if (!result.valid) {
      throw new Error(result.errors.join(" "));
    }
    return record;
  }

  function assertAccountExists(accountId, stateObject) {
    var accounts = stateObject ? stateObject.accounts : state.accounts;
    assert(findById(accounts, accountId), "Account not found: " + accountId);
  }

  function assertAllocationExists(allocationId, stateObject) {
    if (!allocationId) return;
    var allocations = stateObject ? stateObject.allocations : state.allocations;
    assert(
      findById(allocations, allocationId),
      "Allocation not found: " + allocationId
    );
  }

  function getAccounts() {
    return deepClone(state.accounts);
  }

  function getAccount(id) {
    var record = findById(state.accounts, id);
    return record ? deepClone(record) : null;
  }

  function createAccount(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("acc"),
      name: input.name,
      type: input.type,
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate || INITIAL_FINANCIAL_DATE,
      description:
        typeof input.description === "string" ? input.description : "",
      status: input.status || "active",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("account", record);
    return mutate(function (draft) {
      draft.accounts.push(record);
      return deepClone(record);
    });
  }

  function updateAccount(id, patch) {
    assert(isNonEmptyString(id), "Account id is required.");
    assert(isPlainObject(patch), "Account update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.accounts, id);
      assert(record, "Account not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("account", record);
      return deepClone(record);
    });
  }

  function deleteAccount(id) {
    return mutate(function (draft) {
      var index = draft.accounts.findIndex(function (account) {
        return account.id === id;
      });
      assert(index !== -1, "Account not found.");
      var usedByTransaction = draft.transactions.some(function (transaction) {
        return transaction.accountId === id || transaction.toAccountId === id;
      });
      assert(!usedByTransaction, "Account is referenced by transactions.");
      var usedBySavings = draft.savingsMovements.some(function (movement) {
        return movement.accountId === id;
      });
      assert(!usedBySavings, "Account is referenced by savings movements.");
      draft.accounts.splice(index, 1);
      return true;
    });
  }

  function buildTransaction(type, data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    return {
      id: generateId("txn"),
      type: type,
      amount: input.amount,
      date: input.date || INITIAL_FINANCIAL_DATE,
      category: typeof input.category === "string" ? input.category : "",
      accountId: input.accountId,
      toAccountId: type === "transfer" ? input.toAccountId : undefined,
      allocationId: type === "transfer" ? undefined : input.allocationId || undefined,
      paymentMethod:
        typeof input.paymentMethod === "string" ? input.paymentMethod : "",
      description:
        typeof input.description === "string" ? input.description : "",
      notes: typeof input.notes === "string" ? input.notes : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function createTransaction(data) {
    var input = isPlainObject(data) ? data : {};
    var record = buildTransaction(input.type, input);
    assertValid("transaction", record);
    assertAccountExists(record.accountId);
    if (record.type === "transfer") {
      assertAccountExists(record.toAccountId);
    }
    assertAllocationExists(record.allocationId);
    return mutate(function (draft) {
      draft.transactions.push(record);
      return deepClone(record);
    });
  }

  function createIncome(data) {
    return createTransaction(Object.assign({}, data, { type: "income" }));
  }

  function createExpense(data) {
    return createTransaction(Object.assign({}, data, { type: "expense" }));
  }

  function createTransfer(data) {
    return createTransaction(Object.assign({}, data, { type: "transfer" }));
  }

  function getTransactions(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.transactions.filter(function (transaction) {
      if (settings.type && transaction.type !== settings.type) return false;
      if (
        settings.accountId &&
        transaction.accountId !== settings.accountId &&
        transaction.toAccountId !== settings.accountId
      ) {
        return false;
      }
      if (settings.month && getMonthKey(transaction.date) !== settings.month) {
        return false;
      }
      if (settings.dateFrom && transaction.date < settings.dateFrom) return false;
      if (settings.dateTo && transaction.date > settings.dateTo) return false;
      if (settings.category && transaction.category !== settings.category) {
        return false;
      }
      if (
        settings.allocationId &&
        transaction.allocationId !== settings.allocationId
      ) {
        return false;
      }
      return true;
    });
    return deepClone(records);
  }

  function getTransaction(id) {
    var record = findById(state.transactions, id);
    return record ? deepClone(record) : null;
  }

  function updateTransaction(id, patch) {
    assert(isNonEmptyString(id), "Transaction id is required.");
    assert(isPlainObject(patch), "Transaction update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.transactions, id);
      assert(record, "Transaction not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      if (record.type !== "transfer") record.toAccountId = undefined;
      if (record.type === "transfer") record.allocationId = undefined;
      assertValid("transaction", record);
      assertAccountExists(record.accountId, draft);
      if (record.type === "transfer") {
        assertAccountExists(record.toAccountId, draft);
      }
      assertAllocationExists(record.allocationId, draft);
      return deepClone(record);
    });
  }

  function deleteTransaction(id) {
    return mutate(function (draft) {
      var index = draft.transactions.findIndex(function (transaction) {
        return transaction.id === id;
      });
      assert(index !== -1, "Transaction not found.");
      draft.transactions.splice(index, 1);
      return true;
    });
  }

  function createAllocation(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("alloc"),
      financialMonth:
        input.financialMonth || getMonthKey(input.date || todayKey()),
      name: input.name,
      purpose: typeof input.purpose === "string" ? input.purpose : "",
      plannedAmount: input.plannedAmount,
      category: typeof input.category === "string" ? input.category : "",
      description:
        typeof input.description === "string" ? input.description : "",
      notes: typeof input.notes === "string" ? input.notes : "",
      status: input.status || "planned",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("allocation", record);
    return mutate(function (draft) {
      draft.allocations.push(record);
      return deepClone(record);
    });
  }

  function updateAllocation(id, patch) {
    assert(isNonEmptyString(id), "Allocation id is required.");
    assert(isPlainObject(patch), "Allocation update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.allocations, id);
      assert(record, "Allocation not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("allocation", record);
      return deepClone(record);
    });
  }

  function deleteAllocation(id) {
    return mutate(function (draft) {
      var index = draft.allocations.findIndex(function (allocation) {
        return allocation.id === id;
      });
      assert(index !== -1, "Allocation not found.");
      var referenced = draft.transactions.some(function (transaction) {
        return transaction.allocationId === id;
      });
      assert(!referenced, "Allocation is referenced by transactions.");
      draft.allocations.splice(index, 1);
      return true;
    });
  }

  function getAllocations(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.allocations.filter(function (allocation) {
      if (settings.month && allocation.financialMonth !== settings.month) {
        return false;
      }
      if (settings.status && allocation.status !== settings.status) {
        return false;
      }
      return true;
    });
    return deepClone(records);
  }

  function getMonthlyAllocations(month) {
    return getAllocations({ month: month || getMonthKey(todayKey()) });
  }

  function getAllocation(id) {
    var record = findById(state.allocations, id);
    return record ? deepClone(record) : null;
  }

  function createSavingsPlan(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("splan"),
      name: input.name,
      purpose: typeof input.purpose === "string" ? input.purpose : "",
      targetAmount: input.targetAmount,
      status: input.status || "active",
      notes: typeof input.notes === "string" ? input.notes : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("savingsPlan", record);
    return mutate(function (draft) {
      draft.savingsPlans.push(record);
      return deepClone(record);
    });
  }

  function updateSavingsPlan(id, patch) {
    assert(isNonEmptyString(id), "Savings plan id is required.");
    assert(isPlainObject(patch), "Savings plan update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.savingsPlans, id);
      assert(record, "Savings plan not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("savingsPlan", record);
      return deepClone(record);
    });
  }

  function deleteSavingsPlan(id) {
    return mutate(function (draft) {
      var index = draft.savingsPlans.findIndex(function (plan) {
        return plan.id === id;
      });
      assert(index !== -1, "Savings plan not found.");
      var usedByMovement = draft.savingsMovements.some(function (movement) {
        return movement.savingsPlanId === id;
      });
      assert(!usedByMovement, "Savings plan is referenced by movements.");
      var usedByGoal = draft.goals.some(function (goal) {
        return goal.savingsPlanId === id;
      });
      assert(!usedByGoal, "Savings plan is referenced by goals.");
      draft.savingsPlans.splice(index, 1);
      return true;
    });
  }

  function getSavingsPlans() {
    return deepClone(state.savingsPlans);
  }

  function getSavingsPlan(id) {
    var record = findById(state.savingsPlans, id);
    return record ? deepClone(record) : null;
  }

  function createSavingsMovement(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("smov"),
      type: input.type,
      amount: input.amount,
      date: input.date || INITIAL_FINANCIAL_DATE,
      savingsPlanId: input.savingsPlanId,
      accountId: input.accountId || undefined,
      description:
        typeof input.description === "string" ? input.description : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("savingsMovement", record);
    assert(
      findById(state.savingsPlans, record.savingsPlanId),
      "Savings plan not found."
    );
    if (record.accountId) assertAccountExists(record.accountId);
    return mutate(function (draft) {
      draft.savingsMovements.push(record);
      return deepClone(record);
    });
  }

  function updateSavingsMovement(id, patch) {
    assert(isNonEmptyString(id), "Savings movement id is required.");
    assert(isPlainObject(patch), "Savings movement update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.savingsMovements, id);
      assert(record, "Savings movement not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("savingsMovement", record);
      assert(
        findById(draft.savingsPlans, record.savingsPlanId),
        "Savings plan not found."
      );
      if (record.accountId) assertAccountExists(record.accountId, draft);
      return deepClone(record);
    });
  }

  function deleteSavingsMovement(id) {
    return mutate(function (draft) {
      var index = draft.savingsMovements.findIndex(function (movement) {
        return movement.id === id;
      });
      assert(index !== -1, "Savings movement not found.");
      draft.savingsMovements.splice(index, 1);
      return true;
    });
  }

  function getSavingsMovements(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.savingsMovements.filter(function (movement) {
      if (
        settings.savingsPlanId &&
        movement.savingsPlanId !== settings.savingsPlanId
      ) {
        return false;
      }
      if (settings.accountId && movement.accountId !== settings.accountId) {
        return false;
      }
      if (settings.type && movement.type !== settings.type) return false;
      if (settings.month && getMonthKey(movement.date) !== settings.month) {
        return false;
      }
      if (settings.dateFrom && movement.date < settings.dateFrom) return false;
      if (settings.dateTo && movement.date > settings.dateTo) return false;
      return true;
    });
    return deepClone(records);
  }

  function createGoal(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("goal"),
      name: input.name,
      goalType: input.goalType,
      objective: typeof input.objective === "string" ? input.objective : "",
      targetAmount: input.targetAmount,
      targetDate: input.targetDate,
      priority: input.priority || "medium",
      status: input.status || "active",
      savingsPlanId: input.savingsPlanId || undefined,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("goal", record);
    if (record.savingsPlanId) {
      assert(
        findById(state.savingsPlans, record.savingsPlanId),
        "Savings plan not found."
      );
    }
    return mutate(function (draft) {
      draft.goals.push(record);
      return deepClone(record);
    });
  }

  function updateGoal(id, patch) {
    assert(isNonEmptyString(id), "Goal id is required.");
    assert(isPlainObject(patch), "Goal update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.goals, id);
      assert(record, "Goal not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("goal", record);
      if (record.savingsPlanId) {
        assert(
          findById(draft.savingsPlans, record.savingsPlanId),
          "Savings plan not found."
        );
      }
      return deepClone(record);
    });
  }

  function deleteGoal(id) {
    return mutate(function (draft) {
      var index = draft.goals.findIndex(function (goal) {
        return goal.id === id;
      });
      assert(index !== -1, "Goal not found.");
      draft.goals.splice(index, 1);
      return true;
    });
  }

  function getGoals() {
    return deepClone(state.goals);
  }

  function getGoal(id) {
    var record = findById(state.goals, id);
    return record ? deepClone(record) : null;
  }

  function findDailyPlanByDate(date, collection) {
    var plans = collection || state.dailyPlans;
    var match = null;
    plans.forEach(function (plan) {
      if (plan.date === date) match = plan;
    });
    return match;
  }

  function buildTask(input) {
    var source = isPlainObject(input) ? input : {};
    var timestamp = nowIso();
    return {
      id: generateId("task"),
      title: source.title,
      description:
        typeof source.description === "string" ? source.description : "",
      completed: source.completed === true,
      priority: source.priority || "medium",
      isTopThree: source.isTopThree === true,
      completedAt:
        source.completed === true
          ? source.completedAt || timestamp
          : source.completedAt || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function buildMeeting(input) {
    var source = isPlainObject(input) ? input : {};
    var timestamp = nowIso();
    return {
      id: generateId("meet"),
      title: source.title,
      date: source.date,
      startTime: typeof source.startTime === "string" ? source.startTime : "",
      endTime: typeof source.endTime === "string" ? source.endTime : "",
      location: typeof source.location === "string" ? source.location : "",
      notes: typeof source.notes === "string" ? source.notes : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function createDailyPlan(data) {
    var input = isPlainObject(data) ? data : {};
    var date = input.date || todayKey();
    var existing = findDailyPlanByDate(date);
    assert(!existing, "A daily plan already exists for " + date + ".");
    var timestamp = nowIso();
    var tasks = Array.isArray(input.tasks) ? input.tasks.map(buildTask) : [];
    var topThreeTaskIds = Array.isArray(input.topThreeTaskIds)
      ? input.topThreeTaskIds.slice(0, 3)
      : tasks
          .filter(function (task) {
            return task.isTopThree;
          })
          .map(function (task) {
            return task.id;
          });
    var meetings = Array.isArray(input.meetings)
      ? input.meetings.map(function (meeting) {
          return buildMeeting(Object.assign({ date: date }, meeting));
        })
      : [];
    var record = {
      id: generateId("day"),
      date: date,
      dayStatus: input.dayStatus || "unspecified",
      tasks: tasks,
      topThreeTaskIds: topThreeTaskIds,
      meetings: meetings,
      notes: typeof input.notes === "string" ? input.notes : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    topThreeTaskIds.forEach(function (taskId) {
      assert(
        tasks.some(function (task) {
          return task.id === taskId;
        }),
        "Top three task not found: " + taskId
      );
    });
    tasks.forEach(function (task) {
      task.isTopThree = topThreeTaskIds.indexOf(task.id) !== -1;
    });
    assertValid("dailyPlan", record);
    return mutate(function (draft) {
      draft.dailyPlans.push(record);
      return deepClone(record);
    });
  }

  function getOrCreateDailyPlan(date) {
    var targetDate = date || todayKey();
    var existing = findDailyPlanByDate(targetDate);
    if (existing) return deepClone(existing);
    return createDailyPlan({ date: targetDate });
  }

  function getDailyPlans(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.dailyPlans.filter(function (plan) {
      if (settings.month && getMonthKey(plan.date) !== settings.month) {
        return false;
      }
      if (settings.dateFrom && plan.date < settings.dateFrom) return false;
      if (settings.dateTo && plan.date > settings.dateTo) return false;
      if (settings.dayStatus && plan.dayStatus !== settings.dayStatus) {
        return false;
      }
      return true;
    });
    return deepClone(records);
  }

  function getDailyPlan(id) {
    var record = findById(state.dailyPlans, id);
    return record ? deepClone(record) : null;
  }

  function getDailyPlanByDate(date) {
    var record = findDailyPlanByDate(date);
    return record ? deepClone(record) : null;
  }

  function updateDailyPlan(id, patch) {
    assert(isNonEmptyString(id), "Daily plan id is required.");
    assert(isPlainObject(patch), "Daily plan update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.dailyPlans, id);
      assert(record, "Daily plan not found.");
      var update = deepClone(patch);
      ["id", "createdAt", "tasks", "meetings", "topThreeTaskIds"].forEach(
        function (key) {
          delete update[key];
        }
      );
      Object.assign(record, update, {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      if (patch.date !== undefined) {
        var duplicate = draft.dailyPlans.some(function (plan) {
          return plan.id !== record.id && plan.date === record.date;
        });
        assert(!duplicate, "A daily plan already exists for " + record.date + ".");
      }
      assertValid("dailyPlan", record);
      return deepClone(record);
    });
  }

  function deleteDailyPlan(id) {
    return mutate(function (draft) {
      var index = draft.dailyPlans.findIndex(function (plan) {
        return plan.id === id;
      });
      assert(index !== -1, "Daily plan not found.");
      draft.dailyPlans.splice(index, 1);
      return true;
    });
  }

  function addTask(planId, data) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var task = buildTask(data);
      if (task.isTopThree) {
        assert(
          plan.topThreeTaskIds.length < 3,
          "Top three already has three tasks."
        );
        plan.topThreeTaskIds.push(task.id);
      }
      task.isTopThree = plan.topThreeTaskIds.indexOf(task.id) !== -1;
      plan.tasks.push(task);
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return deepClone(task);
    });
  }

  function updateTask(planId, taskId, patch) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var task = findById(plan.tasks, taskId);
      assert(task, "Task not found.");
      var update = isPlainObject(patch) ? deepClone(patch) : {};
      delete update.id;
      delete update.createdAt;
      var wantsTopThree =
        update.isTopThree !== undefined
          ? update.isTopThree === true
          : task.isTopThree;
      var inTopThree = plan.topThreeTaskIds.indexOf(task.id) !== -1;
      if (wantsTopThree && !inTopThree) {
        assert(
          plan.topThreeTaskIds.length < 3,
          "Top three already has three tasks."
        );
        plan.topThreeTaskIds.push(task.id);
      }
      if (!wantsTopThree && inTopThree) {
        plan.topThreeTaskIds = plan.topThreeTaskIds.filter(function (id) {
          return id !== task.id;
        });
      }
      Object.assign(task, update, {
        id: task.id,
        createdAt: task.createdAt,
        updatedAt: nowIso()
      });
      if (update.completed !== undefined) {
        task.completedAt = task.completed ? task.completedAt || nowIso() : null;
      }
      task.isTopThree = plan.topThreeTaskIds.indexOf(task.id) !== -1;
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return deepClone(task);
    });
  }

  function toggleTask(planId, taskId, completed) {
    var plan = findById(state.dailyPlans, planId);
    assert(plan, "Daily plan not found.");
    var task = findById(plan.tasks, taskId);
    assert(task, "Task not found.");
    var nextCompleted =
      typeof completed === "boolean" ? completed : !task.completed;
    return updateTask(planId, taskId, { completed: nextCompleted });
  }

  function deleteTask(planId, taskId) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var index = plan.tasks.findIndex(function (task) {
        return task.id === taskId;
      });
      assert(index !== -1, "Task not found.");
      plan.tasks.splice(index, 1);
      plan.topThreeTaskIds = plan.topThreeTaskIds.filter(function (id) {
        return id !== taskId;
      });
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return true;
    });
  }

  function setTopThreeTasks(planId, taskIds) {
    assert(Array.isArray(taskIds), "Top three task ids must be an array.");
    assert(taskIds.length <= 3, "Top three may contain at most three tasks.");
    var unique = {};
    taskIds.forEach(function (taskId) {
      assert(!unique[taskId], "Top three task ids must be unique.");
      unique[taskId] = true;
    });
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      taskIds.forEach(function (taskId) {
        assert(findById(plan.tasks, taskId), "Task not found: " + taskId);
      });
      plan.tasks.forEach(function (task) {
        task.isTopThree = taskIds.indexOf(task.id) !== -1;
        task.updatedAt = nowIso();
      });
      plan.topThreeTaskIds = taskIds.slice();
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return deepClone(plan);
    });
  }

  function addMeeting(planId, data) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var meeting = buildMeeting(
        Object.assign({ date: plan.date }, isPlainObject(data) ? data : {})
      );
      assertValid("meeting", meeting);
      plan.meetings.push(meeting);
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return deepClone(meeting);
    });
  }

  function updateMeeting(planId, meetingId, patch) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var meeting = findById(plan.meetings, meetingId);
      assert(meeting, "Meeting not found.");
      Object.assign(meeting, deepClone(patch), {
        id: meeting.id,
        createdAt: meeting.createdAt,
        updatedAt: nowIso()
      });
      assertValid("meeting", meeting);
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return deepClone(meeting);
    });
  }

  function deleteMeeting(planId, meetingId) {
    return mutate(function (draft) {
      var plan = findById(draft.dailyPlans, planId);
      assert(plan, "Daily plan not found.");
      var index = plan.meetings.findIndex(function (meeting) {
        return meeting.id === meetingId;
      });
      assert(index !== -1, "Meeting not found.");
      plan.meetings.splice(index, 1);
      plan.updatedAt = nowIso();
      assertValid("dailyPlan", plan);
      return true;
    });
  }

  function createProject(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var milestones = Array.isArray(input.milestones)
      ? input.milestones.map(function (milestone) {
          var milestoneTimestamp = nowIso();
          return {
            id: generateId("mile"),
            title: milestone.title,
            description:
              typeof milestone.description === "string"
                ? milestone.description
                : "",
            dueDate: milestone.dueDate,
            status: milestone.status || "pending",
            completionDate: milestone.completionDate || null,
            notes:
              typeof milestone.notes === "string" ? milestone.notes : "",
            createdAt: milestone.createdAt || milestoneTimestamp,
            updatedAt: milestone.updatedAt || milestoneTimestamp
          };
        })
      : [];
    var record = {
      id: generateId("prj"),
      name: input.name,
      objectives: typeof input.objectives === "string" ? input.objectives : "",
      executionPlan:
        typeof input.executionPlan === "string" ? input.executionPlan : "",
      startDate: input.startDate,
      endDate: input.endDate,
      deadline: input.deadline,
      estimatedCost: input.estimatedCost,
      status: input.status || "planned",
      notes: typeof input.notes === "string" ? input.notes : "",
      milestones: milestones,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("project", record);
    return mutate(function (draft) {
      draft.projects.push(record);
      return deepClone(record);
    });
  }

  function updateProject(id, patch) {
    assert(isNonEmptyString(id), "Project id is required.");
    assert(isPlainObject(patch), "Project update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.projects, id);
      assert(record, "Project not found.");
      var update = deepClone(patch);
      delete update.id;
      delete update.createdAt;
      delete update.milestones;
      Object.assign(record, update, {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("project", record);
      return deepClone(record);
    });
  }

  function deleteProject(id) {
    return mutate(function (draft) {
      var index = draft.projects.findIndex(function (project) {
        return project.id === id;
      });
      assert(index !== -1, "Project not found.");
      draft.projects.splice(index, 1);
      return true;
    });
  }

  function getProjects(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.projects.filter(function (project) {
      if (settings.status && project.status !== settings.status) return false;
      if (settings.month && getMonthKey(project.startDate) !== settings.month) {
        return false;
      }
      return true;
    });
    return deepClone(records);
  }

  function getProject(id) {
    var record = findById(state.projects, id);
    return record ? deepClone(record) : null;
  }

  function getMilestone(projectId, milestoneId) {
    var project = findById(state.projects, projectId);
    if (!project) return null;
    var milestone = findById(project.milestones, milestoneId);
    return milestone ? deepClone(milestone) : null;
  }

  function addMilestone(projectId, data) {
    return mutate(function (draft) {
      var project = findById(draft.projects, projectId);
      assert(project, "Project not found.");
      var input = isPlainObject(data) ? data : {};
      var timestamp = nowIso();
      var milestone = {
        id: generateId("mile"),
        title: input.title,
        description:
          typeof input.description === "string" ? input.description : "",
        dueDate: input.dueDate,
        status: input.status || "pending",
        completionDate: input.completionDate || null,
        notes: typeof input.notes === "string" ? input.notes : "",
        createdAt: timestamp,
        updatedAt: timestamp
      };
      assertValid("milestone", milestone);
      project.milestones.push(milestone);
      project.updatedAt = timestamp;
      assertValid("project", project);
      return deepClone(milestone);
    });
  }

  function updateMilestone(projectId, milestoneId, patch) {
    return mutate(function (draft) {
      var project = findById(draft.projects, projectId);
      assert(project, "Project not found.");
      var milestone = findById(project.milestones, milestoneId);
      assert(milestone, "Milestone not found.");
      var update = isPlainObject(patch) ? deepClone(patch) : {};
      delete update.id;
      delete update.createdAt;
      Object.assign(milestone, update, {
        id: milestone.id,
        createdAt: milestone.createdAt,
        updatedAt: nowIso()
      });
      if (milestone.status === "completed" && !milestone.completionDate) {
        milestone.completionDate = todayKey();
      }
      if (
        milestone.status !== "completed" &&
        update.completionDate === undefined
      ) {
        milestone.completionDate = null;
      }
      project.updatedAt = nowIso();
      assertValid("milestone", milestone);
      assertValid("project", project);
      return deepClone(milestone);
    });
  }

  function deleteMilestone(projectId, milestoneId) {
    return mutate(function (draft) {
      var project = findById(draft.projects, projectId);
      assert(project, "Project not found.");
      var index = project.milestones.findIndex(function (milestone) {
        return milestone.id === milestoneId;
      });
      assert(index !== -1, "Milestone not found.");
      project.milestones.splice(index, 1);
      project.updatedAt = nowIso();
      assertValid("project", project);
      return true;
    });
  }

  function getWorkScheduleConfig() {
    return deepClone({
      rotation: state.workSchedule.rotation,
      anchor: state.workSchedule.anchor
    });
  }

  function updateWorkScheduleConfig(patch) {
    assert(isPlainObject(patch), "Work schedule config update must be an object.");
    return mutate(function (draft) {
      if (isPlainObject(patch.rotation)) {
        var rotationPatch = deepClone(patch.rotation);
        if (isPlainObject(rotationPatch.shiftTimes)) {
          rotationPatch.shiftTimes = Object.assign(
            {},
            draft.workSchedule.rotation.shiftTimes,
            rotationPatch.shiftTimes
          );
        }
        Object.assign(draft.workSchedule.rotation, rotationPatch);
      }
      if (isPlainObject(patch.anchor)) {
        Object.assign(draft.workSchedule.anchor, deepClone(patch.anchor));
      }
      return deepClone({
        rotation: draft.workSchedule.rotation,
        anchor: draft.workSchedule.anchor
      });
    });
  }

  function getRotationSettings() {
    return deepClone(state.workSchedule.rotation);
  }

  function updateRotationSettings(patch) {
    assert(isPlainObject(patch), "Rotation settings update must be an object.");
    return mutate(function (draft) {
      Object.assign(draft.workSchedule.rotation, deepClone(patch));
      return deepClone(draft.workSchedule.rotation);
    });
  }

  function getWorkScheduleRecords(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var records = state.workSchedule.records.filter(function (record) {
      if (settings.month && getMonthKey(record.date) !== settings.month) {
        return false;
      }
      if (settings.dateFrom && record.date < settings.dateFrom) return false;
      if (settings.dateTo && record.date > settings.dateTo) return false;
      if (settings.status && record.status !== settings.status) return false;
      if (settings.team && record.team !== settings.team) return false;
      return true;
    });
    records.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    return deepClone(records);
  }

  function getWorkScheduleRecord(id) {
    var record = findById(state.workSchedule.records, id);
    return record ? deepClone(record) : null;
  }

  function addWorkScheduleRecord(data) {
    var input = isPlainObject(data) ? data : {};
    var timestamp = nowIso();
    var record = {
      id: generateId("shift"),
      date: input.date,
      shiftType: input.shiftType,
      startTime: typeof input.startTime === "string" ? input.startTime : "",
      endTime: typeof input.endTime === "string" ? input.endTime : "",
      team: typeof input.team === "string" ? input.team : "",
      status: input.status || "unassigned",
      source: input.source === "generated" ? "generated" : "manual",
      notes: typeof input.notes === "string" ? input.notes : "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    assertValid("workScheduleRecord", record);
    return mutate(function (draft) {
      draft.workSchedule.records.push(record);
      return deepClone(record);
    });
  }

  function updateWorkScheduleRecord(id, patch) {
    assert(isNonEmptyString(id), "Work schedule id is required.");
    assert(isPlainObject(patch), "Work schedule update must be an object.");
    return mutate(function (draft) {
      var record = findById(draft.workSchedule.records, id);
      assert(record, "Work schedule record not found.");
      Object.assign(record, deepClone(patch), {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: nowIso()
      });
      assertValid("workScheduleRecord", record);
      return deepClone(record);
    });
  }

  function deleteWorkScheduleRecord(id) {
    return mutate(function (draft) {
      var index = draft.workSchedule.records.findIndex(function (record) {
        return record.id === id;
      });
      assert(index !== -1, "Work schedule record not found.");
      draft.workSchedule.records.splice(index, 1);
      return true;
    });
  }

  function getSettings() {
    return deepClone(state.settings);
  }

  function updateSettings(patch) {
    assert(isPlainObject(patch), "Settings update must be an object.");
    return mutate(function (draft) {
      var update = deepClone(patch);
      delete update.createdAt;
      delete update.updatedAt;
      Object.assign(draft.settings, update);
      assertValid("settings", draft.settings);
      return deepClone(draft.settings);
    });
  }

  function getProfile() {
    var settings = state.settings;
    return deepClone({
      name: settings.name,
      email: settings.email,
      workTeam: settings.workTeam,
      supervisor: settings.supervisor,
      shiftPreferences: settings.shiftPreferences
    });
  }

  function updateProfile(patch) {
    assert(isPlainObject(patch), "Profile update must be an object.");
    var allowed = ["name", "email", "workTeam", "supervisor", "shiftPreferences"];
    var update = {};
    allowed.forEach(function (key) {
      if (patch[key] !== undefined) update[key] = patch[key];
    });
    return updateSettings(update);
  }

  function matchesDateRange(date, filters) {
    if (filters.month && getMonthKey(date) !== filters.month) return false;
    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo && date > filters.dateTo) return false;
    return true;
  }

  function getTotalIncome(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var total = state.transactions.reduce(function (sum, transaction) {
      if (transaction.type !== "income") return sum;
      if (!matchesDateRange(transaction.date, settings)) return sum;
      if (settings.accountId && transaction.accountId !== settings.accountId) {
        return sum;
      }
      if (settings.category && transaction.category !== settings.category) {
        return sum;
      }
      if (
        settings.allocationId &&
        transaction.allocationId !== settings.allocationId
      ) {
        return sum;
      }
      return sum + Number(transaction.amount || 0);
    }, 0);
    return roundMoney(total);
  }

  function getTotalExpenses(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var total = state.transactions.reduce(function (sum, transaction) {
      if (transaction.type !== "expense") return sum;
      if (!matchesDateRange(transaction.date, settings)) return sum;
      if (settings.accountId && transaction.accountId !== settings.accountId) {
        return sum;
      }
      if (settings.category && transaction.category !== settings.category) {
        return sum;
      }
      if (
        settings.allocationId &&
        transaction.allocationId !== settings.allocationId
      ) {
        return sum;
      }
      return sum + Number(transaction.amount || 0);
    }, 0);
    return roundMoney(total);
  }

  function getAccountBalance(accountId) {
    var account = findById(state.accounts, accountId);
    if (!account) return null;
    var openingDate = isDateOnly(account.openingBalanceDate)
      ? account.openingBalanceDate
      : INITIAL_FINANCIAL_DATE;
    var balance = Number(account.openingBalance || 0);
    state.transactions.forEach(function (transaction) {
      if (transaction.date < openingDate) return;
      if (transaction.type === "income" && transaction.accountId === accountId) {
        balance += Number(transaction.amount || 0);
      }
      if (transaction.type === "expense" && transaction.accountId === accountId) {
        balance -= Number(transaction.amount || 0);
      }
      if (transaction.type === "transfer") {
        if (transaction.accountId === accountId) {
          balance -= Number(transaction.amount || 0);
        }
        if (transaction.toAccountId === accountId) {
          balance += Number(transaction.amount || 0);
        }
      }
    });
    return roundMoney(balance);
  }

  function getAccountBalances() {
    return state.accounts.map(function (account) {
      return {
        accountId: account.id,
        name: account.name,
        type: account.type,
        balance: getAccountBalance(account.id)
      };
    });
  }

  function getTotalBalance() {
    var total = state.accounts.reduce(function (sum, account) {
      return sum + Number(getAccountBalance(account.id) || 0);
    }, 0);
    return roundMoney(total);
  }

  function getSavingsBalance(filters) {
    var settings = isPlainObject(filters) ? filters : {};
    var total = state.savingsMovements.reduce(function (sum, movement) {
      if (
        settings.savingsPlanId &&
        movement.savingsPlanId !== settings.savingsPlanId
      ) {
        return sum;
      }
      if (settings.accountId && movement.accountId !== settings.accountId) {
        return sum;
      }
      if (!matchesDateRange(movement.date, settings)) return sum;
      if (movement.type === "contribution") {
        return sum + Number(movement.amount || 0);
      }
      if (movement.type === "withdrawal") {
        return sum - Number(movement.amount || 0);
      }
      return sum;
    }, 0);
    return roundMoney(total);
  }

  function getSavingsPlanSavedAmount(planId) {
    return getSavingsBalance({ savingsPlanId: planId });
  }

  function getAvailableBalance(options) {
    var settings = isPlainObject(options) ? options : {};
    var total = getTotalBalance();
    if (settings.accountId) {
      total = getAccountBalance(settings.accountId);
      if (total === null) return null;
    }
    if (settings.reserveSavings === false) return roundMoney(total);
    var savings = getSavingsBalance(
      settings.accountId ? { accountId: settings.accountId } : {}
    );
    return roundMoney(total - savings);
  }

  function getAllocationActualSpending(allocationId) {
    var total = state.transactions.reduce(function (sum, transaction) {
      if (
        transaction.type === "expense" &&
        transaction.allocationId === allocationId
      ) {
        return sum + Number(transaction.amount || 0);
      }
      return sum;
    }, 0);
    return roundMoney(total);
  }

  function getAllocationRemaining(allocationId) {
    var allocation = findById(state.allocations, allocationId);
    if (!allocation) return null;
    return roundMoney(
      Number(allocation.plannedAmount || 0) -
        getAllocationActualSpending(allocationId)
    );
  }

  function getAllocationSummary(month) {
    var targetMonth = month || getMonthKey(todayKey());
    var allocations = state.allocations.filter(function (allocation) {
      return (
        allocation.financialMonth === targetMonth &&
        allocation.status !== "cancelled"
      );
    });
    var details = allocations.map(function (allocation) {
      var actual = getAllocationActualSpending(allocation.id);
      var planned = roundMoney(Number(allocation.plannedAmount || 0));
      return {
        allocationId: allocation.id,
        name: allocation.name,
        plannedAmount: planned,
        actualSpending: actual,
        remainingAmount: roundMoney(planned - actual)
      };
    });
    var totalAllocated = roundMoney(
      details.reduce(function (sum, item) {
        return sum + item.plannedAmount;
      }, 0)
    );
    var totalActualSpending = roundMoney(
      details.reduce(function (sum, item) {
        return sum + item.actualSpending;
      }, 0)
    );
    var monthlyIncome = getTotalIncome({ month: targetMonth });
    return {
      month: targetMonth,
      totalAllocated: totalAllocated,
      monthlyIncome: monthlyIncome,
      unallocatedFunds: roundMoney(monthlyIncome - totalAllocated),
      totalActualSpending: totalActualSpending,
      totalRemaining: roundMoney(totalAllocated - totalActualSpending),
      allocations: details
    };
  }

  function getTotalAllocated(month) {
    return getAllocationSummary(month).totalAllocated;
  }

  function getUnallocatedFunds(month) {
    return getAllocationSummary(month).unallocatedFunds;
  }

  function getSavingsPlanProgress(planId) {
    var plan = findById(state.savingsPlans, planId);
    if (!plan) return null;
    var saved = getSavingsPlanSavedAmount(planId);
    var target = roundMoney(Number(plan.targetAmount || 0));
    return {
      savingsPlanId: planId,
      name: plan.name,
      savedAmount: saved,
      targetAmount: target,
      remainingAmount: roundMoney(target - saved),
      percentage: target > 0 ? roundPercent((saved / target) * 100) : null,
      progressAvailable: target > 0
    };
  }

  function getGoalProgress(goalId) {
    var goal = findById(state.goals, goalId);
    if (!goal) return null;
    var target = roundMoney(Number(goal.targetAmount || 0));
    if (!goal.savingsPlanId) {
      return {
        goalId: goalId,
        name: goal.name,
        available: false,
        reason:
          "No linked savings plan. No separate goal-funding mechanism is defined.",
        fundingSource: null,
        currentAmount: null,
        targetAmount: target,
        remainingAmount: null,
        percentage: null
      };
    }
    var plan = findById(state.savingsPlans, goal.savingsPlanId);
    if (!plan) {
      return {
        goalId: goalId,
        name: goal.name,
        available: false,
        reason: "The linked savings plan could not be found.",
        fundingSource: null,
        currentAmount: null,
        targetAmount: target,
        remainingAmount: null,
        percentage: null
      };
    }
    var saved = getSavingsPlanSavedAmount(plan.id);
    return {
      goalId: goalId,
      name: goal.name,
      available: true,
      fundingSource: "savingsPlan",
      savingsPlanId: plan.id,
      currentAmount: saved,
      targetAmount: target,
      remainingAmount: roundMoney(target - saved),
      percentage: target > 0 ? roundPercent((saved / target) * 100) : null
    };
  }

  function getDailyPlanScore(planOrIdentifier) {
    var plan = null;
    if (typeof planOrIdentifier === "string") {
      plan =
        findById(state.dailyPlans, planOrIdentifier) ||
        findDailyPlanByDate(planOrIdentifier);
    } else if (isPlainObject(planOrIdentifier)) {
      plan = planOrIdentifier;
    }
    if (!plan) return null;
    var tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    var total = tasks.length;
    var completed = tasks.filter(function (task) {
      return task.completed === true;
    }).length;
    if (total === 0) {
      return {
        planId: plan.id,
        date: plan.date,
        available: false,
        percentage: null,
        completedTasks: 0,
        totalTasks: 0,
        label: "No tasks scheduled"
      };
    }
    return {
      planId: plan.id,
      date: plan.date,
      available: true,
      percentage: roundPercent((completed / total) * 100),
      completedTasks: completed,
      totalTasks: total
    };
  }

  function getProjectProgress(projectId) {
    var project = findById(state.projects, projectId);
    if (!project) return null;
    var milestones = Array.isArray(project.milestones)
      ? project.milestones
      : [];
    var total = milestones.length;
    var completed = milestones.filter(function (milestone) {
      return milestone.status === "completed";
    }).length;
    return {
      projectId: projectId,
      name: project.name,
      totalMilestones: total,
      completedMilestones: completed,
      available: total > 0,
      percentage:
        total > 0 ? roundPercent((completed / total) * 100) : null
    };
  }

  function getUpcomingMilestones(days) {
    var today = todayKey();
    var windowDays = typeof days === "number" && days >= 0 ? days : 7;
    var limit = addDaysToDateKey(today, windowDays) || today;
    var results = [];
    state.projects.forEach(function (project) {
      (Array.isArray(project.milestones) ? project.milestones : []).forEach(
        function (milestone) {
          if (milestone.status === "completed") return;
          if (milestone.dueDate >= today && milestone.dueDate <= limit) {
            results.push({
              projectId: project.id,
              projectName: project.name,
              milestoneId: milestone.id,
              title: milestone.title,
              dueDate: milestone.dueDate,
              status: milestone.status
            });
          }
        }
      );
    });
    results.sort(function (a, b) {
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
    return results;
  }

  function getOverdueMilestones() {
    var today = todayKey();
    var results = [];
    state.projects.forEach(function (project) {
      (Array.isArray(project.milestones) ? project.milestones : []).forEach(
        function (milestone) {
          if (milestone.status === "completed") return;
          if (milestone.dueDate < today) {
            results.push({
              projectId: project.id,
              projectName: project.name,
              milestoneId: milestone.id,
              title: milestone.title,
              dueDate: milestone.dueDate,
              status: milestone.status
            });
          }
        }
      );
    });
    results.sort(function (a, b) {
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
    return results;
  }

  function getFinancialSummary() {
    var savingsBalance = getSavingsBalance();
    return {
      accountBalances: getAccountBalances(),
      totalBalance: getTotalBalance(),
      availableBalance: getAvailableBalance(),
      totalIncome: getTotalIncome(),
      totalExpenses: getTotalExpenses(),
      savingsBalance: savingsBalance,
      allocationSummary: getAllocationSummary()
    };
  }

  function getState() {
    return deepClone(state);
  }

  function getLoadInfo() {
    return deepClone(loadInfo);
  }

  function isStorageAvailable() {
    return storageAvailable;
  }

  function subscribe(listener) {
    assert(typeof listener === "function", "Listener must be a function.");
    listeners.push(listener);
    return function unsubscribe() {
      listeners = listeners.filter(function (item) {
        return item !== listener;
      });
    };
  }

  function exportData() {
    return JSON.stringify(state);
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    INITIAL_FINANCIAL_DATE: INITIAL_FINANCIAL_DATE,
    DEFAULT_CURRENCY: DEFAULT_CURRENCY,
    getSchemaVersion: function () {
      return state.schemaVersion;
    },
    getState: getState,
    getLoadInfo: getLoadInfo,
    isStorageAvailable: isStorageAvailable,
    subscribe: subscribe,
    exportData: exportData,
    generateId: generateId,
    validateRecord: validateRecord,
    formatCurrency: formatCurrency,
    formatNaira: formatNaira,
    formatDate: formatDate,
    todayKey: todayKey,
    isDateOnly: isDateOnly,
    isMonthKey: isMonthKey,
    getMonthKey: getMonthKey,
    getAccounts: getAccounts,
    getAccount: getAccount,
    createAccount: createAccount,
    updateAccount: updateAccount,
    deleteAccount: deleteAccount,
    getTransactions: getTransactions,
    getTransaction: getTransaction,
    createTransaction: createTransaction,
    createIncome: createIncome,
    createExpense: createExpense,
    createTransfer: createTransfer,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    getAllocations: getAllocations,
    getMonthlyAllocations: getMonthlyAllocations,
    getAllocation: getAllocation,
    createAllocation: createAllocation,
    updateAllocation: updateAllocation,
    deleteAllocation: deleteAllocation,
    getSavingsPlans: getSavingsPlans,
    getSavingsPlan: getSavingsPlan,
    createSavingsPlan: createSavingsPlan,
    updateSavingsPlan: updateSavingsPlan,
    deleteSavingsPlan: deleteSavingsPlan,
    getSavingsMovements: getSavingsMovements,
    createSavingsMovement: createSavingsMovement,
    updateSavingsMovement: updateSavingsMovement,
    deleteSavingsMovement: deleteSavingsMovement,
    getGoals: getGoals,
    getGoal: getGoal,
    createGoal: createGoal,
    updateGoal: updateGoal,
    deleteGoal: deleteGoal,
    getDailyPlans: getDailyPlans,
    getDailyPlan: getDailyPlan,
    getDailyPlanByDate: getDailyPlanByDate,
    getOrCreateDailyPlan: getOrCreateDailyPlan,
    createDailyPlan: createDailyPlan,
    updateDailyPlan: updateDailyPlan,
    deleteDailyPlan: deleteDailyPlan,
    addTask: addTask,
    updateTask: updateTask,
    toggleTask: toggleTask,
    deleteTask: deleteTask,
    setTopThreeTasks: setTopThreeTasks,
    addMeeting: addMeeting,
    updateMeeting: updateMeeting,
    deleteMeeting: deleteMeeting,
    getProjects: getProjects,
    getProject: getProject,
    createProject: createProject,
    updateProject: updateProject,
    deleteProject: deleteProject,
    getMilestone: getMilestone,
    addMilestone: addMilestone,
    updateMilestone: updateMilestone,
    deleteMilestone: deleteMilestone,
    getWorkScheduleConfig: getWorkScheduleConfig,
    updateWorkScheduleConfig: updateWorkScheduleConfig,
    getRotationSettings: getRotationSettings,
    updateRotationSettings: updateRotationSettings,
    getWorkScheduleRecords: getWorkScheduleRecords,
    getWorkScheduleRecord: getWorkScheduleRecord,
    addWorkScheduleRecord: addWorkScheduleRecord,
    updateWorkScheduleRecord: updateWorkScheduleRecord,
    deleteWorkScheduleRecord: deleteWorkScheduleRecord,
    getSettings: getSettings,
    updateSettings: updateSettings,
    getProfile: getProfile,
    updateProfile: updateProfile,
    getAccountBalance: getAccountBalance,
    getAccountBalances: getAccountBalances,
    getTotalBalance: getTotalBalance,
    getAvailableBalance: getAvailableBalance,
    getTotalIncome: getTotalIncome,
    getTotalExpenses: getTotalExpenses,
    getSavingsBalance: getSavingsBalance,
    getSavingsPlanSavedAmount: getSavingsPlanSavedAmount,
    getAllocationActualSpending: getAllocationActualSpending,
    getAllocationRemaining: getAllocationRemaining,
    getAllocationSummary: getAllocationSummary,
    getTotalAllocated: getTotalAllocated,
    getUnallocatedFunds: getUnallocatedFunds,
    getSavingsPlanProgress: getSavingsPlanProgress,
    getGoalProgress: getGoalProgress,
    getDailyPlanScore: getDailyPlanScore,
    getProjectProgress: getProjectProgress,
    getUpcomingMilestones: getUpcomingMilestones,
    getOverdueMilestones: getOverdueMilestones,
    getFinancialSummary: getFinancialSummary
  };

  root.GabswebCashFlowData = api;
})();

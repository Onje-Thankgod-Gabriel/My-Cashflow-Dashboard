"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");
var webcrypto = require("crypto").webcrypto;

var rootDir = path.resolve(__dirname, "..");
var dataSource = fs.readFileSync(
  path.join(rootDir, "assets", "js", "cashflow-data.js"),
  "utf8"
);
var storageKey = "gabsweb-cashflow-data";

function createStorage() {
  var values = Object.create(null);
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : null;
    },
    setItem: function (key, value) {
      values[key] = String(value);
    },
    removeItem: function (key) {
      delete values[key];
    },
    clear: function () {
      values = Object.create(null);
    }
  };
}

function loadData(storage) {
  var context = {
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Intl: Intl,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    localStorage: storage,
    crypto: webcrypto
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(dataSource, context, {
    filename: "assets/js/cashflow-data.js"
  });
  return context.GabswebCashFlowData;
}

function createAccount(data) {
  return data.createAccount({
    name: "Test Account",
    type: "checking",
    openingBalance: 1000,
    openingBalanceDate: "2026-01-01"
  });
}

function createAllocation(data, month) {
  return data.createAllocation({
    name: month + " allocation",
    financialMonth: month,
    plannedAmount: 500,
    status: "planned",
    category: "Test"
  });
}

function createExpense(data, accountId, date) {
  return data.createExpense({
    amount: 100,
    date: date,
    category: "Test",
    accountId: accountId,
    description: "Test expense"
  });
}

function test(name, callback) {
  callback();
  console.log("PASS " + name);
}

test("fresh data initializes work schedule before any page script runs", function () {
  var data = loadData(createStorage());
  assert.strictEqual(data.getWorkScheduleRecords().length, 5);
  assert.strictEqual(data.getWorkScheduleConfig().rotation.configured, true);
  assert.strictEqual(
    data.getSettings().preferences.workScheduleInitialized,
    true
  );
});

test("cross-month expense cannot be linked to an allocation", function () {
  var data = loadData(createStorage());
  var account = createAccount(data);
  var allocation = createAllocation(data, "2026-01");
  var expense = createExpense(data, account.id, "2026-02-10");

  assert.throws(function () {
    data.updateTransaction(expense.id, { allocationId: allocation.id });
  }, /financial month/);
  assert.strictEqual(
    data.getTransaction(expense.id).allocationId,
    undefined
  );
  assert.strictEqual(data.getAllocationActualSpending(allocation.id), 0);
});

test("same-month expense links and counts as actual spending", function () {
  var data = loadData(createStorage());
  var account = createAccount(data);
  var allocation = createAllocation(data, "2026-01");
  var expense = createExpense(data, account.id, "2026-01-10");

  data.updateTransaction(expense.id, { allocationId: allocation.id });
  assert.strictEqual(
    data.getTransaction(expense.id).allocationId,
    allocation.id
  );
  assert.strictEqual(data.getAllocationActualSpending(allocation.id), 100);
});

test("moving a linked expense outside the allocation month is rejected", function () {
  var data = loadData(createStorage());
  var account = createAccount(data);
  var allocation = createAllocation(data, "2026-01");
  var expense = createExpense(data, account.id, "2026-01-10");

  data.updateTransaction(expense.id, { allocationId: allocation.id });
  assert.throws(function () {
    data.updateTransaction(expense.id, { date: "2026-02-10" });
  }, /financial month/);
  assert.strictEqual(data.getTransaction(expense.id).date, "2026-01-10");
  assert.strictEqual(data.getAllocationActualSpending(allocation.id), 100);
});

test("legacy cross-month links stay linked but are excluded from actual spending", function () {
  var storage = createStorage();
  var data = loadData(storage);
  var account = createAccount(data);
  var allocation = createAllocation(data, "2026-01");
  var expense = createExpense(data, account.id, "2026-02-10");
  var raw = JSON.parse(storage.getItem(storageKey));
  raw.transactions[0].allocationId = allocation.id;
  storage.setItem(storageKey, JSON.stringify(raw));

  var reloaded = loadData(storage);
  assert.strictEqual(
    reloaded.getTransaction(expense.id).allocationId,
    allocation.id
  );
  assert.strictEqual(reloaded.getAllocationActualSpending(allocation.id), 0);
});

test("transfers do not change total wealth", function () {
  var data = loadData(createStorage());
  var first = createAccount(data);
  var second = data.createAccount({
    name: "Second Account",
    type: "savings",
    openingBalance: 500,
    openingBalanceDate: "2026-01-01"
  });
  var before = data.getTotalBalance();
  data.createTransfer({
    amount: 100,
    date: "2026-01-15",
    accountId: first.id,
    toAccountId: second.id,
    description: "Move money"
  });
  assert.strictEqual(data.getTotalBalance(), before);
});

console.log("All financial regression tests passed.");

import test from "node:test";
import assert from "node:assert/strict";
import { parseControlCommand } from "../src/control-bot/commands.js";

test("parseControlCommand recognizes menu command", () => {
  assert.deepEqual(parseControlCommand("/start"), { kind: "show_menu" });
});

test("parseControlCommand recognizes shutdown command", () => {
  assert.deepEqual(parseControlCommand("🛑 Выключить бота"), { kind: "shutdown" });
});

test("parseControlCommand recognizes reload command", () => {
  assert.deepEqual(parseControlCommand("перезагрузить"), { kind: "reload" });
});

test("parseControlCommand recognizes stop command", () => {
  assert.deepEqual(parseControlCommand("Остановить текущий процесс"), { kind: "stop" });
});

test("parseControlCommand recognizes live list command", () => {
  assert.deepEqual(parseControlCommand("📋 Получить список лайв"), {
    kind: "list",
    status: "live",
  });
});

test("parseControlCommand recognizes prematch list command", () => {
  assert.deepEqual(parseControlCommand("📋 Получить список премачт"), {
    kind: "list",
    status: "upcoming",
  });
});

test("parseControlCommand recognizes live analysis command", () => {
  assert.deepEqual(parseControlCommand("▶️ Анализ лайв"), {
    kind: "analyze",
    status: "live",
    label: "лайв",
  });
});

test("parseControlCommand recognizes prematch analysis command", () => {
  assert.deepEqual(parseControlCommand("▶️ Анализ всех прематч"), {
    kind: "analyze",
    status: "upcoming",
    label: "прематч",
  });
});

test("parseControlCommand returns unknown for unsupported text", () => {
  assert.deepEqual(parseControlCommand("что-то непонятное"), { kind: "unknown" });
});

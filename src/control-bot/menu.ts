export const MENU = {
  listLive: "📋 Получить список лайв",
  listPrematch: "📋 Получить список прематч",
  analyzeLive: "▶️ Анализ лайв",
  analyzePrematch: "▶️ Анализ всех прематч",
  stop: "⏹ Остановить текущий процесс",
  reload: "🔄 Перезагрузить",
  shutdown: "🛑 Выключить бота",
} as const;

export const MENU_KEYBOARD = {
  keyboard: [
    [MENU.listLive, MENU.listPrematch],
    [MENU.analyzeLive, MENU.analyzePrematch],
    [MENU.stop],
    [MENU.reload, MENU.shutdown],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

export const MAX_LIST_LINES = 30;

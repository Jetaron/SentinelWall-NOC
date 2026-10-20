import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Send,
  Settings,
  Trash2,
} from 'lucide-react';
import type {
  NotificationConfig,
  NotificationRecord,
} from '../utils/monitoringEngine';

interface NotificationsAndExportViewProps {
  config: NotificationConfig;
  history: NotificationRecord[];
  isDark: boolean;
  onUpdateConfig: (patch: Partial<NotificationConfig>) => void;
  onClearDemoConfig: () => void;
  onClearAllDemoData: () => void;
  onRestoreDemoServices: () => void;
  onSendTestNotification: (channel: 'telegram' | 'slack', customText?: string) => Promise<void>;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export const NotificationsAndExportView: React.FC<NotificationsAndExportViewProps> = ({
  config,
  history,
  isDark,
  onUpdateConfig,
  onClearDemoConfig,
  onClearAllDemoData,
  onRestoreDemoServices,
  onSendTestNotification,
  onExportCsv,
  onExportPdf,
}) => {
  const [customAlertText, setCustomAlertText] = useState(
    'Тестове сповіщення SentinelWall NOC: Перевірка каналу оперативного реагування та 30с дампу.'
  );
  const [sendingChannel, setSendingChannel] = useState<'telegram' | 'slack' | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const handleTriggerSend = async (channel: 'telegram' | 'slack') => {
    setSendingChannel(channel);
    try {
      await onSendTestNotification(channel, customAlertText);
    } finally {
      setSendingChannel(null);
    }
  };

  return (
    <section className="space-y-6" aria-label="Сповіщення Telegram і Slack та експорт звітів PDF і CSV">
      {/* Header Action to Clear Demo Parameters */}
      <div
        className={`rounded-xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
          isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div>
          <h2 className="text-sm font-bold">Налаштування шлюзів сповіщень та параметрів експорту</h2>
          <p className="text-xs text-slate-400">
            Ви можете очистити демонстраційні токени Telegram / Slack та історію тестових сповіщень перед введенням власних ключів
          </p>
        </div>
        <button
          type="button"
          onClick={onClearDemoConfig}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0"
        >
          Очистити демо-параметри шлюзів
        </button>
      </div>

      {/* Top Grid: Telegram & Slack Integration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telegram Card */}
        <div
          className={`rounded-xl border p-5 flex flex-col justify-between ${
            isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-sky-400">TELEGRAM BOT API ШЛЮЗ</div>
                <h2 className="text-lg font-bold mt-0.5">Сповіщення у Telegram</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.telegramEnabled}
                  onChange={(e) => onUpdateConfig({ telegramEnabled: e.target.checked })}
                  className="rounded border-slate-700"
                />
                <span>Активно</span>
              </label>
            </div>

            <div>
              <label htmlFor="tg-token" className="block text-xs text-slate-400 mb-1">
                Telegram Bot Token (або залиште демо-шлюз)
              </label>
              <input
                id="tg-token"
                type="text"
                value={config.telegramBotToken}
                onChange={(e) => onUpdateConfig({ telegramBotToken: e.target.value })}
                placeholder="7123456789:AAH_your_telegram_bot_token"
                className={`w-full px-3 py-2 text-xs font-mono rounded-lg border ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label htmlFor="tg-chat-id" className="block text-xs text-slate-400 mb-1">
                Chat ID або Канал чергової зміни NOC
              </label>
              <input
                id="tg-chat-id"
                type="text"
                value={config.telegramChatId}
                onChange={(e) => onUpdateConfig({ telegramChatId: e.target.value })}
                placeholder="-100198237465 або @noc_ops_ukraine"
                className={`w-full px-3 py-2 text-xs font-mono rounded-lg border ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Авто-відправка при збої (разом із дампом 30с)
            </span>
            <button
              type="button"
              disabled={sendingChannel === 'telegram'}
              onClick={() => handleTriggerSend('telegram')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {sendingChannel === 'telegram' ? 'Відправка...' : 'Тест у Telegram'}
              </span>
            </button>
          </div>
        </div>

        {/* Slack Card */}
        <div
          className={`rounded-xl border p-5 flex flex-col justify-between ${
            isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-emerald-400">SLACK INCOMING WEBHOOK</div>
                <h2 className="text-lg font-bold mt-0.5">Сповіщення у Slack</h2>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.slackEnabled}
                  onChange={(e) => onUpdateConfig({ slackEnabled: e.target.checked })}
                  className="rounded border-slate-700"
                />
                <span>Активно</span>
              </label>
            </div>

            <div>
              <label htmlFor="slack-webhook" className="block text-xs text-slate-400 mb-1">
                Slack Incoming Webhook URL
              </label>
              <input
                id="slack-webhook"
                type="text"
                value={config.slackWebhookUrl}
                onChange={(e) => onUpdateConfig({ slackWebhookUrl: e.target.value })}
                placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                className={`w-full px-3 py-2 text-xs font-mono rounded-lg border ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label htmlFor="slack-channel" className="block text-xs text-slate-400 mb-1">
                Канал для інцидентів
              </label>
              <input
                id="slack-channel"
                type="text"
                value={config.slackChannel}
                onChange={(e) => onUpdateConfig({ slackChannel: e.target.value })}
                placeholder="#noc-incidents-ua"
                className={`w-full px-3 py-2 text-xs font-mono rounded-lg border ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Миттєвий вебхук у робочий простір команди
            </span>
            <button
              type="button"
              disabled={sendingChannel === 'slack'}
              onClick={() => handleTriggerSend('slack')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingChannel === 'slack' ? 'Відправка...' : 'Тест у Slack'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Custom Alert Message & Trigger Policies */}
      <div
        className={`rounded-xl border p-5 ${
          isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-2 space-y-2">
            <label htmlFor="custom-alert-msg" className="block text-xs font-semibold text-slate-300">
              Текст оперативного повідомлення для перевірки шлюзів Telegram / Slack
            </label>
            <input
              id="custom-alert-msg"
              type="text"
              value={customAlertText}
              onChange={(e) => setCustomAlertText(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-lg border ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
            <div className="flex flex-wrap gap-4 pt-2 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyOnCritical}
                  onChange={(e) => onUpdateConfig({ notifyOnCritical: e.target.checked })}
                />
                <span>Сповіщати при критичних збоях (CRITICAL)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyWith30sBlackbox}
                  onChange={(e) => onUpdateConfig({ notifyWith30sBlackbox: e.target.checked })}
                />
                <span>Додавати зведення метрик за останні 30 секунд</span>
              </label>
            </div>
          </div>

          {/* Export PDF / CSV Section */}
          <div
            className={`rounded-lg border p-4 space-y-3 ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-xs font-mono text-sky-400">ЕКСПОРТ ЗВІТІВ (PDF / CSV)</div>
            <p className="text-xs text-slate-400">
              Вивантажити повний звіт стану всіх камер, посекундних метрик за останні 30с та історії хмарних запитів
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportPdf}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>Завантажити PDF</span>
              </button>
              <button
                type="button"
                onClick={onExportCsv}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Завантажити CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Delivery Log */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold">Журнал відправлених сповіщень (Telegram / Slack)</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Усього відправлено: {history.length}
          </span>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-mono ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <th className="py-2.5 px-4">Час</th>
                <th className="py-2.5 px-4">Канал</th>
                <th className="py-2.5 px-4">Сервіс</th>
                <th className="py-2.5 px-4">Повідомлення</th>
                <th className="py-2.5 px-4">Статус доставки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {history.map((item) => (
                <tr key={item.id} className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                  <td className="py-2.5 px-4 whitespace-nowrap text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString('uk-UA')}
                  </td>
                  <td className="py-2.5 px-4 uppercase font-semibold text-sky-400">
                    {item.channelType}
                  </td>
                  <td className="py-2.5 px-4 font-sans font-semibold">{item.serviceName}</td>
                  <td className="py-2.5 px-4 font-sans">{item.message}</td>
                  <td className="py-2.5 px-4 font-sans text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.deliveryNote}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deep Collapsible System & Demo Environment Settings (Hidden away from main screen) */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isDark ? 'bg-[#0F172A]/70 border-slate-800/80' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <button
          type="button"
          aria-expanded={showAdvancedSettings}
          onClick={() => setShowAdvancedSettings((prev) => !prev)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>Системні налаштування середовища та керування демонстраційними даними</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showAdvancedSettings && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-xs text-slate-400 max-w-xl">
              Службовий розділ для повного очищення демонстраційних сервісів або повторного розгортання тестового стенда (Wazuh, Zabbix, Ceph/Seph, Redis, RabbitMQ).
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onClearAllDemoData}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Видалити всі демо-дані</span>
              </button>
              <button
                type="button"
                onClick={onRestoreDemoServices}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Повернути демо-стенд</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};


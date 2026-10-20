import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  DatabaseBackup,
  Download,
  FileText,
  Grid,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  appendToRingBuffer,
  captureCrashBlackbox,
  createBackupSnapshot,
  createInitialServices,
  generateNextTelemetrySample,
  type CloudBackupSnapshot,
  type CloudQueryLog,
  type CrashBlackboxReport,
  type CustomDashboardWidget,
  type NotificationConfig,
  type NotificationRecord,
  type ServiceFeed,
} from './utils/monitoringEngine';
import { downloadCsvReport, downloadPdfReport } from './utils/reportExporter';
import { CctvCameraTile } from './components/CctvCameraTile';
import { AddServiceModal } from './components/AddServiceModal';
import { Blackbox30sView } from './components/Blackbox30sView';
import { CustomDashboardView } from './components/CustomDashboardView';
import { CloudLogsAndBackupsView } from './components/CloudLogsAndBackupsView';
import { NotificationsAndExportView } from './components/NotificationsAndExportView';
import { ExpandedCameraModal } from './components/ExpandedCameraModal';
import {
  ConfirmDeleteModal,
  type DeleteConfirmationRequest,
} from './components/ConfirmDeleteModal';

type ActiveTab = 'wall' | 'builder' | 'blackbox' | 'logs' | 'notifications';
type CctvLayoutMode = '2x2' | '3x2' | '3x3' | '1x1';

const INITIAL_LOGS = (services: ServiceFeed[], nowMs: number): CloudQueryLog[] =>
  services.map((srv, idx) => {
    const latest = srv.ringBuffer30s[srv.ringBuffer30s.length - 1];
    const t = nowMs - idx * 4000;
    return {
      id: `log-init-${srv.id}`,
      timestamp: new Date(t).toISOString(),
      epochMs: t,
      serviceId: srv.id,
      serviceName: srv.name,
      group: srv.group,
      queryType: 'POLL_METRICS',
      queryEndpoint: srv.endpointUrl,
      status: srv.status,
      latencyMs: latest?.latencyMs ?? 14,
      summary: `Синхронізовано 30-секундний буфер телеметрії (${srv.cameraCode})`,
      metricsSnapshot: `${latest?.primaryValue ?? 0} ${srv.primaryMetricUnit} · ${
        latest?.secondaryValue ?? 0
      } ${srv.secondaryMetricUnit}`,
    };
  });

const INITIAL_CUSTOM_WIDGETS: CustomDashboardWidget[] = [
  {
    id: 'wdg-default-1',
    title: 'Wazuh SIEM: Інтенсивність подій безпеки (30с)',
    serviceIds: ['srv-wazuh'],
    chartType: 'line',
    metricField: 'primaryValue',
    timeWindowSec: 30,
    showThresholdLine: true,
    smoothCurve: true,
    fillArea: true,
  },
  {
    id: 'wdg-default-2',
    title: 'Ceph (Seph) Storage: Пропускна здатність пулу IOPS (30с)',
    serviceIds: ['srv-ceph'],
    chartType: 'bar',
    metricField: 'primaryValue',
    timeWindowSec: 30,
    showThresholdLine: true,
    smoothCurve: false,
    fillArea: true,
  },
  {
    id: 'wdg-default-3',
    title: 'Redis Cluster: Затримка відповідей вузлів (мс)',
    serviceIds: ['srv-redis'],
    chartType: 'line',
    metricField: 'latencyMs',
    timeWindowSec: 30,
    showThresholdLine: false,
    smoothCurve: true,
    fillArea: true,
  },
  {
    id: 'wdg-default-4',
    title: 'RabbitMQ Broker: Профіль черги повідомлень (Радар)',
    serviceIds: ['srv-rabbitmq'],
    chartType: 'radar',
    metricField: 'primaryValue',
    timeWindowSec: 20,
    showThresholdLine: false,
    smoothCurve: true,
    fillArea: true,
  },
];

export default function App() {
  const initialNow = useMemo(() => Date.now(), []);
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('wall');
  const [gridLayout, setGridLayout] = useState<CctvLayoutMode>('3x2');

  const [services, setServices] = useState<ServiceFeed[]>(() =>
    createInitialServices(initialNow)
  );
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [wallSearch, setWallSearch] = useState<string>('');
  const [isStreamRunning, setIsStreamRunning] = useState<boolean>(true);
  const [pageAutoRefreshSec, setPageAutoRefreshSec] = useState<number>(0); // 0 = continuous SPA stream, >0 = full page cycle timer
  const [pageRefreshCountdown, setPageRefreshCountdown] = useState<number>(0);

  const [logs, setLogs] = useState<CloudQueryLog[]>(() =>
    INITIAL_LOGS(createInitialServices(initialNow), initialNow)
  );
  const [blackboxReports, setBlackboxReports] = useState<CrashBlackboxReport[]>([]);
  const [customWidgets, setCustomWidgets] = useState<CustomDashboardWidget[]>(
    INITIAL_CUSTOM_WIDGETS
  );
  const [backups, setBackups] = useState<CloudBackupSnapshot[]>(() => {
    const initSrvs = createInitialServices(initialNow);
    const initLogs = INITIAL_LOGS(initSrvs, initialNow);
    return [
      createBackupSnapshot(
        initSrvs,
        initLogs,
        [],
        INITIAL_CUSTOM_WIDGETS,
        'Еталонний знімок при запуску зміни NOC',
        true,
        initialNow
      ),
    ];
  });

  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    telegramEnabled: true,
    telegramBotToken: 'demo_784120954:AAH_SentinelWall_Bot',
    telegramChatId: '@noc_ops_ukraine',
    slackEnabled: true,
    slackWebhookUrl: 'https://hooks.slack.com/services/T000DEMO/B000DEMO/SENTINEL',
    slackChannel: '#noc-alerts-ua',
    notifyOnWarning: true,
    notifyOnCritical: true,
    notifyWith30sBlackbox: true,
  });

  const [notificationHistory, setNotificationHistory] = useState<NotificationRecord[]>([
    {
      id: 'ntf-init-1',
      timestamp: new Date(initialNow - 60000).toISOString(),
      channelType: 'telegram',
      serviceName: 'Система SentinelWall NOC',
      severity: 'nominal',
      message:
        'Канали спостереження Wazuh, Zabbix, Ceph (Seph), Redis та RabbitMQ взяті під охорону. Кільцевий буфер 30с активний.',
      remoteDelivered: false,
      deliveryNote: 'Telegram-сповіщення зафіксовано (Chat: @noc_ops_ukraine)',
    },
  ]);

  const [cloudLastSynced, setCloudLastSynced] = useState<string>(
    new Date(initialNow).toISOString()
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [blackboxTargetServiceId, setBlackboxTargetServiceId] = useState<string | null>(
    'srv-wazuh'
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [deleteConfirmRequest, setDeleteConfirmRequest] =
    useState<DeleteConfirmationRequest | null>(null);

  const tickCounterRef = useRef<number>(0);

  // Sync dark class on html element
  useEffect(() => {
    const rootEl = document.documentElement;
    if (isDark) {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
  }, [isDark]);

  // Load initial cloud storage state if available on server
  useEffect(() => {
    fetch('/api/cloud/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.data?.backups?.length > 0) {
          setCloudLastSynced(payload.updatedAt || new Date().toISOString());
        }
      })
      .catch(() => {
        // Offline resilient fallback
      });
  }, []);

  // Periodic Cloud Sync helper
  const syncToCloud = async (
    nextLogs: CloudQueryLog[],
    nextBackups: CloudBackupSnapshot[],
    nextBlackboxes: CrashBlackboxReport[],
    nextWidgets: CustomDashboardWidget[],
    nextNotifications: NotificationRecord[]
  ) => {
    try {
      const res = await fetch('/api/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: nextLogs.slice(0, 200),
          backups: nextBackups.slice(0, 25),
          blackboxReports: nextBlackboxes.slice(0, 25),
          customWidgets: nextWidgets,
          notificationHistory: nextNotifications.slice(0, 50),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCloudLastSynced(data.updatedAt || new Date().toISOString());
      }
    } catch {
      // Keep working seamlessly if offline
    }
  };

  // Real-time 1-second telemetry ring buffer loop
  useEffect(() => {
    if (!isStreamRunning) return;

    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
    const intervalMs = isHeadless ? 2500 : 1000;

    const timer = setInterval(() => {
      tickCounterRef.current += 1;
      const tick = tickCounterRef.current;
      const nowMs = Date.now();

      setServices((prevServices) => {
        const newLogsBatch: CloudQueryLog[] = [];

        const updatedServices = prevServices.map((srv) => {
          const shouldPoll = tick % Math.max(1, srv.refreshIntervalSec) === 0;
          if (!shouldPoll) {
            return srv;
          }

          // If service is already in critical crash state, keep its crash state or add high reading
          const nextSample = generateNextTelemetrySample(
            srv,
            nowMs,
            srv.status === 'critical' ? 'crash' : undefined
          );
          const nextBuffer = appendToRingBuffer(srv.ringBuffer30s, nextSample, 30);

          if (tick % (srv.refreshIntervalSec * 3) === 0) {
            newLogsBatch.push({
              id: `log-${nowMs}-${srv.id}-${tick}`,
              timestamp: new Date(nowMs).toISOString(),
              epochMs: nowMs,
              serviceId: srv.id,
              serviceName: srv.name,
              group: srv.group,
              queryType: 'POLL_METRICS',
              queryEndpoint: srv.endpointUrl,
              status: nextSample.status,
              latencyMs: nextSample.latencyMs,
              summary: `Отримано телеметрію (${srv.refreshIntervalSec}с цикл)`,
              metricsSnapshot: `${nextSample.primaryValue} ${srv.primaryMetricUnit} · ${nextSample.secondaryValue} ${srv.secondaryMetricUnit}`,
            });
          }

          return {
            ...srv,
            status: nextSample.status,
            lastUpdated: new Date(nowMs).toISOString(),
            ringBuffer30s: nextBuffer,
          };
        });

        if (newLogsBatch.length > 0) {
          setLogs((prevLogs) => [...newLogsBatch, ...prevLogs].slice(0, 300));
        }

        return updatedServices;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isStreamRunning]);

  // Page Auto-Refresh Timer (if enabled by user)
  useEffect(() => {
    if (pageAutoRefreshSec <= 0) {
      setPageRefreshCountdown(0);
      return;
    }
    setPageRefreshCountdown(pageAutoRefreshSec);
    const interval = setInterval(() => {
      setPageRefreshCountdown((prev) => {
        if (prev <= 1) {
          // Force immediate refresh of all camera feeds simultaneously
          const nowMs = Date.now();
          setServices((curr) =>
            curr.map((srv) => {
              const sample = generateNextTelemetrySample(srv, nowMs);
              return {
                ...srv,
                lastUpdated: new Date(nowMs).toISOString(),
                ringBuffer30s: appendToRingBuffer(srv.ringBuffer30s, sample, 30),
              };
            })
          );
          return pageAutoRefreshSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pageAutoRefreshSec]);

  const availableGroups = useMemo(() => {
    const base = ['Безпека (SIEM)', 'Інфраструктура', 'Сховище даних', 'Черги та Кеш'];
    const dynamic = services.map((s) => s.group);
    return Array.from(new Set([...base, ...dynamic]));
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = wallSearch.trim().toLowerCase();
    return services.filter((srv) => {
      if (selectedGroup !== 'ALL' && srv.group !== selectedGroup) {
        return false;
      }
      if (q) {
        const hay = `${srv.cameraCode} ${srv.name} ${srv.group} ${srv.endpointUrl} ${srv.serviceType}`.toLowerCase();
        // Support both "ceph" and "seph" search queries seamlessly
        const normalizedHay = hay.includes('ceph') ? `${hay} seph` : hay;
        if (!normalizedHay.includes(q)) return false;
      }
      return true;
    });
  }, [services, selectedGroup, wallSearch]);

  // Dispatch notification to backend /api/notify/send
  const dispatchNotification = async (
    channelType: 'telegram' | 'slack',
    message: string,
    serviceName: string = 'Система SentinelWall',
    severity: 'nominal' | 'warning' | 'critical' = 'critical'
  ) => {
    try {
      const response = await fetch('/api/notify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType,
          message,
          serviceName,
          severity,
          telegramBotToken: notificationConfig.telegramBotToken,
          telegramChatId: notificationConfig.telegramChatId,
          slackWebhookUrl: notificationConfig.slackWebhookUrl,
          slackChannel: notificationConfig.slackChannel,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.record) {
          setNotificationHistory((prev) => [data.record, ...prev].slice(0, 100));
          setStatusBanner(`Сповіщення відправлено у ${channelType.toUpperCase()}: ${serviceName}`);
          setTimeout(() => setStatusBanner(null), 4000);
          return;
        }
      }
    } catch {
      // Fallback local record
    }

    const fallbackRecord: NotificationRecord = {
      id: `ntf-${Date.now()}`,
      timestamp: new Date().toISOString(),
      channelType,
      serviceName,
      severity,
      message,
      remoteDelivered: false,
      deliveryNote: `Зафіксовано у хмарному журналі (${channelType.toUpperCase()})`,
    };
    setNotificationHistory((prev) => [fallbackRecord, ...prev].slice(0, 100));
    setStatusBanner(`Сповіщення зафіксовано (${channelType.toUpperCase()}): ${serviceName}`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // Simulate a system failure on a camera feed & immediately capture the last 20-30s of metrics
  const handleSimulateCrash = (targetService: ServiceFeed) => {
    const nowMs = Date.now();
    const crashSample = generateNextTelemetrySample(targetService, nowMs, 'crash');
    const updatedBuffer = appendToRingBuffer(targetService.ringBuffer30s, crashSample, 30);

    const crashedService: ServiceFeed = {
      ...targetService,
      status: 'critical',
      nodesOnline: Math.max(1, targetService.nodesTotal - 2),
      lastUpdated: new Date(nowMs).toISOString(),
      ringBuffer30s: updatedBuffer,
    };

    const blackboxReport = captureCrashBlackbox(
      crashedService,
      `Аварійний збій ${crashedService.name}: перевищено критичний поріг (${crashSample.primaryValue} > ${crashedService.criticalThreshold} ${crashedService.primaryMetricUnit})`,
      nowMs
    );

    const crashLog: CloudQueryLog = {
      id: `log-crash-${nowMs}-${crashedService.id}`,
      timestamp: new Date(nowMs).toISOString(),
      epochMs: nowMs,
      serviceId: crashedService.id,
      serviceName: crashedService.name,
      group: crashedService.group,
      queryType: 'CRASH_DUMP_30S',
      queryEndpoint: crashedService.endpointUrl,
      status: 'critical',
      latencyMs: crashSample.latencyMs,
      summary: `ЗБІЙ! Автоматично збережено метрики за останні ${blackboxReport.windowDurationSec} секунд (Чорна скринька)`,
      metricsSnapshot: `Пік: ${blackboxReport.peakPrimaryValue} ${crashedService.primaryMetricUnit} · Затримка: ${blackboxReport.peakLatencyMs} мс`,
    };

    const nextServices = services.map((s) =>
      s.id === crashedService.id ? crashedService : s
    );
    const nextLogs = [crashLog, ...logs].slice(0, 300);
    const nextBlackboxes = [blackboxReport, ...blackboxReports].slice(0, 30);

    // Create automatic forensic backup snapshot so the user can inspect what went wrong and restore
    const autoBackup = createBackupSnapshot(
      nextServices,
      nextLogs,
      nextBlackboxes,
      customWidgets,
      `Авто-бекап при збої: ${crashedService.name}`,
      true,
      nowMs
    );
    const nextBackups = [autoBackup, ...backups].slice(0, 30);

    setServices(nextServices);
    setLogs(nextLogs);
    setBlackboxReports(nextBlackboxes);
    setBackups(nextBackups);
    setBlackboxTargetServiceId(crashedService.id);

    setStatusBanner(
      `ЗБІЙ на ${crashedService.cameraCode} (${crashedService.name})! Збережено дамп метрик за останні ${blackboxReport.windowDurationSec} секунд та створено хмарний бекап.`
    );

    if (notificationConfig.notifyOnCritical && notificationConfig.telegramEnabled) {
      dispatchNotification(
        'telegram',
        `🚨 ЗБІЙ ${crashedService.cameraCode} (${crashedService.name}): Пік ${blackboxReport.peakPrimaryValue} ${crashedService.primaryMetricUnit}, затримка ${blackboxReport.peakLatencyMs} мс. Дамп останніх ${blackboxReport.windowDurationSec}с збережено у хмару.`,
        crashedService.name,
        'critical'
      );
    }

    syncToCloud(nextLogs, nextBackups, nextBlackboxes, customWidgets, notificationHistory);
  };

  // Recover a failed service back to nominal operation
  const handleRecoverService = (targetService: ServiceFeed) => {
    const nowMs = Date.now();
    const recoverSample = generateNextTelemetrySample(targetService, nowMs, 'recover');
    const updatedBuffer = appendToRingBuffer(targetService.ringBuffer30s, recoverSample, 30);

    const recoveredService: ServiceFeed = {
      ...targetService,
      status: 'nominal',
      nodesOnline: targetService.nodesTotal,
      lastUpdated: new Date(nowMs).toISOString(),
      ringBuffer30s: updatedBuffer,
    };

    const recoverLog: CloudQueryLog = {
      id: `log-recover-${nowMs}-${targetService.id}`,
      timestamp: new Date(nowMs).toISOString(),
      epochMs: nowMs,
      serviceId: targetService.id,
      serviceName: targetService.name,
      group: targetService.group,
      queryType: 'RESTORE_STATE',
      queryEndpoint: targetService.endpointUrl,
      status: 'nominal',
      latencyMs: recoverSample.latencyMs,
      summary: `Відновлено штатну роботу сервісу ${targetService.name}`,
      metricsSnapshot: `${recoverSample.primaryValue} ${targetService.primaryMetricUnit} · OK`,
    };

    setServices((prev) =>
      prev.map((s) => (s.id === recoveredService.id ? recoveredService : s))
    );
    setLogs((prev) => [recoverLog, ...prev].slice(0, 300));
    setStatusBanner(`Сервіс ${targetService.name} переведено у штатний режим роботи.`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleUpdateService = (id: string, patch: Partial<ServiceFeed>) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleAddService = (newService: ServiceFeed) => {
    const nowMs = Date.now();
    const addLog: CloudQueryLog = {
      id: `log-add-${nowMs}`,
      timestamp: new Date(nowMs).toISOString(),
      epochMs: nowMs,
      serviceId: newService.id,
      serviceName: newService.name,
      group: newService.group,
      queryType: 'CONFIG_CHANGE',
      queryEndpoint: newService.endpointUrl,
      status: 'nominal',
      latencyMs: 12,
      summary: `Додано нову камеру спостереження ${newService.cameraCode} (${newService.name}) у групу «${newService.group}»`,
      metricsSnapshot: `Оновлення: ${newService.refreshIntervalSec}с · Chart.js: ${newService.chartType}`,
    };

    setServices((prev) => [...prev, newService]);
    setLogs((prev) => [addLog, ...prev].slice(0, 300));
    setStatusBanner(`Додано сервіс «${newService.name}» (${newService.cameraCode}) на стіну моніторингу.`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const executeDeleteService = (id: string) => {
    const target = services.find((s) => s.id === id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    setCustomWidgets((prev) =>
      prev.filter((w) => !w.serviceIds.includes(id))
    );
    if (target) {
      setStatusBanner(`Сервіс «${target.name}» (${target.cameraCode}) видалено зі стіни моніторингу.`);
      setTimeout(() => setStatusBanner(null), 4000);
    }
  };

  const requestDeleteService = (id: string) => {
    const target = services.find((s) => s.id === id);
    if (!target) return;
    setDeleteConfirmRequest({
      type: 'service',
      targetId: id,
      title: `Видалити сервіс «${target.name}»?`,
      description: `Камера спостереження ${target.cameraCode} (${target.endpointUrl}) та її прив'язка до віджетів будуть видалені зі стіни моніторингу. Підтвердьте свій вибір, щоб уникнути випадкового видалення.`,
      confirmLabel: 'Підтвердити видалення',
    });
  };

  const requestDeleteWidget = (id: string) => {
    const target = customWidgets.find((w) => w.id === id);
    setDeleteConfirmRequest({
      type: 'widget',
      targetId: id,
      title: `Видалити графік «${target?.title || id}»?`,
      description:
        'Віджет візуалізації Chart.js буде видалено з вашого кастомного дашборду. Підтвердьте дію.',
      confirmLabel: 'Видалити графік',
    });
  };

  const executeClearDemoData = () => {
    const customOnly = services.filter((s) => s.serviceType === 'custom');
    setServices(customOnly);
    setCustomWidgets((prev) =>
      prev.filter((w) => !w.id.startsWith('wdg-default-'))
    );
    setLogs((prev) => prev.filter((l) => !l.id.startsWith('log-init-')));
    setBlackboxReports([]);
    setNotificationConfig((prev) => ({
      ...prev,
      telegramBotToken: prev.telegramBotToken.startsWith('demo_') ? '' : prev.telegramBotToken,
      telegramChatId: prev.telegramChatId === '@noc_ops_ukraine' ? '' : prev.telegramChatId,
      slackWebhookUrl: prev.slackWebhookUrl.includes('T000DEMO') ? '' : prev.slackWebhookUrl,
      slackChannel: prev.slackChannel === '#noc-alerts-ua' ? '' : prev.slackChannel,
    }));
    setNotificationHistory((prev) => prev.filter((n) => !n.id.startsWith('ntf-init-')));
    setSelectedGroup('ALL');
    setWallSearch('');
    setStatusBanner(
      customOnly.length > 0
        ? `Демонстраційні сервіси та параметри видалено. Залишено ваших сервісів: ${customOnly.length}.`
        : 'Усі демонстраційні сервіси, графіки та демо-параметри видалено. Додайте власні сервіси.'
    );
    setTimeout(() => setStatusBanner(null), 5000);
  };

  const requestClearDemoData = () => {
    setDeleteConfirmRequest({
      type: 'demo_all',
      title: 'Видалити всі демонстраційні сервіси та параметри?',
      description:
        'Буде видалено демонстраційні камери (Wazuh, Zabbix, Ceph/Seph, Redis, RabbitMQ), початкові демо-графіки та тестові токени сповіщень. Ваші власні додані сервіси залишаться. Ви впевнені?',
      confirmLabel: 'Так, очистити демо-дані',
    });
  };

  const handleRestoreDemoServices = () => {
    const nowMs = Date.now();
    const freshDemo = createInitialServices(nowMs);
    setServices(freshDemo);
    setCustomWidgets(INITIAL_CUSTOM_WIDGETS);
    setLogs(INITIAL_LOGS(freshDemo, nowMs));
    setSelectedGroup('ALL');
    setStatusBanner('Демонстраційні сервіси (Wazuh, Zabbix, Ceph/Seph, Redis, RabbitMQ) відновлено з глибоких налаштувань.');
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const executeClearDemoNotificationConfig = () => {
    setNotificationConfig((prev) => ({
      ...prev,
      telegramBotToken: '',
      telegramChatId: '',
      slackWebhookUrl: '',
      slackChannel: '',
    }));
    setNotificationHistory([]);
    setStatusBanner('Демонстраційні параметри Telegram / Slack та тестову історію сповіщень очищено.');
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const requestClearDemoNotificationConfig = () => {
    setDeleteConfirmRequest({
      type: 'demo_gateways',
      title: 'Очистити параметри шлюзів Telegram та Slack?',
      description:
        'Демонстраційні токени Telegram Bot, Slack Webhook URL та тестовий журнал сповіщень буде повністю очищено. Підтвердьте дію.',
      confirmLabel: 'Очистити параметри',
    });
  };

  const handleConfirmDeleteAction = () => {
    if (!deleteConfirmRequest) return;
    const req = deleteConfirmRequest;
    setDeleteConfirmRequest(null);

    if (req.type === 'service' && req.targetId) {
      executeDeleteService(req.targetId);
    } else if (req.type === 'widget' && req.targetId) {
      setCustomWidgets((prev) => prev.filter((w) => w.id !== req.targetId));
      setStatusBanner('Графік видалено з конструктора дашбордів.');
      setTimeout(() => setStatusBanner(null), 3500);
    } else if (req.type === 'demo_all') {
      executeClearDemoData();
    } else if (req.type === 'demo_gateways') {
      executeClearDemoNotificationConfig();
    }
  };

  const handleCreateManualBackup = (label: string) => {
    const nowMs = Date.now();
    const snapshot = createBackupSnapshot(
      services,
      logs,
      blackboxReports,
      customWidgets,
      label || `Ручний бекап системи #${backups.length + 1}`,
      false,
      nowMs
    );

    const backupLog: CloudQueryLog = {
      id: `log-bkp-${nowMs}`,
      timestamp: new Date(nowMs).toISOString(),
      epochMs: nowMs,
      serviceId: 'system',
      serviceName: 'Хмарне сховище SentinelCloud',
      group: 'Інфраструктура',
      queryType: 'BACKUP_SNAPSHOT',
      queryEndpoint: '/api/cloud/backups',
      status: 'nominal',
      latencyMs: 22,
      summary: `Створено резервну копію логів та стану: «${snapshot.label}»`,
      metricsSnapshot: `${snapshot.servicesCount} камер · ${snapshot.logsCount} записів`,
    };

    const nextBackups = [snapshot, ...backups].slice(0, 30);
    const nextLogs = [backupLog, ...logs].slice(0, 300);
    setBackups(nextBackups);
    setLogs(nextLogs);

    fetch('/api/cloud/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    }).catch(() => {});

    setStatusBanner(`Хмарний бекап «${snapshot.label}» успішно збережено.`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleRestoreFromBackup = (snapshot: CloudBackupSnapshot) => {
    const nowMs = Date.now();
    const restoredServices = snapshot.payload.services.map((s) => ({
      ...s,
      lastUpdated: new Date(nowMs).toISOString(),
    }));

    const restoreLog: CloudQueryLog = {
      id: `log-restore-bkp-${nowMs}`,
      timestamp: new Date(nowMs).toISOString(),
      epochMs: nowMs,
      serviceId: 'system',
      serviceName: 'Система відновлення SentinelCloud',
      group: 'Інфраструктура',
      queryType: 'RESTORE_STATE',
      queryEndpoint: `/api/cloud/backups/${snapshot.id}`,
      status: 'nominal',
      latencyMs: 19,
      summary: `Відновлено конфігурацію та історію логів із бекапу «${snapshot.label}»`,
      metricsSnapshot: `Відновлено ${restoredServices.length} камер`,
    };

    setServices(restoredServices);
    setCustomWidgets(snapshot.payload.customWidgets || INITIAL_CUSTOM_WIDGETS);
    setLogs([restoreLog, ...(snapshot.payload.logs || [])].slice(0, 300));
    setStatusBanner(`Дані та стан дашбордів відновлено з бекапу «${snapshot.label}».`);
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleApplyGlobalRefreshRate = (sec: number) => {
    setServices((prev) => prev.map((s) => ({ ...s, refreshIntervalSec: sec })));
    setStatusBanner(`Період оновлення для всіх камер встановлено на ${sec} сек.`);
    setTimeout(() => setStatusBanner(null), 3000);
  };

  const expandedService = useMemo(
    () => services.find((s) => s.id === expandedServiceId) || null,
    [services, expandedServiceId]
  );

  const criticalCount = services.filter((s) => s.status === 'critical').length;
  const warningCount = services.filter((s) => s.status === 'warning').length;
  const nominalCount = services.filter((s) => s.status === 'nominal').length;
  const hasDemoServices = services.some((s) => s.serviceType !== 'custom');

  const gridColsClass =
    gridLayout === '1x1'
      ? 'grid-cols-1'
      : gridLayout === '2x2'
      ? 'grid-cols-1 md:grid-cols-2'
      : gridLayout === '3x3'
      ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div
      className={`min-h-screen transition-colors ${
        isDark ? 'bg-[#0B0F17] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`}
    >
      {/* STRICT 3-ZONE TOP BAR CONTRACT WITH REFINED SEGMENTED NAVIGATION */}
      <header
        className={`flex items-center justify-between gap-8 px-6 py-3.5 border-b ${
          isDark ? 'bg-[#0F172A] border-slate-800/90' : 'bg-white border-slate-200'
        }`}
      >
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#wall"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('wall');
          }}
          className={`text-lg font-bold tracking-tight font-display whitespace-nowrap shrink-0 ${
            isDark ? 'text-slate-100 hover:text-sky-300' : 'text-slate-900 hover:text-sky-600'
          } transition-colors`}
        >
          SentinelWall NOC
        </a>

        {/* Zone 2: 5 refined segmented navigation buttons with crisp icons */}
        <nav
          aria-label="Основна навігація"
          className={`hidden lg:flex items-center gap-1.5 p-1.5 rounded-xl border ${
            isDark
              ? 'bg-[#0B0F17]/90 border-slate-800'
              : 'bg-slate-100/90 border-slate-200/90'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('wall')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'wall'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Стіна камер ({services.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('builder')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'builder'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Конструктор Chart.js</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('blackbox')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'blackbox'
                ? 'bg-red-600 text-white font-semibold shadow-sm'
                : criticalCount > 0
                ? 'bg-red-950/60 text-red-300 border border-red-500/40 font-semibold hover:bg-red-900/50'
                : isDark
                ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              Чорна скринька 30с {criticalCount > 0 ? `(${criticalCount} ЗБІЙ)` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'logs'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <DatabaseBackup className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Журнал і Бекапи ({backups.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
              activeTab === 'notifications'
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : isDark
                ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Сповіщення та Звіти</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-xl hover:bg-sky-400 shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Додати сервіс</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (visible on <lg screens, non-sticky so 0% sticky viewport cap) */}
      <div
        className={`lg:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 border-b text-xs font-medium ${
          isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('wall')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'wall'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Стіна камер ({services.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('builder')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'builder'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Конструктор Chart.js</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('blackbox')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'blackbox'
              ? 'bg-red-600 text-white font-semibold'
              : 'text-red-400 font-semibold hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Чорна скринька 30с</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'logs'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <DatabaseBackup className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Журнал і Бекапи</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            activeTab === 'notifications'
              ? 'bg-sky-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Bell className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Сповіщення та Експорт</span>
        </button>
      </div>

      {/* Main Workspace Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Live Toast / Incident Banner */}
        {statusBanner && (
          <div
            role="status"
            className="rounded-xl border border-sky-500/50 bg-sky-950/40 px-4 py-3 text-xs font-medium text-sky-200 flex items-center justify-between gap-4"
          >
            <span>{statusBanner}</span>
            <div className="flex items-center gap-2 shrink-0">
              {criticalCount > 0 && activeTab !== 'blackbox' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('blackbox')}
                  className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors whitespace-nowrap"
                >
                  Переглянути метрики останніх 30с
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-400 hover:text-white"
              >
                Закрити
              </button>
            </div>
          </div>
        )}

        {/* NOC Summary & Global Controls Strip */}
        <section
          aria-label="Панель керування моніторингом"
          className={`rounded-xl border px-4 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 ${
            isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Left: System Telemetry Summary */}
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-3 text-xs font-mono tabular-nums whitespace-nowrap">
            <div>
              <span className="text-slate-400">Статус: </span>
              <span className="font-bold text-emerald-400">{nominalCount} ОК</span>
              <span aria-hidden="true"> · </span>
              <span className="font-bold text-amber-400">{warningCount} УВАГА</span>
              <span aria-hidden="true"> · </span>
              <span className="font-bold text-red-400">{criticalCount} ЗБІЙ</span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              |
            </span>
            <div>
              <span className="text-slate-400">Буфер: </span>
              <span className="text-sky-400 font-semibold">30с (1 Гц)</span>
            </div>
            <span className="text-slate-700" aria-hidden="true">
              |
            </span>
            <div>
              <span className="text-slate-400">Хмара: </span>
              <span className="text-slate-200">
                {new Date(cloudLastSynced).toLocaleTimeString('uk-UA')}
              </span>
            </div>
          </div>

          {/* Right: Stream Controls, Auto-Refresh, Clear Demo, Export PDF/CSV & Theme Toggle */}
          <div className="flex flex-wrap xl:flex-nowrap items-center gap-2">
            {/* Pause / Resume Live Stream */}
            <button
              type="button"
              onClick={() => setIsStreamRunning((prev) => !prev)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isStreamRunning
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
              }`}
            >
              {isStreamRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Потік Live</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Пауза</span>
                </>
              )}
            </button>

            {/* Global Refresh Period Selector */}
            <div className="flex items-center gap-1 text-xs font-mono shrink-0">
              <label htmlFor="global-refresh-select" className="text-slate-400 sr-only">
                Глобальний період оновлення
              </label>
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <select
                id="global-refresh-select"
                aria-label="Глобальний період оновлення всіх камер"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleApplyGlobalRefreshRate(Number(e.target.value));
                  }
                }}
                className={`px-2 py-1.5 text-xs font-mono rounded-lg border ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-200'
                    : 'bg-slate-100 border-slate-300 text-slate-800'
                }`}
              >
                <option value="" disabled>
                  Період (усі)
                </option>
                <option value={1}>Усі: 1 сек</option>
                <option value={2}>Усі: 2 сек</option>
                <option value={5}>Усі: 5 сек</option>
                <option value={10}>Усі: 10 сек</option>
                <option value={30}>Усі: 30 сек</option>
              </select>
            </div>

            {/* Page Auto-Refresh Cycle */}
            <select
              aria-label="Автооновлення сторінки"
              value={pageAutoRefreshSec}
              onChange={(e) => setPageAutoRefreshSec(Number(e.target.value))}
              className={`px-2 py-1.5 text-xs font-mono rounded-lg border shrink-0 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              <option value={0}>Авто-цикл: Вимк</option>
              <option value={15}>
                Авто-цикл: 15с {pageRefreshCountdown > 0 ? `(${pageRefreshCountdown}с)` : ''}
              </option>
              <option value={30}>
                Авто-цикл: 30с {pageRefreshCountdown > 0 ? `(${pageRefreshCountdown}с)` : ''}
              </option>
              <option value={60}>
                Авто-цикл: 60с {pageRefreshCountdown > 0 ? `(${pageRefreshCountdown}с)` : ''}
              </option>
            </select>

            {/* Clear Demo Data (Restore Demo is tucked away deep in settings) */}
            {hasDemoServices && (
              <button
                type="button"
                onClick={requestClearDemoData}
                aria-label="Очистити демонстраційні сервіси та параметри"
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                  isDark
                    ? 'border-red-500/40 text-red-300 hover:bg-red-950/40'
                    : 'border-red-300 text-red-700 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Очистити демо</span>
              </button>
            )}

            {/* Instant Export CSV & PDF */}
            <button
              type="button"
              onClick={() => downloadCsvReport(services, logs, blackboxReports)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => downloadPdfReport(services, logs, blackboxReports)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            {/* Night / Day Theme Toggle */}
            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Увімкнути денну тему' : 'Увімкнути нічну темну тему'}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-slate-700 bg-slate-900 text-sky-300 hover:bg-slate-800'
                  : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {isDark ? (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Нічна</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Денна</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* VIEW 1: CCTV SURVEILLANCE WALL */}
        {activeTab === 'wall' && (
          <section className="space-y-4" aria-label="Стіна камер спостереження за сервісами">
            {/* Group Filter Tabs + Search + Grid Matrix Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Group Segmented Filter Buttons */}
              <div
                role="tablist"
                aria-label="Фільтр сервісів за групами"
                className={`flex items-center gap-1 p-1 rounded-xl border overflow-x-auto ${
                  isDark ? 'bg-[#111827] border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedGroup === 'ALL'}
                  onClick={() => setSelectedGroup('ALL')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    selectedGroup === 'ALL'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : isDark
                      ? 'text-slate-300 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Усі камери ({services.length})
                </button>
                {availableGroups.map((grp) => {
                  const count = services.filter((s) => s.group === grp).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={grp}
                      type="button"
                      role="tab"
                      aria-selected={selectedGroup === grp}
                      onClick={() => setSelectedGroup(grp)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        selectedGroup === grp
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : isDark
                          ? 'text-slate-300 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {grp} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Search & CCTV Matrix Layout Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <label htmlFor="wall-search-input" className="sr-only">
                    Пошук сервісу або камери
                  </label>
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-2"
                    aria-hidden="true"
                  />
                  <input
                    id="wall-search-input"
                    type="text"
                    value={wallSearch}
                    onChange={(e) => setWallSearch(e.target.value)}
                    placeholder="Пошук: Wazuh, Zabbix, Seph, Redis..."
                    className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border ${
                      isDark
                        ? 'bg-[#111827] border-slate-700 text-slate-100'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                {/* CCTV Grid Layout Switcher */}
                <div
                  className={`flex items-center gap-1 p-1 rounded-lg border ${
                    isDark ? 'bg-[#111827] border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" aria-hidden="true" />
                  {(['2x2', '3x2', '3x3', '1x1'] as const).map((layout) => (
                    <button
                      key={layout}
                      type="button"
                      onClick={() => setGridLayout(layout)}
                      className={`px-2 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                        gridLayout === layout
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {layout}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* CCTV Camera Matrix Grid */}
            {services.length === 0 ? (
              <div
                className={`rounded-xl border p-12 text-center ${
                  isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <LayoutGrid className="w-8 h-8 text-sky-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold">
                  Стіна моніторингу готова до підключення ваших сервісів
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Додайте власні сервіси (Wazuh, Zabbix, Ceph/Seph, Redis, RabbitMQ або будь-який API-ендпоінт). Якщо потрібно розгорнути тестовий стенд, це доступно у розділі «Сповіщення та Звіти → Системні налаштування середовища».
                </p>
                <div className="mt-4 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Додати власний сервіс</span>
                  </button>
                </div>
              </div>
            ) : filteredServices.length === 0 ? (
              <div
                className={`rounded-xl border p-12 text-center ${
                  isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <p className="text-sm text-slate-400">
                  За запитом «{wallSearch}» у групі «{selectedGroup}» камер не знайдено.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setWallSearch('');
                    setSelectedGroup('ALL');
                  }}
                  className="mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400"
                >
                  Показати всі камери
                </button>
              </div>
            ) : (
              <div className={`grid ${gridColsClass} gap-4`}>
                {filteredServices.map((srv) => (
                  <CctvCameraTile
                    key={srv.id}
                    service={srv}
                    isDark={isDark}
                    compactMode={gridLayout === '3x3'}
                    onUpdateService={handleUpdateService}
                    onSimulateCrash={handleSimulateCrash}
                    onRecoverService={handleRecoverService}
                    onOpenBlackbox30s={(target) => {
                      setBlackboxTargetServiceId(target.id);
                      setActiveTab('blackbox');
                    }}
                    onExpandCamera={(target) => setExpandedServiceId(target.id)}
                    onDeleteService={requestDeleteService}
                  />
                ))}
              </div>
            )}

            {/* Quick Emergency 30s Blackbox Strip at Bottom of Wall */}
            <div
              className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                isDark ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    Безперервний запис метрик за останні 20–30 секунд (Чорна скринька)
                  </h3>
                  <p className="text-xs text-slate-400">
                    У разі збою будь-якого сервісу система миттєво фіксує останні 30 секунд телеметрії та створює точку відновлення у хмарі
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('blackbox')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-sky-500/50 text-sky-300 hover:bg-sky-950/40 transition-colors whitespace-nowrap"
                >
                  Відкрити інспектор 30 секунд
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateManualBackup('Ручний знімок зі стіни камер')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  Зробити бекап зараз
                </button>
              </div>
            </div>
          </section>
        )}

        {/* VIEW 2: CUSTOM DASHBOARD BUILDER (CHART.JS) */}
        {activeTab === 'builder' && (
          <CustomDashboardView
            services={services}
            widgets={customWidgets}
            isDark={isDark}
            onAddWidget={(w) => setCustomWidgets((prev) => [w, ...prev])}
            onUpdateWidget={(id, patch) =>
              setCustomWidgets((prev) =>
                prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
              )
            }
            onDeleteWidget={requestDeleteWidget}
          />
        )}

        {/* VIEW 3: 20-30s CRASH BLACKBOX FLIGHT RECORDER */}
        {activeTab === 'blackbox' && (
          <Blackbox30sView
            services={services}
            blackboxReports={blackboxReports}
            selectedServiceId={blackboxTargetServiceId}
            isDark={isDark}
            onSelectService={(id) => setBlackboxTargetServiceId(id)}
            onSimulateCrash={handleSimulateCrash}
            onRecoverService={handleRecoverService}
            onDispatchAlert={(channel, msg, srvName) =>
              dispatchNotification(channel, msg, srvName, 'critical')
            }
            onExportCsv={() => downloadCsvReport(services, logs, blackboxReports)}
            onExportPdf={() => downloadPdfReport(services, logs, blackboxReports)}
          />
        )}

        {/* VIEW 4: CLOUD LOGS, SEARCH, DATE FILTERING & BACKUPS */}
        {activeTab === 'logs' && (
          <CloudLogsAndBackupsView
            logs={logs}
            backups={backups}
            availableGroups={availableGroups}
            cloudLastSynced={cloudLastSynced}
            isDark={isDark}
            onCreateBackup={handleCreateManualBackup}
            onRestoreBackup={handleRestoreFromBackup}
          />
        )}

        {/* VIEW 5: TELEGRAM / SLACK NOTIFICATIONS & PDF / CSV EXPORT */}
        {activeTab === 'notifications' && (
          <NotificationsAndExportView
            config={notificationConfig}
            history={notificationHistory}
            isDark={isDark}
            onUpdateConfig={(patch) =>
              setNotificationConfig((prev) => ({ ...prev, ...patch }))
            }
            onClearDemoConfig={requestClearDemoNotificationConfig}
            onClearAllDemoData={requestClearDemoData}
            onRestoreDemoServices={handleRestoreDemoServices}
            onSendTestNotification={async (channel, customText) => {
              await dispatchNotification(
                channel,
                customText || 'Тестовий сигнал SentinelWall NOC',
                'Тест шлюзу NOC',
                'nominal'
              );
            }}
            onExportCsv={() => downloadCsvReport(services, logs, blackboxReports)}
            onExportPdf={() => downloadPdfReport(services, logs, blackboxReports)}
          />
        )}
      </main>

      {/* Licensing & System Footer */}
      <footer
        className={`max-w-[1440px] mx-auto px-4 sm:px-6 py-5 mt-6 border-t text-xs flex flex-col sm:flex-row items-center justify-between gap-2 ${
          isDark
            ? 'border-slate-800/80 text-slate-400'
            : 'border-slate-200 text-slate-500'
        }`}
      >
        <div className="font-medium">
          SentinelWall NOC — Мультисервісна система оперативного відеоспостереження за метриками
        </div>
        <div className="font-mono text-slate-300">
          Omega Development 2026 All right reserved
        </div>
      </footer>

      {/* Modals */}
      <AddServiceModal
        isOpen={isAddModalOpen}
        isDark={isDark}
        existingCount={services.length}
        availableGroups={availableGroups}
        onClose={() => setIsAddModalOpen(false)}
        onAddService={handleAddService}
      />

      <ExpandedCameraModal
        service={expandedService}
        isDark={isDark}
        onClose={() => setExpandedServiceId(null)}
        onSimulateCrash={handleSimulateCrash}
        onRecoverService={handleRecoverService}
        onOpenBlackbox30s={(srv) => {
          setBlackboxTargetServiceId(srv.id);
          setActiveTab('blackbox');
        }}
      />

      <ConfirmDeleteModal
        request={deleteConfirmRequest}
        isDark={isDark}
        onCancel={() => setDeleteConfirmRequest(null)}
        onConfirm={handleConfirmDeleteAction}
      />
    </div>
  );
}

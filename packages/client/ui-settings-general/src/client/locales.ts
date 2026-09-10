/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'connection.error': '连接异常',
  'connection.retry': '立即重连',
  'connection.connecting': '自动重连中',
  'connection.connected': '连接成功',
  'connection.reconnect': '连接异常，点击立即重连',
  'connection.restart': '连接中断，正在自动重试，点击立即重连',
  'startup.newSession.title': '打开应用时创建新对话',
  'startup.newSession.desc': '关闭后将恢复上次打开的对话。',
  'startup.defaultProject.title': '创建新对话时打开默认项目',
  'startup.defaultProject.desc': '关闭时新对话为无项目对话。',
  'startup.defaultProject.choose': '选择默认项目',
  'startup.defaultProject.none': '暂无项目',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Reconnecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Reconnecting automatically, reconnect now',
  'startup.newSession.title': 'Open a new conversation when the app starts',
  'startup.newSession.desc': 'When off, the conversation open before closing is restored.',
  'startup.defaultProject.title': 'Open a default project for new conversations',
  'startup.defaultProject.desc': 'When off, new conversations start without a project.',
  'startup.defaultProject.choose': 'Choose the default project',
  'startup.defaultProject.none': 'No projects yet',
} satisfies Record<SettingsKey, string>

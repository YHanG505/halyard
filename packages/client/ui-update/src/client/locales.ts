/** `update` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'update'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.available': '更新到 {version}',
  'action.updating': '正在更新…',
  'action.ready': '更新完成，正在重启…',
  'action.error': '更新失败，请手动下载',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export type UpdateKey = keyof typeof zh

/** English dictionary. */
export const en: Record<UpdateKey, string> = {
  'action.available': 'Update to {version}',
  'action.updating': 'Updating…',
  'action.ready': 'Updated, restarting…',
  'action.error': 'Update failed; download manually',
}

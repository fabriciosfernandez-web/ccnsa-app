import type { AccountNotification, NotificationPreferences } from './types'

export interface NotificationService {
  listForSocio(socioId: string): Promise<AccountNotification[]>
  countUnread(socioId: string): Promise<number>
  markAsRead(notificationId: string, socioId: string): Promise<void>
  getPreferences(socioId: string): Promise<NotificationPreferences>
  savePreferences(preferences: NotificationPreferences): Promise<void>
}

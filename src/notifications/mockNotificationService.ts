import type { NotificationService } from './NotificationService'
import type { AccountNotification, NotificationPreferences } from './types'

const demoNotifications: AccountNotification[] = [
  {
    id: 'demo-statement-2026-09',
    socioId: 'SOCIO-DEMO',
    kind: 'ACCOUNT_STATEMENT_READY',
    title: 'Tu estado de cuenta está disponible',
    message: 'Ya podés consultar el estado de cuenta correspondiente a septiembre de 2026.',
    status: 'UNREAD',
    createdAt: '2026-09-11T12:00:00-03:00',
    accountPeriod: '2026-09',
    actionUrl: '/socio',
  },
  {
    id: 'demo-payment-posted',
    socioId: 'SOCIO-DEMO',
    kind: 'PAYMENT_POSTED',
    title: 'Pago registrado',
    message: 'Se registró correctamente un pago de demostración en tu cuenta.',
    status: 'READ',
    createdAt: '2026-09-08T09:30:00-03:00',
    readAt: '2026-09-08T10:00:00-03:00',
    amount: 37000,
    currency: 'PYG',
    actionUrl: '/socio',
  },
]

const preferences = new Map<string, NotificationPreferences>()

function defaultPreferences(socioId: string): NotificationPreferences {
  return {
    socioId,
    inApp: true,
    email: true,
    push: false,
    overdueReminders: true,
    paymentConfirmations: true,
    monthlyStatements: true,
  }
}

export const mockNotificationService: NotificationService = {
  async listForSocio(socioId) {
    return demoNotifications.filter((item) => item.socioId === socioId || socioId === 'SOCIO-DEMO')
  },

  async countUnread(socioId) {
    const items = await this.listForSocio(socioId)
    return items.filter((item) => item.status === 'UNREAD').length
  },

  async markAsRead(notificationId, socioId) {
    const item = demoNotifications.find(
      (notification) => notification.id === notificationId && (notification.socioId === socioId || socioId === 'SOCIO-DEMO'),
    )
    if (!item) return
    item.status = 'READ'
    item.readAt = new Date().toISOString()
  },

  async getPreferences(socioId) {
    return preferences.get(socioId) ?? defaultPreferences(socioId)
  },

  async savePreferences(nextPreferences) {
    preferences.set(nextPreferences.socioId, nextPreferences)
  },
}

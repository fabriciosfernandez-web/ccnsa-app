export type NotificationKind =
  | 'ACCOUNT_STATEMENT_READY'
  | 'PAYMENT_POSTED'
  | 'OBLIGATION_POSTED'
  | 'OVERDUE_REMINDER'
  | 'GENERAL_NOTICE'

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH'

export type NotificationStatus = 'UNREAD' | 'READ'

export interface AccountNotification {
  id: string
  socioId: string
  kind: NotificationKind
  title: string
  message: string
  status: NotificationStatus
  createdAt: string
  readAt?: string
  accountPeriod?: string
  amount?: number
  currency?: 'PYG'
  actionUrl?: string
  sourceType?: string
  sourceId?: string
  deduplicationKey?: string
}

export interface NotificationPreferences {
  socioId: string
  inApp: boolean
  email: boolean
  push: boolean
  overdueReminders: boolean
  paymentConfirmations: boolean
  monthlyStatements: boolean
}

export interface NotificationDelivery {
  notificationId: string
  channel: NotificationChannel
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'
  attemptedAt?: string
  providerMessageId?: string
  errorCode?: string
}

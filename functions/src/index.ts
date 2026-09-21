import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

initializeApp()

const database = getFirestore()

type NotificationData = {
  socioId?: unknown
  kind?: unknown
  title?: unknown
  message?: unknown
  actionUrl?: unknown
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function preferenceAllowsKind(kind: string, preferences: Record<string, unknown>) {
  if (preferences.push !== true) return false
  if (kind === 'PAYMENT_POSTED') return preferences.paymentConfirmations !== false
  if (kind === 'OVERDUE_REMINDER') return preferences.overdueReminders !== false
  if (kind === 'ACCOUNT_STATEMENT_READY') return preferences.monthlyStatements !== false
  return true
}

async function writeDelivery(
  notificationId: string,
  payload: Record<string, unknown>,
) {
  await database.collection('notification_deliveries').doc(notificationId).set({
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}

export const deliverNotificationPush = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 30,
    retry: false,
  },
  async (event) => {
    const snapshot = event.data
    const notificationId = event.params.notificationId

    if (!snapshot) return

    const notification = snapshot.data() as NotificationData
    const socioId = stringValue(notification.socioId)
    const title = stringValue(notification.title, 'CCNSA')
    const body = stringValue(notification.message, 'Tenés una nueva notificación.')
    const kind = stringValue(notification.kind, 'GENERAL_NOTICE')
    const actionUrl = stringValue(notification.actionUrl, '/socio/notificaciones')

    try {
      await writeDelivery(notificationId, { status: 'PENDING', socioId, notificationId })

      if (!socioId) {
        await writeDelivery(notificationId, {
          status: 'SKIPPED',
          reason: 'MISSING_SOCIO_ID',
        })
        return
      }

      const preferenceSnapshot = await database
        .collection('notification_preferences')
        .doc(socioId)
        .get()

      const preferences = preferenceSnapshot.exists
        ? preferenceSnapshot.data() ?? {}
        : {}

      if (!preferenceAllowsKind(kind, preferences)) {
        await writeDelivery(notificationId, {
          status: 'SKIPPED',
          reason: 'PUSH_DISABLED_BY_PREFERENCE',
          socioId,
        })
        return
      }

      const subscriptionsSnapshot = await database
        .collection('push_subscriptions')
        .where('socioId', '==', socioId)
        .get()

      const subscriptions = subscriptionsSnapshot.docs
        .map((document) => ({
          ref: document.ref,
          token: stringValue(document.data().token),
          enabled: document.data().enabled === true,
        }))
        .filter((item) => item.enabled && item.token)

      if (subscriptions.length === 0) {
        await writeDelivery(notificationId, {
          status: 'SKIPPED',
          reason: 'NO_ACTIVE_PUSH_SUBSCRIPTIONS',
          socioId,
        })
        return
      }

      const selected = subscriptions.slice(0, 500)
      const result = await getMessaging().sendEachForMulticast({
        tokens: selected.map((item) => item.token),
        data: {
          title,
          body,
          actionUrl: actionUrl.startsWith('/') ? actionUrl : '/socio/notificaciones',
          notificationId,
          kind,
        },
        webpush: {
          headers: {
            TTL: '86400',
            Urgency: kind === 'OVERDUE_REMINDER' ? 'normal' : 'high',
          },
        },
      })

      const invalidCodes = new Set([
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
      ])

      const cleanup: Promise<unknown>[] = []
      result.responses.forEach((response, index) => {
        if (response.success) return
        const code = response.error?.code || ''
        if (invalidCodes.has(code)) {
          cleanup.push(selected[index].ref.delete())
        }
      })
      const cleanupResults = await Promise.allSettled(cleanup)

      await writeDelivery(notificationId, {
        status: result.failureCount === 0 ? 'SENT' : result.successCount > 0 ? 'PARTIAL' : 'FAILED',
        socioId,
        attempted: selected.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        reason: [...new Set(result.responses.flatMap((response) => response.error ? [response.error.code] : []))].join(', '),
        staleSubscriptionsRemoved: cleanupResults.filter((result) => result.status === 'fulfilled').length,
      })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code) : 'PUSH_PROCESSING_FAILED'
      // Do not log device tokens or message content.
      logger.error('Push processing failed', { notificationId, socioId, code })
      await writeDelivery(notificationId, { status: 'FAILED', socioId, reason: code })
    }
  },
)


type ActivityRegistrationAction = {
  actividadId?: unknown
  action?: unknown
  acompanantes?: unknown
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function integerValue(value: unknown, fallback = 0) {
  return Math.trunc(numberValue(value, fallback))
}

function timestampMillis(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return Number.MAX_SAFE_INTEGER
}

async function promoteActivityWaitlist(actividadId: string) {
  const activityRef = database.collection('actividades').doc(actividadId)
  const waitingSnapshot = await database
    .collection('actividad_inscripciones')
    .where('actividadId', '==', actividadId)
    .get()

  const waiting = waitingSnapshot.docs
    .filter((item) => item.data().estado === 'ESPERA')
    .sort((a, b) => timestampMillis(a.data().createdAt) - timestampMillis(b.data().createdAt))

  for (const waitingDoc of waiting) {
    const promoted = await database.runTransaction(async (transaction) => {
      const [activitySnapshot, registrationSnapshot] = await Promise.all([
        transaction.get(activityRef),
        transaction.get(waitingDoc.ref),
      ])

      if (!activitySnapshot.exists || !registrationSnapshot.exists) return false
      const activity = activitySnapshot.data() ?? {}
      const registration = registrationSnapshot.data() ?? {}
      if (registration.estado !== 'ESPERA') return false

      const capacity = Math.max(0, integerValue(activity.cupo))
      const occupied = Math.max(0, integerValue(activity.cuposOcupados))
      const companions = Math.max(0, integerValue(registration.acompanantes))
      const seats = 1 + companions

      if (capacity > 0 && occupied + seats > capacity) return false

      transaction.update(activityRef, {
        cuposOcupados: occupied + seats,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.update(waitingDoc.ref, {
        estado: 'CONFIRMADA',
        updatedAt: FieldValue.serverTimestamp(),
        promotedAt: FieldValue.serverTimestamp(),
      })
      return true
    })

    if (!promoted) break

    const promotedSnapshot = await waitingDoc.ref.get()
    const promotedData = promotedSnapshot.data() ?? {}
    const socioId = stringValue(promotedData.socioId)
    if (socioId) {
      await database.collection('notifications').add({
        socioId,
        kind: 'GENERAL_NOTICE',
        title: 'Cupo disponible',
        message: `Tu inscripción a “${stringValue(promotedData.actividadNombre, 'la actividad')}” quedó confirmada.`,
        status: 'UNREAD',
        actionUrl: '/socio/actividades',
        sourceType: 'activity_waitlist',
        sourceId: waitingDoc.id,
        deduplicationKey: `activity-waitlist:${waitingDoc.id}:${Date.now()}`,
        createdByUid: 'system',
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }
}

export const registerForActivity = onCall(
  {
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Iniciá sesión para inscribirte.')
    }

    const data = (request.data ?? {}) as ActivityRegistrationAction
    const actividadId = stringValue(data.actividadId)
    const action = stringValue(data.action)
    const requestedCompanions = Math.max(0, integerValue(data.acompanantes))

    if (!actividadId) throw new HttpsError('invalid-argument', 'La actividad no está identificada.')
    if (action !== 'CONFIRM' && action !== 'CANCEL') {
      throw new HttpsError('invalid-argument', 'La acción solicitada no es válida.')
    }

    const uid = request.auth.uid
    const userRef = database.collection('users').doc(uid)
    const userSnapshot = await userRef.get()
    const user = userSnapshot.data() ?? {}
    const socioId = stringValue(user.socioId)

    if (!userSnapshot.exists || user.active !== true || user.role !== 'SOCIO' || !socioId) {
      throw new HttpsError('permission-denied', 'Tu usuario no está habilitado como socio.')
    }

    const socioSnapshot = await database.collection('socios').doc(socioId).get()
    const socio = socioSnapshot.data() ?? {}
    const socioNombre = stringValue(socio.nombre, stringValue(user.displayName, 'Socio'))

    const activityRef = database.collection('actividades').doc(actividadId)
    const registrationRef = database.collection('actividad_inscripciones').doc(`${actividadId}__${socioId}`)

    const result = await database.runTransaction(async (transaction) => {
      const [activitySnapshot, registrationSnapshot] = await Promise.all([
        transaction.get(activityRef),
        transaction.get(registrationRef),
      ])

      if (!activitySnapshot.exists) {
        throw new HttpsError('not-found', 'La actividad ya no existe.')
      }

      const activity = activitySnapshot.data() ?? {}
      const activityStatus = stringValue(activity.estado)
      if (activityStatus !== 'PLANIFICADA' && activityStatus !== 'ACTIVA') {
        throw new HttpsError('failed-precondition', 'La actividad ya no admite inscripciones.')
      }

      const previous = registrationSnapshot.exists ? registrationSnapshot.data() ?? {} : {}
      const previousState = stringValue(previous.estado)
      const previousCompanions = Math.max(0, integerValue(previous.acompanantes))
      const previousSeats = previousState === 'CONFIRMADA' ? 1 + previousCompanions : 0
      const occupied = Math.max(0, integerValue(activity.cuposOcupados))
      const capacity = Math.max(0, integerValue(activity.cupo))
      const allowsCompanions = activity.permiteAcompanantes === true
      const maxCompanions = allowsCompanions ? Math.max(0, integerValue(activity.maxAcompanantes)) : 0
      const companions = allowsCompanions ? requestedCompanions : 0
      const cost = Math.max(0, numberValue(activity.costoInscripcion))

      if (companions > maxCompanions) {
        throw new HttpsError('invalid-argument', `Esta actividad admite hasta ${maxCompanions} acompañante(s).`)
      }

      if (action === 'CANCEL') {
        if (!registrationSnapshot.exists || previousState === 'CANCELADA') {
          throw new HttpsError('failed-precondition', 'No tenés una inscripción activa para cancelar.')
        }

        const nextOccupied = Math.max(0, occupied - previousSeats)
        if (previousSeats > 0) {
          transaction.update(activityRef, {
            cuposOcupados: nextOccupied,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
        transaction.update(registrationRef, {
          estado: 'CANCELADA',
          updatedAt: FieldValue.serverTimestamp(),
        })

        return {
          id: registrationRef.id,
          estado: 'CANCELADA',
          acompanantes: previousCompanions,
          estadoPago: stringValue(previous.estadoPago, cost > 0 ? 'PENDIENTE' : 'NO_APLICA'),
          asistencia: stringValue(previous.asistencia, 'PENDIENTE'),
          importeInscripcion: Math.max(0, numberValue(previous.importeInscripcion, cost)),
          cuposOcupados: nextOccupied,
          freedSeats: previousSeats,
        }
      }

      const seats = 1 + companions
      let nextState = 'CONFIRMADA'
      let nextOccupied = occupied

      if (previousState === 'CONFIRMADA') {
        const delta = seats - previousSeats
        if (capacity > 0 && occupied + delta > capacity) {
          throw new HttpsError('resource-exhausted', 'No hay cupos suficientes para agregar acompañantes.')
        }
        nextOccupied = Math.max(0, occupied + delta)
      } else if (capacity > 0 && occupied + seats > capacity) {
        nextState = 'ESPERA'
      } else {
        nextOccupied = occupied + seats
      }

      const paymentStatus = stringValue(previous.estadoPago, cost > 0 ? 'PENDIENTE' : 'NO_APLICA')
      const attendanceStatus = stringValue(previous.asistencia, 'PENDIENTE')

      transaction.set(registrationRef, {
        actividadId,
        actividadNombre: stringValue(activity.nombre, 'Actividad'),
        socioId,
        uid,
        socioNombre,
        estado: nextState,
        acompanantes: companions,
        estadoPago: paymentStatus,
        asistencia: attendanceStatus,
        importeInscripcion: cost,
        createdAt: registrationSnapshot.exists ? previous.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      if (nextOccupied !== occupied) {
        transaction.update(activityRef, {
          cuposOcupados: nextOccupied,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      return {
        id: registrationRef.id,
        estado: nextState,
        acompanantes: companions,
        estadoPago: paymentStatus,
        asistencia: attendanceStatus,
        importeInscripcion: cost,
        cuposOcupados: nextOccupied,
        freedSeats: 0,
      }
    })

    await database.collection('audit_log').add({
      actorUid: uid,
      actorNombre: socioNombre,
      actorRol: 'SOCIO',
      action: action === 'CANCEL' ? 'ACTIVIDAD_REGISTRATION_CANCELLED' : 'ACTIVIDAD_REGISTRATION_REQUESTED',
      entity: 'actividad_inscripciones',
      entityId: result.id,
      actividadId,
      estado: result.estado,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (result.freedSeats > 0) {
      await promoteActivityWaitlist(actividadId)
      const refreshed = await activityRef.get()
      result.cuposOcupados = Math.max(0, integerValue(refreshed.data()?.cuposOcupados))
    }

    return result
  },
)


type PushRecipientStatusRequest = {
  socioId?: unknown
}

export const getPushRecipientStatus = onCall(
  {
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 20,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Iniciá sesión para consultar el estado push.')
    }

    const callerSnapshot = await database.collection('users').doc(request.auth.uid).get()
    const caller = callerSnapshot.data() ?? {}
    if (!callerSnapshot.exists || caller.active !== true || !['ADMIN', 'TESORERIA'].includes(stringValue(caller.role))) {
      throw new HttpsError('permission-denied', 'No tenés permisos para consultar dispositivos push.')
    }

    const socioId = stringValue((request.data ?? {} as PushRecipientStatusRequest).socioId)
    if (!socioId) {
      throw new HttpsError('invalid-argument', 'Seleccioná un socio.')
    }

    const [subscriptionsSnapshot, preferencesSnapshot] = await Promise.all([
      database.collection('push_subscriptions').where('socioId', '==', socioId).get(),
      database.collection('notification_preferences').doc(socioId).get(),
    ])

    const activeDevices = subscriptionsSnapshot.docs.filter((document) => {
      const data = document.data()
      return data.enabled === true && stringValue(data.token).length > 20
    }).length

    const preferences = preferencesSnapshot.exists ? preferencesSnapshot.data() ?? {} : {}

    return {
      socioId,
      activeDevices,
      pushEnabled: preferences.push === true,
      inAppEnabled: preferences.inApp !== false,
      emailEnabled: preferences.email === true,
      deliverable: preferences.push === true && activeDevices > 0,
    }
  },
)


type UserAccessRole = 'SOCIO' | 'TESORERIA' | 'ADMIN' | 'CONSULTA'

async function requireAdminCaller(uid: string) {
  const snapshot = await database.collection('users').doc(uid).get()
  const data = snapshot.data() ?? {}
  if (!snapshot.exists || data.active !== true || data.role !== 'ADMIN') {
    throw new HttpsError('permission-denied', 'Esta operación requiere rol ADMIN.')
  }
  return data
}

export const listUserAccessAccounts = onCall(
  {
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Iniciá sesión para administrar usuarios.')
    }
    await requireAdminCaller(request.auth.uid)

    const authUsers = await getAuth().listUsers(1000)
    const profileRefs = authUsers.users.map((userRecord) => database.collection('users').doc(userRecord.uid))
    const profileSnapshots = profileRefs.length > 0 ? await database.getAll(...profileRefs) : []

    const profileByUid = new Map(
      profileSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() ?? {} : null]),
    )

    const users = authUsers.users.map((userRecord) => {
      const profile = profileByUid.get(userRecord.uid)
      const role = profile ? stringValue(profile.role) : ''
      const allowedRole: UserAccessRole | null = role === 'SOCIO'
        || role === 'TESORERIA'
        || role === 'ADMIN'
        || role === 'CONSULTA'
        ? role
        : null

      return {
        uid: userRecord.uid,
        email: userRecord.email ?? null,
        displayName: stringValue(profile?.displayName, userRecord.displayName ?? userRecord.email ?? 'Usuario'),
        role: allowedRole,
        socioId: profile ? stringValue(profile.socioId) || null : null,
        active: profile?.active === true,
        linked: Boolean(profile),
        authDisabled: userRecord.disabled === true,
        providerIds: userRecord.providerData.map((item) => item.providerId),
        createdAt: userRecord.metadata.creationTime ?? null,
        lastSignInAt: userRecord.metadata.lastSignInTime ?? null,
      }
    })

    users.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
    return { users }
  },
)

type UpdateUserAccessRequest = {
  uid?: unknown
  role?: unknown
  socioId?: unknown
  active?: unknown
}

export const updateUserAccess = onCall(
  {
    minInstances: 0,
    maxInstances: 1,
    memory: '256MiB',
    cpu: 'gcf_gen1',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Iniciá sesión para administrar usuarios.')
    }
    await requireAdminCaller(request.auth.uid)

    const input = (request.data ?? {}) as UpdateUserAccessRequest
    const uid = stringValue(input.uid)
    const role = stringValue(input.role) as UserAccessRole
    const socioId = stringValue(input.socioId)
    const active = input.active === true

    if (!uid) throw new HttpsError('invalid-argument', 'El usuario no está identificado.')
    if (!['SOCIO', 'TESORERIA', 'ADMIN', 'CONSULTA'].includes(role)) {
      throw new HttpsError('invalid-argument', 'El rol seleccionado no es válido.')
    }
    if (role === 'SOCIO' && !socioId) {
      throw new HttpsError('invalid-argument', 'Seleccioná el socio que corresponde a esta cuenta.')
    }

    if (uid === request.auth.uid && (!active || role !== 'ADMIN')) {
      throw new HttpsError(
        'failed-precondition',
        'No podés desactivar tu propia cuenta ADMIN ni quitarte el rol de administrador.',
      )
    }

    let authUser
    try {
      authUser = await getAuth().getUser(uid)
    } catch {
      throw new HttpsError('not-found', 'La cuenta ya no existe en Firebase Authentication.')
    }

    let socioNombre = ''
    if (role === 'SOCIO') {
      const socioSnapshot = await database.collection('socios').doc(socioId).get()
      if (!socioSnapshot.exists) {
        throw new HttpsError('not-found', 'El socio seleccionado no existe.')
      }
      const socio = socioSnapshot.data() ?? {}
      socioNombre = stringValue(socio.nombre, authUser.displayName ?? authUser.email ?? 'Socio')

      if (active && stringValue(socio.estado, 'ACTIVO') !== 'ACTIVO') {
        throw new HttpsError('failed-precondition', 'No se puede activar el acceso de un socio inactivo.')
      }

      const duplicates = await database.collection('users').where('socioId', '==', socioId).get()
      const otherActive = duplicates.docs.find((document) => (
        document.id !== uid && document.data().active === true
      ))
      if (otherActive) {
        throw new HttpsError('already-exists', 'Ese socio ya está vinculado a otra cuenta activa.')
      }
    }

    const targetRef = database.collection('users').doc(uid)
    const auditRef = database.collection('audit_log').doc()
    const existingSnapshot = await targetRef.get()
    const existing = existingSnapshot.data() ?? {}

    const displayName = role === 'SOCIO'
      ? socioNombre
      : stringValue(existing.displayName, authUser.displayName ?? authUser.email ?? 'Usuario')

    const payload: Record<string, unknown> = {
      displayName,
      email: authUser.email ?? null,
      role,
      active,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: request.auth.uid,
    }

    if (role === 'SOCIO') payload.socioId = socioId
    else payload.socioId = FieldValue.delete()

    if (!existingSnapshot.exists) {
      payload.createdAt = FieldValue.serverTimestamp()
    }

    const batch = database.batch()
    batch.set(targetRef, payload, { merge: true })
    batch.set(auditRef, {
      actorUid: request.auth.uid,
      action: existingSnapshot.exists ? 'USER_ACCESS_UPDATED' : 'USER_ACCESS_CREATED',
      entity: 'users',
      entityId: uid,
      targetEmail: authUser.email ?? null,
      previousRole: stringValue(existing.role) || null,
      role,
      previousActive: existing.active === true,
      active,
      previousSocioId: stringValue(existing.socioId) || null,
      socioId: role === 'SOCIO' ? socioId : null,
      createdAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    return {
      uid,
      displayName,
      email: authUser.email ?? null,
      role,
      socioId: role === 'SOCIO' ? socioId : null,
      active,
      linked: true,
      authDisabled: authUser.disabled === true,
      providerIds: authUser.providerData.map((item) => item.providerId),
      createdAt: authUser.metadata.creationTime ?? null,
      lastSignInAt: authUser.metadata.lastSignInTime ?? null,
    }
  },
)

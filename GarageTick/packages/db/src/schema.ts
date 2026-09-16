/**
 * GarageTick schema — see docs/02-modelo-datos.md.
 *
 * Three rules that run through everything:
 *  1. Multi-tenant since the very first migration. `tenantId` on EVERY table.
 *     Costs nothing today; redoing it at site #8 costs the project.
 *  2. Nothing is deleted. Soft deletes and audit trails.
 *  3. The server sets the timestamps (`defaultNow`). The clocks on the shop
 *     floor PCs are always wrong.
 *
 * Naming: identifiers are English; user-facing labels stay in Spanish and live
 * in shared/constants.ts. Two names dodge Postgres reserved words on purpose:
 * `app_user` (not `user`) and `work_order` (not `order`), so a hand-written
 * query never needs quoting.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────
// These mirror packages/shared/src/constants.ts. Change one, change the other.

export const roleEnum = pgEnum('role', [
  'super_admin',
  'admin',
  'shop_manager',
  'front_desk',
  'mechanic',
])

/**
 * Who pays for the job. This is the DMS "cargo" field, and it is the split the
 * dealership actually reports on: warranty hours are paid by the manufacturer,
 * late and badly; customer hours are margin; internal hours are pure cost.
 */
export const chargeEnum = pgEnum('charge', ['customer', 'warranty', 'internal', 'other'])

export const workOrderStatusEnum = pgEnum('work_order_status', [
  'open',
  'in_progress',
  'on_hold',
  'finished',
  'invoiced',
  'cancelled',
])
export const holdReasonEnum = pgEnum('hold_reason', [
  'parts',
  'customer_approval',
  'warranty_approval',
  'diagnosis',
  'lift',
  'customer_appointment',
  'other',
])
export const operationStatusEnum = pgEnum('operation_status', ['pending', 'in_progress', 'done'])
export const closedByEnum = pgEnum('closed_by', ['mechanic', 'auto', 'manager'])
export const deviceTypeEnum = pgEnum('device_type', ['kiosk', 'desktop'])
export const workOrderSourceEnum = pgEnum('work_order_source', ['manual', 'dms', 'import'])
export const scanOutcomeEnum = pgEnum('scan_outcome', ['ok', 'rejected', 'error'])

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// ─── Organization ─────────────────────────────────────────────────────────────

/** One tenant = one dealership. A group may own many. */
export const tenant = pgTable('tenant', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt,
  updatedAt,
})

export const branch = pgTable(
  'branch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    name: text('name').notNull(),
    address: text('address'),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [index('ix_branch_tenant').on(t.tenantId)],
)

/** Per-tenant configuration. See SETTING_DEFAULTS in shared/constants.ts. */
export const setting = pgTable(
  'setting',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt,
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
)

/**
 * Which features each tenant has switched on.
 *
 * Deliberately separate from `setting`, even though both are key/value per
 * tenant: `setting` holds shop preferences that the customer's own admin edits,
 * while this is what the customer paid for and only a `super_admin` touches it.
 * If it lived in `setting`, their admin could switch on a paid feature.
 *
 * See FEATURES in shared/constants.ts.
 */
export const feature = pgTable(
  'feature',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    key: text('key').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    /** Why it is the way it is: paid for, trial until a date, cut off for non-payment. */
    note: text('note'),
    updatedBy: uuid('updated_by').references(() => appUser.id),
    updatedAt,
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
)

// ─── People and access ────────────────────────────────────────────────────────

export const appUser = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    branchId: uuid('branch_id').references(() => branch.id),
    employeeNumber: text('employee_number').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    /** Null for mechanics: they clock in by QR, they never log into the web app. */
    passwordHash: text('password_hash'),
    role: roleEnum('role').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('ux_app_user_employee_number').on(t.tenantId, t.employeeNumber),
    uniqueIndex('ux_app_user_email')
      .on(t.email)
      .where(sql`email IS NOT NULL`),
    index('ix_app_user_tenant').on(t.tenantId),
  ],
)

/**
 * Deliberately separate from `app_user`: if a card breaks or goes missing it is
 * revoked and reissued without touching the mechanic's session history.
 */
export const credential = pgTable(
  'credential',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    /** 8 base32 chars. This is what goes inside the signed QR. */
    code: text('code').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
  },
  (t) => [
    index('ix_credential_user').on(t.userId),
    index('ix_credential_active')
      .on(t.tenantId)
      .where(sql`revoked_at IS NULL`),
  ],
)

/** The kiosk authenticates as a device; each scan carries the mechanic's identity. */
export const device = pgTable(
  'device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branch.id),
    name: text('name').notNull(),
    type: deviceTypeEnum('type').notNull(),
    tokenHash: text('token_hash').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt,
  },
  (t) => [index('ix_device_tenant').on(t.tenantId)],
)

// ─── Work ─────────────────────────────────────────────────────────────────────

export const vehicle = pgTable(
  'vehicle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    licensePlate: text('license_plate'),
    vin: text('vin'),
    make: text('make'),
    model: text('model'),
    year: smallint('year'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    createdAt,
  },
  (t) => [index('ix_vehicle_license_plate').on(t.tenantId, t.licensePlate)],
)

export const workOrder = pgTable(
  'work_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branch.id),
    /** Our own number. Works even if the DMS is never integrated. */
    number: text('number').notNull(),
    /** The number in Oversoft, once integrated. See docs/04-oversoft.md. */
    dmsNumber: text('dms_number'),
    /** 8 base32 chars inside the QR on the label. */
    qrCode: text('qr_code').notNull().unique(),
    charge: chargeEnum('charge').notNull(),
    /** The raw charge value the DMS returned, kept verbatim. If the mapping to
     * `charge` turns out wrong, it is recomputed from this instead of reimporting. */
    dmsChargeRaw: text('dms_charge_raw'),
    vehicleId: uuid('vehicle_id').references(() => vehicle.id),
    description: text('description'),
    status: workOrderStatusEnum('status').notNull().default('open'),
    priority: smallint('priority').notNull().default(0),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** Trabajo declarado terminado, y quién lo declaró. */
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    finishedById: uuid('finished_by_id').references(() => appUser.id),
    /** Orden cerrada del todo (entregada o facturada), y quién la cerró. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedById: uuid('closed_by_id').references(() => appUser.id),
    createdById: uuid('created_by_id').references(() => appUser.id),
    source: workOrderSourceEnum('source').notNull().default('manual'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('ux_work_order_number').on(t.tenantId, t.branchId, t.number),
    index('ix_work_order_status').on(t.tenantId, t.branchId, t.status),
    index('ix_work_order_dms').on(t.tenantId, t.dmsNumber),
  ],
)

export const operation = pgTable(
  'operation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    code: text('code'),
    description: text('description').notNull(),
    status: operationStatusEnum('status').notNull().default('pending'),
    /** Manufacturer flat-rate time. Null in phase 1; unlocks efficiency in phase 2. */
    flatRateMinutes: integer('flat_rate_minutes'),
    displayOrder: smallint('display_order').notNull().default(0),
    createdAt,
  },
  (t) => [index('ix_operation_work_order').on(t.workOrderId)],
)

/**
 * A session = one mechanic clocked into one work order. It is NOT the status of
 * the work order. A warranty job sitting in the shop for 5 days is many short
 * closed sessions plus hold periods, never one 5-day session.
 */
export const workSession = pgTable(
  'work_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    operationId: uuid('operation_id').references(() => operation.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').generatedAlwaysAs(
      sql`EXTRACT(EPOCH FROM (ended_at - started_at))::int`,
    ),
    closedBy: closedByEnum('closed_by'),
    startDeviceId: uuid('start_device_id').references(() => device.id),
    endDeviceId: uuid('end_device_id').references(() => device.id),
    /** Came in through the offline queue: the timestamp is the kiosk's, so it is not trusted. */
    deferred: boolean('deferred').notNull().default(false),
    note: text('note'),
    createdAt,
  },
  (t) => [
    // The hottest query in the system: does this mechanic have anything open?
    index('ix_work_session_open')
      .on(t.userId)
      .where(sql`ended_at IS NULL`),
    index('ix_work_session_work_order').on(t.workOrderId),
    index('ix_work_session_range').on(t.tenantId, t.userId, t.startedAt),
  ],
  // NOTE: there is deliberately no partial unique on (userId) where ended_at is
  // null. The "one work order at a time" rule is per-tenant configuration
  // (work_order_concurrency) and is still undefined — it is enforced in the app.
  // See docs/00-relevamiento.md A2.
)

/** Vehicle dead time. This is what explains a 6-day lead time. */
export const workOrderHold = pgTable(
  'work_order_hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    reason: holdReasonEnum('reason').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    note: text('note'),
    /**
     * Quién registró la espera y quién la dio por resuelta. Hacen falta los dos:
     * sin ellos no se puede reconstruir por qué un auto estuvo parado ni quién
     * lo destrabó, que es la discusión que aparece cuando el lead time es malo.
     */
    recordedById: uuid('recorded_by_id').references(() => appUser.id),
    resolvedById: uuid('resolved_by_id').references(() => appUser.id),
  },
  (t) => [
    index('ix_work_order_hold_work_order').on(t.workOrderId),
    index('ix_work_order_hold_open')
      .on(t.tenantId)
      .where(sql`ended_at IS NULL`),
  ],
)

// ─── Audit ────────────────────────────────────────────────────────────────────

/** Every time correction is recorded. Reason is mandatory. */
export const sessionAdjustment = pgTable(
  'session_adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workSession.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    reason: text('reason').notNull(),
    createdAt,
  },
  (t) => [index('ix_session_adjustment_session').on(t.sessionId)],
)

/**
 * EVERY scan is logged, whether it resolves or fails. When a mechanic says "I
 * did scan and it didn't take", this table is the answer. Costs nothing, worth
 * a fortune. It also feeds the latency panel (a phase 1 acceptance criterion).
 */
export const scanEvent = pgTable(
  'scan_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    deviceId: uuid('device_id').references(() => device.id),
    rawCode: text('raw_code').notNull(),
    detectedType: text('detected_type'),
    userId: uuid('user_id').references(() => appUser.id),
    workOrderId: uuid('work_order_id').references(() => workOrder.id),
    outcome: scanOutcomeEnum('outcome').notNull(),
    action: text('action'),
    message: text('message'),
    latencyMs: integer('latency_ms'),
    deferred: boolean('deferred').notNull().default(false),
    idempotencyKey: uuid('idempotency_key'),
    createdAt,
  },
  (t) => [
    uniqueIndex('ux_scan_event_idempotency')
      .on(t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('ix_scan_event_date').on(t.tenantId, t.createdAt),
  ],
)

// ─── Phase 2 ──────────────────────────────────────────────────────────────────

/** Mechanic clock in/out. Needed for productivity = clocked hours / hours present. */
export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id),
    date: date('date').notNull(),
    clockIn: timestamp('clock_in', { withTimezone: true }),
    clockOut: timestamp('clock_out', { withTimezone: true }),
    source: text('source').notNull().default('manual'),
  },
  (t) => [uniqueIndex('ux_attendance').on(t.userId, t.date)],
)

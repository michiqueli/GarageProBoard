/**
 * Constants shared between the API and the front end.
 *
 * Identifiers are English; the values travel in the database and over the wire.
 * The *_LABEL maps stay in Spanish on purpose: they are what a mechanic in the
 * shop reads on screen.
 */

export const ROLES = ['super_admin', 'admin', 'shop_manager', 'front_desk', 'mechanic'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super administrador',
  admin: 'Administrador',
  shop_manager: 'Jefe de taller',
  front_desk: 'Recepción',
  mechanic: 'Mecánico',
}

/**
 * Features switched on per tenant. Only a `super_admin` touches these: they are
 * what the customer paid for, not a shop preference. Operational preferences go
 * in the `setting` table, which the customer's own admin manages.
 */
export const FEATURES = [
  'dms_read',
  'remote_access',
  'roi_report',
  'offline_queue',
  'thermal_label',
  'flat_rate',
  'attendance',
] as const
export type Feature = (typeof FEATURES)[number]

export const FEATURE_LABEL: Record<Feature, string> = {
  dms_read: 'Lectura de órdenes del DMS',
  remote_access: 'Acceso desde fuera del taller',
  roi_report: 'Reporte mensual de ROI',
  offline_queue: 'Cola offline del kiosco',
  thermal_label: 'Impresión de etiquetas térmicas',
  flat_rate: 'Tiempos baremo y eficiencia',
  attendance: 'Registro de jornada',
}

/**
 * Who pays for the job — the DMS "cargo" field. This is the split the
 * dealership reports on: warranty hours are paid by the manufacturer, late and
 * badly; customer hours are margin; internal hours are pure cost.
 *
 * Deliberately the smallest set that is certainly correct. Adding a value later
 * is a one-line, non-destructive migration; merging values once rows use them
 * is the expensive direction. PDI folds into `internal` until the shop asks to
 * measure it on its own.
 */
export const CHARGES = ['customer', 'warranty', 'internal', 'other'] as const
export type Charge = (typeof CHARGES)[number]

export const CHARGE_LABEL: Record<Charge, string> = {
  customer: 'Cliente',
  warranty: 'Garantía',
  internal: 'Interno',
  other: 'Otro',
}

export const WORK_ORDER_STATUSES = [
  'open',
  'in_progress',
  'on_hold',
  'finished',
  'invoiced',
  'cancelled',
] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: 'Abierta',
  in_progress: 'En proceso',
  on_hold: 'En espera',
  finished: 'Terminada',
  invoiced: 'Facturada',
  cancelled: 'Anulada',
}

/** Statuses in which the work order still accepts clock-ins. */
export const ACTIVE_WORK_ORDER_STATUSES = ['open', 'in_progress', 'on_hold'] as const

/**
 * Dead time by reason is what explains why a car sat in the shop for 6 days.
 * It is the number the dealership cares about most.
 */
export const HOLD_REASONS = [
  'parts',
  'customer_approval',
  'warranty_approval',
  'diagnosis',
  'lift',
  'customer_appointment',
  'other',
] as const
export type HoldReason = (typeof HOLD_REASONS)[number]

export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  parts: 'Esperando repuestos',
  customer_approval: 'Esperando autorización del cliente',
  warranty_approval: 'Esperando autorización de garantía',
  diagnosis: 'En diagnóstico',
  lift: 'Esperando elevador',
  customer_appointment: 'Esperando turno del cliente',
  other: 'Otro',
}

export const OPERATION_STATUSES = ['pending', 'in_progress', 'done'] as const
export type OperationStatus = (typeof OPERATION_STATUSES)[number]

export const CLOSED_BY = ['mechanic', 'auto', 'manager'] as const
export type ClosedBy = (typeof CLOSED_BY)[number]

export const DEVICE_TYPES = ['kiosk', 'desktop'] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const WORK_ORDER_SOURCES = ['manual', 'dms', 'import'] as const
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number]

export const SCAN_OUTCOMES = ['ok', 'rejected', 'error'] as const
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number]

/**
 * How to resolve a mechanic scanning a work order while another one is open.
 * Not yet decided by the shop manager — see docs/00-relevamiento.md A2.
 * That is why it is per-tenant configuration and not a constant in the code.
 */
export const CONCURRENCY_MODES = ['single', 'multiple', 'multiple_prorated'] as const
export type ConcurrencyMode = (typeof CONCURRENCY_MODES)[number]

export const SETTING_DEFAULTS = {
  /** 'single' = scanning another work order closes the previous one. Default until decided. */
  work_order_concurrency: 'single' satisfies ConcurrencyMode,
  /** Auto-close time for forgotten sessions (HH:mm, shop local time). */
  auto_close_time: '18:30',
  /** Seconds between the credential scan and the work order scan before going back to IDLE. */
  scan_timeout_seconds: '25',
  /** Shop time zone. */
  timezone: 'America/Argentina/Buenos_Aires',
} as const

/**
 * Kiosk latency budget — see docs/01-arquitectura.md.
 * This is requirement #1 of the product: the customer abandoned the Oversoft
 * module because it was slow. If this is missed, nothing else matters.
 */
export const LATENCY = {
  /** On-screen feedback resolved against the local cache, without waiting for the server. */
  FEEDBACK_MAX_MS: 50,
  /** Server confirmation on a LAN or nearby VPS. Does not block the screen. */
  CONFIRMATION_MAX_MS: 200,
  /** Total perceived by the mechanic, decoding time included. */
  TOTAL_TARGET_MS: 500,
  /** Phase 1 acceptance criterion: median of a full clock-in. */
  CLOCK_IN_MEDIAN_TARGET_MS: 3000,
  /** Phase 1 acceptance criterion: p95 of a full clock-in. */
  CLOCK_IN_P95_TARGET_MS: 5000,
} as const

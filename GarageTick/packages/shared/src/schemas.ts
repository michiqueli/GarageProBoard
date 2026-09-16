/** API contracts, validated the same way on the front end and the back end. */

import { z } from 'zod'
import {
  CHARGES,
  CLOSED_BY,
  CONCURRENCY_MODES,
  HOLD_REASONS,
  ROLES,
  WORK_ORDER_STATUSES,
} from './constants.js'

export const roleSchema = z.enum(ROLES)
export const chargeSchema = z.enum(CHARGES)
export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES)
export const holdReasonSchema = z.enum(HOLD_REASONS)
export const closedBySchema = z.enum(CLOSED_BY)
export const concurrencyModeSchema = z.enum(CONCURRENCY_MODES)

// ─── Scanning ─────────────────────────────────────────────────────────────────

/**
 * One kiosk scan. `occurredAt` only travels when the event sat in the offline
 * queue: the server stamps the time in every other case, because the clocks on
 * the shop floor PCs are always wrong.
 */
export const scanInputSchema = z.object({
  raw: z.string().min(1).max(200),
  /** Kiosk-local id: makes the POST idempotent when the queue retries. */
  idempotencyKey: z.string().uuid(),
  deferred: z.boolean().default(false),
  occurredAt: z.string().datetime().optional(),
  /** Milliseconds between the scan and the send. Feeds the latency panel. */
  latencyMs: z.number().int().min(0).max(600_000).optional(),
})
export type ScanInput = z.infer<typeof scanInputSchema>

export const scanActionSchema = z.enum([
  'mechanic_identified',
  'session_opened',
  'session_closed',
  'session_replaced',
  'mechanic_switched',
  'cancelled',
  'rejected',
])
export type ScanAction = z.infer<typeof scanActionSchema>

/**
 * Scan response. `message` is short, large text for the kiosk: the mechanic is
 * two metres away with dirty hands and does not read paragraphs.
 */
export const scanResultSchema = z.object({
  action: scanActionSchema,
  ok: z.boolean(),
  message: z.string(),
  mechanic: z
    .object({ id: z.string().uuid(), name: z.string(), employeeNumber: z.string() })
    .nullable(),
  workOrder: z
    .object({ id: z.string().uuid(), number: z.string(), description: z.string().nullable() })
    .nullable(),
  /** Sessions still open for that mechanic, so the screen can show them. */
  openSessions: z.array(
    z.object({
      sessionId: z.string().uuid(),
      workOrderId: z.string().uuid(),
      workOrderNumber: z.string(),
      startedAt: z.string().datetime(),
    }),
  ),
})
export type ScanResult = z.infer<typeof scanResultSchema>

// ─── Kiosk cache ──────────────────────────────────────────────────────────────

/**
 * What the kiosk syncs so it can resolve a scan in under 50 ms with no network.
 * It does not include the HMAC secret: the kiosk identifies by lookup, the
 * server is what validates the signature.
 */
export const kioskCacheSchema = z.object({
  version: z.string(),
  generatedAt: z.string().datetime(),
  credentials: z.array(
    z.object({
      code: z.string(),
      userId: z.string().uuid(),
      name: z.string(),
      employeeNumber: z.string(),
    }),
  ),
  workOrders: z.array(
    z.object({
      code: z.string(),
      workOrderId: z.string().uuid(),
      number: z.string(),
      description: z.string().nullable(),
      status: workOrderStatusSchema,
    }),
  ),
  settings: z.object({
    workOrderConcurrency: concurrencyModeSchema,
    scanTimeoutSeconds: z.number().int().positive(),
  }),
})
export type KioskCache = z.infer<typeof kioskCacheSchema>

// ─── Work orders ──────────────────────────────────────────────────────────────

export const createWorkOrderSchema = z.object({
  number: z.string().min(1).max(40),
  dmsNumber: z.string().max(40).optional(),
  charge: chargeSchema,
  description: z.string().max(1000).optional(),
  licensePlate: z.string().max(15).optional(),
  make: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  customerName: z.string().max(160).optional(),
})
export type CreateWorkOrder = z.infer<typeof createWorkOrderSchema>

export const changeWorkOrderStatusSchema = z.object({
  status: workOrderStatusSchema,
  holdReason: holdReasonSchema.optional(),
  note: z.string().max(500).optional(),
})

// ─── Manager corrections ──────────────────────────────────────────────────────

/**
 * The reason is mandatory on purpose. Without an audit trail on corrections the
 * system loses credibility the first week a time comes out wrong.
 */
export const adjustSessionSchema = z.object({
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(3).max(500),
})
export type AdjustSession = z.infer<typeof adjustSessionSchema>

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
})

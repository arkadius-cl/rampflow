import { blockingFeature, catalog } from '@rampflow/shared';
import { totalLoadUnits } from '@rampflow/shared/modules/avis/avis';
import type { BookingEventData } from '@rampflow/shared/modules/booking/events';
import {
  type BookingCommand,
  COMMAND_INPUTS,
  COMMANDS,
  type CommandActor,
  type CommandDef,
  type CommandInput,
  type CommandName,
  type CommandOf,
  punctualityOf,
  sourceStates,
} from '@rampflow/shared/modules/booking/lifecycle';
import {
  BookingEventType,
  BookingParty,
  BookingStatus,
  CarrierLinkStatus,
} from '@rampflow/shared/modules/booking/values';
import { DockStatus } from '@rampflow/shared/modules/core/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { acknowledgementStatus } from '@rampflow/shared/modules/safety/validity';
import { AckStatus, InstructionSafety, SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import {
  ConflictReason,
  EmailTemplate,
  ErrorCode,
  Module,
  Permission,
  Setting,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { CarrierId, DockId } from '../../../db/ids.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { changedFields, checkAvis, readAvis, setPlateSeen, writeAvis } from '../../avis/avis.ts';
import { dock, tenantCarrierLink } from '../../core/schema.ts';
import { conflictOnUnique, invalid } from '../../core/sites/tenant.ts';
import {
  activeDriverLink,
  issueDriverLink,
  linkExpiryFor,
  revokeDriverLink,
  setDriverLinkExpiry,
} from '../../driver/access.ts';
import { applicableInstructions } from '../../safety/authoring/published.ts';
import {
  type AcknowledgementId,
  bookingAcknowledgement,
  safetyAcknowledgement,
  safetyVersion,
} from '../../safety/schema.ts';
import { lockSiteCapacity } from '../capacity/lock.ts';
import { type ResourceId, resourceDock } from '../schema.resources.ts';
import { booking, bookingEvent } from '../schema.ts';
import { actorUserId, type BookingContext, eventActor } from './context.ts';
import {
  blockOf,
  candidates,
  conflictWithOffers,
  findFit,
  isOffered,
  loadTypeAt,
  windowOf,
} from './fit.ts';
import {
  isPastCutoff,
  minutesFromStart,
  noShowCheckInOpen,
  noShowDueAt,
  visitEndLinkExpiry,
} from './guards.ts';
import { type BookingRow, emailContacts, emailFacts } from './notify.ts';
import { bookingSafety } from './safety.ts';

// The only writer of booking.status (ADR-0005). One command: lock the row, check the actor and
// the source state, run the guards, write the row and one event, then the side effects, all in
// the caller's transaction.

type Patch = Partial<Omit<typeof booking.$inferInsert, 'id' | 'status' | 'version'>>;

interface Step {
  patch: Patch;
  event: BookingEventData;
  /** Side effects after the row and the event are written. */
  after?: () => Promise<void>;
}

interface Handler<K extends CommandName> {
  /** The booking already shows this command with this input: answer 200 without an event. */
  done(ctx: BookingContext, b: BookingRow, cmd: CommandOf<K>): boolean | Promise<boolean>;
  apply(ctx: BookingContext, b: BookingRow, cmd: CommandOf<K>): Promise<Step>;
}

export interface TransitionResult {
  booking: BookingRow;
  /** `false` for an idempotent repeat. */
  changed: boolean;
}

const conflict = (reason: ConflictReason, details: Record<string, unknown> = {}) =>
  new ApiError(ErrorCode.conflict, `Conflict: ${reason}`, { reason, ...details });

const setting = <K extends Parameters<BookingContext['access']['setting']>[0]>(
  ctx: BookingContext,
  key: K,
  b: BookingRow,
) => ctx.access.setting(key, b.siteId).then((r) => r.value);

const zoneOf = (b: BookingRow) => b.siteTimeZone as TimeZone;

/** A dock of the booking's site that can take a truck: 404 elsewhere, 409 when not active. */
async function usableDock(ctx: BookingContext, b: BookingRow, dockId: DockId) {
  const [row] = await ctx.tx
    .select({ id: dock.id, status: dock.status })
    .from(dock)
    .where(and(eq(dock.id, dockId), eq(dock.siteId, b.siteId), eq(dock.tenantId, b.tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found, 'No such dock at this site');
  if (row.status !== DockStatus.active) throw conflict(ConflictReason.dock_inactive, { dockId });
  return row.id;
}

async function outsideResource(ctx: BookingContext, b: BookingRow, dockId: DockId) {
  const [member] = await ctx.tx
    .select({ dockId: resourceDock.dockId })
    .from(resourceDock)
    .where(and(eq(resourceDock.resourceId, b.resourceId), eq(resourceDock.dockId, dockId)));
  return member === undefined;
}

async function expireLinkAfterVisit(ctx: BookingContext, b: BookingRow) {
  const hours = await setting(ctx, Setting.privacy.retention.driver_link_hours, b);
  await setDriverLinkExpiry(ctx.tx, b.id, visitEndLinkExpiry(ctx.now, b.startsAt, hours));
}

function staleVersion(b: BookingRow, version: number) {
  if (version !== b.version) throw conflict(ConflictReason.stale_version, { version: b.version });
}

/** Dock commands: the dock given (and usable) or the one already assigned. */
async function dockFor(ctx: BookingContext, b: BookingRow, given: string | undefined) {
  if (given) return usableDock(ctx, b, given as DockId);
  if (b.dockId) return b.dockId;
  throw invalid(['dockId'], 'Choose a dock');
}

const HANDLERS: { [K in CommandName]: Handler<K> } = {
  reschedule: {
    done: (_ctx, b, cmd) =>
      b.startsAt.getTime() === cmd.startsAt.getTime() &&
      (cmd.resourceId === undefined || cmd.resourceId === b.resourceId),
    async apply(ctx, b, cmd) {
      staleVersion(b, cmd.version);
      const force = cmd.forceReason !== undefined;
      if (
        force &&
        (ctx.actor.party !== BookingParty.staff ||
          !ctx.access.permissions.has(Permission.booking.force))
      ) {
        throw new ApiError(ErrorCode.forbidden, 'Missing booking.force');
      }
      const lt = await loadTypeAt(ctx.tx, b.tenantId, b.siteId, b.loadTypeId);
      if (!lt) throw new Error(`booking ${b.id} without load type`);
      const block = {
        durationMinutes: (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000,
        bufferMinutes: (b.blocksUntil.getTime() - b.endsAt.getTime()) / 60_000,
      };
      const audience = ctx.actor.party === BookingParty.carrier ? 'carrier' : 'staff';
      const scope = {
        tenantId: b.tenantId,
        siteId: b.siteId,
        loadTypeId: b.loadTypeId,
        loadUnits: b.loadUnits,
        audience,
        excludeBookingId: b.id,
      } as const;
      await lockSiteCapacity(ctx.tx, b.siteId);
      const zone = zoneOf(b);
      const day = siteDay(cmd.startsAt, zone);
      if (!(await isOffered(ctx.access, b.siteId, zone, cmd.startsAt, audience, ctx.now))) {
        return conflictWithOffers(
          ctx.tx,
          ctx.access,
          ctx.now,
          scope,
          day,
          ConflictReason.not_offered,
        );
      }
      const only = cmd.resourceId as ResourceId | undefined;
      const tryOrder = await candidates(ctx.tx, b.tenantId, lt, { only, preferred: b.resourceId });
      if (only && tryOrder.length === 0) {
        throw invalid(['resourceId'], 'The load type cannot be booked on this resource');
      }
      const fit = await findFit(ctx.tx, ctx.access, {
        tenantId: b.tenantId,
        siteId: b.siteId,
        zone,
        startsAt: cmd.startsAt,
        block,
        candidates: tryOrder,
        excludeBookingId: b.id,
        force,
      });
      if (!fit.ok) return conflictWithOffers(ctx.tx, ctx.access, ctx.now, scope, day, fit.reason);
      const to = { resourceId: fit.resourceId, ...windowOf(cmd.startsAt, block) };
      const previous = { startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() };
      return {
        patch: { ...to, forced: force },
        event: {
          type: BookingEventType.rescheduled,
          from: { resourceId: b.resourceId, ...previous },
          to: {
            resourceId: to.resourceId,
            startsAt: to.startsAt.toISOString(),
            endsAt: to.endsAt.toISOString(),
          },
          forced: force,
          forceReason: cmd.forceReason ?? null,
        },
        after: async () => {
          await setDriverLinkExpiry(ctx.tx, b.id, linkExpiryFor(to.startsAt));
          if (ctx.actor.party === BookingParty.staff) {
            const updated = { ...b, ...to };
            await emailContacts(ctx, updated, EmailTemplate.booking_changed, {
              change: 'rescheduled',
              previous,
            });
          }
        },
      };
    },
  },

  update_avis: {
    async done(ctx, b, cmd) {
      const stored = await readAvis(ctx.tx, b.id);
      return stored !== null && changedFields(stored, cmd.avis).length === 0;
    },
    async apply(ctx, b, cmd) {
      staleVersion(b, cmd.version);
      const units = totalLoadUnits(cmd.avis);
      let window = { startsAt: b.startsAt, endsAt: b.endsAt, blocksUntil: b.blocksUntil };
      let durationChanged = false;
      // The site lock also serializes avis.unique_references between two edits or a create.
      let locked = false;
      const lock = async () => {
        if (!locked) await lockSiteCapacity(ctx.tx, b.siteId);
        locked = true;
      };
      if (units !== b.loadUnits) {
        const lt = await loadTypeAt(ctx.tx, b.tenantId, b.siteId, b.loadTypeId);
        if (!lt) throw new Error(`booking ${b.id} without load type`);
        const block = blockOf(lt, units, ctx.access);
        durationChanged =
          block.durationMinutes * 60_000 !== b.endsAt.getTime() - b.startsAt.getTime();
        if (durationChanged) {
          window = windowOf(b.startsAt, block);
          // From check-in on the truck carries what it carries: no capacity check (AV-02).
          if (b.status === BookingStatus.confirmed) {
            await lock();
            const fit = await findFit(ctx.tx, ctx.access, {
              tenantId: b.tenantId,
              siteId: b.siteId,
              zone: zoneOf(b),
              startsAt: b.startsAt,
              block,
              candidates: [b.resourceId],
              excludeBookingId: b.id,
              force: false,
            });
            if (!fit.ok) throw conflict(ConflictReason.capacity_full);
          }
        }
      }
      if ((await setting(ctx, Setting.avis.unique_references, b)) === true) await lock();
      await checkAvis(ctx.tx, ctx.access, b, cmd.avis);
      const before = await readAvis(ctx.tx, b.id);
      const fields = before ? changedFields(before, cmd.avis) : Object.keys(cmd.avis);
      await writeAvis(ctx.tx, b, cmd.avis, { updatedBy: actorUserId(ctx.actor), now: ctx.now });
      return {
        patch: { loadUnits: units, endsAt: window.endsAt, blocksUntil: window.blocksUntil },
        event: { type: BookingEventType.avis_updated, fields, durationChanged },
        after: async () => {
          if (ctx.actor.party === BookingParty.staff && b.status === BookingStatus.confirmed) {
            await emailContacts(ctx, { ...b, ...window }, EmailTemplate.booking_changed, {
              change: 'avis',
              previous: null,
            });
          }
        },
      };
    },
  },

  cancel: {
    done: (_ctx, b) => b.status === BookingStatus.cancelled,
    async apply(ctx, b, cmd) {
      const cutoff = await setting(ctx, Setting.booking.cancel_cutoff_minutes, b);
      const late = isPastCutoff(ctx.now, b.startsAt, cutoff);
      return {
        patch: { cancelledAt: ctx.now, cancelReason: cmd.reason, cancelledLate: late },
        event: { type: BookingEventType.cancelled, reason: cmd.reason, late },
        after: async () => {
          await revokeDriverLink(ctx.tx, b.id, ctx.now);
          if (ctx.actor.party === BookingParty.staff) {
            await emailContacts(ctx, b, EmailTemplate.booking_cancelled, { reason: cmd.reason });
          }
        },
      };
    },
  },

  regenerate_driver_link: {
    done: () => false,
    async apply(ctx, b) {
      return {
        patch: {},
        event: { type: BookingEventType.driver_link_regenerated },
        after: async () => {
          await revokeDriverLink(ctx.tx, b.id, ctx.now);
          await issueDriverLink(ctx.tx, b, {
            channel: DriverChannel.link,
            createdBy: actorUserId(ctx.actor),
          });
        },
      };
    },
  },

  send_driver_link: {
    done: () => false,
    async apply(ctx, b, cmd) {
      const link = await activeDriverLink(ctx.tx, b.id);
      if (!link) throw new ApiError(ErrorCode.not_found, 'The booking has no active driver link');
      return {
        patch: {},
        event: { type: BookingEventType.driver_link_sent, locale: cmd.locale },
        after: async () => {
          const facts = await emailFacts(ctx, b);
          await enqueueEmail(
            ctx.tx,
            {
              template: EmailTemplate.driver_link,
              to: cmd.email,
              locale: cmd.locale,
              tenantId: b.tenantId,
              payload: {
                locale: cmd.locale,
                driverAccessId: link.id,
                code: facts.code,
                site: facts.site,
                startsAt: facts.startsAt,
                endsAt: facts.endsAt,
                timeZone: facts.timeZone,
              },
            },
            ctx.access.entitlements,
          );
        },
      };
    },
  },

  mark_no_show: {
    done: (_ctx, b) => b.status === BookingStatus.no_show,
    async apply(ctx, b) {
      const entitlements = ctx.access.entitlements;
      if (!entitlements?.modules.yard) {
        const key = entitlements
          ? blockingFeature(catalog, entitlements, Module.yard)
          : 'yard.checkin_qr';
        throw new ApiError(ErrorCode.entitlement_required, 'Module yard is off', { key });
      }
      const dueAt = noShowDueAt(
        b.startsAt,
        await setting(ctx, Setting.yard.no_show_after_minutes, b),
      );
      if (ctx.now < dueAt) throw conflict(ConflictReason.not_due, { dueAt: dueAt.toISOString() });
      return {
        patch: { noShowAt: dueAt },
        event: { type: BookingEventType.no_show, dueAt: dueAt.toISOString() },
        after: () =>
          emailContacts(ctx, b, EmailTemplate.booking_no_show, { dueAt: dueAt.toISOString() }),
      };
    },
  },

  check_in: {
    async done(ctx, b, cmd) {
      if (b.status !== BookingStatus.checked_in) return false;
      if (cmd.plateSeen === null) return true;
      return (await readAvis(ctx.tx, b.id))?.plateSeen === cmd.plateSeen;
    },
    async apply(ctx, b, cmd) {
      const fromNoShow = b.status === BookingStatus.no_show;
      if (fromNoShow && !(b.noShowAt && noShowCheckInOpen(ctx.now, b.noShowAt, zoneOf(b)))) {
        throw conflict(ConflictReason.invalid_transition, { status: b.status });
      }
      const safety = await bookingSafety(ctx.tx, ctx.access, b, ctx.now);
      if (safety.enforced && safety.status === SafetyStatus.missing) {
        throw conflict(ConflictReason.safety_missing, {
          instructionIds: safety.instructions
            .filter((i) => i.status === InstructionSafety.missing)
            .map((i) => i.instructionId),
        });
      }
      // A walk-in has no slot to be punctual for; a check-in from no_show is late (YD-02).
      let punctuality = null;
      let punctualityMinutes = null;
      if (!b.walkIn) {
        const exact = minutesFromStart(ctx.now, b.startsAt);
        punctualityMinutes = Math.round(exact);
        punctuality = fromNoShow
          ? ('late' as const)
          : punctualityOf(
              exact,
              await setting(ctx, Setting.yard.early_tolerance_minutes, b),
              await setting(ctx, Setting.yard.grace_minutes, b),
            );
      }
      return {
        patch: { checkedInAt: ctx.now, punctuality, punctualityMinutes },
        event: {
          type: BookingEventType.checked_in,
          punctuality,
          punctualityMinutes,
          plateRecorded: cmd.plateSeen !== null,
          safety:
            safety.status === SafetyStatus.valid
              ? 'valid'
              : safety.status === SafetyStatus.missing
                ? 'missing_warned'
                : 'not_required',
          fromNoShow,
        },
        after: async () => {
          if (cmd.plateSeen !== null) await setPlateSeen(ctx.tx, b.id, cmd.plateSeen);
        },
      };
    },
  },

  turn_away: {
    done: (_ctx, b, cmd) =>
      b.status === BookingStatus.turned_away && b.turnAwayReason === cmd.reason,
    async apply(ctx, b, cmd) {
      return {
        patch: { turnedAwayAt: ctx.now, turnAwayReason: cmd.reason },
        event: { type: BookingEventType.turned_away, reason: cmd.reason, fromStatus: b.status },
        after: () => expireLinkAfterVisit(ctx, b),
      };
    },
  },

  call: {
    done: (_ctx, b, cmd) => b.status === BookingStatus.called && b.dockId === cmd.dockId,
    async apply(ctx, b, cmd) {
      const dockId = await usableDock(ctx, b, cmd.dockId as DockId);
      const outside = await outsideResource(ctx, b, dockId);
      const reassign = b.status === BookingStatus.called && b.dockId !== null;
      return {
        patch: { dockId, calledAt: reassign ? b.calledAt : ctx.now },
        event:
          reassign && b.dockId
            ? {
                type: BookingEventType.reassigned,
                fromDockId: b.dockId,
                toDockId: dockId,
                outsideResource: outside,
              }
            : { type: BookingEventType.called, dockId, outsideResource: outside },
      };
    },
  },

  uncall: {
    done: (_ctx, b) => b.status === BookingStatus.checked_in && b.dockId === null,
    async apply(_ctx, b) {
      if (!b.dockId) throw new Error(`called booking ${b.id} without a dock`);
      return {
        patch: { dockId: null, calledAt: null },
        event: { type: BookingEventType.uncalled, dockId: b.dockId },
      };
    },
  },

  dock: {
    done: (_ctx, b, cmd) =>
      b.status === BookingStatus.at_dock && (cmd.dockId === undefined || cmd.dockId === b.dockId),
    async apply(ctx, b, cmd) {
      const dockId = await dockFor(ctx, b, cmd.dockId);
      return {
        patch: { dockId, atDockAt: ctx.now },
        event: { type: BookingEventType.at_dock, dockId },
      };
    },
  },

  start_loading: {
    done: (_ctx, b, cmd) =>
      b.status === BookingStatus.loading && (cmd.dockId === undefined || cmd.dockId === b.dockId),
    async apply(ctx, b, cmd) {
      const dockId = await dockFor(ctx, b, cmd.dockId);
      return {
        patch: { dockId, loadingAt: ctx.now },
        event: { type: BookingEventType.loading_started, dockId },
      };
    },
  },

  complete: {
    done: (_ctx, b, cmd) =>
      b.status === BookingStatus.done &&
      b.actualLoadUnits === cmd.actualLoadUnits &&
      b.discrepancyNote === cmd.discrepancyNote,
    async apply(ctx, b, cmd) {
      if (!b.dockId) throw new Error(`booking ${b.id} in ${b.status} without a dock`);
      return {
        patch: {
          doneAt: ctx.now,
          actualLoadUnits: cmd.actualLoadUnits,
          discrepancyNote: cmd.discrepancyNote,
        },
        event: {
          type: BookingEventType.done,
          dockId: b.dockId,
          actualLoadUnits: cmd.actualLoadUnits,
          discrepancy: cmd.actualLoadUnits !== b.loadUnits || cmd.discrepancyNote !== null,
        },
      };
    },
  },

  depart: {
    done: (_ctx, b) => b.status === BookingStatus.departed,
    async apply(ctx, b, cmd) {
      if (b.status !== BookingStatus.done && cmd.reason === null) {
        throw invalid(['reason'], 'Leaving before the load is done needs a reason');
      }
      return {
        patch: { departedAt: ctx.now, departureReason: cmd.reason },
        event: { type: BookingEventType.departed, fromStatus: b.status, reason: cmd.reason },
        after: () => expireLinkAfterVisit(ctx, b),
      };
    },
  },

  link_acknowledgement: {
    async done(ctx, b, cmd) {
      const [linked] = await ctx.tx
        .select({ id: bookingAcknowledgement.acknowledgementId })
        .from(bookingAcknowledgement)
        .where(
          and(
            eq(bookingAcknowledgement.bookingId, b.id),
            eq(
              bookingAcknowledgement.acknowledgementId,
              cmd.acknowledgementId as AcknowledgementId,
            ),
          ),
        );
      return linked !== undefined;
    },
    async apply(ctx, b, cmd) {
      const [ack] = await ctx.tx
        .select({
          id: safetyAcknowledgement.id,
          instructionId: safetyAcknowledgement.instructionId,
          bookingId: safetyAcknowledgement.bookingId,
          expiresAt: safetyAcknowledgement.expiresAt,
          restrictedAt: safetyAcknowledgement.restrictedAt,
          version: safetyVersion.version,
        })
        .from(safetyAcknowledgement)
        .innerJoin(safetyVersion, eq(safetyVersion.id, safetyAcknowledgement.versionId))
        .where(
          and(
            eq(safetyAcknowledgement.id, cmd.acknowledgementId as AcknowledgementId),
            eq(safetyAcknowledgement.tenantId, b.tenantId),
          ),
        );
      if (!ack) throw new ApiError(ErrorCode.not_found, 'No such acknowledgement');
      const instruction = (
        await applicableInstructions(ctx.tx, { tenantId: b.tenantId, siteId: b.siteId })
      ).find((i) => i.instructionId === ack.instructionId);
      const status = instruction
        ? acknowledgementStatus(ack, {
            now: ctx.now,
            bookingId: b.id,
            materialFloor: instruction.materialFloor,
          })
        : 'not_applicable';
      if (status !== AckStatus.valid || ack.restrictedAt !== null) {
        throw conflict(ConflictReason.acknowledgement_invalid, { status });
      }
      const link = {
        acknowledgementId: ack.id,
        via: cmd.via,
        linkedByParty: eventActor(ctx.actor).actorParty,
        linkedByUserId: actorUserId(ctx.actor),
      };
      await ctx.tx
        .insert(bookingAcknowledgement)
        .values({
          bookingId: b.id,
          instructionId: ack.instructionId,
          tenantId: b.tenantId,
          siteId: b.siteId,
          ...link,
        })
        .onConflictDoUpdate({
          target: [bookingAcknowledgement.bookingId, bookingAcknowledgement.instructionId],
          set: link,
        });
      return {
        patch: {},
        event: {
          type: BookingEventType.safety_linked,
          instructionId: ack.instructionId,
          acknowledgementId: ack.id,
          via: cmd.via,
        },
      };
    },
  },
};

function parseCommand(input: CommandInput): BookingCommand {
  const { type, ...rest } = input;
  const parsed = COMMAND_INPUTS[type].safeParse(rest);
  if (!parsed.success) {
    throw new ApiError(ErrorCode.validation_failed, 'Invalid command', {
      issues: parsed.error.issues.map(({ path, code, message }) => ({
        path: path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        code,
        message,
      })),
    });
  }
  return { type, ...parsed.data } as BookingCommand;
}

async function carrierGuards(ctx: BookingContext, b: BookingRow, actor: CommandActor) {
  if (ctx.actor.party !== BookingParty.carrier) return;
  if (actor.activeLink) {
    const [link] = await ctx.tx
      .select({ status: tenantCarrierLink.status })
      .from(tenantCarrierLink)
      .where(
        and(
          eq(tenantCarrierLink.tenantId, b.tenantId),
          eq(tenantCarrierLink.carrierId, ctx.actor.carrierId as CarrierId),
        ),
      );
    if (link?.status !== CarrierLinkStatus.active) {
      throw new ApiError(ErrorCode.forbidden, 'The carrier link is deactivated', {
        reason: 'link_inactive',
      });
    }
  }
  if (actor.beforeCutoff) {
    const cutoff = await setting(ctx, Setting.booking.cancel_cutoff_minutes, b);
    if (isPastCutoff(ctx.now, b.startsAt, cutoff)) throw conflict(ConflictReason.cutoff_passed);
  }
}

/**
 * Runs one lifecycle command on a booking (booking lifecycle, "Commands"). 404 when the caller's
 * scope cannot see the booking, 403 for a party or permission the table does not allow, 409
 * `invalid_transition` from any other source state, and 200 without a new event for a repeat.
 */
export async function transitionBooking(
  ctx: BookingContext,
  bookingId: string,
  input: CommandInput,
): Promise<TransitionResult> {
  const cmd = parseCommand(input);
  const [b] = await ctx.tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, bookingId as BookingRow['id']), eq(booking.tenantId, ctx.tenantId)))
    .for('update');
  if (!b) throw new ApiError(ErrorCode.not_found);

  const def: CommandDef = COMMANDS[cmd.type];
  const actor = def.actors[ctx.actor.party];
  if (!actor) throw new ApiError(ErrorCode.forbidden, `${ctx.actor.party} cannot ${cmd.type}`);
  if (actor.permission && !ctx.access.permissions.has(actor.permission)) {
    throw new ApiError(ErrorCode.forbidden, `Missing ${actor.permission}`);
  }
  if (def.entitlement && !ctx.access.entitlements?.features[def.entitlement]) {
    throw new ApiError(ErrorCode.entitlement_required, `${def.entitlement} is off`, {
      key: def.entitlement,
    });
  }

  const handler = HANDLERS[cmd.type] as Handler<CommandName>;
  // A repeat is idempotent only from a source state or from the command's own target state.
  const reachable = sourceStates(cmd.type, ctx.actor.party).includes(b.status);
  if ((reachable || b.status === def.to) && (await handler.done(ctx, b, cmd as never))) {
    return { booking: b, changed: false };
  }
  if (!reachable) {
    throw conflict(ConflictReason.invalid_transition, { status: b.status });
  }
  await carrierGuards(ctx, b, actor);

  const step = await handler.apply(ctx, b, cmd as never);
  const status = def.to ?? b.status;
  let updated = b;
  if (status !== b.status || Object.keys(step.patch).length > 0) {
    const write = () =>
      ctx.tx
        .update(booking)
        .set({ ...step.patch, status, version: b.version + 1, updatedAt: ctx.now })
        .where(eq(booking.id, b.id))
        .returning();
    // A savepoint, so a second truck on a dock answers 409 and the handler can still read.
    const [row] = await ctx.tx
      .transaction(write)
      .catch((e: unknown) =>
        conflictOnUnique(e, 'booking_dock_occupied', ConflictReason.dock_occupied),
      );
    if (!row) throw new Error(`booking ${b.id} vanished under its row lock`);
    updated = row;
  }
  const { type, ...data } = step.event;
  await ctx.tx.insert(bookingEvent).values({
    tenantId: b.tenantId,
    siteId: b.siteId,
    bookingId: b.id,
    carrierId: b.carrierId,
    type,
    fromStatus: b.status,
    toStatus: status,
    at: ctx.now,
    ...eventActor(ctx.actor),
    data,
  });
  await step.after?.();
  return { booking: updated, changed: true };
}

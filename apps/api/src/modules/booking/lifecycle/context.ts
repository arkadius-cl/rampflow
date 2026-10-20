import type { ActorParty } from '@rampflow/shared/modules/booking/values';
import type { DriverChannel } from '@rampflow/shared/modules/driver/values';
import type { SystemActorName } from '@rampflow/shared/values';
import type { Context } from 'hono';
import type { BookingId, CarrierId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import type { AppEnv } from '../../../kernel/env.ts';

/** Who issues a booking command, derived from the request scope (ADR-0002, ADR-0005). */
export type BookingActor =
  | { party: 'staff'; userId: UserId }
  | { party: 'carrier'; userId: UserId; carrierId: CarrierId }
  | { party: 'driver'; bookingId: BookingId; channel: DriverChannel }
  | { party: 'system'; job: SystemActorName };

/** Everything a lifecycle function needs: the request transaction, the actor, access and now. */
export interface BookingContext {
  tx: Tx;
  tenantId: TenantId;
  actor: BookingActor;
  access: Access;
  now: Date;
}

export function bookingContext(c: Context<AppEnv>): BookingContext {
  const { scope, access, db } = c.var;
  const now = c.var.clock.now();
  switch (scope.party) {
    case 'tenant':
      return {
        tx: db,
        tenantId: scope.tenantId,
        actor:
          scope.actor.kind === 'user'
            ? { party: 'staff', userId: scope.actor.userId }
            : { party: 'system', job: scope.actor.job },
        access,
        now,
      };
    case 'carrier_at_tenant':
      return {
        tx: db,
        tenantId: scope.tenantId,
        actor: { party: 'carrier', userId: scope.userId, carrierId: scope.carrierId },
        access,
        now,
      };
    case 'driver':
      return {
        tx: db,
        tenantId: scope.tenantId,
        actor: { party: 'driver', bookingId: scope.bookingId, channel: scope.channel },
        access,
        now,
      };
    default:
      throw new Error(`booking command under party ${scope.party}`);
  }
}

export const actorUserId = (actor: BookingActor): UserId | null =>
  actor.party === 'staff' || actor.party === 'carrier' ? actor.userId : null;

/** `booking_event.actor_*` columns. */
export function eventActor(actor: BookingActor): {
  actorParty: ActorParty;
  actorUserId: UserId | null;
  actorJob: string | null;
} {
  const party = {
    staff: 'tenant',
    carrier: 'carrier',
    driver: 'driver',
    system: 'system',
  } as const;
  return {
    actorParty: party[actor.party],
    actorUserId: actorUserId(actor),
    actorJob: actor.party === 'system' ? actor.job : null,
  };
}

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { CreatedParty, Punctuality } from '../../packages/shared/src/modules/booking/values.ts';
import type { WorldSide } from './auth.ts';

// Report fixtures (U11), written as the owner: the ten visits of the reference fixture in
// docs/reference/booking-lifecycle.md, on a fixed past Tuesday so every booking is due.

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set; run through pnpm test:e2e');
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/** The fixture day: a Tuesday in CET (UTC+1), long past. */
export const REFERENCE_DAY = '2026-02-10';

const at = (hhmm: string) => new Date(`${REFERENCE_DAY}T${hhmm}:00+01:00`);

interface Visit {
  start: string;
  party: 'carrier' | 'staff';
  status: string;
  walkIn?: boolean;
  punctuality?: 'early' | 'on_time' | 'late';
  checkedIn?: string;
  called?: string;
  atDock?: string;
  loading?: string;
  done?: string;
  departed?: string;
  noShow?: string;
  cancelled?: string;
  cancelledLate?: boolean;
}

const VISITS: Visit[] = [
  {
    start: '08:00',
    party: CreatedParty.carrier,
    status: 'departed',
    punctuality: Punctuality.on_time,
    checkedIn: '07:50',
    atDock: '08:05',
    done: '08:50',
    departed: '09:00',
  },
  {
    start: '09:00',
    party: CreatedParty.carrier,
    status: 'departed',
    punctuality: Punctuality.early,
    checkedIn: '08:20',
    atDock: '09:10',
    done: '10:00',
    departed: '10:15',
  },
  {
    start: '10:00',
    party: CreatedParty.staff,
    status: 'departed',
    punctuality: Punctuality.late,
    checkedIn: '10:30',
    called: '10:35',
    atDock: '10:40',
    loading: '10:45',
    done: '11:40',
    departed: '12:45',
  },
  {
    start: '11:00',
    party: CreatedParty.carrier,
    status: 'departed',
    punctuality: Punctuality.late,
    noShow: '12:00',
    checkedIn: '12:30',
    atDock: '12:40',
    done: '13:20',
    departed: '13:30',
  },
  { start: '12:00', party: CreatedParty.carrier, status: 'no_show', noShow: '13:00' },
  {
    start: '13:00',
    party: CreatedParty.carrier,
    status: 'cancelled',
    cancelled: '12:00',
    cancelledLate: true,
  },
  {
    start: '14:00',
    party: CreatedParty.carrier,
    status: 'cancelled',
    cancelled: '08:00',
    cancelledLate: false,
  },
  {
    start: '15:00',
    party: CreatedParty.staff,
    status: 'departed',
    punctuality: Punctuality.on_time,
    checkedIn: '14:55',
    loading: '15:05',
    done: '15:45',
    departed: '15:50',
  },
  {
    start: '16:00',
    party: CreatedParty.staff,
    status: 'departed',
    walkIn: true,
    checkedIn: '16:10',
    atDock: '16:20',
    done: '17:00',
    departed: '17:10',
  },
  {
    start: '17:00',
    party: CreatedParty.carrier,
    status: 'done',
    punctuality: Punctuality.on_time,
    checkedIn: '16:50',
    atDock: '17:00',
    done: '17:30',
  },
];

/**
 * Opens site 0 from 06:00 to 22:00 every day and seeds the reference visits on it. Returns the
 * booking codes in slot order.
 */
export async function seedReferenceVisits(side: WorldSide): Promise<string[]> {
  const siteId = side.sites[0]?.id;
  const { rows } = await db().query<{ resource_id: string; load_type_id: string }>(
    `select r.id as resource_id, l.id as load_type_id from bookable_resource r
     join load_type l on l.site_id = r.site_id where r.site_id = $1 limit 1`,
    [siteId],
  );
  const ids = rows[0];
  if (!ids) throw new Error('world site without resource or load type');
  for (let weekday = 1; weekday <= 7; weekday++) {
    await db().query(
      `insert into opening_hours (tenant_id, site_id, weekday, opens, closes)
       values ($1, $2, $3, '06:00', '22:00')`,
      [side.tenantId, siteId, weekday],
    );
  }
  const codes: string[] = [];
  for (const v of VISITS) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    const startsAt = at(v.start);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const stamp = (hhmm: string | undefined) => (hhmm ? at(hhmm) : null);
    const minutes = v.checkedIn
      ? Math.round((at(v.checkedIn).getTime() - startsAt.getTime()) / 60_000)
      : null;
    await db().query(
      `insert into booking (tenant_id, site_id, resource_id, load_type_id, carrier_id, carrier_name,
         code, status, direction, starts_at, ends_at, blocks_until, site_time_zone, load_units,
         created_party, walk_in, punctuality, punctuality_minutes, checked_in_at, called_at,
         at_dock_at, loading_at, done_at, departed_at, no_show_at, cancelled_at, cancelled_late)
       values ($1, $2, $3, $4, $5, 'Spedition Nowak', $6, $7, 'inbound', $8, $9, $9,
         'Europe/Berlin', 10, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        side.tenantId,
        siteId,
        ids.resource_id,
        ids.load_type_id,
        side.carrierId,
        code,
        v.status,
        startsAt,
        endsAt,
        v.party,
        v.walkIn ?? false,
        v.punctuality ?? null,
        v.punctuality ? minutes : null,
        stamp(v.checkedIn),
        stamp(v.called),
        stamp(v.atDock),
        stamp(v.loading),
        stamp(v.done),
        stamp(v.departed),
        stamp(v.noShow),
        stamp(v.cancelled),
        v.cancelledLate ?? false,
      ],
    );
    codes.push(code);
  }
  return codes;
}

/** Sets the UI and CSV language of a user. */
export async function setLocale(userId: string, locale: 'de' | 'en' | 'pl'): Promise<void> {
  await db().query('update app_user set locale = $1 where id = $2', [locale, userId]);
}

/** Writes driver data into the avis of a booking, as a carrier's avis would carry it. */
export async function setDriver(
  bookingId: string,
  driver: { name: string; phone: string | null; plate: string | null },
): Promise<void> {
  await db().query(
    'update avis set driver_name = $1, driver_phone = $2, plate = $3 where booking_id = $4',
    [driver.name, driver.phone, driver.plate, bookingId],
  );
}

export async function avisOf(bookingId: string) {
  const { rows } = await db().query<{
    driver_name: string | null;
    driver_phone: string | null;
    plate: string | null;
    pseudonymized_at: Date | null;
  }>('select driver_name, driver_phone, plate, pseudonymized_at from avis where booking_id = $1', [
    bookingId,
  ]);
  return rows[0];
}

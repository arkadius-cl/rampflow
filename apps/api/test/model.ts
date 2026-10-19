import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashToken, wrapJson } from '../src/db/ids.ts';
import {
  carrierInvitation,
  carrierRegistration,
  publicLink,
} from '../src/modules/booking/schema.carriers.ts';
import {
  closure,
  loadTypeResource,
  openingHours,
  resourceDock,
} from '../src/modules/booking/schema.resources.ts';
import { tenantLogo } from '../src/modules/brand/schema.ts';
import { entitlementOverride, invitation, settingValue } from '../src/modules/core/schema.ts';
import { outboxMessage } from '../src/modules/notify/schema.ts';
import { privacyRequestLog } from '../src/modules/privacy/schema.ts';
import {
  bookingAcknowledgement,
  safetyAcknowledgement,
  safetyAttempt,
  safetyContent,
  safetyInstruction,
  safetyInstructionSite,
  safetyPass,
  safetyVersion,
} from '../src/modules/safety/schema.ts';
import type { OwnerDb } from './db.ts';
import type { World, WorldSide } from './world.ts';

// One row or more in every table of the data model that world() leaves empty, for both sides,
// so the RLS matrix has something to hide in each table.

export interface ModelTokens {
  /** Raw token of side A's tenant staff invitation. */
  invitationA: string;
  /** Deletes the platform-level rows `seedModel` inserted. */
  removePlatformRows: () => Promise<void>;
}

async function side(o: OwnerDb, w: World, s: WorldSide, label: string): Promise<string> {
  const by = w.platformAdmin.id;
  const [site0, site1] = s.sites;
  const token = `inv-${label}-${randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);
  await o.insert(invitation).values([
    {
      orgId: s.tenantId,
      orgKind: 'tenant',
      email: `invitee-${label}-${randomUUID()}@model.test`,
      role: 'dispatcher',
      tokenHash: hashToken(token),
      expiresAt,
    },
    {
      orgId: s.carrierId,
      orgKind: 'carrier',
      email: `carrier-invitee-${randomUUID()}@model.test`,
      role: 'carrier_user',
      tokenHash: hashToken(`${token}-carrier`),
      expiresAt,
    },
  ]);
  await o.insert(entitlementOverride).values({
    tenantId: s.tenantId,
    key: 'core.max_sites',
    value: wrapJson(null),
    updatedBy: by,
  });
  await o.insert(settingValue).values([
    { tenantId: s.tenantId, key: 'yard.grace_minutes', value: wrapJson(10), updatedBy: by },
    {
      tenantId: s.tenantId,
      siteId: site0.id,
      key: 'yard.grace_minutes',
      value: wrapJson(5),
      updatedBy: by,
    },
    {
      tenantId: s.tenantId,
      siteId: site1.id,
      key: 'yard.grace_minutes',
      value: wrapJson(6),
      updatedBy: by,
    },
  ]);
  for (const site of s.sites) {
    await o.insert(resourceDock).values({
      dockId: site.dockIds[0],
      resourceId: site.resourceId,
      resourceKind: 'pool',
      siteId: site.id,
      tenantId: s.tenantId,
    });
    await o.insert(openingHours).values({
      tenantId: s.tenantId,
      siteId: site.id,
      weekday: 1,
      opens: '06:00',
      closes: '22:00',
    });
    await o.insert(closure).values({
      tenantId: s.tenantId,
      siteId: site.id,
      kind: 'closed',
      startsLocal: '2026-12-24 00:00:00',
      endsLocal: '2026-12-25 00:00:00',
      source: 'manual',
    });
    await o.insert(loadTypeResource).values({
      loadTypeId: site.loadTypeId,
      resourceId: site.resourceId,
      siteId: site.id,
      tenantId: s.tenantId,
    });
  }
  await o.insert(carrierInvitation).values({
    tenantId: s.tenantId,
    companyName: 'Invited Spedition',
    email: `ci-${randomUUID()}@model.test`,
    tokenHash: hashToken(`${token}-ci`),
    invitedBy: s.users.tenant_admin.id,
    expiresAt,
  });
  await o.insert(publicLink).values({
    slug: randomBytes(5).toString('hex'),
    tenantId: s.tenantId,
    siteId: site0.id,
  });
  await o.insert(carrierRegistration).values({
    tenantId: s.tenantId,
    siteId: site0.id,
    companyName: 'Registered Spedition',
    country: 'PL',
    contactName: 'Contact Person',
    email: `reg-${randomUUID()}@model.test`,
    carrierId: s.carrierId,
    status: 'approved',
  });

  const instructionId = randomUUID();
  await o.insert(safetyInstruction).values({
    id: instructionId as never,
    tenantId: s.tenantId,
    name: 'Site rules',
    allSites: false,
  });
  await o.insert(safetyInstructionSite).values({
    instructionId: instructionId as never,
    siteId: site0.id,
    tenantId: s.tenantId,
  });
  const published = randomUUID();
  const draft = randomUUID();
  await o.insert(safetyVersion).values([
    {
      id: published as never,
      tenantId: s.tenantId,
      instructionId: instructionId as never,
      version: 1,
      status: 'published',
    },
    {
      id: draft as never,
      tenantId: s.tenantId,
      instructionId: instructionId as never,
      version: 2,
      status: 'draft',
    },
  ]);
  for (const versionId of [published, draft]) {
    await o.insert(safetyContent).values({
      versionId: versionId as never,
      locale: 'en',
      tenantId: s.tenantId,
      title: 'Rules',
      blocks: [{ kind: 'text', text: 'Wear a vest.' }],
      statement: 'I understood.',
      translation: 'source',
      contentHash: hashToken(versionId),
    });
  }
  const ackIds: string[] = [];
  for (const b of [s.bookings.own, s.bookings.rival, s.bookings.otherSite]) {
    const id = randomUUID();
    ackIds.push(id);
    await o.insert(safetyAcknowledgement).values({
      id: id as never,
      tenantId: s.tenantId,
      instructionId: instructionId as never,
      versionId: published as never,
      locale: 'en',
      contentHash: hashToken(published),
      bookingId: b.id,
      carrierId: b.carrierId,
      driverName: `Driver ${b.code}`,
      statementShown: 'I understood.',
      channel: 'link',
      completedAt: new Date(),
    });
    await o.insert(bookingAcknowledgement).values({
      bookingId: b.id,
      instructionId: instructionId as never,
      acknowledgementId: id as never,
      tenantId: s.tenantId,
      siteId: b.siteId,
      via: 'completed',
      linkedByParty: 'driver',
    });
    await o.insert(safetyAttempt).values({
      bookingId: b.id,
      versionId: published as never,
      tenantId: s.tenantId,
      attempts: 1,
    });
  }
  await o.insert(safetyPass).values({
    deviceHash: hashToken(`device-${label}`),
    tenantId: s.tenantId,
    instructionId: instructionId as never,
    acknowledgementId: ackIds[0] as never,
  });
  await o.insert(tenantLogo).values({
    tenantId: s.tenantId,
    contentType: 'image/png',
    bytes: Buffer.from('89504e47', 'hex'),
    byteSize: 4,
    sha256: hashToken('logo'),
    updatedBy: s.users.tenant_admin.id,
  });
  await o.insert(privacyRequestLog).values({
    tenantId: s.tenantId,
    kind: 'export',
    matchedBookings: 1,
    matchedAcknowledgements: 0,
    actorUserId: s.users.tenant_admin.id,
  });
  await o.insert(outboxMessage).values({
    tenantId: s.tenantId,
    template: 'booking.confirmed',
    toEmail: `driver-${label}@model.test`,
    locale: 'de',
    payload: { bookingId: s.bookings.own.id },
  });
  return token;
}

/**
 * Fills every table for both sides of `w`, plus platform-level rows. Platform rows are shared by
 * every later test in the worker database, so callers must run `removePlatformRows` afterwards.
 */
export async function seedModel(o: OwnerDb, w: World): Promise<ModelTokens> {
  const settings = await o
    .insert(settingValue)
    .values({
      key: 'privacy.notice_url',
      value: wrapJson('https://example.test/privacy'),
      updatedBy: w.platformAdmin.id,
    })
    .onConflictDoNothing()
    .returning({ id: settingValue.id });
  const outbox = await o
    .insert(outboxMessage)
    .values({
      template: 'core.magic-link',
      toEmail: `someone-${randomUUID()}@model.test`,
      locale: 'en',
      payload: { authTokenId: randomUUID() },
    })
    .returning({ id: outboxMessage.id });
  const invitationA = await side(o, w, w.A, 'A');
  await side(o, w, w.B, 'B');
  return {
    invitationA,
    removePlatformRows: async () => {
      for (const { id } of settings) await o.delete(settingValue).where(eq(settingValue.id, id));
      for (const { id } of outbox) await o.delete(outboxMessage).where(eq(outboxMessage.id, id));
    },
  };
}

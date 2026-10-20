import { LOGO_MAX_BYTES } from '@rampflow/shared/modules/brand/api';
import { LogoContentType } from '@rampflow/shared/modules/brand/values';
import { PolicyReader, values } from '@rampflow/shared/values';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, createdAt, instant, type TenantId, type UserId } from '../../db/ids.ts';
import { tenantPolicies } from '../../db/rls.ts';
import { appUser, org } from '../core/schema.ts';

/** The tenant's logo (TN-05), served under `/api/public/logos/:tenantId/:sha`. */
export const tenantLogo = pgTable(
  'tenant_logo',
  {
    tenantId: uuid('tenant_id')
      .$type<TenantId>()
      .primaryKey()
      .references(() => org.id, { onDelete: 'cascade' }),
    contentType: text('content_type', { enum: values(LogoContentType) }).notNull(),
    bytes: bytea('bytes').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: bytea('sha256').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by')
      .$type<UserId>()
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'tenant_logo_content_type_check',
      sql`${t.contentType} in (${sql.raw(
        values(LogoContentType)
          .map((v) => `'${v}'`)
          .join(', '),
      )})`,
    ),
    check('tenant_logo_size_check', sql`${t.byteSize} <= ${sql.raw(String(LOGO_MAX_BYTES))}`),
    ...tenantPolicies(t, {
      site: null,
      readers: [
        PolicyReader.carrier,
        PolicyReader.carrier_at_tenant,
        PolicyReader.driver,
        PolicyReader.public,
      ],
    }),
  ],
);

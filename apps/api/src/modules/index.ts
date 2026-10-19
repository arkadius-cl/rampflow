import { Hono } from 'hono';
import { withModule } from '../kernel/access.ts';
import type { AppEnv } from '../kernel/env.ts';
import { scoped } from '../kernel/scoped.ts';
import {
  carrierScope,
  driverScope,
  platformScope,
  tenantScope,
  userScope,
} from '../kernel/scopes.ts';
import * as bookingCapacity from './booking/capacity/routes.tenant.ts';
import * as bookingCarriersCarrier from './booking/carriers/routes.carrier.ts';
import * as bookingCarriersPublic from './booking/carriers/routes.public.ts';
import * as bookingCarriers from './booking/carriers/routes.tenant.ts';
import * as portal from './booking/portal/routes.carrier.ts';
import * as portalAtTenant from './booking/portal/routes.carrier-at-tenant.ts';
import * as registration from './booking/registration/routes.public.ts';
import * as bookingStaff from './booking/staff/routes.tenant.ts';
import * as brandLogoPublic from './brand/logo/routes.public.ts';
import * as brandLogo from './brand/logo/routes.tenant.ts';
import * as auth from './core/auth/routes.anonymous.ts';
import * as carrierUsers from './core/carrier-users/routes.carrier.ts';
import * as contextCarrier from './core/context/routes.carrier.ts';
import * as contextPlatform from './core/context/routes.platform.ts';
import * as contextTenant from './core/context/routes.tenant.ts';
import * as invitations from './core/invitations/routes.public.ts';
import * as me from './core/me/routes.user.ts';
import * as platformAdmin from './core/platform/routes.platform.ts';
import * as settings from './core/settings/routes.tenant.ts';
import * as sites from './core/sites/routes.tenant.ts';
import * as staff from './core/staff/routes.tenant.ts';
import * as driverSessionDriver from './driver/session/routes.driver.ts';
import * as driverSessionPublic from './driver/session/routes.public.ts';
import * as driverView from './driver/view/routes.driver.ts';
import * as privacy from './privacy/requests/routes.tenant.ts';
import * as reports from './report/kpi/routes.tenant.ts';
import * as safetyAuthoring from './safety/authoring/routes.tenant.ts';
import * as safetyDriver from './safety/driver/routes.driver.ts';
import * as safetyRegister from './safety/register/routes.tenant.ts';
import * as yard from './yard/routes.tenant.ts';

// The only file that mounts routers (module contract, "Mounting"). One scoped() per area, so no
// request opens two scoped transactions. Only the coordinator edits this file after U1.

const tenant = new Hono<AppEnv>()
  .use(scoped(tenantScope))
  .route('/context', contextTenant.tenant)
  .route('/staff', staff.tenant)
  .route('/settings', settings.tenant)
  .route('/sites', sites.tenant)
  .route('/capacity', bookingCapacity.tenant)
  .route('/bookings', bookingStaff.tenant)
  .route('/carriers', bookingCarriers.tenant)
  .route('/privacy', privacy.tenant)
  .route('/brand', withModule('brand', brandLogo.tenant))
  .route('/safety', withModule('safety', safetyAuthoring.tenant))
  .route('/safety', withModule('safety', safetyRegister.tenant))
  .route('/yard', withModule('yard', yard.tenant))
  .route('/reports', withModule('report', reports.tenant));

// carrierScope resolves `carrier_at_tenant` for paths under /at/:tenantId.
const carrier = new Hono<AppEnv>()
  .use(scoped(carrierScope))
  .route('/context', contextCarrier.carrier)
  .route('/users', carrierUsers.carrier)
  .route('/tenants', bookingCarriersCarrier.carrier)
  .route('/bookings', portal.carrier)
  .route('/at/:tenantId', portalAtTenant.carrierAtTenant);

const platform = new Hono<AppEnv>()
  .use(scoped(platformScope))
  .route('/context', contextPlatform.platform)
  .route('/', platformAdmin.platform);

const driver = new Hono<AppEnv>()
  .use(scoped(driverScope))
  .route('/session', driverSessionDriver.driver)
  .route('/briefings', withModule('safety', safetyDriver.driver))
  .route('/', driverView.driver);

// Token and public routes pick their scope per route (a token in the body, a slug in the path).
const publicApi = new Hono<AppEnv>()
  .route('/invitations', invitations.publicApi)
  .route('/carrier-invitations', bookingCarriersPublic.publicApi)
  .route('/driver-session', driverSessionPublic.publicApi)
  .route('/logos', brandLogoPublic.publicApi)
  .route('/', registration.publicApi);

export const modulesApi = new Hono<AppEnv>()
  .route('/auth', auth.anonymous)
  .route('/me', new Hono<AppEnv>().use(scoped(userScope)).route('/', me.user))
  .route('/t/:orgId', tenant)
  .route('/c/:orgId', carrier)
  .route('/platform', platform)
  .route('/driver', driver)
  .route('/public', publicApi);

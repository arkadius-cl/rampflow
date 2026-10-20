import {
  ApiParty,
  BodyKind,
  ErrorCode,
  GuardKind,
  JsonSchemaType,
  SecuritySchemeType,
} from '@rampflow/shared/values';
import type { Guard } from '../../src/kernel/describe.ts';
import { DEFAULT_MESSAGE, ERROR_STATUS } from '../../src/kernel/errors.ts';
import { DRIVER_COOKIE, SESSION_COOKIE } from '../../src/kernel/scopes.ts';
import { byText } from './converter.ts';
import type { Endpoint, Party } from './model.ts';
import { describeRequest, openApiPath } from './request.ts';
import type { JsonSchema } from './schema.ts';
import { SECTIONS, type Section, sectionOf } from './sections.ts';
import type { StaticResult } from './static.ts';

// Assembles the OpenAPI 3.1 document (design D8, D10). Everything is sorted, nothing reads the
// clock, so the same code gives the same bytes.

export interface Operation {
  endpoint: Endpoint;
  file: string;
  section: Section;
}

type Doc = Record<string, unknown>;

const SESSION_PARTIES = new Set<Party>([
  ApiParty.user,
  ApiParty.platform,
  ApiParty.tenant,
  ApiParty.carrier,
  ApiParty.carrier_at_tenant,
  ApiParty.driver,
]);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** A public or anonymous route that takes a token in its body, which can be unknown or used. */
export function takesToken(e: Endpoint): boolean {
  const body = e.validators.json;
  return body !== undefined && 'shape' in body && 'token' in (body.shape as object);
}

/** The error statuses an operation can answer from its guards and validators alone. */
export function errorStatuses(e: Endpoint): number[] {
  const statuses: number[] = [];
  if (SESSION_PARTIES.has(e.party) || takesToken(e)) statuses.push(401);
  if (e.guards.length || MUTATING.has(e.method)) statuses.push(403);
  if (e.path.includes('/:')) statuses.push(404);
  if (e.meta.limits?.length) statuses.push(409);
  if (e.validators.query || e.validators.json) statuses.push(422);
  return statuses;
}

const ERROR_RESPONSES: Record<number, { name: string; code: ErrorCode; description: string }> = {
  401: {
    name: 'Unauthorized',
    code: ErrorCode.unauthorized,
    description: '`unauthorized`: no valid session or driver link.',
  },
  403: {
    name: 'Forbidden',
    code: ErrorCode.forbidden,
    description:
      '`forbidden` without the permission or from a foreign `Origin`, `entitlement_required` when the package does not include the module or feature (`details.key`).',
  },
  404: {
    name: 'NotFound',
    code: ErrorCode.not_found,
    description:
      '`not_found`: an unknown or malformed id, or an org the caller does not belong to.',
  },
  409: {
    name: 'LimitReached',
    code: ErrorCode.limit_reached,
    description: '`limit_reached` at a hard limit of the package (`details.key`, `details.limit`).',
  },
  422: {
    name: 'ValidationFailed',
    code: ErrorCode.validation_failed,
    description:
      '`validation_failed` with the zod issues in `details.issues` (`path`, `code`, `message`).',
  },
};

const permissions = (guards: readonly Guard[]) =>
  guards.flatMap((g) => (g.kind === GuardKind.permission ? [g.key] : []));
const entitlements = (guards: readonly Guard[]) =>
  guards.flatMap((g) =>
    g.kind === GuardKind.module ? [g.id] : g.kind === GuardKind.entitlement ? [g.key] : [],
  );

/** `booking.capacity.listResources` reads "List resources". */
export function summaryOf(id: string): string {
  const words = (id.split('.').at(-1) ?? id).replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function security(party: Party) {
  if (party === ApiParty.anonymous || party === ApiParty.public) return { security: [] };
  if (party === ApiParty.driver) return { security: [{ driver: [] }] };
  return {};
}

function operation(op: Operation, statics: StaticResult, summary: string): Doc {
  const e = op.endpoint;
  const { parameters, requestBody } = describeRequest(e);
  const bodies = statics.responses.get(e.meta.id) ?? new Map<number, JsonSchema>();
  const responses: Record<string, unknown> = {};
  const statuses = new Set([...Object.keys(e.meta.responses).map(Number), ...bodies.keys()]);
  for (const status of [...statuses].sort((a, b) => a - b)) {
    const declared = e.meta.responses[status as keyof typeof e.meta.responses];
    if (declared?.kind === BodyKind.empty) responses[status] = { description: 'No body.' };
    else if (declared?.kind === BodyKind.file) {
      const content = Object.fromEntries(
        declared.mediaTypes.map((type) => [type, { schema: { contentMediaType: type } }]),
      );
      responses[status] = { description: 'A file.', content };
    } else {
      const schema = bodies.get(status) ?? {};
      responses[status] = { description: 'OK.', content: { 'application/json': { schema } } };
    }
  }
  for (const status of errorStatuses(e)) {
    responses[status] = { $ref: `#/components/responses/${ERROR_RESPONSES[status]?.name}` };
  }
  const perms = permissions(e.guards);
  const ents = entitlements(e.guards);
  return {
    operationId: e.meta.id,
    summary,
    description: e.meta.description,
    tags: [op.section],
    ...security(e.party),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
    'x-party': e.party,
    ...(perms.length ? { 'x-permission': perms } : {}),
    ...(ents.length ? { 'x-entitlement': ents } : {}),
    ...(e.meta.limits?.length ? { 'x-limits': e.meta.limits } : {}),
    'x-stories': e.meta.stories,
    'x-router': op.file,
  };
}

const ERROR_SCHEMA: JsonSchema = {
  type: JsonSchemaType.object,
  required: ['error'],
  properties: {
    error: {
      type: JsonSchemaType.object,
      required: ['code', 'message'],
      properties: {
        code: {
          type: JsonSchemaType.string,
          enum: (Object.keys(ERROR_STATUS) as ErrorCode[]).sort(byText),
        },
        message: { type: JsonSchemaType.string },
        details: { type: JsonSchemaType.object, additionalProperties: {} },
      },
    },
  },
};

const DESCRIPTION = `The HTTP API of rampflow, generated from the routes by \`pnpm api:docs\` (ADR-0013).

Sign in with \`POST /api/auth/login\`; the \`rf_session\` cookie it sets authenticates the other requests. Every mutating request needs an \`Origin\` header with the app origin (ADR-0003). Routes under \`/api/driver\` use the \`rf_driver\` cookie of a driver link instead.`;

/** Joins the runtime and static halves into the operations, with their router file and section. */
export function operations(endpoints: readonly Endpoint[], statics: StaticResult) {
  const problems: string[] = [];
  const ops: Operation[] = [];
  for (const endpoint of endpoints) {
    const file = statics.files.get(endpoint.meta.id);
    if (!file) continue;
    const section = sectionOf(file);
    if (!section) problems.push(`${endpoint.meta.id}: ${file} is in no section of SECTIONS`);
    else ops.push({ endpoint, file, section });
  }
  return { ops, problems };
}

/** The summary, with the module and area added where two operations would read the same. */
function summaries(ops: readonly Operation[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const op of ops) {
    const s = summaryOf(op.endpoint.meta.id);
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  return new Map(
    ops.map(({ endpoint: { meta } }) => {
      const s = summaryOf(meta.id);
      const area = meta.id.split('.').slice(0, -1).join('.');
      return [meta.id, (count.get(s) ?? 0) > 1 ? `${s} (${area})` : s];
    }),
  );
}

export function buildDocument(ops: readonly Operation[], statics: StaticResult): Doc {
  const paths: Record<string, Record<string, unknown>> = {};
  const summary = summaries(ops);
  for (const op of ops) {
    const path = openApiPath(op.endpoint.path);
    const doc = operation(op, statics, summary.get(op.endpoint.meta.id) ?? '');
    paths[path] = { ...paths[path], [op.endpoint.method.toLowerCase()]: doc };
  }
  const order = ['get', 'post', 'put', 'patch', 'delete'];
  const sortedPaths = Object.fromEntries(
    Object.keys(paths)
      .sort(byText)
      .map((p) => [
        p,
        Object.fromEntries(
          Object.entries(paths[p] ?? {}).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)),
        ),
      ]),
  );
  const schemas: Record<string, JsonSchema> = { ...statics.components, Error: ERROR_SCHEMA };
  return {
    openapi: '3.1.1',
    info: { title: 'rampflow API', version: '1', description: DESCRIPTION },
    servers: [
      {
        url: '{appOrigin}',
        description: 'Web app',
        variables: { appOrigin: { default: 'http://localhost:5173' } },
      },
    ],
    security: [{ session: [] }],
    tags: Object.keys(SECTIONS).map((name) => ({ name })),
    paths: sortedPaths,
    components: {
      schemas: Object.fromEntries(
        Object.keys(schemas)
          .sort(byText)
          .map((k) => [k, schemas[k]]),
      ),
      responses: Object.fromEntries(
        Object.values(ERROR_RESPONSES).map(({ name, code, description }) => [
          name,
          {
            description,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: { error: { code, message: DEFAULT_MESSAGE[code] } },
              },
            },
          },
        ]),
      ),
      securitySchemes: {
        session: { type: SecuritySchemeType.apiKey, in: 'cookie', name: SESSION_COOKIE },
        driver: { type: SecuritySchemeType.apiKey, in: 'cookie', name: DRIVER_COOKIE },
      },
    },
  };
}

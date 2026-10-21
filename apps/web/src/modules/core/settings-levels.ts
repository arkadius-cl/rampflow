import type { PermissionKey, SettingKey } from '@rampflow/shared';
import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import {
  OrgKind,
  Permission,
  SettingScope,
  SettingSource,
  SettingsTopic,
} from '@rampflow/shared/values';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { linkOptions, notFound } from '@tanstack/react-router';
import * as z from 'zod';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { platformKeys } from './queries';
import { availableTopics } from './settings-placement';
import type { SettingChanges } from './settings-topic-form';

// The three levels a settings page edits, and the route of a topic on each (ADR-0011, ADR-0020).

export type SettingsLevel =
  | { scope: typeof SettingScope.platform }
  | { scope: typeof SettingScope.tenant; orgId: string }
  | { scope: typeof SettingScope.site; orgId: string; siteId: string };

export const PLATFORM_LEVEL = { scope: SettingScope.platform } as const satisfies SettingsLevel;

/** The topic page of a level as typed link options; `key` opens that field (decision 7). */
export function topicLink(level: SettingsLevel, topic: SettingsTopic, key?: SettingKey) {
  switch (level.scope) {
    case SettingScope.platform:
      return linkOptions({
        // values-check-ignore: a route path, typed by the generated route tree
        to: '/platform/settings/$topic',
        params: { topic },
        hash: key,
      });
    case SettingScope.tenant:
      return linkOptions({
        // values-check-ignore: a route path, typed by the generated route tree
        to: '/t/$orgId/settings/$topic',
        params: { orgId: level.orgId, topic },
        hash: key,
      });
    case SettingScope.site:
      return linkOptions({
        // values-check-ignore: a route path, typed by the generated route tree
        to: '/t/$orgId/sites/$siteId/settings/$topic',
        params: { orgId: level.orgId, siteId: level.siteId, topic },
        hash: key,
      });
  }
}

export type TopicLink = ReturnType<typeof topicLink>;

/** Links an inherited value to the same field on its source level, or answers `undefined`. */
export type OriginLink = (source: SettingSource, key: SettingKey) => TopicLink | undefined;

/**
 * Origin links of a page on `level`: a value from a level above links to the same field there,
 * when `can` holds that level's settings permission. A tenant area never holds the platform's.
 */
export function originLinkFor(
  level: SettingsLevel,
  topic: SettingsTopic,
  can: (permission: PermissionKey) => boolean,
): OriginLink {
  return (source, key) => {
    if (source === SettingSource.platform && can(Permission.core.manage_platform_settings)) {
      return topicLink(PLATFORM_LEVEL, topic, key);
    }
    if (
      source === SettingSource.tenant &&
      level.scope === SettingScope.site &&
      can(Permission.core.manage_settings)
    ) {
      return topicLink({ scope: SettingScope.tenant, orgId: level.orgId }, topic, key);
    }
    return undefined;
  };
}

/** The level's settings view, as its layout loads it. Tenant and site keys share one prefix. */
export const settingsQuery = (level: SettingsLevel) =>
  queryOptions({
    queryKey:
      level.scope === SettingScope.platform
        ? platformKeys.settings()
        : [
            'tenant',
            level.orgId,
            'core',
            'settings',
            level.scope === SettingScope.site ? level.siteId : SettingScope.tenant,
          ],
    queryFn: () =>
      level.scope === SettingScope.platform
        ? call<SettingsView>(api.platform.settings.$get())
        : call<SettingsView>(
            api.t[':orgId'].settings.$get({
              param: { orgId: level.orgId },
              query: level.scope === SettingScope.site ? { siteId: level.siteId } : {},
            }),
          ),
  });

/** The `$topic` param of the topic routes; an unknown topic is no page (no access). */
export const topicParams = {
  parse: ({ topic }: { topic: string }) => {
    const parsed = z.enum(SettingsTopic).safeParse(topic);
    if (!parsed.success) throw notFound();
    return { topic: parsed.data };
  },
  stringify: ({ topic }: { topic: SettingsTopic }) => ({ topic }),
};

/** The topic a level's settings root opens: the first one its navigation lists. */
export function firstTopic(view: SettingsView): SettingsTopic {
  const first = availableTopics(view.items)[0];
  if (!first) throw notFound();
  return first;
}

/** Throws `notFound()` for a topic without an available setting on the level (no access). */
export function assertTopic(view: SettingsView, topic: SettingsTopic) {
  if (!availableTopics(view.items).includes(topic)) throw notFound();
}

/**
 * Saves a topic form of the level in one PATCH and refreshes what depends on it: the level's view
 * and, in a tenant, the context, so `useAccess().setting` sees the new values at once.
 */
export function useSaveSettings(level: SettingsLevel) {
  const queryClient = useQueryClient();
  return async (changes: SettingChanges): Promise<SettingsView> => {
    if (level.scope === SettingScope.platform) {
      const view = await call<SettingsView>(api.platform.settings.$patch({ json: changes }));
      await queryClient.invalidateQueries({ queryKey: platformKeys.settings() });
      return view;
    }
    const { orgId } = level;
    const siteId = level.scope === SettingScope.site ? level.siteId : null;
    const view = await call<SettingsView>(
      api.t[':orgId'].settings.$patch({ param: { orgId }, json: { siteId, ...changes } }),
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tenant', orgId, 'core', 'settings'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.context(OrgKind.tenant, orgId) }),
    ]);
    return view;
  };
}

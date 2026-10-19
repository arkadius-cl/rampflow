import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCE_LOCALE } from '@rampflow/shared';
import i18next, { type i18n, type Resource } from 'i18next';

export const LOCALES_DIR = fileURLToPath(new URL('../locales', import.meta.url));

const cache = new Map<string, Resource[string]>();

/** One locale's namespaces; each namespace merges its part files under the part's name. */
function loadLocale(locale: string): Resource[string] {
  let resources = cache.get(locale);
  if (resources) return resources;
  resources = {};
  const dir = `${LOCALES_DIR}/${locale}`;
  if (existsSync(dir)) {
    for (const ns of readdirSync(dir, { withFileTypes: true })) {
      if (!ns.isDirectory()) continue;
      const parts: Record<string, unknown> = {};
      for (const file of readdirSync(`${dir}/${ns.name}`)) {
        if (!file.endsWith('.json')) continue;
        parts[file.slice(0, -'.json'.length)] = JSON.parse(
          readFileSync(`${dir}/${ns.name}/${file}`, 'utf8'),
        );
      }
      resources[ns.name] = parts as Resource[string][string];
    }
  }
  cache.set(locale, resources);
  return resources;
}

/**
 * A fresh i18next instance for one email or server message (ADR-0009). Falls back to `en`.
 * `t('booking:plan.title')` reads `locales/<locale>/booking/plan.json` key `title`.
 */
export async function createServerI18n(locale: string): Promise<i18n> {
  const resources: Resource = {
    [locale]: loadLocale(locale),
    [SOURCE_LOCALE]: loadLocale(SOURCE_LOCALE),
  };
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: SOURCE_LOCALE,
    resources,
    ns: Object.keys(resources[SOURCE_LOCALE] ?? {}),
    defaultNS: 'core',
    interpolation: { escapeValue: false },
  });
  return instance;
}

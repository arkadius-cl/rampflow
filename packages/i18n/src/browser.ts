import { SOURCE_LOCALE } from '@rampflow/shared';
import i18next, { type i18n } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

const parts = import.meta.glob<{ default: unknown }>('../locales/*/*/*.json');

/** Loads `<locale>/<ns>/*.json` on demand and mounts each part under its file name. */
async function loadNamespace(locale: string, ns: string): Promise<Record<string, unknown>> {
  const prefix = `../locales/${locale}/${ns}/`;
  const entries = Object.entries(parts).filter(([path]) => path.startsWith(prefix));
  const loaded = await Promise.all(
    entries.map(
      async ([path, load]) =>
        [path.slice(prefix.length, -'.json'.length), (await load()).default] as const,
    ),
  );
  return Object.fromEntries(loaded);
}

/**
 * The i18next instance of `apps/web` and `apps/driver` (ADR-0009). Namespaces load lazily;
 * the caller wires `react-i18next` and the language detection it needs.
 */
export async function createBrowserI18n(
  namespaces: readonly string[],
  locale: string,
): Promise<i18n> {
  const instance = i18next.createInstance().use(resourcesToBackend(loadNamespace));
  await instance.init({
    lng: locale,
    fallbackLng: SOURCE_LOCALE,
    ns: [...namespaces],
    defaultNS: namespaces[0] ?? 'core',
    interpolation: { escapeValue: false },
  });
  return instance;
}

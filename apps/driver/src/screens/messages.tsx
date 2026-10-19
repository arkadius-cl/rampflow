import { LinkIcon, WifiOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';

// The neutral screens without a booking: loading, an unusable link (DR-01, one generic message
// whatever the reason) and a new link opened offline.

export function Loading() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
      <Spinner /> {t(($) => $.app.loading)}
    </div>
  );
}

function Message({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof LinkIcon;
  title: string;
  body: string;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-10" />
      </div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-lg text-muted-foreground">{body}</p>
    </section>
  );
}

export function InvalidLink() {
  const { t } = useTranslation();
  return (
    <Message
      icon={LinkIcon}
      title={t(($) => $.app.invalid.title)}
      body={t(($) => $.app.invalid.body)}
    />
  );
}

export function OfflineLink() {
  const { t } = useTranslation();
  return (
    <Message
      icon={WifiOffIcon}
      title={t(($) => $.app.offline_link.title)}
      body={t(($) => $.app.offline_link.body)}
    />
  );
}

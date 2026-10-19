import { APP_NAME } from '@rampflow/shared';
import { WarehouseIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageMenu } from './user-menu';

/** The frame of sign-in, token pages and the org picker: brand, language, one centred card. */
export function AuthLayout({
  title,
  description,
  signedIn = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <WarehouseIcon className="size-4" />
          </div>
          {APP_NAME}
        </div>
        <LanguageMenu signedIn={signedIn} />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg font-semibold">{title}</h1>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        {t(($) => $.shell.tagline)}
      </footer>
    </div>
  );
}

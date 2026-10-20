import { ErrorCode } from '@rampflow/shared/values';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { CircleAlertIcon, CompassIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { AccessDenied } from '@/lib/access';
import { isFailure } from '@/lib/api';

/**
 * "No access": a missing permission or entitlement, or an org the user is not a member of. The
 * page never says which, so a foreign org id reveals nothing (ADR-0011).
 */
export function NoAccess() {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>{t(($) => $.shell.no_access.title)}</EmptyTitle>
        <EmptyDescription>{t(($) => $.shell.no_access.description)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/" className={buttonVariants()}>
          {t(($) => $.shell.no_access.action)}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

export function RouteNotFound() {
  const { t } = useTranslation();
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle>{t(($) => $.shell.not_found.title)}</EmptyTitle>
        <EmptyDescription>{t(($) => $.shell.not_found.description)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/" className={buttonVariants()}>
          {t(($) => $.shell.no_access.action)}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/** The error boundary of every route. Renders inside the parent layout, so the shell stays. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  if (error instanceof AccessDenied || isFailure(error, ErrorCode.not_found)) return <NoAccess />;
  return (
    <Empty className="min-h-[60svh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t(($) => $.shell.error.title)}</EmptyTitle>
        <EmptyDescription>{t(($) => $.shell.error.description)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          {t(($) => $.shell.error.retry)}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

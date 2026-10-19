import { APP_NAME } from '@rampflow/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async () => (await api.api.health.$get()).json(),
  refetchInterval: 10_000,
});

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const health = useQuery(healthQuery);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{APP_NAME}</CardTitle>
          <CardDescription>Dock and yard management</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">API</dt>
            <dd>
              {health.isPending ? (
                <Skeleton className="h-5 w-12" />
              ) : (
                <StatusBadge testId="api-status" ok={health.isSuccess}>
                  {health.isSuccess ? 'ok' : 'unreachable'}
                </StatusBadge>
              )}
            </dd>
            <dt className="text-muted-foreground">Database</dt>
            <dd>
              {health.isPending ? (
                <Skeleton className="h-5 w-12" />
              ) : (
                <StatusBadge testId="db-status" ok={health.data?.db === 'ok'}>
                  {health.data?.db ?? 'unknown'}
                </StatusBadge>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}

function StatusBadge({
  ok,
  testId,
  children,
}: {
  ok: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Badge data-testid={testId} variant={ok ? 'secondary' : 'destructive'}>
      {children}
    </Badge>
  );
}

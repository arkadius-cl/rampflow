import { cn } from '@/lib/utils';

/**
 * The tenant's logo (TN-05), or nothing without one. Every caller shows the tenant's name next
 * to it, so the image is decorative.
 */
export function TenantLogo({
  url,
  className,
}: {
  url: string | null | undefined;
  className?: string;
}) {
  if (!url) return null;
  return <img src={url} alt="" className={cn('h-10 w-auto max-w-48 object-contain', className)} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { AreaHome } from '@/components/app-shell/area-home';

export const Route = createFileRoute('/c/$orgId/')({ component: AreaHome });

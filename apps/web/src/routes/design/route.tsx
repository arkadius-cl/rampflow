import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

// Design prototype routes exist in dev builds only. Production answers 404.
export const Route = createFileRoute('/design')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Outlet,
});

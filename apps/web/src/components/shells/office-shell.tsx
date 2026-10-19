import {
  BuildingIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  LockIcon,
  type LucideIcon,
  SearchIcon,
} from 'lucide-react';
import { Fragment } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EntitlementState } from '@/lib/domain';
import { cn } from '@/lib/utils';

export type OrgKind = 'tenant' | 'carrier' | 'platform';

export interface Membership {
  id: string;
  name: string;
  kind: OrgKind;
  role: string;
}

export interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  active?: boolean;
  badge?: string;
  /** "off" items are not rendered (PL-02). "upsell" items render locked with a hint. */
  entitlement?: EntitlementState;
  upsellHint?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface OfficeShellProps {
  org: Membership;
  memberships: Membership[];
  nav: NavGroup[];
  breadcrumbs: string[];
  /** Right side of the top bar: site picker, date, primary action. */
  toolbar?: React.ReactNode;
  user: { name: string; initials: string };
  children: React.ReactNode;
  /** Remove the content padding for full-bleed screens such as the plan board. */
  flush?: boolean;
}

const orgKindLabel: Record<OrgKind, string> = {
  tenant: 'Warehouse',
  carrier: 'Carrier',
  platform: 'Platform',
};

export function OfficeShell({
  org,
  memberships,
  nav,
  breadcrumbs,
  toolbar,
  user,
  children,
  flush,
}: OfficeShellProps) {
  return (
    <SidebarProvider data-density="compact" className="bg-canvas" defaultOpen={!flush}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <OrgSwitcher org={org} memberships={memberships} />
        </SidebarHeader>
        <SidebarContent>
          {nav.map((group, i) => (
            <SidebarGroup key={group.label ?? i}>
              {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items
                    .filter((item) => item.entitlement !== 'off')
                    .map((item) => (
                      <NavEntry key={item.label} item={item} />
                    ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:p-0!">
                <Avatar size="sm" className="rounded-md">
                  <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">{org.role}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-canvas">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, i) => {
                const last = i === breadcrumbs.length - 1;
                return (
                  <Fragment key={crumb}>
                    <BreadcrumbItem className={cn(!last && 'hidden md:block')}>
                      {last ? (
                        <BreadcrumbPage className="font-medium">{crumb}</BreadcrumbPage>
                      ) : (
                        <span className="text-muted-foreground">{crumb}</span>
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator className="hidden md:block" />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-52 justify-start text-muted-foreground"
            >
              <SearchIcon />
              Search
              <Kbd className="ml-auto">⌘K</Kbd>
            </Button>
            {toolbar}
          </div>
        </header>
        <div className={cn('flex min-h-0 flex-1 flex-col', !flush && 'gap-4 p-4 lg:p-6')}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavEntry({ item }: { item: NavItem }) {
  const Icon = item.icon;
  if (item.entitlement === 'upsell') {
    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuButton
                aria-disabled
                className="text-sidebar-foreground/50 hover:bg-transparent hover:text-sidebar-foreground/50"
              />
            }
          >
            <Icon />
            <span>{item.label}</span>
            <LockIcon className="ml-auto size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="right">{item.upsellHint ?? 'Not in your package'}</TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={item.active}
        tooltip={item.label}
        render={<a href={item.href} aria-current={item.active ? 'page' : undefined} />}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

function OrgSwitcher({ org, memberships }: { org: Membership; memberships: Membership[] }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <BuildingIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{org.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">
                {orgKindLabel[org.kind]}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={4}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Your organisations
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {memberships.map((m) => (
                <DropdownMenuItem key={m.id} className="gap-2">
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <BuildingIcon className="size-3.5" />
                  </div>
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate text-sm">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {orgKindLabel[m.kind]} · {m.role}
                    </span>
                  </div>
                  {m.id === org.id ? <CheckIcon className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              Sign out everywhere
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

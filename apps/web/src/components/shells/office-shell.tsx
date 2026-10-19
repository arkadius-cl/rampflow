import { useNavigate } from '@tanstack/react-router';
import { BuildingIcon, CheckIcon, ChevronsUpDownIcon, LockIcon, SearchIcon } from 'lucide-react';
import { type ComponentType, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
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
  /** Where the org switcher goes for this org. */
  href?: string;
}

export interface NavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
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
  /** Items of the user menu in the sidebar footer (language, sign out). */
  userMenu?: React.ReactNode;
  /** The search button of the prototype; the MVP has no global search yet. */
  search?: boolean;
  children: React.ReactNode;
  /** Remove the content padding for full-bleed screens such as the plan board. */
  flush?: boolean;
}

/** An anchor that navigates inside the SPA on a plain click and behaves like a link otherwise. */
export function NavLink({ href, ...props }: React.ComponentProps<'a'> & { href: string }) {
  const navigate = useNavigate();
  return (
    <a
      href={href}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        void navigate({ href });
      }}
    />
  );
}

export function OfficeShell({
  org,
  memberships,
  nav,
  breadcrumbs,
  toolbar,
  user,
  userMenu,
  search = true,
  children,
  flush,
}: OfficeShellProps) {
  const { t } = useTranslation();
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
                      <NavEntry key={item.href + item.label} item={item} />
                    ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserButton user={user} role={org.role} menu={userMenu} />
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
            {search ? (
              <Button
                variant="outline"
                size="sm"
                className="w-52 justify-start text-muted-foreground"
              >
                <SearchIcon />
                {t(($) => $.shell.search)}
                <Kbd className="ml-auto">⌘K</Kbd>
              </Button>
            ) : null}
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

function UserButton({
  user,
  role,
  menu,
}: {
  user: OfficeShellProps['user'];
  role: string;
  menu: React.ReactNode;
}) {
  const content = (
    <>
      <Avatar size="sm" className="rounded-md">
        <AvatarFallback className="rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          {user.initials}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">{role}</span>
      </div>
      <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
    </>
  );
  if (!menu) {
    return (
      <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:p-0!">
        {content}
      </SidebarMenuButton>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            data-testid="user-menu"
            className="group-data-[collapsible=icon]:p-0! data-[popup-open]:bg-sidebar-accent"
          />
        }
      >
        {content}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top" sideOffset={4}>
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavEntry({ item }: { item: NavItem }) {
  const { t } = useTranslation();
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
          <TooltipContent side="right">
            {item.upsellHint ?? t(($) => $.shell.not_in_package)}
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={item.active}
        tooltip={item.label}
        render={<NavLink href={item.href} aria-current={item.active ? 'page' : undefined} />}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}

function OrgSwitcher({ org, memberships }: { org: Membership; memberships: Membership[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                data-testid="org-switcher"
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
                {t(($) => $.shell.org_kind[org.kind])}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t(($) => $.shell.your_orgs)}
              </DropdownMenuLabel>
              {memberships.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  className="gap-2"
                  onClick={() => (m.href ? void navigate({ href: m.href }) : undefined)}
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <BuildingIcon className="size-3.5" />
                  </div>
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate text-sm">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t(($) => $.shell.org_kind[m.kind])} · {m.role}
                    </span>
                  </div>
                  {m.id === org.id ? <CheckIcon className="size-4" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
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

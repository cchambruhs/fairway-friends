// @polsia:user-owned
'use client';

import {
  ChartNoAxesColumn,
  CircleUserRound,
  History,
  House,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/dashboard',
    label: 'Workspace',
    icon: LayoutDashboard,
  },
  {
    href: '/dashboard/profile',
    label: 'Player profile',
    icon: UserRound,
  },
  {
    href: '/dashboard/rounds',
    label: 'Rounds',
    icon: History,
  },
  {
    href: '/dashboard/courses',
    label: 'Courses',
    icon: MapPinned,
  },
  {
    href: '/dashboard/clubhouses',
    label: 'Clubhouses',
    icon: UsersRound,
  },
  {
    href: '/dashboard/leagues',
    label: 'Leagues',
    icon: Trophy,
  },
  {
    href: '/dashboard/account',
    label: 'Account',
    icon: CircleUserRound,
  },
];

export function DashboardNav({
  isAdmin,
  mobileOpen,
  onNavigate,
}: {
  isAdmin: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const items = isAdmin
    ? [...navItems, { href: '/admin', label: 'Administration', icon: ShieldCheck }]
    : navItems;

  return (
    <nav
      id="player-workspace-navigation"
      aria-label="Workspace"
      className="ff-dashboard-nav"
      data-open={mobileOpen}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn('ff-dashboard-nav-link', active && 'is-active')}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const mobileItems = [
  { href: '/dashboard', label: 'Home', icon: House },
  { href: '/dashboard/rounds', label: 'Rounds', icon: History },
  { href: '/dashboard/clubhouses', label: 'Clubhouses', icon: UsersRound },
  { href: '/dashboard/stats', label: 'Stats', icon: ChartNoAxesColumn },
  { href: '/dashboard/profile', label: 'Profile', icon: UserRound },
];

export function MobileDashboardTabs() {
  const pathname = usePathname();
  return (
    <nav className="ff-mobile-dashboard-tabs" aria-label="Main dashboard tabs">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('ff-mobile-dashboard-tab', active && 'is-active')}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

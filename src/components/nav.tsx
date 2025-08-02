

'use client';

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Banknote,
  Landmark,
  BarChart3,
  Settings,
  BookCopy,
  Network,
  MessageCircle,
  ShieldAlert,
  Settings2,
  Pilcrow,
  Send,
  Contact,
  Bot,
  Info,
  History,
  Wallet,
} from 'lucide-react';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/transactions', label: 'Transactions', icon: Banknote },
  { type: 'divider' },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { type: 'divider' },
  { href: '/accounting/journal', label: 'Journal', icon: BookCopy },
  { href: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: Network },
  { type: 'divider' },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/logs', label: 'Audit Log', icon: History },
  { href: '/blacklist', label: 'Blacklist', icon: ShieldAlert },
  { type: 'divider' },
  { href: '/sms/transactions', label: 'SMS Transactions', icon: MessageCircle },
  { href: '/sms/settings', label: 'SMS Gateway Setup', icon: Settings2 },
  { href: '/sms/parsing', label: 'SMS Parsing Rules', icon: Pilcrow },
  { type: 'divider' },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/about', label: 'About', icon: Info },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return <hr key={`divider-${index}`} className="my-2 border-sidebar-border" />;
        }
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith(item.href) && (item.href !== '/' || pathname === '/')}
              tooltip={item.label}
            >
              <Link href={item.href!}>
                <item.icon />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  );
}

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
  FileScan,
  HandCoins,
  ArrowLeftRight,
  Globe,
} from 'lucide-react';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'divider', label: 'Operations' },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/transactions', label: 'Transactions', icon: Banknote },
  { href: '/cash-receipts', label: 'Cash Receipts', icon: HandCoins },
  { href: '/cash-payments', label: 'Cash Payments', icon: ArrowLeftRight },
  { href: '/wallet', label: 'USDT Sender Wallet', icon: Wallet },
  { type: 'divider', label: 'Accounting & Reports' },
  { href: '/accounting/journal', label: 'Journal', icon: BookCopy },
  { href: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: Network },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { type: 'divider', label: 'Management' },
  { href: '/sms/transactions', label: 'SMS Transactions', icon: MessageCircle },
  { href: '/blacklist', label: 'Blacklist', icon: ShieldAlert },
  { href: '/logs', label: 'Audit Log', icon: History },
  { type: 'divider', label: 'System' },
  { href: '/sms/settings', label: 'SMS Gateway Setup', icon: Settings2 },
  { href: '/sms/parsing', label: 'SMS Parsing Rules', icon: Pilcrow },
  { href: '/document-processing', label: 'Document Processing', icon: FileScan },
  { href: '/service-providers', label: 'Service Providers', icon: Globe },
  { href: '/exchange-rates', label: 'Exchange Rates', icon: Landmark },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/about', label: 'About', icon: Info },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return (
            <li key={`divider-${index}`} className="px-2 pt-4 pb-1 text-xs font-semibold text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
              {item.label}
            </li>
          );
        }
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith(item.href!) && (item.href !== '/' || pathname === '/')}
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



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
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat,
  Sparkles,
  Book,
  DollarSign,
  Plug,
  FileWarning,
} from 'lucide-react';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/modern', label: 'Modern Hub', icon: Sparkles },
  
  { type: 'divider', label: 'العمليات المالية' },
  { href: '/modern-cash-records', label: 'Modern Cash Records', icon: BookCopy },
  { href: '/modern-usdt-records', label: 'Modern USDT Records', icon: DollarSign },

  { type: 'divider', label: 'التنفيذ' },
  { href: '/wallet', label: 'USDT Sender Wallet', icon: Send },

  { type: 'divider', label: 'المعاملات' },
  { href: '/transactions/modern', label: 'Modern Transaction', icon: HandCoins },
  { href: '/exchange', label: 'Exchange', icon: ArrowLeftRight },
  { href: '/accounting/journal', label: 'Internal Transfer', icon: Repeat },

  { type: 'divider', label: 'المحاسبة والتقارير' },
  { href: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: Network },
  { href: '/reports', label: 'Reports', icon: BarChart3 },

  { type: 'divider', label: 'الإدارة' },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/blacklist', label: 'Blacklist', icon: ShieldAlert },
  { href: '/logs', label: 'Audit Log', icon: History },

  { type: 'divider', label: 'النظام' },
  { href: '/sms/settings', label: 'SMS Gateway Setup', icon: Settings2 },
  { href: '/sms/parsing', label: 'SMS Parsing Rules', icon: Pilcrow },
  { href: '/sms/parsing-failures', label: 'SMS Parsing Failures', icon: FileWarning },
  { href: '/settings/bsc-apis', label: 'BSC API Settings', icon: Plug },
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

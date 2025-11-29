

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
  Repeat,
  Sparkles,
  Book,
  DollarSign,
  Plug,
  FileWarning,
  Globe,
  ListOrdered,
  UserSquare,
} from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';


const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/client-dashboard', label: 'Client Dashboard', icon: UserSquare },
  { href: '/transactions/modern', label: 'New Transaction', icon: HandCoins },
  
  { type: 'divider', label: 'Core' },
  { href: '/transactions', label: 'Transactions', icon: ListOrdered },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/reports', label: 'Reports', icon: BarChart3 },

  { type: 'divider', label: 'Records' },
  { href: '/modern-cash-records', label: 'Cash Records', icon: BookCopy },
  { href: '/modern-usdt-records', label: 'USDT Records', icon: DollarSign },
  { href: '/wallet', label: 'USDT Sender Wallet', icon: Send },

  { type: 'divider', label: 'Accounting' },
  { href: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: Network },
  { href: '/accounting/journal', label: 'Journal', icon: Book },
  { href: '/exchange-rates', label: 'Exchange Rates', icon: Landmark },

  { type: 'divider', label: 'System' },
  { href: '/sms/settings', label: 'SMS Gateway', icon: Settings2 },
  { href: '/sms/parsing', label: 'SMS Parsing Rules', icon: Pilcrow },
  { href: '/sms/parsing-failures', label: 'SMS Failures', icon: FileWarning },
  { href: '/settings/bsc-apis', label: 'BSC API Settings', icon: Plug },
  { href: '/document-ocr', label: 'Document OCR', icon: FileScan },
  { href: '/document-processing', label: 'Document Processing', icon: FileScan },
  { href: '/service-providers', label: 'Service Providers', icon: Globe },
  { href: '/blacklist', label: 'Blacklist', icon: ShieldAlert },
  { href: '/logs', label: 'Audit Log', icon: History },
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

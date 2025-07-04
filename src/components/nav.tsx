'use client';

import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Book,
  FileText,
  BarChart3,
  Settings,
  Landmark,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import * as React from 'react';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, subItems: [] },
  { 
    label: 'Accounting', 
    icon: Landmark,
    subItems: [
        { href: '/accounting/journal', label: 'Journal' },
        { href: '/accounting/chart-of-accounts', label: 'Chart of Accounts' },
        { href: '/accounting/reports', label: 'Reports' },
    ]
  },
  { href: '/settings', label: 'Settings', icon: Settings, subItems: [] },
];

export function Nav() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
      'Accounting': pathname.startsWith('/accounting')
  });

  const handleToggle = (label: string) => {
      setOpenSections(prev => ({...prev, [label]: !prev[label]}));
  }

  return (
    <SidebarMenu>
      {menuItems.map((item) => (
        item.subItems.length > 0 ? (
            <Collapsible key={item.label} asChild open={openSections[item.label]} onOpenChange={() => handleToggle(item.label)}>
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.label}>
                            <item.icon />
                            <span>{item.label}</span>
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                        <SidebarMenuSub>
                            {item.subItems.map(subItem => (
                                <SidebarMenuSubItem key={subItem.href}>
                                     <SidebarMenuSubButton asChild isActive={pathname === subItem.href}>
                                        <Link href={subItem.href}>
                                            <span>{subItem.label}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </SidebarMenuItem>
            </Collapsible>
        ) : (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={pathname === item.href}
            tooltip={item.label}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        )
      ))}
    </SidebarMenu>
  );
}

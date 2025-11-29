export const dynamic = 'force-dynamic';

import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Logo } from '@/components/logo';
import { Nav } from '@/components/nav';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoutButton } from '@/components/logout-button';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <Nav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-20 items-center justify-between gap-4 px-6 bg-background">
           <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div>
                <h1 className="text-xl font-bold">صباح الخير</h1>
                <p className="text-sm text-muted-foreground">السبحي</p>
              </div>
           </div>
           <div className="flex items-center gap-2">
             <Button variant="ghost" size="icon" className="rounded-full">
                  <Bell className="h-5 w-5" />
             </Button>
             <LogoutButton />
           </div>
        </header>
        <main className="flex flex-1 flex-col p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

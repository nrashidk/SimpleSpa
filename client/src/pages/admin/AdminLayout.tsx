import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import { SpaProvider, useSpaContext } from "@/contexts/SpaContext";
import { Loader2 } from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { selectedSpaId, isSuperAdmin, isLoading } = useSpaContext();
  
  const showContent = !isSuperAdmin || !!selectedSpaId;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <header className="flex items-center justify-between p-4 border-b bg-background">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <ThemeToggle />
      </header>
      <main className="flex-1 overflow-auto p-6 bg-background">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showContent ? (
          children
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground">Please select a spa from the sidebar to view data.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SpaProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AdminSidebar />
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </div>
      </SidebarProvider>
    </SpaProvider>
  );
}

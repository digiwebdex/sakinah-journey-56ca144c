import { createContext, useContext } from "react";
import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { auth as api } from "@/lib/api";
import { toast } from "sonner";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { Eye } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";

// Role context so child components can access the current admin role
const AdminRoleContext = createContext<AppRole>(null);
export const useAdminRole = () => useContext(AdminRoleContext);
export const useIsViewer = () => useContext(AdminRoleContext) === "viewer";

/** Only admin can see profit data */
export const useCanSeeProfit = () => {
  const role = useContext(AdminRoleContext);
  return role === "admin";
};

/** Admin and accountant can modify financial data */
export const useCanModifyFinancials = () => {
  const role = useContext(AdminRoleContext);
  return role === "admin" || role === "accountant";
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  accountant: "Accountant",
  booking: "Booking",
  cms: "CMS",
  viewer: "Viewer",
};

export default function AdminLayout() {
  useSessionTimeout();
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { session } } = await api.getSession();
        if (!session) { navigate("/auth", { replace: true }); return; }

        const { data: { user } } = await api.getUser();
        let roles: string[] = user?.roles || [];

        if (roles.length === 0) {
          toast.error("Access denied");
          navigate("/dashboard", { replace: true });
          return;
        }

        if (roles.includes("admin")) setRole("admin");
        else if (roles.includes("accountant")) setRole("accountant");
        else if (roles.includes("booking")) setRole("booking");
        else if (roles.includes("cms")) setRole("cms");
        else if (roles.includes("viewer")) setRole("viewer");
        else { toast.error("Access denied"); navigate("/dashboard", { replace: true }); return; }

        setLoading(false);
      } catch {
        navigate("/auth", { replace: true });
      }
    };
    checkAccess();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const isReadOnly = role === "viewer";
  const isCmsOnly = role === "cms";

  return (
    <AdminRoleContext.Provider value={role}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AdminSidebar role={role} />
          <main className="flex-1 flex flex-col min-w-0">
            <header className="h-14 border-b border-border flex items-center px-4 sticky top-0 bg-background z-40">
              <SidebarTrigger />
              <span className="ml-auto text-xs text-muted-foreground capitalize bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                {ROLE_LABELS[role || ""] || role}
              </span>
            </header>
            {isReadOnly && (
              <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-amber-700 text-sm">
                <Eye className="h-4 w-4" />
                <span className="font-medium">Read-Only Mode</span> — You can only view data, no changes can be made.
              </div>
            )}
            {isCmsOnly && (
              <div className="bg-blue-500/10 border-b border-blue-500/30 px-4 py-2 flex items-center gap-2 text-blue-700 text-sm">
                <Eye className="h-4 w-4" />
                <span className="font-medium">CMS Mode</span> — You can only access content management.
              </div>
            )}
            <div className="flex-1 p-6 overflow-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
    </AdminRoleContext.Provider>
  );
}

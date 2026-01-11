import { useQuery } from "@tanstack/react-query";

export interface StaffPermissions {
  canViewOwnCalendar: boolean;
  canViewAllCalendars: boolean;
  canEditAppointments: boolean;
  canAccessDashboard: boolean;
  role: string | null;
  isAdmin: boolean;
  staffId?: number;
}

export function useStaffPermissions() {
  const { data: permissions, isLoading } = useQuery<StaffPermissions>({
    queryKey: ["/api/staff/permissions"],
  });

  return {
    permissions: permissions || {
      canViewOwnCalendar: false,
      canViewAllCalendars: false,
      canEditAppointments: false,
      canAccessDashboard: false,
      role: null,
      isAdmin: false,
    },
    isLoading,
    isAdmin: permissions?.isAdmin || false,
    canViewOwnCalendar: permissions?.canViewOwnCalendar || false,
    canViewAllCalendars: permissions?.canViewAllCalendars || false,
    canEditAppointments: permissions?.canEditAppointments || false,
    canAccessDashboard: permissions?.canAccessDashboard || false,
  };
}

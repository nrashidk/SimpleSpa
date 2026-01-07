import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import type { User } from "@shared/schema";
import { auth, onAuthChange, onTokenChange, logOut, type User as FirebaseUser } from "@/lib/firebase";

export function useAuth() {
  const queryClient = useQueryClient();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [firebaseLoading, setFirebaseLoading] = useState(true);

  const syncWithBackend = useCallback(async (user: FirebaseUser | null) => {
    if (user) {
      try {
        const idToken = await user.getIdToken(true);
        if (idToken) {
          const response = await fetch("/api/auth/firebase", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
            credentials: "include",
          });
          
          if (response.ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          }
        }
      } catch (error) {
        console.error("Failed to sync Firebase auth with backend:", error);
      }
    }
  }, [queryClient]);

  useEffect(() => {
    const unsubscribeAuth = onAuthChange(async (user) => {
      setFirebaseUser(user);
      setFirebaseLoading(false);
      await syncWithBackend(user);
    });

    const unsubscribeToken = onTokenChange(async (user) => {
      if (user) {
        await syncWithBackend(user);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeToken();
    };
  }, [syncWithBackend]);

  const { data: user, isLoading: apiLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !firebaseLoading,
  });

  const logout = async () => {
    await logOut();
    window.location.href = "/api/logout";
  };

  return {
    user,
    firebaseUser,
    isLoading: firebaseLoading || apiLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin" || user?.role === "super_admin",
    isSuperAdmin: user?.role === "super_admin",
    logout,
  };
}

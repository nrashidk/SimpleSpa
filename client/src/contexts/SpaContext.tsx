import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { setSelectedSpaId as setGlobalSpaId, queryClient } from "@/lib/queryClient";

interface Spa {
  id: number;
  spaName: string;
  contactEmail: string | null;
  active?: boolean;
}

interface SpaContextType {
  selectedSpaId: number | null;
  setSelectedSpaId: (id: number | null) => void;
  spas: Spa[];
  isLoading: boolean;
  selectedSpa: Spa | null;
  isSuperAdmin: boolean;
}

const SpaContext = createContext<SpaContextType | undefined>(undefined);

export function SpaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedSpaId, setSelectedSpaIdState] = useState<number | null>(null);
  const [spas, setSpas] = useState<Spa[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";

  const setSelectedSpaId = useCallback((id: number | null) => {
    setSelectedSpaIdState(id);
    setGlobalSpaId(id);
    queryClient.invalidateQueries();
    setTimeout(() => {
      queryClient.getQueryCache().findAll().forEach((query) => {
        if (query.state.status === 'error') {
          query.fetch();
        }
      });
    }, 100);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      setIsLoading(true);
      fetch("/api/admin/spas", {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSpas(data);
            if (data.length > 0 && !selectedSpaId) {
              const firstSpaId = data[0].id;
              setSelectedSpaIdState(firstSpaId);
              setGlobalSpaId(firstSpaId);
              setTimeout(() => {
                queryClient.invalidateQueries();
                setTimeout(() => {
                  queryClient.getQueryCache().findAll().forEach((query) => {
                    if (query.state.status === 'error') {
                      query.fetch();
                    }
                  });
                }, 100);
              }, 0);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to fetch spas:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (user?.adminSpaId) {
      setSelectedSpaIdState(user.adminSpaId);
      setGlobalSpaId(user.adminSpaId);
    }
  }, [isSuperAdmin, user?.adminSpaId]);

  const selectedSpa = spas.find((spa) => spa.id === selectedSpaId) || null;

  return (
    <SpaContext.Provider
      value={{
        selectedSpaId,
        setSelectedSpaId,
        spas,
        isLoading,
        selectedSpa,
        isSuperAdmin,
      }}
    >
      {children}
    </SpaContext.Provider>
  );
}

export function useSpaContext() {
  const context = useContext(SpaContext);
  if (context === undefined) {
    throw new Error("useSpaContext must be used within a SpaProvider");
  }
  return context;
}

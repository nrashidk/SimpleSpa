import { useSpaContext } from "@/contexts/SpaContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function SpaSelector() {
  const { spas, selectedSpaId, setSelectedSpaId, isLoading, isSuperAdmin } = useSpaContext();

  if (!isSuperAdmin || spas.length === 0) {
    return null;
  }

  return (
    <div className="px-3 py-2 border-b">
      <div className="flex items-center gap-2 mb-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Viewing Spa</span>
      </div>
      <Select
        value={selectedSpaId?.toString() || ""}
        onValueChange={(value) => setSelectedSpaId(parseInt(value, 10))}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full h-9">
          <SelectValue placeholder={isLoading ? "Loading..." : "Select a spa"} />
        </SelectTrigger>
        <SelectContent>
          {spas.map((spa) => (
            <SelectItem key={spa.id} value={spa.id.toString()}>
              <div className="flex items-center gap-2">
                <span>{spa.spaName}</span>
                {!spa.active && (
                  <span className="text-xs text-muted-foreground">(inactive)</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

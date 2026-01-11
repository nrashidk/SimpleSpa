import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, Star, FileText, FileSpreadsheet, FileDown, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportHeaderProps {
  title: string;
  description: string;
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  onExportPDF?: () => void;
  onDuplicate?: () => void;
  onAddToFavorites?: () => void;
}

export function ReportHeader({
  title,
  description,
  onExportCSV,
  onExportExcel,
  onExportPDF,
  onDuplicate,
  onAddToFavorites,
}: ReportHeaderProps) {
  const { toast } = useToast();

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate();
    } else {
      toast({
        title: "Coming soon",
        description: "Duplicate functionality will be available soon.",
      });
    }
  };

  const handleAddToFavorites = () => {
    if (onAddToFavorites) {
      onAddToFavorites();
    } else {
      toast({
        title: "Coming soon",
        description: "Favorites functionality will be available soon.",
      });
    }
  };

  const handleExportCSV = () => {
    if (onExportCSV) {
      onExportCSV();
    } else {
      toast({
        title: "Coming soon",
        description: "CSV export will be available soon.",
      });
    }
  };

  const handleExportExcel = () => {
    if (onExportExcel) {
      onExportExcel();
    } else {
      toast({
        title: "Coming soon",
        description: "Excel export will be available soon.",
      });
    }
  };

  const handleExportPDF = () => {
    if (onExportPDF) {
      onExportPDF();
    } else {
      toast({
        title: "Coming soon",
        description: "PDF export will be available soon.",
      });
    }
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" data-testid="button-report-options">
            Options
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleDuplicate} data-testid="button-duplicate-report">
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddToFavorites} data-testid="button-add-to-favorites">
            <Star className="h-4 w-4 mr-2" />
            Add to favorites
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-sm font-semibold">Export</div>
          <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-csv">
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportPDF} data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-2" />
            PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

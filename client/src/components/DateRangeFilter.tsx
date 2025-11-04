import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";

export type DateRangeType = 
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "last-12-months"
  | "month-to-date"
  | "custom";

interface DateRangeFilterProps {
  value: {
    type: DateRangeType;
    startDate?: string;
    endDate?: string;
    month?: string;
  };
  onChange: (value: {
    type: DateRangeType;
    startDate?: string;
    endDate?: string;
    month?: string;
  }) => void;
}

const dateRangeOptions = [
  { value: "this-month" as DateRangeType, label: "This month" },
  { value: "last-month" as DateRangeType, label: "Last month" },
  { value: "last-3-months" as DateRangeType, label: "Last 3 months" },
  { value: "last-6-months" as DateRangeType, label: "Last 6 months" },
  { value: "last-12-months" as DateRangeType, label: "Last 12 months" },
  { value: "month-to-date" as DateRangeType, label: "Month to date" },
  { value: "custom" as DateRangeType, label: "Custom range" },
];

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Internal state for editing - only propagate to parent on Apply
  const [editValue, setEditValue] = useState(value);

  // Sync internal state when popover opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setEditValue(value);
    }
    setIsOpen(open);
  };

  const getDisplayText = () => {
    const option = dateRangeOptions.find(opt => opt.value === value.type);
    if (value.type === "month-to-date" && value.month) {
      const [year, month] = value.month.split("-");
      const monthName = format(new Date(parseInt(year), parseInt(month) - 1), "MMM yyyy");
      return monthName;
    }
    if (value.type === "custom" && value.startDate && value.endDate) {
      return `${format(new Date(value.startDate), "MMM dd, yyyy")} - ${format(new Date(value.endDate), "MMM dd, yyyy")}`;
    }
    return option?.label || "Select range";
  };

  const handleTypeChange = (newType: DateRangeType) => {
    if (newType === "month-to-date") {
      setEditValue({
        type: newType,
        month: format(new Date(), "yyyy-MM"),
      });
    } else if (newType === "custom") {
      const today = format(new Date(), "yyyy-MM-dd");
      setEditValue({
        type: newType,
        startDate: today,
        endDate: today,
      });
    } else {
      setEditValue({ type: newType });
    }
  };

  const handleMonthChange = (month: string) => {
    setEditValue({
      ...editValue,
      month,
    });
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', date: string) => {
    setEditValue({
      ...editValue,
      [field]: date,
    });
  };

  const handleApply = () => {
    // Only update parent state if valid
    const isValid = editValue.type !== "custom" || 
      (editValue.startDate && editValue.endDate && editValue.startDate <= editValue.endDate);
    
    if (isValid) {
      onChange(editValue);
      setIsOpen(false);
    }
  };

  const isApplyDisabled = editValue.type === "custom" && 
    (!editValue.startDate || !editValue.endDate || editValue.startDate > editValue.endDate);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-between min-w-[200px]"
          data-testid="button-date-range-filter"
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span>{getDisplayText()}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Date Range Type</Label>
            <Select value={editValue.type} onValueChange={handleTypeChange}>
              <SelectTrigger data-testid="select-date-range-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRangeOptions.map((option) => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    data-testid={`option-${option.value}`}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {editValue.type === "month-to-date" && (
            <div className="space-y-2">
              <Label htmlFor="month-select">Select Month</Label>
              <Input
                id="month-select"
                type="month"
                value={editValue.month || format(new Date(), "yyyy-MM")}
                onChange={(e) => handleMonthChange(e.target.value)}
                data-testid="input-month-selector"
              />
            </div>
          )}

          {editValue.type === "custom" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={editValue.startDate || ""}
                  onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={editValue.endDate || ""}
                  onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  data-testid="input-end-date"
                />
              </div>
              {editValue.startDate && editValue.endDate && editValue.startDate > editValue.endDate && (
                <p className="text-sm text-destructive">
                  Start date must be before or equal to end date
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleApply}
            disabled={isApplyDisabled}
            data-testid="button-apply-filter"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

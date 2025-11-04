import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreVertical,
  TicketPercent,
  Calendar,
  CheckCircle2,
  XCircle,
  Percent,
  DollarSign,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PromoCode, Service } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

export default function AdminPromoCodes() {
  const { toast } = useToast();
  const [showNewPromoCode, setShowNewPromoCode] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState<PromoCode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired">("all");
  const [promoCodeForm, setPromoCodeForm] = useState({
    code: "",
    discountType: "percentage" as "percentage" | "flat_rate",
    discountValue: "",
    validFrom: "",
    validUntil: "",
    usageLimit: "",
    applicableServiceIds: [] as number[],
  });

  const { data: promoCodes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  const createPromoCodeMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/promo-codes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setShowNewPromoCode(false);
      resetForm();
      toast({
        title: "Promo code created",
        description: "The promo code has been created successfully.",
        duration: 3000,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create promo code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePromoCodeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/admin/promo-codes/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setShowNewPromoCode(false);
      setEditingPromoCode(null);
      resetForm();
      toast({
        title: "Promo code updated",
        description: "The promo code has been updated successfully.",
        duration: 3000,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update promo code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deactivatePromoCodeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PUT", `/api/admin/promo-codes/${id}`, { isActive: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({
        title: "Promo code deactivated",
        description: "The promo code has been deactivated successfully.",
        duration: 3000,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to deactivate promo code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPromoCodeForm({
      code: "",
      discountType: "percentage",
      discountValue: "",
      validFrom: "",
      validUntil: "",
      usageLimit: "",
      applicableServiceIds: [],
    });
  };

  const handleSavePromoCode = () => {
    if (!promoCodeForm.code || !promoCodeForm.discountValue) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      spaId: 1, // TODO: Get from auth context
      code: promoCodeForm.code.toUpperCase(),
      discountType: promoCodeForm.discountType,
      discountValue: promoCodeForm.discountValue,
      validFrom: promoCodeForm.validFrom || null,
      validUntil: promoCodeForm.validUntil || null,
      usageLimit: promoCodeForm.usageLimit ? parseInt(promoCodeForm.usageLimit) : null,
      applicableServiceIds:
        promoCodeForm.applicableServiceIds.length > 0
          ? promoCodeForm.applicableServiceIds
          : null,
    };

    if (editingPromoCode) {
      updatePromoCodeMutation.mutate({ id: editingPromoCode.id, data });
    } else {
      createPromoCodeMutation.mutate(data);
    }
  };

  const handleEdit = (promoCode: PromoCode) => {
    setEditingPromoCode(promoCode);
    const serviceIds = promoCode.applicableServices 
      ? (promoCode.applicableServices as number[])
      : [];
    setPromoCodeForm({
      code: promoCode.code,
      discountType: promoCode.discountType as "percentage" | "flat_rate",
      discountValue: promoCode.discountValue,
      validFrom: promoCode.validFrom ? format(new Date(promoCode.validFrom), "yyyy-MM-dd") : "",
      validUntil: promoCode.validUntil ? format(new Date(promoCode.validUntil), "yyyy-MM-dd") : "",
      usageLimit: promoCode.usageLimit?.toString() || "",
      applicableServiceIds: serviceIds,
    });
    setShowNewPromoCode(true);
  };

  const isPromoCodeExpired = (promoCode: PromoCode) => {
    if (!promoCode.validUntil) return false;
    return new Date(promoCode.validUntil) < new Date();
  };

  const isPromoCodeActive = (promoCode: PromoCode) => {
    if (!promoCode.isActive) return false;
    if (isPromoCodeExpired(promoCode)) return false;
    if (promoCode.usageLimit && promoCode.timesUsed >= promoCode.usageLimit) return false;
    return true;
  };

  const filteredPromoCodes = promoCodes.filter((promo) => {
    const matchesSearch = promo.code.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterStatus === "active") return matchesSearch && isPromoCodeActive(promo);
    if (filterStatus === "expired") return matchesSearch && !isPromoCodeActive(promo);
    return matchesSearch;
  });

  const toggleServiceSelection = (serviceId: number) => {
    setPromoCodeForm((prev) => ({
      ...prev,
      applicableServiceIds: prev.applicableServiceIds.includes(serviceId)
        ? prev.applicableServiceIds.filter((id) => id !== serviceId)
        : [...prev.applicableServiceIds, serviceId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TicketPercent className="h-8 w-8 text-primary" />
            Promo Codes
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage promotional discount codes
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setEditingPromoCode(null);
            setShowNewPromoCode(true);
          }}
          data-testid="button-add-promo"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Promo Code
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search promo codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-promo"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Codes</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired/Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading promo codes...</div>
          ) : filteredPromoCodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No promo codes found" : "No promo codes yet. Create your first one!"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPromoCodes.map((promo) => (
                <Card key={promo.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold" data-testid={`text-promo-code-${promo.id}`}>
                            {promo.code}
                          </h3>
                          {isPromoCodeActive(promo) ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Inactive
                            </Badge>
                          )}
                          <Badge variant="outline" className="gap-1">
                            {promo.discountType === "percentage" ? (
                              <>
                                <Percent className="h-3 w-3" />
                                {promo.discountValue}% off
                              </>
                            ) : (
                              <>
                                <DollarSign className="h-3 w-3" />
                                AED {promo.discountValue} off
                              </>
                            )}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          {promo.validFrom && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>From: {format(new Date(promo.validFrom), "MMM d, yyyy")}</span>
                            </div>
                          )}
                          {promo.validUntil && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>Until: {format(new Date(promo.validUntil), "MMM d, yyyy")}</span>
                            </div>
                          )}
                          {promo.usageLimit && (
                            <div className="text-muted-foreground">
                              Used: {promo.timesUsed} / {promo.usageLimit}
                            </div>
                          )}
                        </div>
                        
                        {(() => {
                          const serviceIds = promo.applicableServices as number[] | null;
                          if (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) {
                            return (
                              <div className="text-sm text-muted-foreground">
                                Applies to {serviceIds.length} specific service(s)
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-promo-menu-${promo.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(promo)} data-testid={`button-edit-promo-${promo.id}`}>
                            Edit
                          </DropdownMenuItem>
                          {promo.isActive && (
                            <DropdownMenuItem
                              onClick={() => deactivatePromoCodeMutation.mutate(promo.id)}
                              className="text-destructive"
                              data-testid={`button-deactivate-promo-${promo.id}`}
                            >
                              Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNewPromoCode} onOpenChange={setShowNewPromoCode}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPromoCode ? "Edit Promo Code" : "Create Promo Code"}</DialogTitle>
            <DialogDescription>
              {editingPromoCode
                ? "Update the promo code details below."
                : "Create a new promotional discount code for your customers."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Promo Code *</Label>
                <Input
                  id="code"
                  value={promoCodeForm.code}
                  onChange={(e) =>
                    setPromoCodeForm({ ...promoCodeForm, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. BIRTHDAY100"
                  data-testid="input-promo-code-form"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountType">Discount Type *</Label>
                <Select
                  value={promoCodeForm.discountType}
                  onValueChange={(value: any) =>
                    setPromoCodeForm({ ...promoCodeForm, discountType: value })
                  }
                >
                  <SelectTrigger id="discountType" data-testid="select-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="flat_rate">Flat Rate (AED)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discountValue">
                {promoCodeForm.discountType === "percentage" ? "Discount Percentage *" : "Discount Amount (AED) *"}
              </Label>
              <Input
                id="discountValue"
                type="number"
                value={promoCodeForm.discountValue}
                onChange={(e) =>
                  setPromoCodeForm({ ...promoCodeForm, discountValue: e.target.value })
                }
                placeholder={promoCodeForm.discountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                data-testid="input-discount-value"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="validFrom">Valid From</Label>
                <Input
                  id="validFrom"
                  type="date"
                  value={promoCodeForm.validFrom}
                  onChange={(e) =>
                    setPromoCodeForm({ ...promoCodeForm, validFrom: e.target.value })
                  }
                  data-testid="input-valid-from"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="validUntil">Valid Until</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={promoCodeForm.validUntil}
                  onChange={(e) =>
                    setPromoCodeForm({ ...promoCodeForm, validUntil: e.target.value })
                  }
                  data-testid="input-valid-until"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usageLimit">Usage Limit (optional)</Label>
              <Input
                id="usageLimit"
                type="number"
                value={promoCodeForm.usageLimit}
                onChange={(e) =>
                  setPromoCodeForm({ ...promoCodeForm, usageLimit: e.target.value })
                }
                placeholder="Leave empty for unlimited"
                data-testid="input-usage-limit"
              />
            </div>

            <div className="space-y-2">
              <Label>Applicable Services (optional)</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Leave unselected to apply to all services
              </p>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`service-${service.id}`}
                      checked={promoCodeForm.applicableServiceIds.includes(service.id)}
                      onCheckedChange={() => toggleServiceSelection(service.id)}
                      data-testid={`checkbox-service-${service.id}`}
                    />
                    <label
                      htmlFor={`service-${service.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {service.name} - AED {service.price}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewPromoCode(false);
                setEditingPromoCode(null);
                resetForm();
              }}
              data-testid="button-cancel-promo"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePromoCode}
              disabled={createPromoCodeMutation.isPending || updatePromoCodeMutation.isPending}
              data-testid="button-save-promo"
            >
              {editingPromoCode ? "Update" : "Create"} Promo Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  Plus, MoreVertical, Search, Layers, DollarSign, Clock, Edit, Trash2 
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Service, ServiceVariant } from "@shared/schema";

export default function ServiceVariants() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedService, setSelectedService] = useState<string>("all");
  const [showNewVariant, setShowNewVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ServiceVariant | null>(null);
  const [variantForm, setVariantForm] = useState({
    serviceId: null as number | null,
    name: "",
    description: "",
    duration: "",
    price: "",
    sku: "",
    active: true,
    displayOrder: "1",
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  const { data: variants = [], isLoading: variantsLoading } = useQuery<ServiceVariant[]>({
    queryKey: ["/api/admin/marketplace/variants"],
  });

  const createVariantMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/marketplace/variants', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/variants'] });
      setShowNewVariant(false);
      resetForm();
      toast({
        title: "Variant created",
        description: "The service variant has been added successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create variant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateVariantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/marketplace/variants/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/variants'] });
      setShowNewVariant(false);
      setEditingVariant(null);
      resetForm();
      toast({
        title: "Variant updated",
        description: "The service variant has been updated successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update variant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/marketplace/variants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/variants'] });
      toast({
        title: "Variant deleted",
        description: "The service variant has been deleted successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete variant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setVariantForm({
      serviceId: null,
      name: "",
      description: "",
      duration: "",
      price: "",
      sku: "",
      active: true,
      displayOrder: "1",
    });
  };

  const handleEdit = (variant: ServiceVariant) => {
    setEditingVariant(variant);
    setVariantForm({
      serviceId: variant.serviceId,
      name: variant.name,
      description: variant.description || "",
      duration: variant.duration?.toString() || "",
      price: variant.price || "",
      sku: variant.sku || "",
      active: variant.active ?? true,
      displayOrder: variant.displayOrder?.toString() || "1",
    });
    setShowNewVariant(true);
  };

  const handleSave = () => {
    if (!variantForm.serviceId || !variantForm.name) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      serviceId: variantForm.serviceId,
      name: variantForm.name.trim(),
      description: variantForm.description.trim() || null,
      duration: variantForm.duration ? parseInt(variantForm.duration) : null,
      price: variantForm.price || null,
      sku: variantForm.sku || null,
      active: variantForm.active,
      displayOrder: parseInt(variantForm.displayOrder) || 0,
    };

    if (editingVariant) {
      updateVariantMutation.mutate({ id: editingVariant.id, data });
    } else {
      createVariantMutation.mutate(data);
    }
  };

  const filteredVariants = variants.filter((variant) => {
    const matchesSearch = variant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesService = selectedService === "all" || variant.serviceId.toString() === selectedService;
    return matchesSearch && matchesService;
  });

  const getServiceName = (serviceId: number) => {
    const service = services.find(s => s.id === serviceId);
    return service?.name || "Unknown Service";
  };

  if (servicesLoading || variantsLoading) {
    return <div className="flex items-center justify-center h-64">Loading variants...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search variants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-variants"
            />
          </div>
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger className="w-[200px]" data-testid="select-service-filter">
              <SelectValue placeholder="Filter by service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id.toString()}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => {
          resetForm();
          setEditingVariant(null);
          setShowNewVariant(true);
        }} data-testid="button-add-variant">
          <Plus className="h-4 w-4 mr-2" />
          Add Variant
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredVariants.map((variant) => (
          <Card key={variant.id} data-testid={`card-variant-${variant.id}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <div className="flex-1">
                <CardTitle className="text-base">{variant.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {getServiceName(variant.serviceId)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-variant-menu-${variant.id}`}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEdit(variant)} data-testid={`button-edit-variant-${variant.id}`}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => deleteVariantMutation.mutate(variant.id)}
                    className="text-destructive"
                    data-testid={`button-delete-variant-${variant.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-3">
              {variant.description && (
                <p className="text-sm text-muted-foreground">{variant.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                {variant.duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{variant.duration} min</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>AED {variant.price || "0.00"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={variant.active ? "default" : "secondary"}>
                  {variant.active ? "Active" : "Inactive"}
                </Badge>
                {variant.displayOrder !== null && variant.displayOrder !== undefined && (
                  <Badge variant="outline">Order: {variant.displayOrder}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredVariants.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery || selectedService !== "all" 
                ? "No variants found matching your filters." 
                : "No service variants yet. Add your first variant to get started."}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewVariant} onOpenChange={(open) => {
        setShowNewVariant(open);
        if (!open) {
          setEditingVariant(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingVariant ? "Edit Variant" : "Add New Variant"}</DialogTitle>
            <DialogDescription>
              {editingVariant 
                ? "Update the variant details below" 
                : "Create a new size or duration option for a service"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="variant-service">Service *</Label>
              <Select
                value={variantForm.serviceId?.toString() || ""}
                onValueChange={(value) => setVariantForm({ ...variantForm, serviceId: parseInt(value) })}
              >
                <SelectTrigger data-testid="select-variant-service">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id.toString()}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-name">Variant Name *</Label>
                <Input
                  id="variant-name"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                  placeholder="e.g., 60 Minutes, Large"
                  data-testid="input-variant-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-duration">Duration (minutes)</Label>
                <Input
                  id="variant-duration"
                  type="number"
                  value={variantForm.duration}
                  onChange={(e) => setVariantForm({ ...variantForm, duration: e.target.value })}
                  placeholder="60"
                  data-testid="input-variant-duration"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-description">Description</Label>
              <Input
                id="variant-description"
                value={variantForm.description}
                onChange={(e) => setVariantForm({ ...variantForm, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-variant-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-price">Price (AED)</Label>
                <Input
                  id="variant-price"
                  value={variantForm.price}
                  onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                  placeholder="100.00"
                  data-testid="input-variant-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-sku">SKU (Optional)</Label>
                <Input
                  id="variant-sku"
                  value={variantForm.sku}
                  onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                  placeholder="VAR-001"
                  data-testid="input-variant-sku"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-display-order">Display Order</Label>
                <Input
                  id="variant-display-order"
                  type="number"
                  value={variantForm.displayOrder}
                  onChange={(e) => setVariantForm({ ...variantForm, displayOrder: e.target.value })}
                  placeholder="0"
                  data-testid="input-variant-display-order"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-active">Status</Label>
                <Select
                  value={variantForm.active.toString()}
                  onValueChange={(value) => setVariantForm({ ...variantForm, active: value === "true" })}
                >
                  <SelectTrigger data-testid="select-variant-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNewVariant(false);
                setEditingVariant(null);
                resetForm();
              }}
              data-testid="button-cancel-variant"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createVariantMutation.isPending || updateVariantMutation.isPending}
              data-testid="button-save-variant"
            >
              {editingVariant ? "Update Variant" : "Add Variant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

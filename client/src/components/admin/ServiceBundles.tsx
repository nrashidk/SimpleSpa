import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Plus, MoreVertical, Search, Package, DollarSign, Edit, Trash2, X 
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Service, ServiceBundle, ServiceBundleItem } from "@shared/schema";

export default function ServiceBundles() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewBundle, setShowNewBundle] = useState(false);
  const [editingBundle, setEditingBundle] = useState<ServiceBundle | null>(null);
  const [bundleForm, setBundleForm] = useState({
    name: "",
    description: "",
    customPrice: "",
    active: true,
    selectedServices: [] as { serviceId: number; quantity: number }[],
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  const { data: bundles = [], isLoading: bundlesLoading } = useQuery<ServiceBundle[]>({
    queryKey: ["/api/admin/marketplace/bundles"],
  });

  const { data: allBundleItems = [] } = useQuery<ServiceBundleItem[]>({
    queryKey: ["/api/admin/marketplace/bundle-items"],
  });

  const createBundleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/marketplace/bundles', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundle-items'] });
      setShowNewBundle(false);
      resetForm();
      toast({
        title: "Bundle created",
        description: "The service bundle has been added successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create bundle. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBundleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/marketplace/bundles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundle-items'] });
      setShowNewBundle(false);
      setEditingBundle(null);
      resetForm();
      toast({
        title: "Bundle updated",
        description: "The service bundle has been updated successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update bundle. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteBundleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/marketplace/bundles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marketplace/bundle-items'] });
      toast({
        title: "Bundle deleted",
        description: "The service bundle has been deleted successfully.",
        duration: 3000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete bundle. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setBundleForm({
      name: "",
      description: "",
      customPrice: "",
      active: true,
      selectedServices: [],
    });
  };

  const handleEdit = async (bundle: ServiceBundle) => {
    setEditingBundle(bundle);
    
    const items = allBundleItems.filter(item => item.bundleId === bundle.id);
    const selectedServices = items.map(item => ({
      serviceId: item.serviceId,
      quantity: item.quantity ?? 1,
    }));

    setBundleForm({
      name: bundle.name,
      description: bundle.description || "",
      customPrice: bundle.customPrice || "",
      active: bundle.active ?? true,
      selectedServices,
    });
    setShowNewBundle(true);
  };

  const handleSave = () => {
    if (!bundleForm.name || bundleForm.selectedServices.length === 0) {
      toast({
        title: "Error",
        description: "Please provide a bundle name and select at least one service.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name: bundleForm.name.trim(),
      description: bundleForm.description.trim() || null,
      customPrice: bundleForm.customPrice || null,
      active: bundleForm.active,
      services: bundleForm.selectedServices,
    };

    if (editingBundle) {
      updateBundleMutation.mutate({ id: editingBundle.id, data });
    } else {
      createBundleMutation.mutate(data);
    }
  };

  const toggleService = (serviceId: number) => {
    const existing = bundleForm.selectedServices.find(s => s.serviceId === serviceId);
    if (existing) {
      setBundleForm({
        ...bundleForm,
        selectedServices: bundleForm.selectedServices.filter(s => s.serviceId !== serviceId),
      });
    } else {
      setBundleForm({
        ...bundleForm,
        selectedServices: [...bundleForm.selectedServices, { serviceId, quantity: 1 }],
      });
    }
  };

  const updateQuantity = (serviceId: number, quantity: number) => {
    setBundleForm({
      ...bundleForm,
      selectedServices: bundleForm.selectedServices.map(s =>
        s.serviceId === serviceId ? { ...s, quantity } : s
      ),
    });
  };

  const filteredBundles = bundles.filter((bundle) => {
    const matchesSearch = bundle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bundle.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getServiceName = (serviceId: number) => {
    const service = services.find(s => s.id === serviceId);
    return service?.name || "Unknown Service";
  };

  const getBundleItems = (bundleId: number) => {
    return allBundleItems.filter(item => item.bundleId === bundleId);
  };

  const calculateTotalValue = (bundleId: number) => {
    const items = getBundleItems(bundleId);
    let total = 0;
    items.forEach(item => {
      const service = services.find(s => s.id === item.serviceId);
      if (service?.price) {
        total += parseFloat(service.price) * (item.quantity ?? 1);
      }
    });
    return total;
  };

  if (servicesLoading || bundlesLoading) {
    return <div className="flex items-center justify-center h-64">Loading bundles...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bundles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-bundles"
            />
          </div>
        </div>
        <Button onClick={() => {
          resetForm();
          setEditingBundle(null);
          setShowNewBundle(true);
        }} data-testid="button-add-bundle">
          <Plus className="h-4 w-4 mr-2" />
          Add Bundle
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredBundles.map((bundle) => {
          const items = getBundleItems(bundle.id);
          const totalValue = calculateTotalValue(bundle.id);
          const savings = totalValue - (parseFloat(bundle.customPrice || "0"));

          return (
            <Card key={bundle.id} data-testid={`card-bundle-${bundle.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <div className="flex-1">
                  <CardTitle className="text-base">{bundle.name}</CardTitle>
                  {bundle.description && (
                    <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-bundle-menu-${bundle.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(bundle)} data-testid={`button-edit-bundle-${bundle.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => deleteBundleMutation.mutate(bundle.id)}
                      className="text-destructive"
                      data-testid={`button-delete-bundle-${bundle.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Included Services:</p>
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span>{getServiceName(item.serviceId)}</span>
                      <span className="text-muted-foreground">×{item.quantity ?? 1}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Value:</span>
                    <span className="line-through">AED {totalValue.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span>Bundle Price:</span>
                    <span className="text-primary">AED {bundle.customPrice || "0.00"}</span>
                  </div>
                  {savings > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>You Save:</span>
                      <span>AED {savings.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={bundle.active ? "default" : "secondary"}>
                    {bundle.active ? "Active" : "Inactive"}
                  </Badge>
                  {bundle.featured && (
                    <Badge variant="outline">Featured</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredBundles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery 
                ? "No bundles found matching your search." 
                : "No service bundles yet. Create your first bundle to offer package deals."}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showNewBundle} onOpenChange={(open) => {
        setShowNewBundle(open);
        if (!open) {
          setEditingBundle(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBundle ? "Edit Bundle" : "Add New Bundle"}</DialogTitle>
            <DialogDescription>
              {editingBundle 
                ? "Update the bundle details below" 
                : "Create a new service package with discounted pricing"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bundle-name">Bundle Name *</Label>
              <Input
                id="bundle-name"
                value={bundleForm.name}
                onChange={(e) => setBundleForm({ ...bundleForm, name: e.target.value })}
                placeholder="e.g., Relaxation Package"
                data-testid="input-bundle-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bundle-description">Description</Label>
              <Textarea
                id="bundle-description"
                value={bundleForm.description}
                onChange={(e) => setBundleForm({ ...bundleForm, description: e.target.value })}
                placeholder="Describe what's included in this bundle"
                rows={3}
                data-testid="input-bundle-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Select Services *</Label>
              <div className="border rounded-md p-4 space-y-2 max-h-64 overflow-y-auto">
                {services.map((service) => {
                  const selected = bundleForm.selectedServices.find(s => s.serviceId === service.id);
                  return (
                    <div key={service.id} className="flex items-center gap-4">
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={() => toggleService(service.id)}
                        data-testid={`checkbox-bundle-service-${service.id}`}
                      />
                      <span className="flex-1">{service.name}</span>
                      {selected && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Qty:</Label>
                          <Input
                            type="number"
                            min="1"
                            value={selected.quantity}
                            onChange={(e) => updateQuantity(service.id, parseInt(e.target.value) || 1)}
                            className="w-16 h-8"
                            data-testid={`input-bundle-quantity-${service.id}`}
                          />
                        </div>
                      )}
                      <span className="text-sm text-muted-foreground">
                        AED {service.price || "0.00"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bundle-price">Bundle Price (AED) *</Label>
              <Input
                id="bundle-price"
                value={bundleForm.customPrice}
                onChange={(e) => setBundleForm({ ...bundleForm, customPrice: e.target.value })}
                placeholder="250.00"
                data-testid="input-bundle-price"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bundle-active">Status</Label>
              <Select
                value={bundleForm.active.toString()}
                onValueChange={(value) => setBundleForm({ ...bundleForm, active: value === "true" })}
              >
                <SelectTrigger data-testid="select-bundle-active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNewBundle(false);
                setEditingBundle(null);
                resetForm();
              }}
              data-testid="button-cancel-bundle"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createBundleMutation.isPending || updateBundleMutation.isPending}
              data-testid="button-save-bundle"
            >
              {editingBundle ? "Update Bundle" : "Add Bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

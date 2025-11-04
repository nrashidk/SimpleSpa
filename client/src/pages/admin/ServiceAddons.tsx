import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { 
  Plus, Search, Edit, Trash2, MoreVertical, ChevronRight, 
  Settings as SettingsIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ServiceAddon = {
  id: number;
  name: string;
  description: string | null;
  selectionType: string;
  required: boolean;
  displayOrder: number | null;
  active: boolean | null;
  categoryId: number | null;
};

type AddonOption = {
  id: number;
  addonId: number;
  name: string;
  description: string | null;
  price: string;
  extraTimeMinutes: number | null;
  displayOrder: number | null;
  active: boolean | null;
};

type ServiceCategory = {
  id: number;
  name: string;
};

export default function ServiceAddons() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showNewAddon, setShowNewAddon] = useState(false);
  const [editingAddon, setEditingAddon] = useState<ServiceAddon | null>(null);
  const [expandedAddon, setExpandedAddon] = useState<number | null>(null);
  const [showOptionDialog, setShowOptionDialog] = useState(false);
  const [editingOption, setEditingOption] = useState<AddonOption | null>(null);
  const [currentAddonId, setCurrentAddonId] = useState<number | null>(null);

  const [addonForm, setAddonForm] = useState({
    name: "",
    description: "",
    selectionType: "single",
    required: false,
    categoryId: null as number | null,
    active: true,
  });

  const [optionForm, setOptionForm] = useState({
    name: "",
    description: "",
    price: "",
    extraTimeMinutes: "",
  });

  const { data: addons = [], isLoading: addonsLoading } = useQuery<ServiceAddon[]>({
    queryKey: ["/api/admin/service-addons"],
  });

  const { data: allOptions = [], isLoading: optionsLoading } = useQuery<AddonOption[]>({
    queryKey: ["/api/admin/service-addon-options"],
  });

  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/admin/service-categories"],
  });

  const createAddonMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/service-addons', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addons'] });
      setShowNewAddon(false);
      resetAddonForm();
      toast({
        title: "Add-on created",
        description: "The service add-on has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create add-on. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAddonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/service-addons/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addons'] });
      setShowNewAddon(false);
      setEditingAddon(null);
      resetAddonForm();
      toast({
        title: "Add-on updated",
        description: "The service add-on has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update add-on. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAddonMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/service-addons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addons'] });
      toast({
        title: "Add-on deleted",
        description: "The service add-on has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete add-on. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createOptionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/service-addon-options', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addon-options'] });
      setShowOptionDialog(false);
      resetOptionForm();
      toast({
        title: "Option created",
        description: "The add-on option has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/service-addon-options/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addon-options'] });
      setShowOptionDialog(false);
      setEditingOption(null);
      resetOptionForm();
      toast({
        title: "Option updated",
        description: "The add-on option has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/service-addon-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-addon-options'] });
      toast({
        title: "Option deleted",
        description: "The add-on option has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetAddonForm = () => {
    setAddonForm({
      name: "",
      description: "",
      selectionType: "single",
      required: false,
      categoryId: null,
      active: true,
    });
  };

  const resetOptionForm = () => {
    setOptionForm({
      name: "",
      description: "",
      price: "",
      extraTimeMinutes: "",
    });
  };

  const handleEditAddon = (addon: ServiceAddon) => {
    setEditingAddon(addon);
    setAddonForm({
      name: addon.name,
      description: addon.description || "",
      selectionType: addon.selectionType,
      required: addon.required,
      categoryId: addon.categoryId,
      active: addon.active ?? true,
    });
    setShowNewAddon(true);
  };

  const handleSaveAddon = () => {
    if (!addonForm.name) {
      toast({
        title: "Validation error",
        description: "Please enter an add-on name.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name: addonForm.name.trim(),
      description: addonForm.description.trim() || null,
      selectionType: addonForm.selectionType,
      required: addonForm.required,
      categoryId: addonForm.categoryId,
      active: addonForm.active,
    };

    if (editingAddon) {
      updateAddonMutation.mutate({ id: editingAddon.id, data });
    } else {
      createAddonMutation.mutate(data);
    }
  };

  const handleAddOption = (addonId: number) => {
    setCurrentAddonId(addonId);
    setEditingOption(null);
    resetOptionForm();
    setShowOptionDialog(true);
  };

  const handleEditOption = (option: AddonOption) => {
    setCurrentAddonId(option.addonId);
    setEditingOption(option);
    setOptionForm({
      name: option.name,
      description: option.description || "",
      price: option.price || "",
      extraTimeMinutes: option.extraTimeMinutes?.toString() || "",
    });
    setShowOptionDialog(true);
  };

  const handleSaveOption = () => {
    if (!optionForm.name || !currentAddonId) {
      toast({
        title: "Validation error",
        description: "Please enter an option name.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      addonId: currentAddonId,
      name: optionForm.name.trim(),
      description: optionForm.description.trim() || null,
      price: optionForm.price || null,
      extraTimeMinutes: optionForm.extraTimeMinutes ? parseInt(optionForm.extraTimeMinutes) : null,
    };

    if (editingOption) {
      updateOptionMutation.mutate({ id: editingOption.id, data });
    } else {
      createOptionMutation.mutate(data);
    }
  };

  const getAddonOptions = (addonId: number) => {
    return allOptions.filter(opt => opt.addonId === addonId);
  };

  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return null;
    return categories.find(c => c.id === categoryId)?.name;
  };

  const filteredAddons = addons.filter((addon) => {
    const matchesSearch = addon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addon.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || addon.categoryId?.toString() === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (addonsLoading || optionsLoading) {
    return <div className="flex items-center justify-center h-64">Loading add-ons...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Service Add-ons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage optional extras and upgrades for your services
          </p>
        </div>
        <Button onClick={() => {
          resetAddonForm();
          setEditingAddon(null);
          setShowNewAddon(true);
        }} data-testid="button-add-addon">
          <Plus className="h-4 w-4 mr-2" />
          New Add-on Group
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search add-ons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-addons"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48" data-testid="select-category-filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id.toString()}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredAddons.map((addon) => {
          const options = getAddonOptions(addon.id);
          const isExpanded = expandedAddon === addon.id;

          return (
            <Card key={addon.id} data-testid={`card-addon-${addon.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    {addon.name}
                    {addon.required && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                  </CardTitle>
                  {addon.description && (
                    <p className="text-sm text-muted-foreground mt-1">{addon.description}</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid={`button-addon-menu-${addon.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditAddon(addon)} data-testid={`button-edit-addon-${addon.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => deleteAddonMutation.mutate(addon.id)}
                      className="text-destructive"
                      data-testid={`button-delete-addon-${addon.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">
                    {addon.selectionType === "single" ? "Single Select" : "Multi Select"}
                  </Badge>
                  <Badge variant={addon.active ? "default" : "secondary"}>
                    {addon.active ? "Active" : "Inactive"}
                  </Badge>
                  {addon.categoryId && (
                    <Badge variant="outline">{getCategoryName(addon.categoryId)}</Badge>
                  )}
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Options ({options.length})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddOption(addon.id)}
                      data-testid={`button-add-option-${addon.id}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>

                  {options.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No options yet
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {options.slice(0, isExpanded ? undefined : 3).map((option) => (
                        <div
                          key={option.id}
                          className="flex items-center justify-between text-sm p-2 rounded hover-elevate"
                          data-testid={`option-item-${option.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{option.name}</p>
                            <p className="text-xs text-muted-foreground">
                              AED {option.price || "0.00"}
                              {option.extraTimeMinutes && ` • +${option.extraTimeMinutes}min`}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                data-testid={`button-option-menu-${option.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditOption(option)} data-testid={`button-edit-option-${option.id}`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteOptionMutation.mutate(option.id)}
                                className="text-destructive"
                                data-testid={`button-delete-option-${option.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                      {options.length > 3 && !isExpanded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setExpandedAddon(addon.id)}
                          data-testid={`button-expand-${addon.id}`}
                        >
                          Show {options.length - 3} more
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                      {isExpanded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setExpandedAddon(null)}
                          data-testid={`button-collapse-${addon.id}`}
                        >
                          Show less
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredAddons.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <SettingsIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No add-ons found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== "all"
                ? "Try adjusting your filters"
                : "Get started by creating your first add-on group"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add-on Dialog */}
      <Dialog open={showNewAddon} onOpenChange={setShowNewAddon}>
        <DialogContent className="max-w-2xl" data-testid="dialog-addon">
          <DialogHeader>
            <DialogTitle>{editingAddon ? "Edit Add-on Group" : "New Add-on Group"}</DialogTitle>
            <DialogDescription>
              Create a group of optional extras that customers can add to their service
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addon-name">Name *</Label>
              <Input
                id="addon-name"
                value={addonForm.name}
                onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                placeholder="e.g., Aromatherapy Options"
                data-testid="input-addon-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="addon-description">Description</Label>
              <Textarea
                id="addon-description"
                value={addonForm.description}
                onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
                placeholder="Describe this add-on group..."
                rows={3}
                data-testid="input-addon-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="addon-selection-type">Selection Type</Label>
                <Select
                  value={addonForm.selectionType}
                  onValueChange={(value) => setAddonForm({ ...addonForm, selectionType: value })}
                >
                  <SelectTrigger data-testid="select-addon-selection-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Select</SelectItem>
                    <SelectItem value="multiple">Multi Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="addon-category">Category (Optional)</Label>
                <Select
                  value={addonForm.categoryId?.toString() || "none"}
                  onValueChange={(value) => 
                    setAddonForm({ ...addonForm, categoryId: value === "none" ? null : parseInt(value) })
                  }
                >
                  <SelectTrigger data-testid="select-addon-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addon-required"
                  checked={addonForm.required}
                  onChange={(e) => setAddonForm({ ...addonForm, required: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="checkbox-addon-required"
                />
                <Label htmlFor="addon-required" className="cursor-pointer">
                  Required
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="addon-active"
                  checked={addonForm.active}
                  onChange={(e) => setAddonForm({ ...addonForm, active: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="checkbox-addon-active"
                />
                <Label htmlFor="addon-active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewAddon(false);
                setEditingAddon(null);
                resetAddonForm();
              }}
              data-testid="button-cancel-addon"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAddon}
              disabled={createAddonMutation.isPending || updateAddonMutation.isPending}
              data-testid="button-save-addon"
            >
              {editingAddon ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Option Dialog */}
      <Dialog open={showOptionDialog} onOpenChange={setShowOptionDialog}>
        <DialogContent data-testid="dialog-option">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Option" : "New Option"}</DialogTitle>
            <DialogDescription>
              Add an option that customers can select for this add-on group
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="option-name">Name *</Label>
              <Input
                id="option-name"
                value={optionForm.name}
                onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
                placeholder="e.g., Lavender Aromatherapy"
                data-testid="input-option-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="option-description">Description</Label>
              <Textarea
                id="option-description"
                value={optionForm.description}
                onChange={(e) => setOptionForm({ ...optionForm, description: e.target.value })}
                placeholder="Describe this option..."
                rows={2}
                data-testid="input-option-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="option-price">Price (AED)</Label>
                <Input
                  id="option-price"
                  value={optionForm.price}
                  onChange={(e) => setOptionForm({ ...optionForm, price: e.target.value })}
                  placeholder="15.00"
                  data-testid="input-option-price"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="option-time">Extra Time (min)</Label>
                <Input
                  id="option-time"
                  type="number"
                  value={optionForm.extraTimeMinutes}
                  onChange={(e) => setOptionForm({ ...optionForm, extraTimeMinutes: e.target.value })}
                  placeholder="10"
                  data-testid="input-option-time"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowOptionDialog(false);
                setEditingOption(null);
                resetOptionForm();
              }}
              data-testid="button-cancel-option"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOption}
              disabled={createOptionMutation.isPending || updateOptionMutation.isPending}
              data-testid="button-save-option"
            >
              {editingOption ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

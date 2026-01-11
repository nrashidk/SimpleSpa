import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, AlertTriangle, Package, Tag, FolderOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@shared/schema";

type InventorySection = "products" | "brands" | "categories";

export default function AdminInventory() {
  const [selectedSection, setSelectedSection] = useState<InventorySection>("products");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/admin/products'],
  });

  const getStockStatus = (stock: number, reorderLevel: number) => {
    if (stock <= reorderLevel) {
      return { label: "Low Stock", variant: "destructive" as const };
    }
    return { label: "In Stock", variant: "secondary" as const };
  };

  const lowStockCount = products.filter(p => (p.stockQuantity || 0) <= (p.reorderLevel || 0)).length;

  const menuSections = [
    {
      title: "Inventory",
      items: [
        { id: "products" as InventorySection, label: "Products", icon: Package },
        { id: "brands" as InventorySection, label: "Brands", icon: Tag },
        { id: "categories" as InventorySection, label: "Categories", icon: FolderOpen },
      ]
    }
  ];

  const renderProducts = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your retail products and inventory
          </p>
        </div>
        <Button data-testid="button-add-product">
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-100">Low Stock Alert</p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {lowStockCount} product{lowStockCount > 1 ? 's' : ''} need to be reordered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const stockStatus = getStockStatus(product.stockQuantity || 0, product.reorderLevel || 0);
          const costPrice = parseFloat(product.costPrice || "0");
          const sellingPrice = parseFloat(product.sellingPrice || "0");
          const profitMargin = sellingPrice > 0 ? Math.round(((sellingPrice - costPrice) / sellingPrice) * 100) : 0;
          
          return (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">SKU: {product.sku || 'N/A'}</p>
                  </div>
                  <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium">{product.categoryId || 'Uncategorized'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stock</span>
                    <span className="font-semibold" data-testid={`product-stock-${product.id}`}>
                      {product.stockQuantity || 0} units
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Reorder at</span>
                    <span className="font-medium">{product.reorderLevel || 0} units</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cost</span>
                    <span className="font-medium">AED {costPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Selling Price</span>
                    <span className="font-semibold">AED {sellingPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Profit Margin</span>
                    <Badge variant="secondary">
                      {profitMargin}%
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  data-testid={`button-edit-product-${product.id}`}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit Product
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderContent = () => {
    if (selectedSection === "products") {
      return renderProducts();
    }

    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>{selectedSection.charAt(0).toUpperCase() + selectedSection.slice(1)} coming soon</p>
      </div>
    );
  };

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 space-y-6">
        <h1 className="text-xl font-bold">Inventory</h1>
        
        {menuSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              {section.title}
            </h3>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedSection(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover-elevate ${
                    selectedSection === item.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                  }`}
                  data-testid={`nav-${item.id}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}

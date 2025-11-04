import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Link as LinkIcon, Search } from "lucide-react";

export default function AdminMarketplace() {
  const integrations: any[] = [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="marketplace-title">Marketplace</h1>
          <p className="text-muted-foreground">Discover integrations to grow your business</p>
        </div>
        <Button variant="outline" data-testid="button-browse-all">
          <Search className="h-4 w-4 mr-2" />
          Browse All
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              ROI Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">+35%</p>
              <p className="text-sm text-muted-foreground">Average revenue increase with integrations</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-blue-600" />
              Connected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">2</p>
              <p className="text-sm text-muted-foreground">Active integrations</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-2xl font-bold">24</p>
              <p className="text-sm text-muted-foreground">More integrations to explore</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <span className="flex-1">{integration.name}</span>
                {integration.connected && (
                  <Badge variant="default">Connected</Badge>
                )}
              </CardTitle>
              <Badge variant="secondary" className="w-fit">
                {integration.category}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{integration.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-600">{integration.roi}</span>
                <Button
                  variant={integration.connected ? "outline" : "default"}
                  size="sm"
                  data-testid={`button-integration-${integration.id}`}
                >
                  {integration.connected ? "Manage" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

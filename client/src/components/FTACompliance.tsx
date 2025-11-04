import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FTACompliance() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Fetch VAT Return Report
  const { data: vatReport, isLoading: vatLoading, refetch: refetchVAT } = useQuery({
    queryKey: ['/api/admin/vat-report', dateFrom, dateTo],
    enabled: false, // Only fetch when user clicks "Generate Report"
  });

  // Fetch Amendment Logs
  const { data: amendments = [], isLoading: amendmentsLoading } = useQuery({
    queryKey: ['/api/admin/amendments'],
  });

  // Fetch Backup Logs
  const { data: backupLogs = [], isLoading: backupsLoading } = useQuery({
    queryKey: ['/api/admin/backup-logs'],
  });

  // Export FAF mutation
  const exportFAF = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/export-faf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateFrom, endDate: dateTo }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('FAF export failed');
      }
      
      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FAF_Export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "FTA Audit File exported successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to export FAF file",
        variant: "destructive",
      });
    },
  });

  const handleGenerateVATReport = () => {
    refetchVAT();
    toast({
      title: "Generating Report",
      description: "VAT return report is being generated...",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2" data-testid="text-fta-title">UAE FTA Compliance</h2>
        <p className="text-muted-foreground" data-testid="text-fta-description">
          VAT reporting, audit file exports, and compliance tracking for UAE Federal Tax Authority
        </p>
      </div>

      <Tabs defaultValue="vat-report" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vat-report" data-testid="tab-vat-report">VAT Return Report</TabsTrigger>
          <TabsTrigger value="faf-export" data-testid="tab-faf-export">FAF Export</TabsTrigger>
          <TabsTrigger value="amendments" data-testid="tab-amendments">Amendment Logs</TabsTrigger>
          <TabsTrigger value="backups" data-testid="tab-backups">Backup Logs</TabsTrigger>
        </TabsList>

        {/* VAT Return Report Tab */}
        <TabsContent value="vat-report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-vat-report-title">VAT Return Report</CardTitle>
              <CardDescription>Comprehensive VAT summary across all revenue streams</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vat-from">From Date</Label>
                  <Input
                    id="vat-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="input-vat-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="vat-to">To Date</Label>
                  <Input
                    id="vat-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="input-vat-to-date"
                  />
                </div>
              </div>
              <Button onClick={handleGenerateVATReport} disabled={vatLoading} data-testid="button-generate-vat-report">
                <FileText className="w-4 h-4 mr-2" />
                Generate VAT Report
              </Button>

              {vatReport && (
                <div className="space-y-4 mt-6">
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Revenue</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold" data-testid="text-total-gross">
                          AED {vatReport.totals.overall.totalGross.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Net Amount</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold" data-testid="text-total-net">
                          AED {vatReport.totals.overall.totalNet.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total VAT</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-primary" data-testid="text-total-vat">
                          AED {vatReport.totals.overall.totalVAT.toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Revenue Stream</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Net Amount</TableHead>
                        <TableHead className="text-right">VAT Amount</TableHead>
                        <TableHead className="text-right">Gross Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Service Bookings</TableCell>
                        <TableCell className="text-right">{vatReport.totals.services.count}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.services.netAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.services.vatAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.services.grossAmount.toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Product Sales</TableCell>
                        <TableCell className="text-right">{vatReport.totals.products.count}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.products.netAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.products.vatAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.products.grossAmount.toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Loyalty Cards</TableCell>
                        <TableCell className="text-right">{vatReport.totals.loyalty.count}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.loyalty.netAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.loyalty.vatAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">AED {vatReport.totals.loyalty.grossAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAF Export Tab */}
        <TabsContent value="faf-export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-faf-export-title">FTA Audit File (FAF) Export</CardTitle>
              <CardDescription>Generate CSV export for UAE Federal Tax Authority compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="faf-from">From Date</Label>
                  <Input
                    id="faf-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="input-faf-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="faf-to">To Date</Label>
                  <Input
                    id="faf-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="input-faf-to-date"
                  />
                </div>
              </div>
              <Button 
                onClick={() => exportFAF.mutate()} 
                disabled={exportFAF.isPending}
                data-testid="button-export-faf"
              >
                <Download className="w-4 h-4 mr-2" />
                {exportFAF.isPending ? 'Exporting...' : 'Export FAF File'}
              </Button>
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  What's included in FAF Export?
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Service bookings with VAT breakdown</li>
                  <li>• Retail product sales</li>
                  <li>• Loyalty card purchases</li>
                  <li>• Invoices and payment transactions</li>
                  <li>• Tax codes (SR, ZR, ES, OP) for each transaction</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Amendment Logs Tab */}
        <TabsContent value="amendments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-amendments-title">Amendment Logs</CardTitle>
              <CardDescription>Audit trail of all data changes for compliance</CardDescription>
            </CardHeader>
            <CardContent>
              {amendmentsLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : amendments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No amendments logged yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Record ID</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {amendments.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.amendDate), 'PPp')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.changeType === 'DELETE' ? 'destructive' : 'default'}>
                            {log.changeType}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.tableName}</TableCell>
                        <TableCell>{log.recordId}</TableCell>
                        <TableCell>{log.amendedByName || 'System'}</TableCell>
                        <TableCell className="max-w-xs truncate">{log.reason || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Logs Tab */}
        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-backups-title">Backup Logs</CardTitle>
              <CardDescription>Database backup history for disaster recovery</CardDescription>
            </CardHeader>
            <CardContent>
              {backupsLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : backupLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No backups logged yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Backup Time</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.backupTime), 'PPp')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.fileName}</TableCell>
                        <TableCell>{log.backupType}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={log.status === 'success' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}
                          >
                            {log.status === 'success' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {log.status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                            {log.status === 'partial' && <Clock className="w-3 h-3 mr-1" />}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.fileSize ? `${(log.fileSize / 1024 / 1024).toFixed(2)} MB` : '-'}</TableCell>
                        <TableCell>{log.location || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

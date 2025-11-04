import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Mail, MessageSquare, Plus, Search, Filter, SlidersHorizontal,
  Bell, Calendar, Clock, Gift, PartyPopper, Crown, ThumbsUp, Heart,
  Sparkles, CalendarCheck, UserPlus, Users2, Zap, MessageCircle,
  Tag, Percent, ChevronRight, MoreVertical
} from "lucide-react";

type MarketingSection = "blast-campaigns" | "automations" | "messages-history" | "deals" | "smart-pricing" | "reviews";

export default function AdminMarketing() {
  const [selectedSection, setSelectedSection] = useState<MarketingSection>("blast-campaigns");
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [selectedDealType, setSelectedDealType] = useState<string | null>(null);
  const [selectedAutomationTab, setSelectedAutomationTab] = useState("reminders");

  const menuSections = [
    {
      title: "Messaging",
      items: [
        { id: "blast-campaigns" as MarketingSection, label: "Blast campaigns", icon: MessageSquare },
        { id: "automations" as MarketingSection, label: "Automations", icon: Zap },
        { id: "messages-history" as MarketingSection, label: "Messages history", icon: Clock },
      ]
    },
    {
      title: "Promotion",
      items: [
        { id: "deals" as MarketingSection, label: "Deals", icon: Tag },
        { id: "smart-pricing" as MarketingSection, label: "Smart pricing", icon: Percent },
      ]
    },
    {
      title: "Engage",
      items: [
        { id: "reviews" as MarketingSection, label: "Reviews", icon: ThumbsUp },
      ]
    }
  ];

  const blastCampaigns: any[] = [];

  const messagesHistory: any[] = [];

  const automationTabs = [
    { id: "reminders", label: "Reminders" },
    { id: "appointment-updates", label: "Appointment updates" },
    { id: "waitlist-updates", label: "Waitlist updates" },
    { id: "increase-bookings", label: "Increase bookings" },
    { id: "celebrate-milestones", label: "Celebrate milestones" },
    { id: "client-loyalty", label: "Client loyalty" },
  ];

  const reminderAutomations: any[] = [];

  const appointmentUpdateAutomations: any[] = [];

  const waitlistAutomations: any[] = [];

  const increaseBookingsAutomations: any[] = [];

  const celebrateMilestonesAutomations: any[] = [];

  const clientLoyaltyAutomations: any[] = [];

  const getAutomationsByTab = () => {
    switch (selectedAutomationTab) {
      case "reminders":
        return reminderAutomations;
      case "appointment-updates":
        return appointmentUpdateAutomations;
      case "waitlist-updates":
        return waitlistAutomations;
      case "increase-bookings":
        return increaseBookingsAutomations;
      case "celebrate-milestones":
        return celebrateMilestonesAutomations;
      case "client-loyalty":
        return clientLoyaltyAutomations;
      default:
        return [];
    }
  };

  const renderBlastCampaigns = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Blast campaigns</h2>
            <Badge variant="secondary">{blastCampaigns.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a message type to customize from our ready-made templates. <a href="#" className="text-primary">Learn more</a>
          </p>
        </div>
        <Button onClick={() => setShowCreateCampaign(true)} data-testid="button-add-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" data-testid="button-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <Button variant="outline" size="sm" data-testid="button-sort">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Created date (newest first)
        </Button>
      </div>

      <div className="space-y-3">
        {blastCampaigns.map((campaign) => (
          <Card key={campaign.id} className="hover-elevate cursor-pointer" data-testid={`campaign-card-${campaign.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <MessageCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{campaign.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">{campaign.type}</span>
                      <span className="text-sm text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground">{campaign.date}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {campaign.status}
                  </Badge>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Audience</p>
                    <p className="font-semibold">{campaign.audience} clients</p>
                  </div>
                  <Button variant="ghost" size="icon" data-testid={`button-campaign-menu-${campaign.id}`}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderCreateCampaign = () => (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" onClick={() => setShowCreateCampaign(false)} className="mb-4" data-testid="button-back-campaigns">
          ← Back to campaigns
        </Button>
        <p className="text-sm text-muted-foreground">Create blast campaign</p>
        <h2 className="text-3xl font-bold mt-1">Select a channel</h2>
      </div>

      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardContent className="p-4">
          <p className="text-sm">200 free emails to use before 31 Oct 2025</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card className="hover-elevate cursor-pointer" data-testid="channel-multichannel">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Multichannel</h3>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Recommended</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Maximise reach and improve campaign performance by using both email and text message
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Reach 1979 clients</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" data-testid="channel-email">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Email</h3>
                  <p className="text-sm text-muted-foreground mt-1">Send promotional emails to your clients</p>
                  <p className="text-sm text-muted-foreground mt-1">Reach 711 clients</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" data-testid="channel-text">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Text message</h3>
                  <p className="text-sm text-muted-foreground mt-1">Send promotional text messages to your clients</p>
                  <p className="text-sm text-muted-foreground mt-1">Reach 1869 clients</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderAutomations = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Automations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all automated messages sent to your clients. <a href="#" className="text-primary">Learn more</a>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Messaging balance</p>
          <p className="text-lg font-semibold">AED 25.50</p>
        </div>
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        {automationTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedAutomationTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAutomationTab === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`automation-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        <h3 className="font-semibold mb-4 capitalize">{selectedAutomationTab.replace("-", " ")}</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {getAutomationsByTab().map((automation, index) => {
            const Icon = automation.icon;
            return (
              <Card key={index} className={automation.enabled ? "" : "opacity-60"} data-testid={`automation-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      {automation.enabled ? (
                        <>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Enabled
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`automation-settings-${index}`}>
                            <SlidersHorizontal className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`automation-delete-${index}`}>
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" data-testid={`automation-enable-${index}`}>
                          Enable
                        </Button>
                      )}
                    </div>
                  </div>
                  <h4 className="font-semibold mb-1">{automation.title}</h4>
                  <p className="text-sm text-muted-foreground">{automation.description}</p>
                </CardContent>
              </Card>
            );
          })}

          {selectedAutomationTab === "celebrate-milestones" && (
            <Card className="border-dashed hover-elevate cursor-pointer" data-testid="create-new-automation">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[150px]">
                <div className="p-3 rounded-full bg-primary/10 mb-3">
                  <Plus className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-primary">Create new</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );

  const renderMessagesHistory = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Messages history</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View all the automated messages sent to your clients. Manage your <a href="#" className="text-primary">settings</a> or <a href="#" className="text-primary">learn more</a>
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or booking reference"
          className="pl-10"
          data-testid="input-search-messages"
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3 text-sm font-medium">Time sent</th>
              <th className="text-left p-3 text-sm font-medium">Client</th>
              <th className="text-left p-3 text-sm font-medium">Appointment</th>
              <th className="text-left p-3 text-sm font-medium">Channel</th>
              <th className="text-left p-3 text-sm font-medium">Type</th>
              <th className="text-left p-3 text-sm font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {messagesHistory.map((message, index) => (
              <tr key={index} className="border-b last:border-0 hover:bg-muted/50" data-testid={`message-row-${index}`}>
                <td className="p-3 text-sm">{message.time}</td>
                <td className="p-3 text-sm text-primary">{message.client}</td>
                <td className="p-3 text-sm text-primary">{message.appointment}</td>
                <td className="p-3 text-sm">{message.channel}</td>
                <td className="p-3 text-sm text-primary">{message.type}</td>
                <td className="p-3">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {message.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDeals = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Deals</h2>
          <p className="text-sm text-muted-foreground mt-1">Active deals and promotions</p>
        </div>
        <Button onClick={() => setShowCreateDeal(true)} data-testid="button-add-deal">
          <Plus className="h-4 w-4 mr-2" />
          Add deal
        </Button>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No active deals</p>
        <p className="text-sm">Create your first promotion to attract customers</p>
      </div>
    </div>
  );

  const renderCreateDeal = () => {
    // If a deal type is selected, show the deal form
    if (selectedDealType) {
      return (
        <div className="space-y-6 max-w-3xl">
          <div>
            <Button variant="ghost" onClick={() => setSelectedDealType(null)} className="mb-4" data-testid="button-back-deal-types">
              ← Back to deal types
            </Button>
            <h2 className="text-3xl font-bold">New {selectedDealType}</h2>
          </div>

          {/* Placeholder for deal form - will be implemented based on deal type */}
          <div className="space-y-4">
            <p className="text-muted-foreground">Deal creation form coming soon...</p>
            <Button data-testid="button-save-deal">Save deal</Button>
          </div>
        </div>
      );
    }

    // Show deal type selection
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <Button variant="ghost" onClick={() => setShowCreateDeal(false)} className="mb-4" data-testid="button-back-deals">
            ← Back to deals
          </Button>
          <h2 className="text-3xl font-bold">Select deal type</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Choose the type of deal you want to create. <a href="#" className="text-primary">Learn more</a>
          </p>
        </div>

        <div className="space-y-3">
          <Card 
            className="hover-elevate cursor-pointer border-2 border-primary" 
            data-testid="deal-promotion"
            onClick={() => setSelectedDealType("Promotion")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Promotion</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a discount redeemed by clients entering the code when booking online or during checkout at Point of Sale
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Tag className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="hover-elevate cursor-pointer" 
            data-testid="deal-flash-sale"
            onClick={() => setSelectedDealType("Flash sale")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Flash sale</h3>
                  <p className="text-sm text-muted-foreground">
                    Immediately apply a discount online and let your team members manually add it to appointments and sales
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="hover-elevate cursor-pointer" 
            data-testid="deal-last-minute"
            onClick={() => setSelectedDealType("Last-minute offer")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Last-minute offer</h3>
                  <p className="text-sm text-muted-foreground">
                    Apply a discount for bookings made just before an appointment starts
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-1 rounded-full bg-blue-100 dark:bg-blue-900">
                <SlidersHorizontal className="h-4 w-4 text-blue-700 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-sm">
                  Configure your off-peak hours, apply higher rates during surge hours, and conveniently manage all dynamic pricing rules from a single place. <a href="#" className="text-primary">Learn more</a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderContent = () => {
    if (selectedSection === "blast-campaigns") {
      return showCreateCampaign ? renderCreateCampaign() : renderBlastCampaigns();
    }
    if (selectedSection === "automations") {
      return renderAutomations();
    }
    if (selectedSection === "messages-history") {
      return renderMessagesHistory();
    }
    if (selectedSection === "deals") {
      return showCreateDeal ? renderCreateDeal() : renderDeals();
    }
    if (selectedSection === "smart-pricing") {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Percent className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Smart pricing feature coming soon</p>
        </div>
      );
    }
    if (selectedSection === "reviews") {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <ThumbsUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Reviews management coming soon</p>
        </div>
      );
    }
  };

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 space-y-6">
        <h1 className="text-xl font-bold">Marketing</h1>
        
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
                  onClick={() => {
                    setSelectedSection(item.id);
                    setShowCreateCampaign(false);
                    setShowCreateDeal(false);
                    setSelectedDealType(null);
                  }}
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

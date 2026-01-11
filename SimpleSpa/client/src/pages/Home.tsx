import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, MapPin, Calendar, Clock, Sparkles, Hand, Scissors, Star, 
  Users, Navigation, Grid3x3, Wand2, Eye, Wind, Flower2, Droplets,
  Syringe, HeartPulse, Bone, UserCheck, Smile, Stethoscope, Brain
} from "lucide-react";
import { APP_CONFIG } from "@shared/constants";

const treatmentCategories = [
  { id: "all", name: "All treatments", icon: Grid3x3 },
  { id: "hair-styling", name: "Hair & styling", icon: Scissors },
  { id: "nails", name: "Nails", icon: Hand },
  { id: "eyebrows", name: "Eyebrows & eyelashes", icon: Eye },
  { id: "massage", name: "Massage", icon: Hand },
  { id: "barbering", name: "Barbering", icon: Scissors },
  { id: "hair-removal", name: "Hair removal", icon: Wind },
  { id: "facials", name: "Facials & skincare", icon: Smile },
  { id: "injectables", name: "Injectables & fillers", icon: Syringe },
  { id: "body", name: "Body", icon: HeartPulse },
  { id: "tattoo", name: "Tattoo & piercing", icon: Droplets },
  { id: "makeup", name: "Makeup", icon: Wand2 },
  { id: "medical", name: "Medical & dental", icon: Stethoscope },
  { id: "counseling", name: "Counseling & holistic", icon: Brain },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [timeQuery, setTimeQuery] = useState("");
  
  // Dropdown states
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateMode, setDateMode] = useState<"any" | "today" | "tomorrow" | "custom">("any");
  const [timeMode, setTimeMode] = useState<"any" | "morning" | "afternoon" | "evening" | "custom">("any");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (locationQuery.trim()) params.set("location", locationQuery.trim());
    if (dateQuery.trim()) params.set("date", dateQuery.trim());
    if (timeQuery.trim()) params.set("time", timeQuery.trim());
    
    setLocation(`/booking?${params.toString()}`);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      setDateQuery(date.toISOString().split('T')[0]);
      setDateMode("custom");
    }
  };

  const handleDateMode = (mode: "any" | "today" | "tomorrow" | "custom") => {
    setDateMode(mode);
    const today = new Date();
    
    if (mode === "any") {
      setDateQuery("");
      setSelectedDate(undefined);
    } else if (mode === "today") {
      setDateQuery(today.toISOString().split('T')[0]);
      setSelectedDate(today);
    } else if (mode === "tomorrow") {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDateQuery(tomorrow.toISOString().split('T')[0]);
      setSelectedDate(tomorrow);
    }
  };

  const handleTimeMode = (mode: "any" | "morning" | "afternoon" | "evening" | "custom") => {
    setTimeMode(mode);
    
    if (mode === "any") {
      setTimeQuery("");
      setTimeFrom("");
      setTimeTo("");
    } else if (mode === "morning") {
      setTimeQuery("morning");
      setTimeFrom("");
      setTimeTo("");
    } else if (mode === "afternoon") {
      setTimeQuery("afternoon");
      setTimeFrom("");
      setTimeTo("");
    } else if (mode === "evening") {
      setTimeQuery("evening");
      setTimeFrom("");
      setTimeTo("");
    } else if (mode === "custom") {
      if (timeFrom && timeTo) {
        setTimeQuery(`${timeFrom}-${timeTo}`);
      }
    }
  };

  const getDateDisplay = () => {
    if (dateMode === "any") return "Any date";
    if (dateMode === "today") return "Today";
    if (dateMode === "tomorrow") return "Tomorrow";
    if (selectedDate) return selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return "Any date";
  };

  const getTimeDisplay = () => {
    if (timeMode === "any") return "Any time";
    if (timeMode === "morning") return "Morning";
    if (timeMode === "afternoon") return "Afternoon";
    if (timeMode === "evening") return "Evening";
    if (timeFrom && timeTo) return `${timeFrom} - ${timeTo}`;
    return "Any time";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-sm">
        <Link href="/">
          <h1 className="text-2xl font-bold cursor-pointer" data-testid="text-logo">{APP_CONFIG.APP_NAME}</h1>
        </Link>
        
        <div className="flex items-center gap-3">
          <Link href="/login/customer">
            <Button variant="ghost" data-testid="button-customer-login">
              Customer Login
            </Button>
          </Link>
          <Link href="/login/admin">
            <Button variant="outline" data-testid="button-admin-login">
              Admin Login
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          {/* Headline */}
          <h2 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight">
            Book local beauty and wellness services
          </h2>

          {/* Search Bar */}
          <div className="bg-white rounded-full shadow-lg p-2 flex items-center gap-2 max-w-4xl mx-auto">
            {/* Treatments Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 rounded-full px-4 hover-elevate"
                  data-testid="button-treatments-dropdown"
                >
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    {selectedCategory === "all" && searchQuery ? searchQuery : 
                     selectedCategory !== "all" ? treatmentCategories.find(c => c.id === selectedCategory)?.name :
                     "All treatments and venues"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-4">
                  <Input
                    placeholder="Search treatments..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedCategory("all");
                    }}
                    className="mb-4"
                    data-testid="input-search-treatments"
                  />
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {treatmentCategories.map((category) => {
                      const Icon = category.icon;
                      return (
                        <Button
                          key={category.id}
                          variant="ghost"
                          className="w-full justify-start gap-3 hover-elevate"
                          onClick={() => {
                            setSelectedCategory(category.id);
                            if (category.id !== "all") {
                              setSearchQuery(category.name);
                            }
                          }}
                          data-testid={`category-${category.id}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{category.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-6 w-px bg-border" />

            {/* Location Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 rounded-full px-4 hover-elevate"
                  data-testid="button-location-dropdown"
                >
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{locationQuery || "Current location"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="p-4 space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 hover-elevate"
                    onClick={() => setLocationQuery("Current location")}
                    data-testid="location-current"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Current location</span>
                  </Button>
                  <Input
                    placeholder="Enter location..."
                    value={locationQuery === "Current location" ? "" : locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    data-testid="input-location-manual"
                  />
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-6 w-px bg-border" />

            {/* Date Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 rounded-full px-4 hover-elevate"
                  data-testid="button-date-dropdown"
                >
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{getDateDisplay()}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-4 space-y-4">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={dateMode === "any" ? "default" : "outline"}
                      onClick={() => handleDateMode("any")}
                      data-testid="date-any"
                    >
                      Any date
                    </Button>
                    <Button
                      size="sm"
                      variant={dateMode === "today" ? "default" : "outline"}
                      onClick={() => handleDateMode("today")}
                      data-testid="date-today"
                    >
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant={dateMode === "tomorrow" ? "default" : "outline"}
                      onClick={() => handleDateMode("tomorrow")}
                      data-testid="date-tomorrow"
                    >
                      Tomorrow
                    </Button>
                  </div>
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    data-testid="calendar-picker"
                  />
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-6 w-px bg-border" />

            {/* Time Dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 rounded-full px-4 hover-elevate"
                  data-testid="button-time-dropdown"
                >
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{getTimeDisplay()}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="p-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={timeMode === "any" ? "default" : "outline"}
                      onClick={() => handleTimeMode("any")}
                      data-testid="time-any"
                    >
                      Any time
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "morning" ? "default" : "outline"}
                      onClick={() => handleTimeMode("morning")}
                      data-testid="time-morning"
                    >
                      Morning
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "afternoon" ? "default" : "outline"}
                      onClick={() => handleTimeMode("afternoon")}
                      data-testid="time-afternoon"
                    >
                      Afternoon
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "evening" ? "default" : "outline"}
                      onClick={() => handleTimeMode("evening")}
                      data-testid="time-evening"
                    >
                      Evening
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Custom time range</p>
                    <div className="flex gap-2">
                      <Select 
                        value={timeFrom} 
                        onValueChange={(val) => {
                          setTimeFrom(val);
                          if (val && timeTo) {
                            setTimeMode("custom");
                            setTimeQuery(`${val}-${timeTo}`);
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-time-from">
                          <SelectValue placeholder="From" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0');
                            return <SelectItem key={hour} value={`${hour}:00`}>{`${hour}:00`}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                      <Select 
                        value={timeTo} 
                        onValueChange={(val) => {
                          setTimeTo(val);
                          if (timeFrom && val) {
                            setTimeMode("custom");
                            setTimeQuery(`${timeFrom}-${val}`);
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-time-to">
                          <SelectValue placeholder="To" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0');
                            return <SelectItem key={hour} value={`${hour}:00`}>{`${hour}:00`}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Search Button */}
            <Button 
              className="rounded-full bg-black hover:bg-black/90 text-white px-8"
              onClick={handleSearch}
              data-testid="button-search"
            >
              Search
            </Button>
          </div>

          {/* Stats */}
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold">339,972</span> appointments booked today
          </p>
        </div>
      </div>
    </div>
  );
}

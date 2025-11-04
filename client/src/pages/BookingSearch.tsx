import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, MapPin, Calendar, Clock, Sparkles, Hand, Scissors, Star, 
  Users, Navigation, Grid3x3, Wand2, Eye, Wind, Flower2, Droplets,
  Syringe, HeartPulse, Bone, UserCheck, Smile, Stethoscope, Brain
} from "lucide-react";
import type { Spa, Service, Staff } from "@shared/schema";

type SearchResult = Spa & { services: Service[]; staff: Staff[] };

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

export default function BookingSearch() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [timeQuery, setTimeQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  
  // Dropdown states
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dateMode, setDateMode] = useState<"any" | "today" | "tomorrow" | "custom">("any");
  const [timeMode, setTimeMode] = useState<"any" | "morning" | "afternoon" | "evening" | "custom">("any");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  // Build query URL for API
  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (locationQuery.trim()) params.set("location", locationQuery.trim());
    if (dateQuery.trim()) params.set("date", dateQuery.trim());
    if (timeQuery.trim()) params.set("time", timeQuery.trim());
    const queryString = params.toString();
    return `/api/search/spas${queryString ? `?${queryString}` : ''}`;
  };

  // Fetch search results
  const { data: searchResults, isLoading } = useQuery<SearchResult[]>({
    queryKey: [buildQueryUrl()],
    enabled: hasSearched,
  });

  const handleSearch = (overrideSearch?: string) => {
    if (overrideSearch) {
      setSearchQuery(overrideSearch);
      setTimeout(() => setHasSearched(true), 0);
    } else {
      setHasSearched(true);
    }
  };

  const handleBookSpa = (spaId: number) => {
    const params = new URLSearchParams();
    params.set("spaId", spaId.toString());
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (dateQuery.trim()) params.set("date", dateQuery.trim());
    if (timeQuery.trim()) params.set("time", timeQuery.trim());
    
    setLocation(`/booking/flow?${params.toString()}`);
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
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Search Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-2 mb-8">
            <div className="flex flex-col md:flex-row gap-2 items-stretch">
              {/* Treatments Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex-1 justify-start h-14 px-4 hover:bg-transparent"
                    data-testid="button-treatments-dropdown"
                  >
                    <Search className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-base">
                      {searchQuery && searchQuery !== "All treatments" && selectedCategory === "all"
                        ? searchQuery
                        : selectedCategory === "all" 
                        ? "All treatments and venues" 
                        : treatmentCategories.find(c => c.id === selectedCategory)?.name
                      }
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
                        // Reset selectedCategory when user types custom query
                        setSelectedCategory("all");
                      }}
                      className="mb-4"
                      data-testid="input-search-treatments"
                    />
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {treatmentCategories.map((category) => {
                        const Icon = category.icon;
                        return (
                          <button
                            key={category.id}
                            onClick={() => {
                              setSelectedCategory(category.id);
                              setSearchQuery(category.name);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent text-left"
                            data-testid={`category-${category.id}`}
                          >
                            <Icon className="h-5 w-5 text-purple-600" />
                            <span className="text-sm font-medium">{category.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="hidden md:block w-px bg-border" />

              {/* Location Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex-1 justify-start h-14 px-4 hover:bg-transparent"
                    data-testid="button-location-dropdown"
                  >
                    <MapPin className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-base">{locationQuery || "Current location"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="start">
                  <button
                    onClick={() => setLocationQuery("")}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-accent text-left"
                    data-testid="button-current-location"
                  >
                    <Navigation className="h-5 w-5 text-purple-600" />
                    <span className="text-sm font-medium">Current location</span>
                  </button>
                  <div className="mt-3">
                    <Input
                      placeholder="Enter location..."
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      data-testid="input-search-location"
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <div className="hidden md:block w-px bg-border" />

              {/* Date Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex-1 justify-start h-14 px-4 hover:bg-transparent"
                    data-testid="button-date-dropdown"
                  >
                    <Calendar className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-base">
                      {dateMode === "any" && "Any date"}
                      {dateMode === "today" && "Today"}
                      {dateMode === "tomorrow" && "Tomorrow"}
                      {dateMode === "custom" && selectedDate && selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="start">
                  <div className="flex gap-2 mb-4">
                    <Button
                      size="sm"
                      variant={dateMode === "any" ? "default" : "outline"}
                      onClick={() => handleDateMode("any")}
                      className={dateMode === "any" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-any-date"
                    >
                      Any date
                    </Button>
                    <Button
                      size="sm"
                      variant={dateMode === "today" ? "default" : "outline"}
                      onClick={() => handleDateMode("today")}
                      className={dateMode === "today" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-today"
                    >
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant={dateMode === "tomorrow" ? "default" : "outline"}
                      onClick={() => handleDateMode("tomorrow")}
                      className={dateMode === "tomorrow" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-tomorrow"
                    >
                      Tomorrow
                    </Button>
                  </div>
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    className="rounded-md border"
                    data-testid="calendar-picker"
                  />
                </PopoverContent>
              </Popover>

              <div className="hidden md:block w-px bg-border" />

              {/* Time Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex-1 justify-start h-14 px-4 hover:bg-transparent"
                    data-testid="button-time-dropdown"
                  >
                    <Clock className="h-5 w-5 mr-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-base">
                      {timeMode === "any" && "Any time"}
                      {timeMode === "morning" && "Morning"}
                      {timeMode === "afternoon" && "Afternoon"}
                      {timeMode === "evening" && "Evening"}
                      {timeMode === "custom" && timeFrom && `${timeFrom} - ${timeTo}`}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-4" align="start">
                  <div className="flex gap-2 mb-4">
                    <Button
                      size="sm"
                      variant={timeMode === "any" ? "default" : "outline"}
                      onClick={() => handleTimeMode("any")}
                      className={timeMode === "any" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-any-time"
                    >
                      Any time
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "morning" ? "default" : "outline"}
                      onClick={() => handleTimeMode("morning")}
                      className={timeMode === "morning" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-morning"
                    >
                      Morning
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "afternoon" ? "default" : "outline"}
                      onClick={() => handleTimeMode("afternoon")}
                      className={timeMode === "afternoon" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-afternoon"
                    >
                      Afternoon
                    </Button>
                    <Button
                      size="sm"
                      variant={timeMode === "evening" ? "default" : "outline"}
                      onClick={() => handleTimeMode("evening")}
                      className={timeMode === "evening" ? "bg-purple-600 hover:bg-purple-700" : ""}
                      data-testid="button-evening"
                    >
                      Evening
                    </Button>
                  </div>
                  <div className="flex gap-3 items-center">
                    <Select value={timeFrom} onValueChange={(val) => {
                      setTimeFrom(val);
                      // Only set custom mode and timeQuery when BOTH From and To are selected
                      if (timeTo) {
                        setTimeMode("custom");
                        setTimeQuery(`${val}-${timeTo}`);
                      }
                    }}>
                      <SelectTrigger className="flex-1" data-testid="select-time-from">
                        <SelectValue placeholder="From" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={`${i.toString().padStart(2, '0')}:00`}>
                            {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">to</span>
                    <Select value={timeTo} onValueChange={(val) => {
                      setTimeTo(val);
                      // Only set custom mode and timeQuery when BOTH From and To are selected
                      if (timeFrom) {
                        setTimeMode("custom");
                        setTimeQuery(`${timeFrom}-${val}`);
                      }
                    }}>
                      <SelectTrigger className="flex-1" data-testid="select-time-to">
                        <SelectValue placeholder="To" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={`${i.toString().padStart(2, '0')}:00`}>
                            {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Search Button */}
              <Button 
                onClick={() => handleSearch()}
                className="h-14 px-8 rounded-2xl font-semibold bg-black hover:bg-black/90 text-white"
                data-testid="button-search"
              >
                Search
              </Button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="text-center mb-12">
            <p className="text-lg text-gray-700 dark:text-gray-300">
              <span className="font-bold text-3xl text-gray-900 dark:text-white">339,972</span> appointments booked today
            </p>
          </div>

          {/* Search Results Section */}
          {hasSearched && (
            <div className="mt-16">
              <h2 className="text-2xl font-bold mb-6">
                {isLoading ? "Searching..." : `Found ${searchResults?.length || 0} spas`}
              </h2>
              
              {isLoading ? (
                <div className="grid gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-32 mt-2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="grid gap-6" data-testid="search-results">
                  {searchResults.map((spa) => (
                    <Card key={spa.id} className="hover-elevate" data-testid={`spa-card-${spa.id}`}>
                      <CardHeader>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-2xl" data-testid={`spa-name-${spa.id}`}>
                                {spa.name}
                              </CardTitle>
                              {spa.featured && (
                                <Badge variant="default" data-testid={`spa-featured-${spa.id}`}>
                                  Featured
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {spa.address}
                              </span>
                              {spa.rating && (
                                <span className="flex items-center gap-1">
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                  {(typeof spa.rating === 'string' ? parseFloat(spa.rating) : Number(spa.rating)).toFixed(1)}
                                </span>
                              )}
                            </CardDescription>
                          </div>
                          <Button 
                            onClick={() => handleBookSpa(spa.id)}
                            size="lg"
                            data-testid={`button-book-spa-${spa.id}`}
                          >
                            Book Now
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {spa.description && (
                          <p className="text-muted-foreground mb-4">{spa.description}</p>
                        )}
                        
                        <div className="space-y-4">
                          {/* Services */}
                          {spa.services.length > 0 && (
                            <div>
                              <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Services ({spa.services.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {spa.services.slice(0, 6).map((service) => (
                                  <Badge key={service.id} variant="secondary" data-testid={`service-${service.id}`}>
                                    {service.name} - ${(typeof service.price === 'string' ? parseFloat(service.price) : Number(service.price)).toFixed(2)}
                                  </Badge>
                                ))}
                                {spa.services.length > 6 && (
                                  <Badge variant="outline">+{spa.services.length - 6} more</Badge>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Staff */}
                          {spa.staff.length > 0 && (
                            <div>
                              <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Team ({spa.staff.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {spa.staff.slice(0, 5).map((member) => (
                                  <Badge key={member.id} variant="outline" data-testid={`staff-${member.id}`}>
                                    {member.name}
                                  </Badge>
                                ))}
                                {spa.staff.length > 5 && (
                                  <Badge variant="outline">+{spa.staff.length - 5} more</Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground text-lg">
                      No spas found. Try adjusting your search criteria.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Quick Browse Section */}
          {!hasSearched && (
            <div className="mt-16">
              <h2 className="text-2xl font-bold mb-6 text-center">Popular Services</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { name: "Massage", Icon: Hand },
                  { name: "Facial", Icon: Sparkles },
                  { name: "Manicure", Icon: Hand },
                  { name: "Hair Styling", Icon: Scissors },
                  { name: "Waxing", Icon: Star },
                  { name: "Spa Package", Icon: Droplets },
                  { name: "Body Treatment", Icon: Flower2 },
                  { name: "Makeup", Icon: Sparkles },
                ].map((service) => (
                  <button
                    key={service.name}
                    onClick={() => handleSearch(service.name)}
                    className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md hover-elevate active-elevate-2 text-center transition-all"
                    data-testid={`quick-service-${service.name.toLowerCase().replace(" ", "-")}`}
                  >
                    <service.Icon className="w-10 h-10 mx-auto mb-3 text-primary" />
                    <p className="font-medium text-gray-900 dark:text-white">{service.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

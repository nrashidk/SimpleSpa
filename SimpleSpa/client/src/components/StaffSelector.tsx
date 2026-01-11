import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Check } from "lucide-react";

interface Staff {
  id: string;
  name: string;
  specialty: string;
  available: boolean;
  imageUrl?: string;
}

interface StaffSelectorProps {
  selectedStaffId: string | null;
  onStaffSelect: (staffId: string | null) => void;
  staff: Staff[];
}

export default function StaffSelector({ selectedStaffId, onStaffSelect, staff }: StaffSelectorProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-semibold">Choose Your Specialist</h3>
      </div>

      <div className="space-y-3">
        <Card
          className={`p-4 cursor-pointer hover-elevate active-elevate-2 transition-all ${
            selectedStaffId === null ? 'ring-2 ring-primary bg-primary/5' : ''
          }`}
          onClick={() => onStaffSelect(null)}
          data-testid="staff-option-any"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  <Users className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">Any Available Specialist</p>
                <p className="text-sm text-muted-foreground">First available expert</p>
              </div>
            </div>
            {selectedStaffId === null && (
              <Check className="h-5 w-5 text-primary" />
            )}
          </div>
        </Card>

        {staff.map((member) => (
          <Card
            key={member.id}
            className={`p-4 cursor-pointer hover-elevate active-elevate-2 transition-all ${
              !member.available ? 'opacity-60' : ''
            } ${selectedStaffId === member.id ? 'ring-2 ring-primary bg-primary/5' : ''}`}
            onClick={() => member.available && onStaffSelect(member.id)}
            data-testid={`staff-option-${member.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={member.imageUrl} alt={member.name} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.specialty}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.available ? "default" : "secondary"} className="text-xs">
                  {member.available ? 'Available' : 'Unavailable'}
                </Badge>
                {selectedStaffId === member.id && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}

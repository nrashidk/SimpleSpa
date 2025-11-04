import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface AddonOption {
  id: number;
  addonId: number;
  name: string;
  description: string | null;
  price: string;
  extraTimeMinutes: number;
  displayOrder: number;
  active: boolean;
}

export interface AddonGroup {
  id: number;
  serviceId: number;
  groupName: string;
  promptText: string | null;
  selectionType: string; // 'single' | 'multiple'
  required: boolean;
  displayOrder: number;
  active: boolean;
  options: AddonOption[];
}

interface ServiceAddonSelectorProps {
  addonGroups: AddonGroup[];
  selectedOptions: Record<number, number[]>; // groupId -> optionIds[]
  onSelectOption: (groupId: number, optionIds: number[]) => void;
}

export default function ServiceAddonSelector({
  addonGroups,
  selectedOptions,
  onSelectOption,
}: ServiceAddonSelectorProps) {
  if (!addonGroups || addonGroups.length === 0) {
    return null;
  }

  const handleSingleSelect = (groupId: number, optionId: string) => {
    onSelectOption(groupId, [parseInt(optionId)]);
  };

  const handleMultipleSelect = (groupId: number, optionId: number, checked: boolean) => {
    const currentSelections = selectedOptions[groupId] || [];
    if (checked) {
      onSelectOption(groupId, [...currentSelections, optionId]);
    } else {
      onSelectOption(groupId, currentSelections.filter(id => id !== optionId));
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Add-ons</h3>
      {addonGroups
        .filter(group => group.active && group.options.some(opt => opt.active))
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(group => {
          const activeOptions = group.options.filter(opt => opt.active).sort((a, b) => a.displayOrder - b.displayOrder);
          if (activeOptions.length === 0) return null;

          return (
            <Card key={group.id} className="p-4" data-testid={`addon-group-${group.id}`}>
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{group.groupName}</h4>
                  {group.required && (
                    <Badge variant="destructive" className="text-xs">Required</Badge>
                  )}
                </div>
                {group.promptText && (
                  <p className="text-sm text-muted-foreground mt-1">{group.promptText}</p>
                )}
              </div>

              {group.selectionType === 'single' ? (
                <RadioGroup
                  value={selectedOptions[group.id]?.[0]?.toString() || ''}
                  onValueChange={(value) => handleSingleSelect(group.id, value)}
                >
                  {activeOptions.map(option => (
                    <div
                      key={option.id}
                      className="flex items-start space-x-3 py-2"
                      data-testid={`addon-option-${option.id}`}
                    >
                      <RadioGroupItem value={option.id.toString()} id={`option-${option.id}`} />
                      <Label
                        htmlFor={`option-${option.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{option.name}</p>
                            {option.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                            )}
                            {option.extraTimeMinutes > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                +{option.extraTimeMinutes} min
                              </p>
                            )}
                          </div>
                          <p className="font-semibold ml-4">
                            AED {parseFloat(option.price).toFixed(2)}
                          </p>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-2">
                  {activeOptions.map(option => {
                    const isChecked = selectedOptions[group.id]?.includes(option.id) || false;
                    return (
                      <div
                        key={option.id}
                        className="flex items-start space-x-3 py-2"
                        data-testid={`addon-option-${option.id}`}
                      >
                        <Checkbox
                          id={`option-${option.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) =>
                            handleMultipleSelect(group.id, option.id, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={`option-${option.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">{option.name}</p>
                              {option.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                              )}
                              {option.extraTimeMinutes > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  +{option.extraTimeMinutes} min
                                </p>
                              )}
                            </div>
                            <p className="font-semibold ml-4">
                              AED {parseFloat(option.price).toFixed(2)}
                            </p>
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
    </div>
  );
}

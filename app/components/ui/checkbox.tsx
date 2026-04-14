import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className="flex cursor-pointer items-start gap-3">
        <div className="relative flex h-5 w-5 items-center justify-center rounded border border-input bg-background shadow-sm transition-colors hover:border-primary">
          <input
            type="checkbox"
            className={cn("peer absolute inset-0 opacity-0", className)}
            ref={ref}
            {...props}
          />
          <Check className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
        </div>
        {label && <span className="text-sm leading-5 text-foreground">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };

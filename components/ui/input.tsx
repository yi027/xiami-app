import * as React from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-foreground outline-none transition placeholder:text-[#a3988d] focus:border-seal focus:ring-2 focus:ring-seal/20";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(fieldClass, "min-h-28 resize-y py-3 leading-6", className)}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(fieldClass, "select-field appearance-none bg-white", className)} {...props} />;
}

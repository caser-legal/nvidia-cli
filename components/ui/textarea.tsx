// Textarea Component
// Feature 13, 236: Auto-resize textarea

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const handleResize = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (textarea && autoResize) {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      }
    }, [autoResize]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleResize();
      onChange?.(e);
    };

    React.useEffect(() => {
      handleResize();
    }, [handleResize, props.value]);

    return (
      <textarea
        className={cn(
          "flex min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#76B900] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none",
          autoResize && "overflow-hidden",
          className
        )}
        ref={(node) => {
          textareaRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

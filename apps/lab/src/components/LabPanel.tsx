import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Quiet Swiss-style panel: hairline structure, light title, no soft-shadow soup. */
export function LabPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  size = "default",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
}) {
  return (
    <Card
      size={size}
      className={cn(
        "mb-4 rounded-none border border-border/80 bg-card shadow-none ring-0",
        className,
      )}
    >
      <CardHeader className="border-b border-border/80 py-3">
        <CardTitle className="text-lg font-light tracking-tight text-balance">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="max-w-[60ch] text-pretty">
            {description}
          </CardDescription>
        ) : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {children != null ? (
        <CardContent className={cn("pt-4", contentClassName)}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}

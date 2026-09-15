import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { accentSurface, color, localType, radius, spacing, surface, text } from "@/lib/graph-theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * The mockup's Primary/Secondary/Ghost/Destructive set. `secondary` matches
 * what every button in this app already looked like before this pass;
 * `primary` is genuinely new -- previously the Run button used an ad hoc
 * green override instead of any documented variant. It now reads as the
 * panel's primary action (blue, per the mockup) instead of a one-off color.
 */
const VARIANT_STYLE: Record<ButtonVariant, Pick<CSSProperties, "background" | "borderColor" | "color">> = {
  primary: {
    background: color.primary[700],
    borderColor: color.primary[600],
    color: text.primary,
  },
  secondary: {
    background: surface.raised,
    borderColor: surface.borderStrong,
    color: text.primary,
  },
  ghost: {
    background: "transparent",
    borderColor: "transparent",
    color: text.primary,
  },
  destructive: {
    background: accentSurface.destructive.bg,
    borderColor: accentSurface.destructive.border,
    color: accentSurface.destructive.text,
  },
};

export function Button({ variant = "secondary", style, ...props }: ButtonProps) {
  const variantStyle = VARIANT_STYLE[variant];
  return (
    <button
      {...props}
      style={{
        padding: `${spacing[2]}px ${spacing[3]}px`,
        borderRadius: radius.lg,
        border: `1px solid ${variantStyle.borderColor}`,
        background: variantStyle.background,
        color: variantStyle.color,
        cursor: "pointer",
        ...localType.ui,
        ...style,
      }}
    />
  );
}

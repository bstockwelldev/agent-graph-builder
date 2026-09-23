import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { border, control, localType, radius, spacing, surface, text } from "@/lib/graph-theme";

// Wave 2.5 ("Inspector & Run console v2"): inputs are inset wells --
// darker than the panel, with a >= 3:1 border and a visible focus ring
// (`.agb-field:focus` in app/globals.css) -- instead of the old raised
// boxes whose edges were ~1.2:1 against the panel.
export const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: control.height.md,
  padding: `${spacing[2]}px 10px`,
  borderRadius: radius.lg,
  border: `1px solid ${border.default}`,
  background: surface.inset,
  color: text.primary,
  ...localType.ui,
};

function withFieldClass(className: string | undefined) {
  return className ? `agb-field ${className}` : "agb-field";
}

export function TextInput({ style, className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={withFieldClass(className)} style={{ ...fieldStyle, ...style }} />;
}

export function TextArea({ style, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={withFieldClass(className)}
      style={{ ...fieldStyle, lineHeight: "20px", resize: "vertical", ...style }}
    />
  );
}

export function Select({ style, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={withFieldClass(className)} style={{ ...fieldStyle, ...style }} />;
}

export function PasswordInput({
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className="agb-field"
        style={{
          ...fieldStyle,
          paddingRight: spacing[6],
          ...style,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide API key" : "Show API key"}
        style={{
          position: "absolute",
          right: spacing[1],
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          color: text.secondary,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing[1],
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { localType, radius, spacing, surface, text } from "../../theme";

const fieldStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: `${spacing[2]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  ...localType.ui,
};

export function TextInput({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...fieldStyle, ...style }} />;
}

export function TextArea({ style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...fieldStyle, ...style }} />;
}

export function Select({ style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...fieldStyle, ...style }} />;
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
          color: text.muted,
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

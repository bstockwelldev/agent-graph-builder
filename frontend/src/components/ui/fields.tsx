import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
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

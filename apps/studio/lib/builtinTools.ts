/** Tools every graph can call without registering them (backend
 * `bindings.CODE_TOOL_IDS`): the demo lookup plus builtin_tools.py. */
export const BUILTIN_TOOL_IDS = [
  { id: "lookup_topic", description: "Demo topic lookup (also what tool_loop calls)" },
  { id: "web_search", description: "Web search" },
  { id: "calculator", description: "Arithmetic" },
] as const;

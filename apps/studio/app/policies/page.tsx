import { WorkspacePolicies } from "@/components/studio/workspace-policies";

// The body lives in components/studio/workspace-policies.tsx so the
// workspacePolicies workbench panel renders the same thing.
export default function PoliciesPage() {
  return <WorkspacePolicies layout="page" />;
}

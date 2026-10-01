---
id: node-rubric
title: "Rubric node"
summary: "Static prompt-quality check"
category: node
keywords: ["quality", "lint", "findings", "placeholders"]
related: ["node-guardrail"]
---
Scans upstream text for static quality findings (empty text, unresolved placeholders, TODO markers). Blocks the run only when rubricFailOnFindings is set.

---
name: component-harvester
description: >
  Search, evaluate, and harvest pre-built React components, UI templates, and app starters from reputable sources (GitHub, Base44, Replit, Lovable, Shadcn). Use when the user wants to "vibe code" an application by stitching together established, production-ready pieces rather than building from scratch.
---

# Component Harvester

A consultative skill that identifies the best pre-built UI components, app templates, and functional blocks from reputable sources, allowing the user to assemble high-quality applications rapidly ("vibe coding").

## Core Philosophy

**Base44 as Foundation + Component Stitching:** The most efficient way to build modern applications is to start with a robust template (like Base44) and stitch together battle-tested components. Never write a complex UI component from scratch if a high-quality open-source or community template already exists.

## Workflow

### Step 1: Clarify the Need

Before searching, ask clarifying questions to understand exactly what piece of the puzzle is missing:
- Are we looking for a full app starter/template, a specific functional widget (e.g., a data grid), or a styling block?
- What is the target stack? (Assume React + Tailwind + Radix/Shadcn unless specified otherwise).
- Does this need to integrate with a specific backend or database?

### Step 2: Select the Source Strategy

Choose the appropriate source based on the user's need:

| Need Type | Primary Source | Search Strategy |
|-----------|----------------|-----------------|
| Full App Templates | Base44 Community / Lovable | Search `base44 app templates gallery` or `lovable app templates clone` |
| UI Components | Shadcn UI Registry | Search `shadcn ui [component] registry` |
| Admin/Dashboards | GitHub (Awesome Lists) | Search `github react admin dashboard template tailwind` |
| Full-Stack Starters | Replit / GitHub | Search `github vibe coding starter template` or `replit templates public` |

### Step 3: Announce and Execute Search

Briefly announce the strategy to the user:
> "Searching [Source] for [Component/Template] because it provides production-ready code that fits our Base44 architecture."

Execute the search using the `search` tool (type: `info` or `tool`). Look for high-signal repositories:
- High star counts (>1k for React components).
- Recent updates (within 6 months).
- Compatibility with Tailwind CSS and Radix UI.

### Step 4: Harvest and Stitch

Once a suitable component or template is found:
1. **Extract the Code:** Pull the relevant React component code, dependencies, and Tailwind configurations.
2. **Adapt to Base44:** Modify the imports and styling to fit the user's Base44 template structure. Ensure it aligns with the established `tailwind.config.js` and `components.json`.
3. **Present the Integration:** Provide the user with the adapted code block and exact instructions on where to place it in their repository.

### Step 5: Credit the Source

Always credit the original creator or repository:
> "This component was harvested from **[Project/Creator Name]** ([URL]). It has been adapted to fit your Base44 architecture."

## Common Harvester Targets

- **Shadcn UI:** The gold standard for copy-paste React/Tailwind components.
- **Base44 Templates:** Best for full-page layouts and pre-wired AI generation flows.
- **Bulletproof React:** Best for scalable architecture patterns.
- **Tremor / Metric UI:** Best for dashboard charts and data visualization blocks.

## Red Flags to Avoid

- ❌ Harvesting components that rely on heavy, outdated CSS frameworks (e.g., Bootstrap) when the project uses Tailwind.
- ❌ Pulling full Next.js boilerplate into a Vite/React SPA.
- ❌ Using components with massive, unnecessary dependency trees. Always prefer zero-dependency or Radix-based primitives.

---
name: microapp-prd-creator
description: Creates a comprehensive Product Requirements Document (PRD) and build prompts for micro apps built with vibe coding tools. Use this skill whenever a user describes an app idea, says they want to build a micro app, mentions creating a PRD, wants to plan a small application, or references any vibe coding platform like Base44, Manus, Loveable, Bolt, Replit, v0, or Cursor. Also trigger when the user says things like "I have an idea for an app", "help me spec out an app", "I want to build something", "write a PRD", or "plan my micro app". This skill assumes the user is a CEO or visionary presenting their app idea and needs a structured interview to extract the full vision before generating build-ready documentation.
---

# MicroApp PRD Creator

This skill transforms a CEO's app vision into a comprehensive, build-ready Product Requirements Document (PRD) and tailored prompts for their chosen vibe coding tool. It works through a structured interview process that captures everything a builder needs — without requiring the CEO to think like a developer.

## Philosophy

CEOs think in outcomes, not features. This skill bridges that gap. It asks business questions, translates the answers into technical requirements, and packages everything into a document optimized for the specific vibe coding tool the CEO (or their team) will use to build it.

## When to Use

- User describes a new app idea in plain language.
- User asks for a PRD, spec, or plan.
- User says "I want to build something" or "I have an app idea."
- User references a vibe coding tool (Base44, Manus, Lovable, Bolt, Replit, v0, Cursor).

## Process

### Phase 1: Capture the Vision (The CEO Interview)

Open with:
> "Let's map out your micro app. I'm going to ask you a series of questions to fully understand your vision. Answer what you can — skip what you're not sure about yet — and I'll fill in smart defaults where needed."

**Required questions (never skip):**
1. "In one or two sentences, what does this app do?"
2. "Who is this for? Describe your ideal user."
3. "What does a user DO inside this app? Walk me through the primary flow."
4. "What's the single most important thing this app must get right?"

**Functional requirements rapid-fire (allow skips):**
- Does a user need to log in?
- Is there an admin section?
- Does it need to store data? What kind?
- Does it connect to external services?
- Mobile, desktop, or both?
- Any branding requirements?
- Free, paid, or freemium?

**Scope check:**
- 1-3 screens → Micro app. Proceed.
- 4-6 screens → Small app. Recommend phasing.
- 7+ screens → Flag scope. Propose Phase 1 MVP + Phase 2 Enhancement breakdown.

**TFRS Cross-Pollination (Blair-specific):**
Before generating the PRD, cross-reference the request against the TFRS Schema Registry (`contracts/tfrs-schema-registry.md`). If any existing schemas apply, note them in the PRD and plan to reuse them.

### Phase 2: Generate the PRD

Generate a markdown PRD with these sections:
1. App Overview (name, one-liner, target user, problem solved)
2. User Stories
3. Functional Requirements (Must Have / Should Have / Nice to Have)
4. User Flow (step-by-step primary journey)
5. Data Model (reuse TFRS schemas where applicable)
6. Auth & Permissions
7. UI/UX Requirements (visual feel, TFRS theme tokens)
8. Integrations
9. Technical Constraints
10. Success Criteria
11. Out of Scope
12. Roadmap (if phased)

### Phase 3: Generate Build Prompts

After the PRD, generate:
1. **Master Build Prompt** — The initial prompt to scaffold the app.
2. **Refinement Prompts** (3-5) — For auth flows, admin, edge cases, styling.
3. **Testing Prompt** — Asks the tool to verify its output against the PRD.

### Phase 4: Deliver

Present both documents (PRD + prompts) as downloadable markdown files. Offer to adjust scope, priority, or regenerate for a different tool.

## Red Flags
- User wants to skip the interview and just "start building" — do not comply. The consultation is mandatory.
- PRD has no data model — always define data before UI.
- User describes 10+ features as "must have" — scope creep. Push back and prioritize.

## Verification
- PRD has all 12 sections.
- Data model reuses TFRS schemas where applicable.
- Build prompts are tool-specific, not generic.
- Out of Scope section explicitly lists what is NOT included.

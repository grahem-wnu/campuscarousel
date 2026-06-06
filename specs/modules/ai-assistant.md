# Module Spec — AI Assistant

## Module id
`ai-assistant`

## Purpose
Contextual AI help from anywhere: ask mode, college-discovery mode, essay-partner mode,
scholarship-discovery mode. Floating chat button → slide-over panel.

## Depends on
All foundational specs. Reads across modules (DB queries) + Bedrock web search. The slide-over
shell hook is provided by the design-system app shell. Build after the data modules it queries.

## Owns (entities)
**AI Conversation** (`CONVERSATION#<id>/MESSAGE#<ts>`: role, userId, content, context, toolsUsed,
createdAt).

## API endpoints
`POST /ai/chat` (body: message, context {module, collegeId?, essayId?, ...}, conversationId? →
returns response, conversationId, toolsUsed?); `GET /ai/conversations`; `GET /ai/conversations/:id`.

## Frontend
- Floating button (bottom-right) → slide-over chat (provided slot in the shell).
- Auto-includes current-page context (college on a college page, essay on the essay page).
- Renders citations when web search was used. Conversation history per user.

## AI behavior (Bedrock, server-side only)
- System prompt includes: user role, current page context, relevant DB records (last 10 messages
  + records from the current module).
- **Ask mode:** NL questions; can query the DB ("how many volunteer hours?", "current GPA?") and
  web-search current facts (deadlines, requirement changes) with citations.
- **College-discovery mode:** web search → structured results addable to the college list from chat.
- **Essay-partner mode:** full access to Keira's data **including private entries when keira is
  authenticated** (`aiVisibleSet`); suggests, never writes.
- **Scholarship-discovery mode:** web search for scholarships → addable from chat.
- Model: `us.anthropic.claude-sonnet-4-*` inference profile (from SSM/env). Web search via Bedrock
  tool use. Cost-aware.

## Privacy
The single most security-sensitive module. The AI receives private entries ONLY when keira is the
authenticated caller, and must NEVER surface private content in a response to grahem or kate.
Enforce via the visibility middleware on every record the prompt is built from. Reviewer hard-fails
any path that could leak private content cross-user.

## File-ownership boundary
`backend/modules/ai-assistant/**`, `frontend/src/modules/ai-assistant/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] `/ai/chat` with all four modes; DB-query tool; web-search tool with citations; history persisted.
- [ ] **Privacy tests:** private entries reach the model only for keira; never leak to a parent's chat.
- [ ] No hardcoded model id/keys; mobile + desktop slide-over; CI green; reviewer approved.

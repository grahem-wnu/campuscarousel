// Request validation for the AI Assistant endpoints. Every handler validates input before touching
// the data layer / Bedrock (specs/foundational/api.md); a failure → 422 envelope.

import { z } from '../../shared/api/index.js';

/** The four assistant modes (specs/modules/ai-assistant.md). Callers may set one explicitly; the
 *  handler otherwise derives it from the page context (see chat.ts `resolveMode`). */
export const MODES = ['ask', 'college-discovery', 'essay-partner', 'scholarship-discovery'] as const;

/** Page/context the chat was opened from. Known fields are typed; unknown keys are tolerated
 *  (`.passthrough()`) since the shell may attach more context over time. */
const contextSchema = z
  .object({
    mode: z.enum(MODES).optional(),
    module: z.string().max(120).optional(),
    collegeId: z.string().max(200).optional(),
    essayId: z.string().max(200).optional(),
  })
  .passthrough();

/** Body for POST /ai/chat. */
export const chatSchema = z
  .object({
    message: z.string().min(1, 'message is required').max(8000),
    context: contextSchema.optional(),
    conversationId: z.string().min(1).optional(),
  })
  .strict();

/** Path params for GET /ai/conversations/:id. */
export const idParamSchema = z.object({ id: z.string().min(1) });

export type ChatInput = z.infer<typeof chatSchema>;
export type ChatContext = z.infer<typeof contextSchema>;

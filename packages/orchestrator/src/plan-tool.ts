// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Tool-use schema for plan extraction.
//
// Phase 1.5 migration: structured outputs via Claude's tool-use API
// replace the fenced-JSON convention from Phase 1. Reasoning per the
// Phase 1 report §9.5: tool-use yields stable replay, deterministic
// parsing, and avoids markdown-stripping fragility.
//
// The model is instructed to call this single tool exactly once. The
// orchestrator extracts the tool call's `input` as the PlanArtifact
// directly — no regex, no fenced block.

import type { ToolSpec } from '@manthanos/adapters-sdk';

export const PLAN_TOOL_NAME = 'record_plan';

export const PLAN_TOOL: ToolSpec = {
  name: PLAN_TOOL_NAME,
  description:
    'Record the structured implementation plan for the task. Call this exactly once, ' +
    'with all fields populated. Do not emit any prose outside of this tool call.',
  inputSchema: {
    type: 'object',
    required: ['summary', 'steps', 'assumptions', 'risks', 'open_questions'],
    additionalProperties: false,
    properties: {
      summary: {
        type: 'string',
        description: 'One-paragraph summary of the plan.',
      },
      steps: {
        type: 'array',
        description: 'Ordered implementation steps.',
        items: {
          type: 'object',
          required: ['id', 'description', 'files_affected', 'depends_on', 'estimated_difficulty'],
          additionalProperties: false,
          properties: {
            id: {
              type: 'string',
              description: 'Stable step id (S1, S2, ...). Reused across re-plans.',
            },
            description: { type: 'string' },
            files_affected: {
              type: 'array',
              items: { type: 'string' },
              description: 'Repo-relative POSIX paths.',
            },
            depends_on: {
              type: 'array',
              items: { type: 'string' },
              description: 'Ids of prior steps.',
            },
            estimated_difficulty: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
            },
          },
        },
      },
      assumptions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Assumptions the plan depends on. Each enters the brain as a T0 (quarantine) semantic fact.',
      },
      risks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['description', 'severity', 'mitigation'],
          additionalProperties: false,
          properties: {
            description: { type: 'string' },
            severity: { type: 'integer', minimum: 1, maximum: 5 },
            mitigation: { type: 'string' },
          },
        },
        description: 'Risks. Severity >=3 become open_issues in the brain.',
      },
      open_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Questions the human needs to answer before / during implementation.',
      },
    },
  },
};

export const PLAN_TOOL_SYSTEM_INSTRUCTIONS = [
  'You produce structured plans by calling the `record_plan` tool exactly once.',
  '',
  'Rules:',
  '- Call `record_plan` with all required fields populated, even if some arrays are empty.',
  '- Do NOT emit any prose, explanation, or markdown outside the tool call.',
  '- Use stable step ids (S1, S2, ...) so re-plans of the same task can be diffed.',
  '- file paths are relative POSIX paths inside the workspace.',
  '- difficulty is an integer 1 (trivial) to 5 (deep architectural change).',
  '- severity is 1 (cosmetic) to 5 (likely to break production).',
].join('\n');

// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { ADAPTER_VERSION, createClaudeCliAdapter } from './adapter.js';
export type { ClaudeCliAdapterConfig } from './adapter.js';
export { projectClaudeCli } from './canonical.js';
export type { ProjectionOptions, ProjectionResult } from './canonical.js';
export { mapCliFailure } from './errors.js';
export { encodeRequest } from './messages.js';
export type { CliInvocation, EncodeOptions } from './messages.js';
export { CLI_PRESETS, presetToConfig } from './presets.js';
export type { ClaudeCliPresetId } from './presets.js';
export { DENIED_TOOLS } from './types.js';
export type { ClaudeCliResultJson } from './types.js';

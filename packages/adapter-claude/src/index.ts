// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

export { createClaudeAdapter, ADAPTER_VERSION } from './adapter.js';
export type { ClaudeAdapterConfig } from './adapter.js';
export { projectAnthropic } from './canonical.js';
export type {
  AnthropicContentBlock,
  AnthropicMessageLike,
  AnthropicStopReason,
  ProjectionOptions,
  ProjectionResult,
} from './canonical.js';
export { mapAnthropicError } from './errors.js';
export { encodeRequest } from './messages.js';
export type {
  AnthropicCreateParams,
  AnthropicSdkContentBlock,
  AnthropicSdkMessage,
  AnthropicSdkTool,
  EncodeOptions,
} from './messages.js';
export { PRESETS, presetToConfig } from './presets.js';
export type { ClaudePresetId } from './presets.js';

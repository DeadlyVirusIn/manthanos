// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Run Plan screen. Three internal phases:
//   1. Brief input — typed-form replacement for `manthan plan "<brief>"`
//   2. Running — live phase markers from the PhaseCallback
//   3. Result — plan body + replay hint + next-step nudge
//
// All three phases happen on the same screen. The substrate call is
// the canonical runPlanWorkflow(); we do not wrap it.

import { createClaudeCliAdapter, presetToConfig } from '@manthanos/adapter-claude-cli';
import {
  type PhaseEvent,
  RunPlanError,
  type RunPlanResult,
  runPlanWorkflow,
} from '@manthanos/orchestrator';
import { Box, Text, useInput } from 'ink';
import { useCallback, useState } from 'react';
import { Frame } from '../components/frame.js';

export interface RunPlanScreenProps {
  readonly workspaceRoot: string;
  readonly onPlanComplete: (runId: string) => void;
  readonly onBack: () => void;
}

type Phase =
  | { readonly kind: 'input'; readonly brief: string }
  | { readonly kind: 'running'; readonly brief: string; readonly events: readonly PhaseEvent[] }
  | { readonly kind: 'done'; readonly brief: string; readonly result: RunPlanResult }
  | {
      readonly kind: 'error';
      readonly brief: string;
      readonly message: string;
      readonly code?: string;
    };

export function RunPlanScreen({ workspaceRoot, onPlanComplete, onBack }: RunPlanScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'input', brief: '' });

  const start = useCallback(
    (brief: string) => {
      setPhase({ kind: 'running', brief, events: [] });
      const adapter = createClaudeCliAdapter(
        presetToConfig('sonnet', {
          recommendedFor: ['architecture', 'implementation'],
        }),
      );
      runPlanWorkflow({
        workspaceRoot,
        taskBrief: brief,
        adapter,
        maxUsdMicro: 100_000,
        contextTokenBudget: 60_000,
        onPhase: (event) => {
          setPhase((prev) => {
            if (prev.kind !== 'running') return prev;
            return { ...prev, events: [...prev.events, event] };
          });
        },
      })
        .then((result) => setPhase({ kind: 'done', brief, result }))
        .catch((e: unknown) => {
          if (e instanceof RunPlanError) {
            setPhase({ kind: 'error', brief, message: e.message, code: e.code });
          } else {
            setPhase({
              kind: 'error',
              brief,
              message: e instanceof Error ? e.message : String(e),
            });
          }
        });
    },
    [workspaceRoot],
  );

  useInput((input, key) => {
    if (phase.kind === 'input') {
      if (key.return) {
        const brief = phase.brief.trim();
        if (brief.length === 0) return;
        start(brief);
      } else if (key.escape) {
        onBack();
      } else if (key.backspace || key.delete) {
        setPhase({ kind: 'input', brief: phase.brief.slice(0, -1) });
      } else if (input && !key.ctrl && !key.meta) {
        setPhase({ kind: 'input', brief: phase.brief + input });
      }
    } else if (phase.kind === 'done') {
      if (input === 'c') onPlanComplete(phase.result.runId);
      else if (input === 'b' || key.escape) onBack();
    } else if (phase.kind === 'error') {
      if (input === 'b' || key.escape || key.return) onBack();
    }
  });

  return (
    <Frame
      screen="Run Plan"
      workspaceRoot={workspaceRoot}
      cliCommand={`manthan plan "${phase.brief || '<brief>'}"`}
      hints={phaseHints(phase)}
    >
      {renderPhase(phase)}
    </Frame>
  );
}

function phaseHints(phase: Phase): readonly string[] {
  switch (phase.kind) {
    case 'input':
      return ['[enter] run · [esc] back'];
    case 'running':
      return ['running…'];
    case 'done':
      return ['[c] continue (next step) · [b] back to home'];
    case 'error':
      return ['[b] back · [enter] back'];
  }
}

function renderPhase(phase: Phase) {
  if (phase.kind === 'input') {
    return (
      <Box flexDirection="column">
        <Text>Brief (what should this plan address?):</Text>
        <Box marginTop={1}>
          <Text color="cyan">› </Text>
          <Text>{phase.brief}</Text>
          <Text color="gray">_</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">A real adapter (Claude CLI) will be invoked. Real cost applies.</Text>
        </Box>
      </Box>
    );
  }
  if (phase.kind === 'running') {
    return (
      <Box flexDirection="column">
        <Text>Brief:</Text>
        <Text color="gray"> {phase.brief}</Text>
        <Box marginTop={1} flexDirection="column">
          {phase.events.length === 0 && <Text color="gray">starting…</Text>}
          {phase.events.map((e, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: events are append-only
            <Text key={i}>{formatPhase(e)}</Text>
          ))}
        </Box>
      </Box>
    );
  }
  if (phase.kind === 'done') {
    const r = phase.result;
    const m = r.bundleMetrics;
    return (
      <Box flexDirection="column">
        <Text color="green">Plan complete.</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>run id: {r.runId}</Text>
          <Text color="gray">
            context: {m.trustedFactsInBundle} trusted · {m.quarantineFactsExcluded} quarantine
            excluded · {m.omittedFactsCount} omitted
          </Text>
          <Text color="gray">
            tokens: in={r.usage.inputTokens} out={r.usage.outputTokens} · cost: $
            {(r.usage.usdMicro / 1_000_000).toFixed(6)}
          </Text>
          <Text color="gray">
            compound: {r.compound.factsQuarantined} new T0 fact(s), {r.compound.openIssuesCreated}
            {' open issue(s)'}
          </Text>
        </Box>
        {r.plan && (
          <Box marginTop={1} flexDirection="column">
            <Text>Summary:</Text>
            <Text color="gray"> {r.plan.summary}</Text>
            <Text>Steps:</Text>
            {r.plan.steps.slice(0, 5).map((s) => (
              <Text key={s.id} color="gray">
                {' '}
                · {s.id} (D{s.estimated_difficulty}) {s.description}
              </Text>
            ))}
            {r.plan.steps.length > 5 && (
              <Text color="gray"> · …and {r.plan.steps.length - 5} more</Text>
            )}
          </Box>
        )}
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">To replay this run from the CLI:</Text>
          <Text> manthan replay {r.runId}</Text>
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      <Text color="red">Plan failed.</Text>
      {phase.code && <Text color="gray">code: {phase.code}</Text>}
      <Text>{phase.message}</Text>
    </Box>
  );
}

function formatPhase(event: PhaseEvent): string {
  switch (event.kind) {
    case 'bundle_ready':
      return `· bundle ready: ${event.trustedFactsInBundle} trusted, ${event.quarantineFactsExcluded} quarantine excluded, ~${event.estimatedTokens} tokens`;
    case 'adapter_invoke_start':
      return `· calling ${event.adapterId}…`;
    case 'adapter_invoke_heartbeat':
      return `· still waiting (${Math.round(event.elapsedMs / 1000)}s)`;
    case 'adapter_invoke_done':
      return `· response received: ${event.outputTokens} tokens in ${Math.round(event.elapsedMs / 1000)}s`;
    case 'extracted':
      return `· extracted plan; ${event.factsRecorded} new fact${event.factsRecorded === 1 ? '' : 's'} recorded for review`;
  }
}

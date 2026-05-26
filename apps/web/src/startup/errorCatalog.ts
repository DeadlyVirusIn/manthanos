// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Friendly startup error catalog (F1–F8) — C4.4-E2 (design: C4_3 §4).
//
// Every card: plain noun-phrase title, one-sentence body, one primary
// action, an optional secondary, and an always-available feedback path
// (rendered by the card, not encoded here). No codes/paths/classes/ports —
// a reference code lives only inside the feedback bundle (C4.4 later).

export type StartupErrorId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8';

export interface StartupErrorCardCopy {
  readonly id: StartupErrorId;
  readonly title: string;
  readonly body: string;
  /** Primary action label (the most likely fix). */
  readonly primary: string;
  /** Optional secondary action label (a safe alternative). */
  readonly secondary?: string;
  /** Whether the always-present "Send feedback" action should show. F2/F3
   *  are non-failures and don't need it. */
  readonly feedback: boolean;
}

/** The eight friendly startup failure cards, with the C4.3 §4 refined copy.
 *  Titles are noun-phrase statements of state; tone is calm and non-blaming. */
export const STARTUP_ERROR_CATALOG: Readonly<Record<StartupErrorId, StartupErrorCardCopy>> = {
  F1: {
    id: 'F1',
    title: "ManthanOS didn't start",
    body: "It didn't come up this time — let's try again.",
    primary: 'Try again',
    feedback: true,
  },
  F2: {
    id: 'F2',
    title: 'ManthanOS is already open',
    body: "It's running in another window — we'll bring it to the front.",
    primary: 'Open it',
    feedback: false,
  },
  F3: {
    id: 'F3',
    title: 'Finishing an update…',
    body: 'Just tidying up your data after an update — one moment.',
    primary: 'Try again',
    feedback: false,
  },
  F4: {
    id: 'F4',
    title: 'This Project was made by a newer ManthanOS',
    body: 'Update to the latest version to open it safely.',
    primary: 'Get the update',
    feedback: true,
  },
  F5: {
    id: 'F5',
    title: "We couldn't set up your demo Project",
    body: "Let's try again, or load a fresh demo. Nothing of yours is lost.",
    primary: 'Try again',
    secondary: 'Reset demo',
    feedback: true,
  },
  F6: {
    id: 'F6',
    title: "ManthanOS is running but didn't open",
    body: "The window didn't appear — let's open it.",
    primary: 'Open ManthanOS',
    feedback: true,
  },
  F7: {
    id: 'F7',
    title: 'Your computer is low on space',
    body: 'Free up a little space, then try again.',
    primary: 'Try again',
    feedback: true,
  },
  F8: {
    id: 'F8',
    title: 'Something went wrong starting ManthanOS',
    body: 'A quick report helps us fix it — or try once more.',
    primary: 'Try again',
    feedback: true,
  },
};

export const ALL_STARTUP_ERROR_IDS: readonly StartupErrorId[] = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
];

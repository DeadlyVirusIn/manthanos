# Founder Rules — First 14 Days

> Operational guardrails while the first 5 users interact with ManthanOS.
> Window: 2026-05-17 → 2026-05-31. Re-read every morning.

---

## 1. Primary objective

The next 14 days exist to observe what real users do — not to react to it. The product is a hypothesis under test. The job is to collect behavioral signal and accurate quotes, update `FIRST_5_TRACKER.md`, and resist the urge to bend the product around any single conversation. The output of the 14 days is a populated tracker with enough behavioral data to make one informed decision on day 15. Anything that feels productive but doesn't serve that one outcome is reactive work.

---

## 2. What to do daily

A working checklist. Should take ≤20 minutes most days.

- **Check inbox / DM channels once.** Once, not five times. Process all replies in one block.
- **Update `FIRST_5_TRACKER.md`** with any new status changes. Statuses only — no commentary yet.
- **For any user who replied:** record the quote verbatim. Date the entry. Mark the status delta.
- **For any user who is at status `sent` for >4 days:** send the §6 follow-up template. Once. No second follow-up after that.
- **For any user who is at status `installed` for >5 days with no progression:** send the §6 mid-loop follow-up. Once.
- **Read the tracker top to bottom before closing it.** Look for emerging patterns (≥3 users showing the same behavior). Add to "Emerging patterns" section only when threshold is met.
- **Note your own urges to act.** If you feel pulled toward opening code, writing a doc, posting publicly — write the urge in a single line in your scratch notes. Don't act on it today.

Days where there is zero new signal: 5-minute check, close the laptop, do something else. Stretching the day's "work" to feel productive is the failure mode.

---

## 3. What not to do

The patterns most likely to break the 14 days:

- **Feature thrash.** Implementing fixes for problems one user mentioned. The fix may not generalize; you don't have enough N. Note → defer → wait for the second user to mention the same thing.
- **Over-explaining.** When a user is confused, the urge is to explain. Don't. Their confusion is data. Ask them to describe what they did instead.
- **Defending friction.** "Oh that's a known limitation, the README mentions it in section 4." If they didn't find it in the README, the README failed. Don't argue.
- **Roadmap promises.** "We're working on X for v0.2." There is no v0.2 planned. Don't invent timelines under conversational pressure.
- **Premature scaling.** Adding telemetry, signup forms, analytics dashboards, npm publish. None of these help signal collection at N=5. They're avoidance.
- **Public-launch temptation.** A slow week will feel like the answer is to post on HN or X. It is not. Public launch is week 5+ work, only if the private cohort produced real signal.
- **Mass-DMing more recruits.** If 5 personal-network engineers aren't enough to learn from, 15 won't be either. Lean on the existing 5.
- **Re-reading the governance docs.** They're written. Returning to them mid-window is procrastination dressed as discipline.
- **"Quick" UI mockups.** No frontend work this window. None.
- **Reading competitor announcements.** Cursor/Anthropic/Letta will ship things in 14 days. Don't read about them; you can't respond and reading them costs focus.
- **Building a "v0.2 plan."** The plan is to listen. Anything beyond that is premature.

---

## 4. How to handle positive feedback

When a user says something positive:

- Write the **exact quote** in the tracker. Verbatim.
- Reply with three lines or fewer: thanks, one specific follow-up question about a behavior, nothing else.
- Do NOT reply with enthusiasm. ("That's amazing to hear!" inflates them and primes them to over-please you in future messages.)
- Do NOT share the quote with other users. Each conversation is independent.
- Do NOT share the quote externally (Twitter, LinkedIn, etc.).
- Ask yourself: did they describe a *behavior* or a *feeling*? Behaviors are signal. Feelings are noise.
- If they used the word "remembered," "earlier session," "previously," or "continued from" — that's the aha. Log it specifically.

Positive feedback that isn't behavioral ("cool idea") gets logged once and otherwise ignored.

---

## 5. How to handle negative feedback

This is the most valuable channel. Treat it as such.

- Reply within 24 hours. Faster than you reply to positive.
- Thank them sincerely. "That's useful, thank you." Stop there.
- Ask ONE clarifying question. The form: "Can you describe exactly what happened — step by step from when you typed the command?"
- Do NOT defend. Not "well, the README mentions...", not "that's a known limitation," not "we'll fix that soon."
- Do NOT promise a fix. Even if the fix is trivial. Promises produce expectations; expectations bias future feedback.
- Log the exact quote and the exact reproducer in the tracker.
- Note your *own* emotional reaction to it in a separate scratch file. Not in the tracker. Don't act on the emotional reaction.
- If two users independently report the same negative experience: that's a pattern. Add to "Emerging patterns." Still don't fix it the same day.

Negative feedback never expires. Sit on it overnight. The urgency you feel to respond is rarely the urgency the user feels.

---

## 6. How to handle silence

The most common outcome. Most users will not reply.

- Default expectation: 5 of 10 DMs go unanswered. This is normal personal-network behavior, not a product signal.
- Follow up exactly **twice**: once 4 days after the initial DM, once 7 days after the initial DM. After that, mark `no-reply` and move on.
- Do not interpret silence as rejection of the product. Most silence is bandwidth, not opinion.
- Silence from someone who installed but never ran a command IS signal. Use the §6 mid-loop follow-up.
- Silence from someone who completed the loop is the strongest possible negative signal — they tried it and walked away without comment. Log this carefully.
- Do NOT chase. After two follow-ups, the silence is the answer.
- Do NOT recruit replacements aggressively. If 3 of 10 personal-network engineers respond, that's your sample. The answer to silence is to listen harder to the people who DID respond, not to recruit a new cohort.

---

## 7. What counts as real signal

Specific observable events. Each is worth more than a hundred compliments:

- **Install failed at step X with error Y.** Reproducible. Specific.
- **Ran `manthan plan` once, then never again.** Walked away after session 1.
- **Ran `manthan brain review` and skipped every fact.** Curation didn't land.
- **Ran second plan and the model didn't use the promoted facts.** Mechanism failure on their workload.
- **Ran second plan and the model *did* use the facts, and they noticed.** Aha confirmed.
- **Used the loop on a second project unprompted.** Strongest single behavior signal.
- **Sent an unprompted DM about a specific bug.** Means they care enough to want it fixed.
- **Asked a clarifying question that reveals their mental model.** Tells you what frame they're applying.
- **Mentioned a coworker tried it because they showed them.** Word-of-mouth at unit scale.
- **Returned after >3 days of no use, ran another plan.** Stickiness signal.

If a piece of feedback maps to one of these, log it carefully. If it doesn't, see §8.

---

## 8. What counts as noise

Things to log once and otherwise discount:

- "Cool idea."
- "I could see this being useful."
- "Have you tried integrating with [X]?" — from someone who hasn't used the loop.
- "You should add a UI." — from someone who hasn't completed session 2.
- "The README could be clearer." — true at N=∞, useless at N=1.
- "Have you thought about [adjacent tool]?" — comparative noise.
- "When are you launching?" — no answer required.
- "Is this open-source?" — license is in LICENSE.
- "What's your monetization?" — out of scope.
- Vague positive ("loved it!") with no specific behavior reference.
- Vague negative ("not for me") with no specific behavior reference.
- Anything that says "users would want X" instead of "I would want X."

Noise is not actively harmful — it's just non-informative. Log it once for completeness, but it should not influence any decision.

---

## 9. When feature work is allowed

Strict gates. **All three** must be true:

1. **Two or more users hit the same reproducible blocker** (not the same vague complaint — the same reproducible blocker). One user is N=1; could be environment-specific.
2. **The blocker prevents reaching session 2.** Polish issues, naming issues, formatting issues — defer to a post-window cycle.
3. **The fix is ≤30 minutes of code work and ≤15 LOC.** Bigger fixes have hidden second-order effects. If the fix is bigger than that, it's not a fix — it's a feature, and features need a planning cycle.

If all three apply: fix it the same day. Mark the fix in the tracker against both users' entries. Don't announce the fix publicly. Don't add it to a "changelog." Just commit and continue.

If only one or two apply: write the issue down in a "post-window backlog" file. Do not open the code today.

---

## 10. When to stop and reassess

Concrete triggers. Any one of these means convene a truth-checkpoint-style review:

- **By day 7: 0 of 10 DMs have produced a written soft-commit.** The recruit pool was wrong, or the ask was wrong. Stop sending more DMs. Re-read §2 of Day 7 plan and pick a different cohort.
- **By day 10: 0 of the soft-committed users have installed.** Install friction is fatal. Whatever Day 4 missed, the friction is more severe than predicted.
- **By day 12: ≥3 users completed session 1 but ≥3 also did not reach session 2.** The loop's initiation problem (predicted by Sonnet's review) is real and dominant.
- **By day 14: Some users reached session 2, but none noticed the continuity effect.** Mechanism failure on real workloads. The most important negative signal. Triggers a TRUTH_CHECKPOINT amendment, not a feature fix.
- **At any point: a user reports an audit-chain or data-corruption issue.** Stop everything; this is substrate work, not feature work. Reproduce, fix, then continue the window.
- **At any point: you find yourself opening code despite no §9 gate met.** Stop. Close the file. The urge is the signal that you're reactive, not the data.

Reassessment doesn't mean "abandon the window." It means: pause new outreach, document the trigger, decide if the remaining days should continue as planned or shift.

---

## 11. Questions to ask yourself each night

Three questions. Answer them honestly in a private scratch file. Not in the tracker.

1. **What did I observe today that wasn't there yesterday?** Behavioral changes, new replies, status deltas. If nothing: that's a legitimate answer.
2. **What did I want to do today that I didn't?** Features, public posts, code changes. Naming the urge weakens it.
3. **Am I letting any single user shape my view of the product?** Especially the loudest one (positive or negative). One voice ≠ the product's reception.

A fourth, weekly (Sunday): **am I still optimizing for truth, or have I started optimizing for the window producing positive results?** The honest answer to that question is the most important one of the 14 days.

---

## 12. Final rule

If you're about to change the product, write down what a real user actually did first; if you can't write it down in one specific sentence, you don't have enough signal to act.

---

*Re-read every morning. Update tracker daily. Update this doc only if a real situation surfaces a rule that's missing.*

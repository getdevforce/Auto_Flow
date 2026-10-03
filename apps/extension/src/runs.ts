import { estimateCost, splitPrompts, type Job, type ProviderId } from '@frameloom/shared';
import { db } from './db/db';
import type { ImageJobInput } from './background/runner';

export interface CreateRequest {
  project: string;
  nameTemplate: string;
  promptsText: string;
  providerId: ProviderId;
  model: string;
  ratio?: string;
  count: number;
  budgetUsd: number;
  priceUsd?: number;
}

export function previewCreate(r: Pick<CreateRequest, 'promptsText' | 'count' | 'priceUsd'>) {
  const prompts = splitPrompts(r.promptsText);
  const per = r.priceUsd !== undefined ? estimateCost({ usd: r.priceUsd, unit: 'image' }, { count: r.count }) : null;
  return { prompts, estimateUsd: per === null ? null : Math.round(per * prompts.length * 10000) / 10000 };
}

/** Creates the run and its jobs in one transaction, then wakes the worker. */
export async function startCreateRun(r: CreateRequest): Promise<string> {
  const { prompts } = previewCreate(r);
  if (!prompts.length) throw new Error('Add at least one prompt. Separate prompts with a blank line.');
  const runId = crypto.randomUUID();
  const per = r.priceUsd !== undefined ? estimateCost({ usd: r.priceUsd, unit: 'image' }, { count: r.count }) ?? 0 : 0;
  await db.transaction('rw', db.runs, db.jobs, async () => {
    await db.runs.put({ id: runId, name: r.project, project: r.project, state: 'generating', budgetUsd: r.budgetUsd, nameTemplate: r.nameTemplate, createdAt: Date.now() });
    for (const [i, prompt] of prompts.entries()) {
      const input: ImageJobInput = { providerId: r.providerId, prompt, ratio: r.ratio, count: r.count, label: prompt.slice(0, 60) };
      const job: Job = {
        id: `${runId}:${i + 1}`, runId, kind: 'image', provider: r.providerId, model: r.model, input, state: 'queued',
        seq: i + 1, attempts: 0, maxAttempts: 3, nextAt: 0, estimateUsd: per,
      };
      await db.jobs.put(job);
    }
  });
  await chrome.runtime.sendMessage({ type: 'wake' });
  return runId;
}

export async function resumeRun(runId: string): Promise<void> {
  await db.runs.update(runId, { state: 'generating', pausedReason: undefined });
  await chrome.runtime.sendMessage({ type: 'wake' });
}

import type { Job, JobStore } from './types';

/** In-memory store for tests. Returns copies so callers cannot mutate state without put(). */
export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>();
  async all(): Promise<Job[]> { return [...this.jobs.values()].map((j) => ({ ...j })); }
  async put(job: Job): Promise<void> { this.jobs.set(job.id, { ...job }); }
}

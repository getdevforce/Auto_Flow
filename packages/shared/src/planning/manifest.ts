export type ShotStatus = 'planned' | 'refining' | 'keyframe' | 'generating' | 'upscaling' | 'downloading' | 'done' | 'flagged' | 'skipped';

export interface ManifestShot {
  seq: number; sceneIndex: number; shotIndex: number; status: ShotStatus; file?: string;
  prompt?: string; negativePrompt?: string; originalPrompt?: string; rationale?: string;
  keyframeModel?: string; videoModel?: string; upscaleModel?: string;
  scores?: { identity?: number; environment?: number; heuristic: true };
  costUsd?: number; flagReason?: string; durationSec?: number; width?: number; height?: number;
}

export interface Manifest { project: string; generatedAt: string; mode: 'native' | 'draft_upscale'; totalCostUsd: number; estimate: true; shots: ManifestShot[] }

export function buildManifest(project: string, mode: Manifest['mode'], shots: ManifestShot[], now = new Date()): Manifest {
  const sorted = [...shots].sort((a, b) => a.seq - b.seq);
  return { project, generatedAt: now.toISOString(), mode, estimate: true, totalCostUsd: Math.round(sorted.reduce((s, x) => s + (x.costUsd ?? 0), 0) * 10000) / 10000, shots: sorted };
}

/** ffmpeg concat demuxer list, in sequence order. Flagged or skipped shots are left out and noted as comments. */
export function buildConcatList(shots: ManifestShot[]): string {
  return [...shots].sort((a, b) => a.seq - b.seq).map((s) => {
    const file = s.file?.split('/').pop();
    return s.status === 'done' && file ? `file '${file.replace(/'/g, "'\\''")}'` : `# ${String(s.seq).padStart(3, '0')} ${s.status}${s.flagReason ? `: ${s.flagReason.replace(/\n/g, ' ')}` : ''}`;
  }).join('\n') + '\n';
}

/**
 * Which finished shots may be downloaded now. Normal mode releases every finished shot immediately (the sequence number in
 * the file name fixes playback order). Strict mode holds a shot until every earlier one is downloaded, flagged or skipped.
 */
export function releasable(shots: Array<{ seq: number; status: ShotStatus; downloaded?: boolean; ready: boolean }>, strict: boolean): number[] {
  const sorted = [...shots].sort((a, b) => a.seq - b.seq);
  const out: number[] = [];
  for (const s of sorted) {
    if (s.ready && !s.downloaded) { out.push(s.seq); continue; }
    const settled = s.downloaded || s.status === 'flagged' || s.status === 'skipped';
    if (strict && !settled) break; // an earlier shot is still in flight: hold everything after it
  }
  return out;
}

export interface RunReport { succeeded: number; flagged: Array<{ seq: number; reason: string }>; skipped: number; retries: number; costUsd: number; durationMs: number }

export function buildReport(shots: ManifestShot[], retries: number, durationMs: number): RunReport {
  return {
    succeeded: shots.filter((s) => s.status === 'done').length,
    // A shot delivered in degraded form (e.g. draft kept after a failed upscale) still counts as flagged.
    flagged: shots.filter((s) => s.status === 'flagged' || (s.status === 'done' && s.flagReason)).map((s) => ({ seq: s.seq, reason: s.flagReason ?? 'Unknown' })),
    skipped: shots.filter((s) => s.status === 'skipped').length,
    retries, costUsd: Math.round(shots.reduce((t, s) => t + (s.costUsd ?? 0), 0) * 10000) / 10000, durationMs,
  };
}

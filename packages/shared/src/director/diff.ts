export type DiffPart = { kind: 'same' | 'add' | 'del'; text: string };

/** Word-level diff via longest common subsequence; small inputs only (prompts), so O(n*m) is fine. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0) as number[]);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i]![j] = a[i] === b[j] ? (dp[i + 1]![j + 1] as number) + 1 : Math.max(dp[i + 1]![j] as number, dp[i]![j + 1] as number);
  }
  const out: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += ` ${text}`; else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i] as string); i++; j++; }
    else if ((dp[i + 1]![j] as number) >= (dp[i]![j + 1] as number)) { push('del', a[i] as string); i++; }
    else { push('add', b[j] as string); j++; }
  }
  while (i < a.length) push('del', a[i++] as string);
  while (j < b.length) push('add', b[j++] as string);
  return out;
}

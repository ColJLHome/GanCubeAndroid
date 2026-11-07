export type TimingOutcome = 'solved' | 'manual' | 'reset' | 'interrupted';
export interface TimingRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: TimingOutcome;
  initialFacelets: string;
  cubeId?: string | null;
  cubeName?: string | null;
}
export async function databaseRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`Database request failed (${response.status}). Check that the API server is running.`);
  return response.json() as Promise<T>;
}
export const saveTiming = (timing: TimingRecord) => databaseRequest<{id: string}>('timings', { method: 'POST', body: JSON.stringify(timing), keepalive: true });
export async function listTimings(): Promise<TimingRecord[]> {
  const records: TimingRecord[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await databaseRequest<TimingRecord[]>(`timings?limit=500&offset=${offset}`);
    records.push(...page);
    if (page.length < 500) return records;
  }
}

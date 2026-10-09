// KRW display helpers shared by screens and the AI prompt.
export function formatManwon(krw: number): string {
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
}
/** "1,100만~2,000만원" */
export function formatManwonRange(r: { low: number; high: number }): string {
  return `${formatManwon(r.low)}~${formatManwon(r.high)}원`;
}
export function formatWon(krw: number): string {
  return `${krw.toLocaleString("ko-KR")}원`;
}

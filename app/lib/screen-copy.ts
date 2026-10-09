// Text builders for the recruiting page, kept pure so the wording is tested.
import { headlineWord, objectParticle } from "./matching.ts";

/** TODO(legal): basis wording shown next to every revenue estimate. */
export function estimateBasis(type: string, e: { respondents: number; scaleFactor: number; marginPct: number }): string {
  return `근거: ${type}${objectParticle(type)} 고른 응답자 ${e.respondents}명의 1회 지출과 방문 빈도, 환산 배수 ${e.scaleFactor}, 순이익률 ${e.marginPct}% 가정`;
}

/** "주민 N명이 <word>를 원해요" as three parts so the screen can highlight only the word. */
export function recruitHeadline(type: string, count: number): { before: string; word: string; after: string } {
  const word = headlineWord(type);
  return { before: `주민 ${count}명이 `, word, after: `${objectParticle(word)} 원해요` };
}

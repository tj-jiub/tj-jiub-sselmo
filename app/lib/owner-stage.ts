import { PUBLIC_THRESHOLD } from "./report.ts";
import type { SpaceStage } from "./owner-spaces.server.ts";

export type StageCard = { stage: SpaceStage; responseCount: number; candidateCount: number; rejectReason: string | null };

export type StageView = {
  label: string;
  /** Big number line: `value` is rendered with the digit font, `unit` is the Korean text around it. */
  big: { value: string; unit: string } | null;
  note: string | null;
  canViewCandidates: boolean;
  /** /r/:slug and the QR only make sense while the space is public. */
  isLive: boolean;
  canEdit: boolean;
};

/** One stage per card; the owner sees their own response count even below the public threshold. */
export function stageView(c: StageCard): StageView {
  switch (c.stage) {
    case "pending":
      return { label: "운영자 확인 대기", big: null, note: "운영자가 확인하면 공개돼요. 보통 1~2일 걸려요.", canViewCandidates: false, isLive: false, canEdit: true };
    case "collecting": {
      const enough = c.responseCount >= PUBLIC_THRESHOLD;
      return {
        label: "주민 의견 모으는 중",
        big: enough ? { value: String(c.responseCount), unit: "명 모였어요" } : { value: `${c.responseCount}/${PUBLIC_THRESHOLD}`, unit: "명" },
        note: enough ? null : `${PUBLIC_THRESHOLD}명이 모이면 공개돼요.`,
        canViewCandidates: true,
        isLive: true,
        canEdit: false,
      };
    }
    case "evaluated":
      return { label: "후보 평가 완료", big: { value: String(c.candidateCount), unit: "명의 후보" }, note: null, canViewCandidates: true, isLive: true, canEdit: false };
    case "rejected":
      return { label: "반려됨", big: null, note: c.rejectReason ? `사유: ${c.rejectReason}` : "운영자가 이 공실을 공개하지 않기로 했어요.", canViewCandidates: false, isLive: false, canEdit: false };
    case "paused":
      return { label: "공개 일시 중지", big: null, note: "이 공간의 공개가 잠시 멈춰 있어요. 운영자에게 문의해 주세요.", canViewCandidates: false, isLive: false, canEdit: false };
  }
}

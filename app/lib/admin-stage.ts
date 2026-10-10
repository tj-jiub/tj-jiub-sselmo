/** Pure admin stage helpers (no server imports: components use them too). Plain Korean words, no abbreviations. */
import { PUBLIC_THRESHOLD } from "./report.ts";

export type SpaceStageKey = "pending" | "collecting" | "ready" | "rejected" | "private";
export type SpaceStageInput = {
  status: "pending" | "active" | "rejected";
  owner_consent: number;
  response_count: number;
  candidate_count: number;
};
export type SpaceStageInfo = {
  key: SpaceStageKey;
  label: string;
  progress: { value: number; max: number } | null;
  detail: string;
};

export function spaceStage(s: SpaceStageInput): SpaceStageInfo {
  if (s.status === "pending") return { key: "pending", label: "승인 대기", progress: null, detail: "운영자 확인을 기다려요" };
  if (s.status === "rejected") return { key: "rejected", label: "반려", progress: null, detail: "승인하지 않았어요" };
  if (s.owner_consent !== 1) return { key: "private", label: "비공개", progress: null, detail: "건물주 동의 전이라 공개되지 않아요" };
  if (s.candidate_count > 0) return { key: "ready", label: "후보 준비됨", progress: null, detail: `후보 ${s.candidate_count}명` };
  return {
    key: "collecting",
    label: "의견 모으는 중",
    progress: { value: Math.min(s.response_count, PUBLIC_THRESHOLD), max: PUBLIC_THRESHOLD },
    detail: `주민 의견 ${s.response_count} / ${PUBLIC_THRESHOLD}명`,
  };
}

export type ApplicationStageKey = "evaluating" | "failed" | "mail" | "owner-review" | "contract";
export type ApplicationStageInput = {
  ai_status: "pending" | "done" | "failed";
  result_mailed_at: number | null;
  has_broker_intro?: boolean;
};

export const APPLICATION_STEPS = ["신청", "AI 평가", "결과 메일", "건물주 검토", "계약 (공인중개사)"] as const;

export function applicationStage(a: ApplicationStageInput): { key: ApplicationStageKey; label: string; stepIndex: 0 | 1 | 2 | 3 | 4 } {
  if (a.ai_status === "failed") return { key: "failed", label: "실패", stepIndex: 1 };
  if (a.ai_status === "pending") return { key: "evaluating", label: "평가 중", stepIndex: 1 };
  if (a.result_mailed_at === null) return { key: "mail", label: "메일 보낼 차례", stepIndex: 2 };
  if (a.has_broker_intro) return { key: "contract", label: "계약 단계", stepIndex: 4 };
  return { key: "owner-review", label: "건물주 검토 중", stepIndex: 3 };
}

export type NextAction = { key: string; title: string; hint: string };
export type NextActionEntity =
  | ({ kind: "space" } & SpaceStageInput)
  | ({
      kind: "application";
      track: "ssulmo" | "general";
      consent_consulting_at: number | null;
      /** True when a consulting_months row exists for the current KST month. */
      has_month_this_month: boolean;
    } & ApplicationStageInput);

export function nextAction(e: NextActionEntity): NextAction | null {
  if (e.kind === "space") {
    return e.status === "pending"
      ? { key: "approve-space", title: "공실 승인하기", hint: "사진과 위치를 확인하고 승인하거나 반려해 주세요." }
      : null;
  }
  const stage = applicationStage(e);
  if (stage.key === "failed") return { key: "re-evaluate", title: "재평가하기", hint: "AI 평가가 실패했어요. 다시 돌려 주세요." };
  if (stage.key === "mail") return { key: "send-mail", title: "결과 메일 보내기", hint: "신청자에게 결과 확인 링크를 보내 주세요." };
  if (stage.key === "evaluating" || stage.key === "contract") return null;
  if (e.track === "ssulmo" && e.consent_consulting_at !== null && !e.has_month_this_month) {
    return { key: "record-revenue", title: "이번 달 매출 기록하기", hint: "컨설팅 중인 신청자의 이번 달 매출과 손익을 적어 주세요." };
  }
  return { key: "wait-owner", title: "건물주 검토를 기다려요", hint: "건물주가 후보를 보고 연락을 정하면 다음 단계로 넘어가요." };
}

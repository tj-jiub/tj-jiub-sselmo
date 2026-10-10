type StatusInput = { status: "pending" | "active" | "rejected"; owner_consent: number };

/** Operator-facing label. Public gate is status = 'active' AND owner_consent = 1. */
export function spaceStatusLabel(s: StatusInput): "공개" | "비공개" | "확인 대기" | "반려" {
  if (s.status === "pending") return "확인 대기";
  if (s.status === "rejected") return "반려";
  return s.owner_consent === 1 ? "공개" : "비공개";
}

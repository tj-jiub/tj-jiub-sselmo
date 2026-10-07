export const VERDICTS = [
  { value: "fit", label: "잘 맞아요" },
  { value: "improve", label: "보완하면 좋아요" },
  { value: "rethink", label: "다시 생각해 보세요" },
] as const;

export function verdictLabel(v: string | null): string | null {
  return VERDICTS.find((x) => x.value === v)?.label ?? null;
}

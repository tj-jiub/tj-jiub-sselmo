import { Link } from "react-router";
import { Shell, Title } from "~/components/ui";

const roles = [
  { to: "/spaces", title: "창업하고 싶어요", desc: "모집 중인 공실을 보고 창업을 신청해요. 신청은 무료예요." },
  { to: "/admin/login", title: "관리자예요", desc: "공실 등록, 수요 리포트, 신청 검토" },
];

export default function Home() {
  return (
    <Shell>
      <Title eyebrow="SSULMO">비어 있는 가게 자리에 어떤 가게가 필요한지, 동네가 알려줘요</Title>
      <div className="mb-8 grid gap-2.5">
        {roles.map((r) => (
          <Link key={r.to} to={r.to} className="block rounded-xl border border-ink p-4 hover:bg-[#f6f6f6]">
            <span className="block font-bold">{r.title}</span>
            <span className="mt-0.5 block text-sm text-muted">{r.desc}</span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted">동네 주민이라면 가게 앞에 붙은 QR을 찍어 의견을 남겨 주세요.</p>
    </Shell>
  );
}

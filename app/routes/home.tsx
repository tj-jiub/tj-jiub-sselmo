import { Link } from "react-router";
import { Hl, Shell, Title } from "~/components/ui";

const roles = [
  { to: "/find", title: "창업할 자리를 찾아요 →", desc: "모집 중인 공실을 보고 창업을 신청해요. 신청은 무료예요.", primary: true },
  { to: "/admin/login", title: "관리자예요", desc: "공실 등록, 수요 리포트, 신청 검토", primary: false },
];

export default function Home() {
  return (
    <Shell wide>
      <div className="split items-end">
        <Title eyebrow="SSULMO" hero>
          비어 있는 가게 자리에 <Hl>어떤 가게가 필요한지</Hl>, 동네가 알려줘요
        </Title>
        <div>
          <div className="mb-6 grid gap-3">
            {roles.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className={`block rounded-[14px] border p-5 lg:p-6 ${r.primary ? "border-yellow-deep bg-yellow" : "border-line bg-paper hover:border-muted"}`}
              >
                <span className="block text-xl font-bold">{r.title}</span>
                <span className="mt-1 block text-sm">{r.desc}</span>
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted">동네 주민이라면 가게 앞에 붙은 QR을 찍어 의견을 남겨 주세요.</p>
        </div>
      </div>
    </Shell>
  );
}

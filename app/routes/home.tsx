import { Link } from "react-router";
import { ContinuousPage, Cta, Hero, NumberedList, Say, StackCard, StackSection } from "~/components/motion";

export default function Home() {
  return (
    <ContinuousPage>
      <Hero
        label="SSULMO"
        title={
          <>
            비어 있는 가게 자리에 <mark className="cp-hl">어떤 가게가 필요한지</mark>, 동네가 알려줘요
          </>
        }
        lead={
          <>
            가게 앞에 붙은 QR로 주민이 남긴 목소리를 모아, 그 자리에 꼭 맞는 창업자를 이어 드려요.
            <span className="block">
              <Link to="/find" className="cp-btn">
                창업할 자리를 찾아요 →
              </Link>
            </span>
            <Link to="/admin/login" className="mt-5 inline-block text-[15px] text-muted underline underline-offset-4">
              관리자예요
            </Link>
          </>
        }
      />

      <Say label="쓸모가 하는 일" text="가게 앞 QR로 모은 주민들의 목소리가, 비어 있는 자리에 꼭 맞는 가게를 알려줘요." />

      <StackSection label="이렇게 쓰여요" title="주민, 창업자, 건물주가 각자 할 일">
        <StackCard tag="주민" title="QR을 찍어 한 번 답해요" top>
          <NumberedList items={["가게 앞 QR을 찍어요", "이 자리에 있었으면 하는 가게를 골라요", "답변은 업종별로만 모여 보여요"]} />
        </StackCard>
        <StackCard tag="창업자" title="자리를 보고 무료로 지원해요">
          <NumberedList items={["모집 중인 자리를 찾아요", "동네 수요와 예상 매출을 확인해요", "무료로 지원하고 AI 평가를 받아요"]} />
        </StackCard>
        <StackCard tag="건물주" title="후보를 소개받아요">
          <NumberedList items={["공실을 등록해요", "주민 수요가 모이면 리포트를 받아요", "상위 후보를 소개받고 계약은 직접 해요"]} />
        </StackCard>
      </StackSection>

      <Cta label="시작하기" title="창업할 자리를 찾아볼까요?" to="/find" action="창업할 자리를 찾아요 →" />
    </ContinuousPage>
  );
}

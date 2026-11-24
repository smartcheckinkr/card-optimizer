import { useEffect, useMemo, useRef, useState } from 'react';
import { useCardStore } from '../state/store';
import { ASSISTANT_SUGGESTIONS, askAssistant, type AssistantAnswer } from '../engine/assistant';
import { Badge, InfoNote } from '../components/ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  followUps?: string[];
  intent?: string;
}

const greeting = (): Message => ({
  id: 'greeting',
  role: 'assistant',
  text: [
    '안녕하세요, 카드 비서입니다.',
    '',
    '이번 달 실적·한도·혜택 데이터를 계산해서 답합니다. 금액 없이 가맹점만 적어도 돼요.',
    '· 이번 달 어떤 카드 실적을 먼저 채워야 하나요?',
    '· 지방세 내기 좋을 카드',
    '· CGV 결제에 유리한 카드',
    '· 스타벅스 카드 추천',
    '· 100만 원 분할 결제 유리한가?',
    '',
    '※ MVP는 외부 LLM 없이 로컬 규칙·계산 엔진으로만 답합니다.',
  ].join('\n'),
  followUps: ASSISTANT_SUGGESTIONS.slice(0, 3),
});

export function AssistantScreen() {
  const { state } = useCardStore();
  const today = useMemo(() => new Date(), []);
  const [messages, setMessages] = useState<Message[]>([greeting()]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, typing]);

  const send = (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);
    const answer: AssistantAnswer = askAssistant(question, state, today);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: answer.text, followUps: answer.followUps, intent: answer.intent }]);
      setTyping(false);
    }, 220);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5 text-white" style={{ background: 'linear-gradient(150deg,#0d1b2a 0%,#123047 60%,#0f766e 140%)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-[19px] font-bold tracking-tight">AI 카드 비서</h1>
          <Badge tone="example" className="!bg-white/10 !text-white/70 !ring-white/15">로컬 엔진</Badge>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
          보유 카드의 실적·한도·지갑 데이터를 계산해 답합니다. 금액·순위는 검증 가능한 계산 엔진 결과입니다.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <InfoNote>
          외부 LLM은 연결되어 있지 않습니다. 질문 의도 분류와 계산은 앱 내부 규칙 엔진이 수행하며, 답변에 사용한 값은 내 카드·결제내역 데이터입니다.
        </InfoNote>

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] ${m.role === 'user' ? '' : 'w-full'}`}>
              <div
                className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-white text-slate-700 shadow-soft ring-1 ring-slate-900/5'
                }`}
              >
                {m.text}
              </div>
              {m.role === 'assistant' && m.followUps && m.followUps.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.followUps.map((f) => (
                    <button key={f} onClick={() => send(f)} className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-medium text-indigo-600 ring-1 ring-indigo-100">
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[12px] text-slate-400 shadow-soft ring-1 ring-slate-900/5">
              계산 중…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white/95 px-3 pb-3 pt-2 backdrop-blur">
        <div className="mb-1.5 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ASSISTANT_SUGGESTIONS.slice(3).map((s) => (
            <button key={s} onClick={() => send(s)} className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-medium text-slate-600">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-1.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 이번 달 소멸 예정인 혜택은?"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
          <button type="submit" disabled={!input.trim()} className="rounded-xl bg-ink px-3.5 py-2.5 text-[12px] font-semibold text-white disabled:opacity-30">
            전송
          </button>
        </form>
      </div>
    </div>
  );
}

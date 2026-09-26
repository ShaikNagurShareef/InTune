import { Languages, MessageSquareReply, Target } from "lucide-react";

/** Static product illustration (decorative): an Instagram-style DM showing tone tags and reading help. */
export function PhoneMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-[300px] rounded-[44px] border border-line bg-card p-3 shadow-[var(--shadow-lg)]">
      <div className="overflow-hidden rounded-[34px] bg-paper">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#1f9d8f] to-[#4f5bd5] text-sm font-extrabold text-white">L</span>
          <div>
            <p className="text-sm font-extrabold leading-tight">Leo Park</p>
            <p className="text-[11px] text-ink-2">🔋 Low energy today</p>
          </div>
        </div>
        <div className="space-y-2 px-3 py-4 text-[13px]">
          <p className="py-1 text-center text-[10px] font-semibold text-ink-2">Today 9:12 AM</p>
          <div className="flex justify-start">
            <p className="bg-bubble rounded-[18px] rounded-bl-md px-3 py-2">red light</p>
          </div>
          <div className="flex justify-end">
            <div className="relative mb-3">
              <p className="bg-brand max-w-[210px] rounded-[18px] rounded-br-md px-3 py-2 text-white">OK. You don’t need to reply. I’m here later.</p>
              <span className="absolute -bottom-3 right-2 rounded-full border border-line bg-card px-1.5 py-0.5 text-[10px] font-bold">🤝 No reply needed</span>
            </div>
          </div>
          <div className="flex justify-start">
            <p className="bg-bubble max-w-[220px] rounded-[18px] rounded-bl-md px-3 py-2">It’d be great if you could maybe bring something?</p>
          </div>
          <div className="ml-2 rounded-2xl border border-line bg-card p-2.5 shadow-[var(--shadow)]">
            <p className="flex items-center gap-1 text-[10px] font-bold text-teal"><Languages className="h-3 w-3" /> Translated for you</p>
            <p className="mt-1.5 flex gap-1.5 text-[11px]"><Target className="mt-0.5 h-3 w-3 shrink-0 text-ink-2" /><b>Can you bring food? Any food is fine.</b></p>
            <p className="mt-1 flex gap-1.5 text-[11px]"><MessageSquareReply className="mt-0.5 h-3 w-3 shrink-0 text-ink-2" /><span className="rounded-full bg-teal-soft px-1.5 font-bold text-teal">Yes — they’re asking</span></p>
          </div>
        </div>
        <div className="m-2 flex items-center gap-2 rounded-full border border-line px-3 py-2 text-[12px] text-ink-2">
          <span>🙂</span> Message… <span className="bg-brand ml-auto rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white">✨ Translate</span>
        </div>
      </div>
    </div>
  );
}

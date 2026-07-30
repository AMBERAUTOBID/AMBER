import { Plus } from "@phosphor-icons/react/dist/ssr";

export default function FAQAccordion({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  return (
    <div className="divide-y divide-char-200 overflow-hidden rounded-2xl border border-char-200 bg-white">
      {items.map((item, i) => (
        <details key={i} className="group px-6 py-5 open:bg-amber-50/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-char-900 [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus
              size={18}
              weight="bold"
              className="shrink-0 text-amber-600 transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-char-600">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

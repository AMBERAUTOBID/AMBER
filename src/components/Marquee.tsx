import { Sparkle } from "@phosphor-icons/react/dist/ssr";

export default function Marquee({ items }: { items: string[] }) {
  const track = [...items, ...items];

  return (
    <div className="overflow-hidden border-y border-amber-400/30 bg-char-900 py-3">
      <div className="flex w-max animate-marquee motion-reduce:animate-none">
        {track.map((item, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-2.5 px-6 text-sm font-medium text-char-200"
          >
            <Sparkle size={14} weight="fill" className="shrink-0 text-amber-500" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

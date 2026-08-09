import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import type { OrderStage } from "../model/stages";
import { stageIndex } from "../model/stages";

/**
 * Where a car is, in one pill.
 *
 * Three colours, not eight. A colour per stage would be a legend nobody
 * learns; what actually needs distinguishing at a glance is "still in the US",
 * "in transit", and "done" — the three answers to "should I be doing something
 * about this today".
 *
 * Reads `Orders.stage` so the client area and the admin console name a stage
 * identically. An operator on the phone to a client must not be reading a
 * different word than the client is looking at.
 */
export default function StageBadge({
  stage,
  className,
}: {
  stage: OrderStage;
  className?: string;
}) {
  const t = useTranslations("Orders.stage");
  const i = stageIndex(stage);

  const tone =
    i >= 7
      ? "bg-green-50 text-green-800"
      : i >= 4
        ? "bg-blue-50 text-blue-800"
        : "bg-amber-50 text-amber-800";

  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone,
        className
      )}
    >
      {t(stage)}
    </span>
  );
}

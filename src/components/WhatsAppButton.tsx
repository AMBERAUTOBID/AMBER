import { getTranslations } from "next-intl/server";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";

const PHONE_E164 = "+19125612347";

export default async function WhatsAppButton() {
  const t = await getTranslations("WhatsAppButton");

  return (
    <a
      href={`https://wa.me/${PHONE_E164.replace(/\D/g, "")}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("label")}
      title={t("label")}
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
    >
      <WhatsappLogo size={30} weight="fill" />
    </a>
  );
}

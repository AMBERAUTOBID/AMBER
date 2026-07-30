import { getTranslations } from "next-intl/server";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { CONTACT_HREF } from "@/shared/config/site";

export default async function WhatsAppButton() {
  const t = await getTranslations("WhatsAppButton");

  return (
    <a
      href={CONTACT_HREF.whatsapp}
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

import {
  InstagramLogo,
  YoutubeLogo,
  WhatsappLogo,
  FacebookLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { SocialNetwork } from "@/shared/config/site";

/**
 * Which glyph draws which network, and what it is called.
 *
 * Lives here rather than in `site.ts` because that file is imported by the
 * Telegram bot outside React and must stay plain data — it hands over a key,
 * and this decides what a key looks like. Shared by the header row, the burger
 * menu and the contact dropdown so the three cannot drift.
 */
export const SOCIAL_ICON: Record<SocialNetwork, typeof InstagramLogo> = {
  instagram: InstagramLogo,
  youtube: YoutubeLogo,
  whatsapp: WhatsappLogo,
  facebook: FacebookLogo,
};

export const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
};

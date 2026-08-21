import { jsonLdString } from "./jsonLd";

/**
 * One JSON-LD block. Not executed by the browser — `application/ld+json` is a
 * data island only crawlers read — so the CSP's script rules do not apply and
 * no nonce is needed.
 */
export default function JsonLdScript({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}

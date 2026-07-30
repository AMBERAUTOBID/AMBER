import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /search itself is a legitimate landing page worth indexing, but
      // /vehicle/[vin] pages are individual auction lots that expire and
      // change constantly (bad for SEO anyway) - a crawler discovering and
      // following every result-card link would be exactly the kind of
      // single client that could drain the Apibara request quota.
      disallow: ["/api/", "/vehicle/"],
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/methodology", "/sources"],
        disallow: ["/api/", "/embed/"],
      },
    ],
    sitemap: "https://dashboard.thesentinelreview.com/sitemap.xml",
  };
}

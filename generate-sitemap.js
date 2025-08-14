const fs = require("fs");
const fetch = require("node-fetch");

const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const SITE_ID = process.env.WEBFLOW_SITE_ID; // Find in Webflow settings

async function getPages() {
  const res = await fetch(`https://api.webflow.com/sites/${SITE_ID}/pages`, {
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "accept-version": "1.0.0"
    }
  });
  if (!res.ok) throw new Error(`Error fetching pages: ${res.statusText}`);
  return res.json();
}

function buildSitemap(pages) {
  const urls = pages
    .filter(p => !p.slug.startsWith("_")) // skip hidden pages
    .map(p => `
    <url>
      <loc>https://${process.env.SITE_DOMAIN}/${p.slug}</loc>
      <lastmod>${new Date(p.lastPublished || p.updatedOn).toISOString()}</lastmod>
      <priority>${p.slug === "" ? "1.0" : "0.8"}</priority>
    </url>
    `)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
  </urlset>`;
}

(async () => {
  try {
    const pages = await getPages();
    const xml = buildSitemap(pages);
    fs.writeFileSync("sitemap.xml", xml, "utf8");
    console.log("✅ Sitemap generated.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

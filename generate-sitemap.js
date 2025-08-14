const fs = require("fs");
const fetch = require("node-fetch");

const API_TOKEN = process.env.WEBFLOW_API_TOKEN; // token with pages:read, cms:read
const SITE_ID   = process.env.WEBFLOW_SITE_ID;   // this site’s ID
const DOMAIN    = process.env.SITE_DOMAIN;       // e.g. exoshield.com

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_TOKEN}` } // v2 uses Bearer only
  });
  if (!res.ok) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

// v2: /v2/sites/:siteId/pages  -> { pages: [...] }
async function getPages(siteId) {
  const out = [];
  let offset = 0, limit = 100;
  while (true) {
    const data = await fetchJSON(`https://api.webflow.com/v2/sites/${siteId}/pages?limit=${limit}&offset=${offset}`);
    const pages = data.pages || [];
    out.push(...pages);
    if (pages.length < limit) break;
    offset += limit;
  }
  return out;
}

// v2: /v2/sites/:siteId/collections -> { collections: [...] }
async function getCollections(siteId) {
  const data = await fetchJSON(`https://api.webflow.com/v2/sites/${siteId}/collections`);
  return data.collections || [];
}

// v2: /v2/collections/:collectionId/items -> { items: [...] }
async function getAllItems(collectionId) {
  const items = [];
  let offset = 0, limit = 100;
  while (true) {
    const data = await fetchJSON(`https://api.webflow.com/v2/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
    const batch = data.items || [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return items;
}

function urlTag(loc, lastmod, priority = "0.8") {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod || Date.now()).toISOString()}</lastmod>
    <priority>${priority}</priority>
  </url>`;
}

(async () => {
  try {
    const tags = [];

    // ----- Static pages -----
    const pages = await getPages(SITE_ID); // requires pages:read scope
    for (const p of pages) {
      if (p.archived || p.draft) continue;
      // v2 provides a ready path for the published page
      const path = p.publishedPath || (p.slug ? `/${p.slug}` : "/");
      const loc  = `https://${DOMAIN}${path}`;
      const last = p.lastUpdated || p.createdOn;
      const prio = path === "/" ? "1.0" : "0.8";
      tags.push(urlTag(loc, last, prio));
    }

    // ----- CMS items -----
    const collections = await getCollections(SITE_ID); // requires cms:read scope
    for (const col of collections) {
      const base = col.slug || ""; // collection base path
      const items = await getAllItems(col.id);
      for (const item of items) {
        if (item.isDraft || item.isArchived) continue;
        const slug = item.fieldData?.slug;
        if (!slug) continue;
        // Build /collection-slug/item-slug
        const loc  = `https://${DOMAIN}/${base}/${slug}`.replace(/\/+/g, "/").replace(":/", "://");
        const last = item.lastPublished || item.lastUpdated || item.createdOn;
        tags.push(urlTag(loc, last, "0.7"));
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${tags.join("\n")}
</urlset>
`;
    fs.writeFileSync("sitemap.xml", xml, "utf8");
    console.log(`✅ Sitemap generated with ${tags.length} URLs`);
  } catch (err) {
    console.error("❌ Generation failed:", err.message);
    process.exit(1);
  }
})();

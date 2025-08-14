const fs = require("fs");
const fetch = require("node-fetch");

const API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const SITE_ID = process.env.WEBFLOW_SITE_ID; // from Webflow project settings
const DOMAIN = process.env.SITE_DOMAIN; // e.g. example.com

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${API_TOKEN}`,
      "accept-version": "1.0.0"
    }
  });
  if (!res.ok) throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function getPages() {
  const data = await fetchJSON(`https://api.webflow.com/sites/${SITE_ID}/pages`);
  return data.filter(p => !p.slug.startsWith("_")); // skip hidden
}

async function getCollections() {
  return fetchJSON(`https://api.webflow.com/sites/${SITE_ID}/collections`);
}

async function getAllItems(collectionId) {
  let items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await fetchJSON(
      `https://api.webflow.com/collections/${collectionId}/items?offset=${offset}&limit=${limit}`
    );
    items = items.concat(data.items);
    if (!data.items || data.items.length < limit) break;
    offset += limit;
  }
  return items;
}

function buildURL(loc, lastmod, priority = "0.8") {
  return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <priority>${priority}</priority>
  </url>`;
}

(async () => {
  try {
    let urls = [];

    // Static Pages
    const pages = await getPages();
    for (const p of pages) {
      const slug = p.slug === "" ? "" : `${p.slug}`;
      const loc = `https://${DOMAIN}/${slug}`;
      const lastmod = p.lastPublished || p.updatedOn || new Date();
      const priority = slug === "" ? "1.0" : "0.8";
      urls.push(buildURL(loc, lastmod, priority));
    }

    // CMS Items
    const collections = await getCollections();
    for (const col of collections) {
      const items = await getAllItems(col._id);
      for (const item of items) {
        if (item.isArchived || item.isDraft) continue; // skip unpublished
        const loc = `https://${DOMAIN}/${item.slug}`;
        const lastmod = item.lastPublished || item.updatedOn || new Date();
        urls.push(buildURL(loc, lastmod, "0.7"));
      }
    }

    // Build XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    fs.writeFileSync("sitemap.xml", xml, "utf8");
    console.log("✅ Sitemap generated with pages + CMS items.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

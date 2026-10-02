#!/usr/bin/env node
/**
 * Gera as páginas estáticas (pt / en / es / zh) a partir de
 * site/i18n/template.html + site/i18n/{locale}.json.
 *
 * Uso:
 *   node scripts/build-i18n.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = join(__dirname, "..");
const SITE_BASE_URL = "https://vitrinedopeixe.com.br/";

// pt fica na raiz (depth 0); os demais em subpastas /en/, /es/, /zh/ (depth 1)
const LOCALES = [
  { code: "pt", dir: "", hreflang: "pt-BR" },
  { code: "en", dir: "en", hreflang: "en" },
  { code: "es", dir: "es", hreflang: "es" },
  { code: "zh", dir: "zh", hreflang: "zh-Hans" },
];

const template = readFileSync(join(SITE_DIR, "i18n", "template.html"), "utf8");

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

function localeUrl(locale) {
  return locale.dir ? `${SITE_BASE_URL}${locale.dir}/` : SITE_BASE_URL;
}

function buildSeoLinks(current) {
  const lines = [`<link rel="canonical" href="${localeUrl(current)}" />`];
  for (const loc of LOCALES) {
    lines.push(`<link rel="alternate" hreflang="${loc.hreflang}" href="${localeUrl(loc)}" />`);
  }
  // x-default aponta para o português, mercado principal do produto
  lines.push(`<link rel="alternate" hreflang="x-default" href="${localeUrl(LOCALES[0])}" />`);
  return lines.join("\n  ");
}

// Dados estruturados (JSON-LD): Organization + WebSite + FAQPage, tudo derivado do {locale}.json
function buildJsonLd(current, data) {
  const url = localeUrl(current);
  const faq = Object.keys(data.faq)
    .filter((k) => /^q\d+$/.test(k))
    .map((k) => ({
      "@type": "Question",
      name: data.faq[k].q,
      acceptedAnswer: { "@type": "Answer", text: data.faq[k].a },
    }));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_BASE_URL}#organization`,
        name: "Vitrine do Peixe",
        url: SITE_BASE_URL,
        logo: `${SITE_BASE_URL}assets/logo.png`,
        description: data.meta.description,
        parentOrganization: { "@type": "Organization", name: "Bússola do Peixe Amazônico" },
        areaServed: "BR",
        knowsAbout: ["Pirarucu", "Tambaqui", "Tilápia", "Tucunaré", "Pescado amazônico"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_BASE_URL}#website`,
        url: SITE_BASE_URL,
        name: "Vitrine do Peixe",
        inLanguage: current.hreflang,
        publisher: { "@id": `${SITE_BASE_URL}#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: data.meta.title,
        description: data.meta.description,
        inLanguage: current.hreflang,
        isPartOf: { "@id": `${SITE_BASE_URL}#website` },
        about: { "@id": `${SITE_BASE_URL}#organization` },
      },
      { "@type": "FAQPage", "@id": `${url}#faq`, inLanguage: current.hreflang, mainEntity: faq },
    ],
  };

  // "<" escapado para o JSON nunca fechar a tag <script> por engano
  const json = JSON.stringify(graph, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">
${json}
  </script>`;
}

function buildLangSwitcher(current, dict) {
  const items = LOCALES.map((loc) => {
    const isCurrent = loc.code === current.code;
    let href;
    if (isCurrent) {
      href = "./";
    } else if (current.dir === "" && loc.dir === "") {
      href = "./";
    } else if (current.dir === "") {
      href = `${loc.dir}/`;
    } else if (loc.dir === "") {
      href = "../";
    } else {
      href = `../${loc.dir}/`;
    }
    const label = dict[`lang.${loc.code}`];
    const current_attr = isCurrent ? ' aria-current="true"' : "";
    return `<a href="${href}" lang="${loc.hreflang}"${current_attr}>${label}</a>`;
  }).join("\n            ");

  const currentLabel = dict[`lang.${current.code}`];
  return [
    '<div class="lang-switch">',
    `          <button type="button" class="lang-switch__btn" aria-haspopup="true" aria-expanded="false" aria-label="${dict["lang.switcherLabel"]}">`,
    `            <span aria-hidden="true">🌐</span> ${currentLabel}`,
    "          </button>",
    '          <div class="lang-switch__list" role="menu">',
    `            ${items}`,
    "          </div>",
    "        </div>",
  ].join("\n        ");
}

function render(locale) {
  const data = JSON.parse(readFileSync(join(SITE_DIR, "i18n", `${locale.code}.json`), "utf8"));
  const dict = flatten(data);

  const assetPath = locale.dir ? "../" : "";
  dict["assetPath"] = assetPath;
  dict["seoLinks"] = buildSeoLinks(locale);
  dict["langSwitcher"] = buildLangSwitcher(locale, dict);
  dict["jsonLd"] = buildJsonLd(locale, data);
  dict["ogUrl"] = localeUrl(locale);
  dict["ogImage"] = `${SITE_BASE_URL}assets/logo.png`;
  dict["year"] = String(new Date().getFullYear());

  let html = template.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
    if (!(key in dict)) {
      throw new Error(`Chave de tradução ausente em ${locale.code}.json: "${key}"`);
    }
    return dict[key];
  });

  const outDir = locale.dir ? join(SITE_DIR, locale.dir) : SITE_DIR;
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(`✓ ${outPath.replace(SITE_DIR, "site")}`);
}

for (const locale of LOCALES) {
  render(locale);
}

console.log("\nBuild de i18n concluído.");

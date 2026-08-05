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
const SITE_BASE_URL = "https://claudio-dev-b.github.io/site-vitrine-do-peixe/";

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

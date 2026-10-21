// Detalhe de uma vaga do LinkedIn usando o próprio código do CLI linkedin-search
// do ai-job-search (mesmo endpoint e mesmo user agent), mais o logo da empresa,
// que o CLI não devolve.
//   bun run linkedin-detail.ts <pasta do cli> <id>
import { pathToFileURL } from "node:url"
import { join } from "node:path"

const [cliDir, id] = process.argv.slice(2)
if (!cliDir || !/^\d{6,}$/.test(id ?? "")) {
  console.error(JSON.stringify({ error: "uso: linkedin-detail.ts <cliDir> <id numérico>" }))
  process.exit(2)
}

const helpers = await import(pathToFileURL(join(cliDir, "src", "helpers.ts")).href)
const html: string = await helpers.htmlFetch(`${helpers.DETAIL_URL}/${id}`)
if (!html) {
  console.log(JSON.stringify({ detail: null, logo: null }))
  process.exit(0)
}
const detail = helpers.parseJobDetail(html, id)
// O logo da empresa vem num <img> com data-delayed-url apontando para media.licdn.com.
const img = html.match(/<img[^>]+class="[^"]*(?:artdeco-entity-image|top-card-layout__entity-image|company-logo)[^"]*"[^>]*>/i)?.[0] ?? ""
const logo = (img.match(/data-delayed-url="([^"]+)"/) ?? img.match(/\ssrc="(https:[^"]+)"/))?.[1]?.replace(/&amp;/g, "&") ?? null
console.log(JSON.stringify({ detail, logo: logo && /^https:\/\/media\.licdn\.com\//.test(logo) ? logo : null }))

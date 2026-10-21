# ai-job-search-dashboard

Addon para o [ai-job-search](https://github.com/MadsLorentzen/ai-job-search): um painel local em Kanban com todas as vagas e candidaturas do seu workspace, mais botões para os comandos do projeto.

O addon não altera o ai-job-search. Ele lê e escreve os mesmos arquivos de estado que os comandos usam (`job_scraper/seen_jobs.json` e `job_search_tracker.csv`), e por isso pode ser instalado, atualizado ou removido de forma independente.

## Requisitos

- Node.js 20.19+ (ou 22.12+)
- Um checkout do ai-job-search
- Python 3, para os botões de scripts locais
- MiKTeX ou TeX Live, para compilar CV e carta pelos botões

## Instalação

### Como comando global (recomendado)

```bash
npm install -g github:<usuario>/ai-job-search-dashboard
```

Depois, de dentro da pasta do ai-job-search:

```bash
ajs-dashboard
```

O workspace é detectado a partir da pasta atual (ou de um dos pais). De qualquer outro lugar, informe o caminho:

```bash
ajs-dashboard --root C:\Projetos\ai-job-search
```

Atualizar: rode o mesmo `npm install -g` de novo. Remover: `npm uninstall -g ai-job-search-dashboard`.

### Clonado ao lado do ai-job-search

```bash
git clone https://github.com/<usuario>/ai-job-search-dashboard.git
cd ai-job-search-dashboard
npm install
npm start
```

Com as duas pastas lado a lado (`Projetos/ai-job-search` e `Projetos/ai-job-search-dashboard`), o painel encontra o workspace sozinho. Em outro layout, use `npm start -- --root <pasta>`.

### Opções

| Opção | Efeito |
|---|---|
| `--root <pasta>` | workspace do ai-job-search (também via `AJS_ROOT`) |
| `--port <n>` | porta local (padrão 5174) |
| `--no-open` | não abre o navegador |
| `--version`, `--help` | versão e ajuda |

O servidor escuta só em `127.0.0.1`.

## O que aparece

| Coluna | Origem |
|---|---|
| Novas, Ranqueadas, Descartadas | `job_scraper/seen_jobs.json` (escrito por `/scrape` e `/rank`) |
| Rascunho, Candidatado, Entrevista, Oferta, Encerradas | `job_search_tracker.csv` (escrito por `/apply` e `/outcome`) |

- Uma vaga do scraper que já virou candidatura aparece só no card do tracker.
- O quadro recarrega sozinho quando qualquer um dos dois arquivos muda. Rode `/rank` no Claude e veja as vagas se moverem.
- **Arrastar e soltar** grava só o campo `status` do registro, preservando o resto do arquivo byte a byte:
  - vagas do scraper: Novas ↔ Descartadas (e de volta a Ranqueadas, se já tiverem pontuação);
  - candidaturas: entre as colunas do tracker. Soltar em *Encerradas* pergunta o desfecho. Isso não substitui o `/outcome`, que também arquiva feedback e etapas.
- Levar uma vaga para o pipeline exige `/apply` (gera CV, carta e a linha do tracker). O card oferece o comando.

## Comandos

- **Claude Code** (`/scrape`, `/rank`, `/apply`, `/outcome`, `/interview`, `/html-report`, …): o botão copia o slash command para colar no Claude. Se o CLI `claude` estiver no PATH (ou em `CLAUDE_BIN`), aparece também "Abrir no terminal", que inicia uma sessão interativa já com o comando.
- **Scripts locais** (`tools/rank_state.py`, guardas de segurança, testes, instalação dos CLIs dos portais): rodam direto no workspace, com a saída no console e botão de parar.
- **Por candidatura** (painel lateral do card): compilar CV (lualatex) e carta (xelatex), verificar com `verify_pdf.py`/`verify_layout.py` e abrir o PDF.

Só os comandos listados em `server/commands.js` podem ser executados. Para adicionar um botão, acrescente uma entrada lá. O Python é detectado automaticamente (`py -3`, `python3`, `python`); para forçar outro, defina `PYTHON`.

## Compatibilidade

O painel depende destes contratos do ai-job-search:

- o schema de `seen_jobs.json` (`status` new/skipped/ranked/expired/unreachable, `rank_score`, `strengths`/`gaps`…);
- o cabeçalho do `job_search_tracker.csv` e o vocabulário de status do `/outcome`;
- os scripts em `tools/` e os nomes dos comandos em `.claude/commands/`.

Se o ai-job-search mudar algum desses contratos, atualize `server/data.js` ou `server/commands.js`.

## Desenvolvimento

```bash
npm install
npm run dev     # Vite com HMR; usa AJS_ROOT ou a pasta irmã ../ai-job-search
```

Estrutura: `bin/` (CLI), `server/` (API local como plugin do Vite: `workspace.js` localiza o workspace, `data.js` lê e grava o estado, `commands.js` é o catálogo de botões, `api.js` define as rotas) e `src/` (app Vue).

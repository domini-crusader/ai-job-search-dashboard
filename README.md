# ai-job-search-dashboard

<img src="https://raw.githubusercontent.com/MadsLorentzen/ai-job-search/master/assets/mascot/pip_flight_loop.gif" alt="Pip, o mascote do ai-job-search" width="120">

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
ai-job-search-dashboard
```

`ajs-dashboard` é um atalho para o mesmo comando. O workspace é detectado a partir da pasta atual (ou de um dos pais). De qualquer outro lugar, informe o caminho:

```bash
ai-job-search-dashboard --root C:\Projetos\ai-job-search
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

## As três abas

### Início

- **Perfil:** valida, etapa por etapa, o que o `/setup` preenche: identidade, formação, experiência, habilidades, perfil comportamental, objetivos, configuração de busca, templates de CV e carta e exemplos STAR. Cada etapa lista o que falta e oferece o comando que completa (`/setup`, `/expand`). Certificações e `documents/` aparecem como opcionais.
  
  Ao abrir uma etapa, você vê e edita as seções de onde o ai-job-search lê aquele dado: o resumo no `CLAUDE.md` e o detalhe nos arquivos `01`…`07` do job-application-assistant. A edição é feita por campos, itens de lista e tabelas (por exemplo, idiomas × nível), ou direto em Markdown. Comentários e o que o editor não reconhece voltam intactos.
- **Busca:** reorganiza as escolhas que o ai-job-search oferece para o `/scrape`:
  - reordenar (arrastando), editar, criar e remover as categorias de `search-queries.md`;
  - montar consultas por tags: cargo, site, tecnologia, nível, modalidade e local. As opções vêm do próprio workspace (sites e cargos já usados nas consultas, stack principal do perfil, filtros do `/scrape`). As consultas existentes aparecem como tags;
  - ligar e desligar portais (a chave `enabled` de cada `SKILL.md`);
  - mudar a janela de datas.
  
  Cada categoria também vira uma lista de objetivos com um clique. Antes de qualquer gravação, o arquivo original é copiado para `~/.ai-job-search-dashboard/backups/`.
- **Ambiente:** Python, pypdf, Bun, LaTeX, CLI do Claude, portais instalados e dados existentes, com botão para instalar o que faltar. Tema claro/escuro/sistema.

### Vagas

Um Kanban por **lista de objetivos**. A lista "Todas as vagas" mostra tudo; crie outras (por exemplo, "Back-end .NET" ou "Tech Lead") com filtros próprios:
- termos para incluir e excluir;
- fit inicial do `/scrape` e pontuação mínima do `/rank`;
- portais;
- esconder vagas com alerta de idioma ou local;
- incluir ou não as candidaturas;
- quais colunas aparecem.

As listas ficam em `~/.ai-job-search-dashboard/` (uma por workspace), fora do repositório: não mudam nenhum dado do ai-job-search.

Os botões **Buscar vagas** (`/scrape`) e **Ranquear** (`/rank`) ficam ao lado da busca.

**Detalhes da vaga.** Ao abrir um card, o painel lê o anúncio pelas mesmas vias do ai-job-search:
- no LinkedIn, o código do CLI `linkedin-search`;
- nos demais sites, `tools/fetch_page.py` (que respeita o `robots.txt`) e os dados estruturados (JSON-LD `JobPosting`) da página.

Ele mostra:
- o logo da empresa e o do portal;
- as tags que mais pesam: tipo de vaga, modelo de trabalho, remuneração e nível;
- a categoria de busca que casou com a vaga;
- um resumo com contrato (CLT, PJ...), jornada, local, idioma, tecnologias, requisitos, diferenciais, benefícios e responsabilidades;
- a descrição completa.

A extração é heurística e roda localmente; o resultado fica em cache por 7 dias em `~/.ai-job-search-dashboard/cache/`. Os cards também passam a exibir o logo, o modelo de trabalho e o nível.

### Comandos

Um botão por comando: um clique executa. O ícone de engrenagem abre as opções, quando o comando tem. A saída dos scripts locais aparece no painel ao lado.

## Colunas e dados

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

Estrutura:
- `bin/`: o CLI.
- `server/`: a API local, como plugin do Vite.
  - `workspace.js` localiza o workspace.
  - `data.js` lê e grava vagas e candidaturas.
  - `profile.js` valida o perfil.
  - `settings.js` cuida das preferências de busca e das listas.
  - `health.js` diagnostica o ambiente.
  - `commands.js` é o catálogo de botões.
  - `api.js` define as rotas.
- `src/`: o app Vue (`views/` com uma tela por aba e `components/`).

O diretório de configuração pode ser trocado com `AJS_DASHBOARD_HOME`.

## Créditos

O mascote Pip pertence ao [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) (licença MIT, © Mads Lorentzen). O painel não traz uma cópia: ele carrega `assets/mascot/pip_flight_loop.gif` do seu próprio workspace e, se o arquivo não existir, usa um ícone genérico.

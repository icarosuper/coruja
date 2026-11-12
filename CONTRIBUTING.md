# Contribuindo com o Coruja

Valeu por ajudar! Este guia é para quem vai abrir issue ou PR.

## Issues

Use os modelos **Problema** ou **Sugestão** ao abrir uma issue. Para dúvidas rápidas, uma issue em
branco serve.

## Rodando localmente

Precisa só do [bun](https://bun.sh):

```bash
bun install
bun run cf-typegen   # gera worker-configuration.d.ts
bun run dev          # http://localhost:5173
```

Mais detalhes em [docs/guides/development.md](docs/guides/development.md).

## Pull requests

1. Crie uma branch a partir da `master` (`feat/feriados-manuais`, `fix/saldo-virada-do-mes`).
2. Rode `bun run verify` antes de abrir o PR. O CI roda o mesmo.
3. **O título do PR vira o commit na `master`** (squash merge), então ele segue o Conventional
   Commits em inglês: `feat: add manual holiday overrides`, `fix: split month-boundary hours`.
   Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. O CI confere o título.
4. Mudanças em tela ou no algoritmo da escala: combine numa issue antes, para ninguém perder
   trabalho.
5. Depois do merge a branch é apagada no GitHub automaticamente. Para a sua cópia local também
   esquecer branches apagadas, rode uma vez `git config --global fetch.prune true`.

## Deploy

Todo merge na `master` vai direto para produção — não há versões nem releases a cada mudança. Por
isso, uma migration de banco precisa funcionar também com o código anterior (detalhes em
[`docs/agents/decisions.md` #17](docs/agents/decisions.md#17-rolling-release-from-master-migrations-stay-backward-compatible)).

## Idioma

Código, docs técnicos e commits são em **inglês**. A interface, as issues, os PRs e este guia são em
**português**.

## Usando Claude Code

O [`CLAUDE.md`](CLAUDE.md) e os docs em [`docs/agents/`](docs/agents/) já orientam o agente: regras
do projeto, arquitetura e decisões que parecem estranhas mas são de propósito
([`docs/agents/decisions.md`](docs/agents/decisions.md)). Vale lê-los também.

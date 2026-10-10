# Relatório de pesquisa e plano (2026-10) — rascunho para aprovação

Nenhum código foi alterado. Fontes completas (URLs) nos 4 relatórios de pesquisa (human route, combat, prior art, chat architecture); resumo abaixo. Números do bot vêm de `analysis/out/REPORT.md` e `analysis/measure/FINDINGS.md`.

## 1. Diagnóstico honesto

**Descer rápido não é o problema.** Mediana de 1º diamante 15,8 min (y -57) e banco ~23 min. Não achei fonte verificável de tempo humano (speedrun.com bloqueou; só um site fraco diz 10-15 min já com ferro). Humanos provavelmente são mais rápidos, mas o buraco real é **confiabilidade**: no baseline do REPORT.md (1329 runs), 32% das runs nunca bancam diamante (38% terminam "stuck", 15% morrem; ver aviso de baseline no item 6). O 68% é maior que o publicado: DEPS 0,6%, JARVIS-1 6-12%, Optimus-1 11,6%; só GITM (67,5%, cap de 10 min, ambiente talvez facilitado) chega perto. Conclusão da literatura: o gargalo é o controle de baixo nível, não o planner.

**Por que os A/B deram pouco:** (a) 24 runs só detectam ~25 pontos, então efeitos reais de 5-10 pontos aparecem como "sem efeito"; (b) cada switch ataca um sintoma isolado (shelter, watchdog, spawn) sem mexer na causa comum; (c) a métrica final (diamantes) é ruidosa demais para guiar.

## 2. O que humanos fazem e o bot não

| Diferença | Evidência | Confiança |
|---|---|---|
| Carregam picaretas reservas | stuck tardio = picareta gasta (250 usos); SPAREPICK em medição | média-alta |
| Lutam com espada, no túnel 1x2, no ritmo do cooldown | bot bate com picareta/mão a cada 12 ticks; espada ~2,5x o dano por segundo (cálculo, não medido) | média |
| Não se emparedam em campo aberto; ficam fora da superfície | 69% das mortes em flee/shelter; 83% dos shelters falhos = `not_sealed` com mob a <1,5 bloco; 11% do tempo parado esperando | média-alta |
| Balde de água + regra "nunca cavar cego" | lava/queda/afogamento/aquífero; Baritone sobrevive queda de 23 com balde | média |
| Escudo e armadura de ferro (peito+perna primeiro: -38% melee) | gift ablation não mostrou ganho, mas o bot perdia o equipamento ao morrer e a amostra era pequena | baixa-média |
| Cavernas/lava: andam mais por minuto, ouro exposto mais rápido | wiki; exposição de minério não aumenta densidade, só velocidade | média |
| Transit: escada, coluna de água, e não voltam | 45% de uma boa run é trânsito vertical | baixa-média |
| Noite/comida/cama quase irrelevantes no subsolo | wiki | baixa |

Não verificado: tempos humanos, e se o mineflayer consegue levantar escudo no offhand.

## 3. Maiores problemas e o que fazer (ordem de impacto esperado)

Scores: viabilidade / risco de segurança (código local, sem rede = baixo).

1. **Stuck (38%): a causa dominante é desgaste de picareta.** `FINDINGS.md:179`: 12 de 14 runs stuck no braço medido são picareta gasta seguida de `craft no_tool` ou `go_up not_reached`; e o SPAREPICK não atrasou a perda da última picareta (`FINDINGS.md:192`). Primeiro: consertar o caminho de recuperação `no_tool` (`skills.js` craft, `nearbyOrPlaced`: reconstruir bancada/picareta no lugar, sem subir); segundo: watchdog por progresso (Mindcraft usa <2 blocos em 20 s) com escada de recuperação; terceiro: ler a réplica do SPAREPICK (200-223) antes de investir mais nele. Viabilidade 75%, risco 5%.
2. **Combate/mortes (15%).** Primeiro: equipar espada de pedra (2 cobble + 1 graveto) e bater no ritmo do cooldown; segundo: em túnel 1x2, lutar colocando só 1 bloco à frente em vez de selar célula inteira; terceiro: arena de treino do `PLAN_V4_DRAFT` para medir isso sem 60 min de run; depois: escudo e armadura (o bot não tem ferro sobrando, `FINDINGS.md:31`, então isto é custo extra incerto). A "espada 2,5x" é cálculo, não medição. Viabilidade 70%, risco 5%.
3. **Tempo parado (11%).** São ~10 pontos de espera pelo amanhecer (`FINDINGS.md:77`), não combate. Tratar à parte: continuar minerando no fundo à noite em vez de subir/esperar. Viabilidade 65%, risco 5%.
4. **Hazards.** Queda não é mensurável e lava é só 2,3% das mortes (`FINDINGS.md:16`), então a prioridade é baixa: portão por bloco e balde só depois dos itens 1-3. Viabilidade 65%, risco 5%.
5. **Trânsito vertical (45%).** Banco no fundo ou reaproveitar a escada, levar blocos de pilar/escada. Só depois de 1-4. Viabilidade 55%, risco 5%.
6. **Método de medição.** Congelar UM conjunto de dados de baseline: o REPORT.md dá 67,6% banco / 38,1% stuck (1329 runs), o FINDINGS.md §4 dá 58,0% (2402 runs) e 88,4% nas runs de ≥59,5 min; eras e populações diferem, então "68%" e a meta de 80% só valem sobre o baseline congelado. Fazer cálculo de poder antes de cada teste (48 pares não resolvem 0,5 mortes/run, `FINDINGS.md:143`); usar métricas de processo (mortes/h, % stuck, tempo parado) além de diamantes; uma mudança por vez com switch. Viabilidade 90%.

## 4. Plano até o produto final

Fase 0 — Medição e baseline (1 sessão): congelar commit, rodar baseline em slots 100-199 com 72 pareadas; categorizar stuck. Sem isso, nada abaixo é comparável.

Fase 1 — Confiabilidade (itens 1-3 acima, um por vez, cada um com A/B pareado e switch). Meta: ≥80% de banco no gate 0-99, mortes <1/h.

Fase 2 (em paralelo à Fase 1, só em mundo de teste/dedicado; nunca num mundo com construções do dono antes da Fase 3): **fatia vertical do produto.**
- 2a. Chat nível 1: bot só responde ao dono, endereçado pelo nome do bot ("Bot, pegue diamantes"). Autenticação: servidor **online-mode** é pré-requisito (em offline-mode qualquer um entra com o nome do dono, então lista de nomes não é autenticação; alternativa: segredo combinado por sussurro). Limite de taxa por comando. Regras + apelidos pt/en + fuzzy. Comandos: parar, status, vem aqui.
- 2b. `goals.json` + expansor de dependências (backward chaining sobre receitas do minecraft-data; fontes: craft, mine com `tool_min`, smelt, mob, estrutura). A lista de prioridade atual continua como camada reativa (comer, fugir, lutar); o expansor decide o objetivo e o replaneja quando o inventário muda ou uma skill falha. GOAP/HTN seria exagero.
- 2c. Meta de demonstração: "Bot, pegue diamantes" num mundo vazio, partindo do zero, sem `!get`.

Fase 3 (a lista de blocos colocados + negação para o resto e a regra "só baú próprio" são pré-requisito de qualquer uso em mundo com construções) — Mundo persistente: lista de blocos colocados pelo bot e negação para o resto (não minerar construções do dono), só baú próprio, base/baú inicial, recuperação após morte, jogadores como passivos, estado salvo em disco, dificuldade normal, biomas variados. Avaliação com sementes novas congeladas, 2º jogador parado, conjunto fixo de frases pt/en. Risco principal: grief (impacto alto).

Fase 4 — LLM de fallback (Haiku 5.5, ~US$0,00006 por chamada, saída em JSON schema com enum dos objetivos do registro, nunca ação livre). Só para frases que as regras não entenderam.

Fase 5 — Novos objetivos como dados (armadura de ferro, cama, mesa de encantamento) e, por fim, "ganha o jogo": exige skills novas (portal do Nether, blaze, pérolas, End, dragão), não só dados. Meta separada, sem prazo.

Fase 6 (PLAN.md fases 3-4, política aprendida): adiada; só vale depois que as skills estiverem estáveis, e o expansor já cobre boa parte do que o clone/RL faria.

## 5. Decisões para o dono

1. O servidor real é online-mode ou offline? (muda a autenticação do dono)
2. Dificuldade alvo do uso real: easy (como nos testes) ou normal?
3. Ordem: confiabilidade primeiro (Fase 1) ou fatia de chat primeiro (Fase 2)? Recomendo **Fase 0, depois 1 e 2 em paralelo**: a 2 é independente e mostra cedo o produto.

## 6. Incertezas

- Valores de dano espada/picareta e limiar de luz do spawn 1.21 são inconsistentes na wiki; nenhum efeito foi medido no bot.
- Pesquisa de DreamerV3, vencedores MineRL, Baritone (internals) e plugins pvp/armor-manager não foi verificada.
- minecraft-data: nomes de campos e fornalha não conferidos; assumimos uma tabela de fusão manual.

# 🤖 Bot de posts automáticos — @amazonasemfato

Automatiza os posts da página [@amazonasemfato](https://instagram.com/amazonasemfato):
busca as últimas notícias do Amazonas em feeds RSS, gera um card bonito (1080x1350)
com a foto e a manchete da matéria, e publica direto no Instagram — tudo rodando
de graça no GitHub Actions, sem precisar de servidor.

## Como funciona

```
GitHub Actions (5x por dia)
   │
   ├─ 1. Lê os feeds RSS: G1 Amazonas, D24AM, Em Tempo, Portal do Holanda, A Crítica
   ├─ 2. Filtra o que ainda não foi postado (data/posted.json)
   ├─ 3. Baixa a foto da matéria e gera o card com a manchete (posts/…)
   ├─ 4. Sobe o card para este repositório (a Meta exige URL pública da imagem)
   └─ 5. Publica no Instagram via API oficial e marca como postado
```

> ⚠️ **O repositório precisa ser público** — a API do Instagram baixa a imagem
> por uma URL pública (`raw.githubusercontent.com`). Nenhum segredo fica exposto:
> o token fica em *Secrets*, nunca no código.

## Configuração (uma vez só)

### 1. Conta profissional no Instagram

A @amazonasemfato precisa ser **conta profissional** (Business ou Criador de conteúdo).
No app: *Configurações → Tipo de conta → Mudar para conta profissional*.

### 2. Criar o app na Meta

1. Acesse <https://developers.facebook.com/apps> e clique em **Criar app**
2. Caso pergunte o caso de uso, escolha algo como **"Outro" → tipo Business**
3. No painel do app, em **Adicionar produtos**, adicione **Instagram**
4. Abra **Instagram → Configuração da API com login do Instagram** (*API setup with Instagram business login*)
5. Em **Gerar tokens de acesso**, clique em **Adicionar conta** e faça login com a @amazonasemfato
6. Clique em **Gerar token** ao lado da conta — esse é o **token de longa duração (60 dias)**. Copie e guarde.

As permissões necessárias são `instagram_business_basic` e
`instagram_business_content_publish` (já incluídas nesse fluxo). Para postar na
sua própria conta, **não precisa de App Review** — o Standard Access basta.

### 3. Descobrir o ID da conta

Com o token em mãos, rode no terminal (ou no navegador):

```bash
curl "https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=SEU_TOKEN"
```

A resposta traz `user_id` — esse é o `IG_USER_ID`.

### 4. Secrets no GitHub

No repositório: *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Valor |
|---|---|
| `IG_ACCESS_TOKEN` | Token de longa duração gerado no passo 2 |
| `IG_USER_ID` | ID numérico do passo 3 |
| `GH_PAT` *(opcional)* | Personal Access Token com permissão de escrever secrets neste repo — permite a renovação automática mensal do token |

Para criar o `GH_PAT`: <https://github.com/settings/personal-access-tokens> →
*Fine-grained token* → só este repositório → Repository permissions →
**Secrets: Read and write**.

### 5. Pronto!

O workflow **"Postar notícias no Instagram"** roda automaticamente às
**7h, 10h, 13h, 16h e 19h (horário de Manaus)**. Para testar agora:
*Actions → Postar notícias no Instagram → Run workflow*.

## Renovação do token

O token vale **60 dias**. O workflow **"Renovar token do Instagram"** renova todo
dia 1º do mês automaticamente (se o `GH_PAT` estiver configurado). Sem o `GH_PAT`,
renove manualmente a cada ~50 dias:

```bash
curl "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=TOKEN_ATUAL"
```

e atualize o secret `IG_ACCESS_TOKEN` com o novo valor.
**Se o token expirar, é preciso gerar um novo no painel da Meta (passo 2.6).**

## Personalização

Tudo em [`bot/config.py`](bot/config.py):

- **Fontes de notícias**: lista `FEEDS` (qualquer feed RSS funciona)
- **Posts por execução**: `MAX_POSTS_PER_RUN` (padrão: 1 por horário = 5/dia)
- **Horários**: edite o `cron` em [`.github/workflows/post.yml`](.github/workflows/post.yml) (lembre: UTC = Manaus + 4h)
- **Hashtags**: constante `HASHTAGS`
- **Visual do card**: cores e layout em [`bot/card.py`](bot/card.py)

## Testar localmente (sem postar)

```bash
pip install -r requirements.txt
set DRY_RUN=1          # Windows (PowerShell: $env:DRY_RUN="1")
python -m bot.main
```

Os cards aparecem na pasta `posts/` sem publicar nada.

## Limites e boas práticas

- A API permite **100 posts/dia**, mas o bot posta no máx. 1 por execução (5/dia) — melhor para o algoritmo do Instagram
- Todo post dá **crédito à fonte** na legenda e no card
- Notícias com mais de 12h não são postadas (`MAX_AGE_HOURS`)
- O histórico `data/posted.json` evita repetição e se auto-limpa após 30 dias

# 🤖 Bot de posts automáticos — @amazonasemfato

Automatiza os posts da página [@amazonasemfato](https://instagram.com/amazonasemfato):
busca as últimas notícias do Amazonas em feeds RSS, gera um card padronizado
(1080x1350) com a foto da matéria, logo e manchete, e monta a legenda pronta com
hashtags — tudo rodando de graça no GitHub Actions, sem servidor.

## Dois modos

| Modo | O que faz | Precisa de quê |
|---|---|---|
| **`draft`** *(padrão)* | Gera card + legenda e coloca na **fila de posts** (página web). Você baixa a imagem, copia a legenda e posta à mão. | Nada! Já funciona. |
| **`publish`** | Publica sozinho no Instagram via API oficial da Meta. | Conta profissional + token (ver seção no final) |

Para trocar de modo: *Settings → Secrets and variables → Actions → Variables →*
crie `MODE` com valor `publish`.

## Modo fila (draft) — como usar no dia a dia

```
GitHub Actions (7h, 10h, 13h, 16h e 19h de Manaus)
   │
   ├─ 1. Lê os feeds RSS: G1 Amazonas, D24AM, Em Tempo, Portal do Holanda, A Crítica
   ├─ 2. Filtra só notícia do Amazonas e descarta repetidas
   ├─ 3. Baixa a foto da matéria e gera o card padronizado com logo e manchete
   └─ 4. Atualiza a página da fila com card + legenda prontos
```

**Abra a fila no celular:** <https://matheuz7k.github.io/amazonasemfato-bot/>
— cada card tem botão **Copiar legenda** e **Baixar imagem**. É só postar.
Salve o link na tela inicial do celular para abrir como um app.

### Sua logo no card

Coloque o arquivo da logo em `assets/logo.png` (PNG com fundo transparente).
Ela entra automaticamente no topo de todos os cards no lugar do chip vermelho.

## Configuração do modo publish (opcional, uma vez só)

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

### 5. Ativar o modo

Crie a variável `MODE` = `publish` (*Settings → Secrets and variables → Actions
→ Variables*). Para testar agora: *Actions → Gerar posts → Run workflow*.

> ⚠️ No modo publish o repositório precisa ser **público** — a API do Instagram
> baixa a imagem por URL pública (`raw.githubusercontent.com`). Nenhum segredo
> fica exposto: o token fica em *Secrets*, nunca no código.

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
- **Posts por execução**: `MAX_POSTS_PER_RUN` (padrão: 3 na fila, 1 no publish)
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

# Prospect Odontoart

Aplicação web de prospecção comercial B2B, com autenticação privada, pesquisa por CNPJ completo/raiz (matrizes e filiais), pesquisa por CNAE/segmento/cidade, consulta contextual ao Google Places, gestão de leads, dashboard, histórico e cotas configuráveis de APIs.

## Arquitetura

- **Next.js 16 / React 19 / TypeScript** (App Router, Route Handlers, Node.js runtime)
- **PostgreSQL Neon** (SQL parametrizado via `postgres`, transações e travas para limites de consumo)
- **Vercel** para hospedagem; **GitHub** para versionamento do código
- Sessões com tokens aleatórios, armazenados somente como SHA-256 no banco, cookie HttpOnly/SameSite e criptografia de senhas bcrypt
- Papéis `admin` e `operator`; operadores acessam apenas os próprios leads
- Nenhuma chave de API é enviada ao navegador

## Pré-requisitos

Node.js 22+, npm, um projeto Neon com PostgreSQL, um projeto Vercel, uma chave Google Places API (New), uma chave cnpj.ai v2 e uma chave LocalizaCNPJ. Os três fornecedores são independentes; a falta de chave de um provedor não impede os demais de funcionar.

## Instalação e teste local

```bash
npm install
cp .env.example .env.local
# Edite .env.local com as credenciais do seu ambiente de desenvolvimento.
# Não compartilhe ou versione este arquivo.
npm run migrate
npm run dev
```

Acesse `http://localhost:3000/setup` para cadastrar o administrador inicial. Defina `SETUP_TOKEN` em `.env.local` como um segredo aleatório de 32+ caracteres e informe-o no primeiro acesso. Essa operação só é permitida quando ainda não existe usuário no banco. O token **não** deve ser enviado em mensagens, commits ou prints. Depois de criar o administrador, você pode remover `SETUP_TOKEN` da configuração.

A senha deve ter ao menos 12 caracteres, com letras maiúsculas, minúsculas e número. Após criar o administrador, acesse `/login`. A aplicação não possui cadastro público; o administrador cria usuários e redefine senhas no painel **Usuários**.

## Conexões manuais (sem automação)

### Neon

1. Crie ou selecione seu banco PostgreSQL no [console do Neon](https://console.neon.tech).
2. Copie a string de conexão **pooled** para a variável `DATABASE_URL`, com `sslmode=require`, sem adicioná-la ao GitHub.
3. No computador local com `.env.local` configurado, execute `npm run migrate` (carregue a variável no processo; o script não importa `.env.local` automaticamente). Alternativamente, copie o conteúdo de `db/schema.sql` e execute cada comando SQL no editor do Neon. Em ambientes locais, `node --env-file=.env.local scripts/migrate.mjs` usa o carregamento nativo do Node 22.
4. A migration cria as tabelas, índices, limites iniciais e categorias odontológicas.

**Observação:** o banco não é alterado automaticamente durante o build da Vercel. Isso evita que previews executem migrations contra a produção.

### Google Places API (New)

1. Ative Places API (New) no Google Cloud e habilite faturamento.
2. Crie uma chave com **restrição por API** para Places API (New) e limite as cotas no Google Cloud. Para backend serverless sem IP fixo, restrições por IP podem exigir uma solução de saída fixa; não escolha IPs arbitrários.
3. Cadastre `GOOGLE_PLACES_API_KEY` no ambiente da Vercel (Production e, se desejado, Preview).
4. O sistema usa Text Search com FieldMask controlado: `places.id,places.displayName,places.formattedAddress,places.googleMapsUri,nextPageToken`.

**Uso de dados do Google:** os resultados servem somente à visualização contextual em tempo real. Não são salvos como leads, exportados ou armazenados como diretório. Dados para CRM vêm de bases cadastrais que permitam esse uso ou de digitação manual. Verifique sempre os [Termos do Google Maps Platform](https://cloud.google.com/maps-platform/terms).

### cnpj.ai

1. Gere sua chave em [cnpj.ai](https://cnpj.ai/api/docs).
2. Cadastre `CNPJ_AI_API_KEY` no servidor/Vercel.
3. Pesquisas com 8 dígitos consultam `/v2/empresas/{raiz}/estabelecimentos?limite=...`; com 14 dígitos consultam `/v2/estabelecimentos/{cnpj}/basic`.
4. Prefixos de 9–13 dígitos são tratados com busca pela raiz e filtro pelo prefixo, percorrendo páginas sucessivas, sempre respeitando limites.

### LocalizaCNPJ

1. Gere sua chave em [LocalizaCNPJ](https://api.localizacnpj.com.br/).
2. Cadastre `LOCALIZACNPJ_API_KEY` no servidor/Vercel.
3. O endpoint `/busca/filtros` aceita CNAE, descrição de atividade, UF, cidade, bairro, razão social e raiz de CNPJ, retornando `resultados` e `next_cursor`.

### Vercel

1. No dashboard da Vercel, use **Add New Project → Import Git Repository** e selecione `DanielRochaOdo/prospect`.
2. Configure framework **Next.js**, raiz do repositório e região de execução compatível com seu banco (por exemplo, `gru1` se disponível no seu plano).
3. Configure as variáveis de ambiente **manualmente** em **Project Settings → Environment Variables**: `DATABASE_URL`, `CNPJ_AI_API_KEY`, `LOCALIZACNPJ_API_KEY`, `GOOGLE_PLACES_API_KEY` e `SETUP_TOKEN` (este último somente durante criação do administrador).
4. Execute as migrations no Neon antes da primeira utilização.
5. Faça o deploy. Teste `/api/health` e abra `/setup`.
6. Faça uma consulta real em cada API e confirme que o contador aumentou no painel.

O GitHub armazena o código-fonte; a aplicação web será efetivamente servida pela **Vercel**.

## Tema claro/escuro e limites de consumo (atualização de novembro/2026)

- O botão com ícones de sol e lua, disponível no cabeçalho e nas telas de login/configuração, alterna os temas e grava a preferência apenas no navegador (`localStorage`). Se não houver preferência, segue o tema do sistema operacional.
- A tela **Configurações** foi reorganizada por fornecedor. Cada operação possui campos de limite e botão próprio **Salvar**. Mudanças não são aplicadas automaticamente.
- Valores internos sugeridos para novos bancos: **cnpj.ai** sem teto mensal (`NULL`), compartilhando **60 chamadas/min** para as operações; **LocalizaCNPJ Free** **2.000/mês** e **40/min**; **Google Places Text Search Pro** **5.000/mês** e **20/min** (este último é um limite de proteção escolhido pelo Prospect, **não** uma cota oficial publicada pelo Google).
- Na cnpj.ai, *sem teto mensal* indica somente que não há franquia mensal inicial publicada. O administrador pode ativar um teto interno opcional. O limite de 60/min é compartilhado entre todas as operações da mesma conta/chaves.
- No Google, 5.000 é a **franquia sem cobrança** por SKU, não uma garantia de bloqueio externo. Se o consumo exceder essa franquia, poderá haver cobrança. Confira os limites efetivos no Google Cloud, principalmente se outras aplicações usarem o mesmo projeto.
- Os limites ficam registrados no banco. Execute novamente a migração após atualizar o código: `node --env-file=.env.local scripts/migrate.mjs`. Ela altera a coluna mensal para permitir `NULL` e só converte os valores iniciais antigos se não houver alteração administrativa correspondente no log de auditoria. **Não altera valores personalizados** registrados anteriormente no painel.

Fontes verificadas em 12/11/2026:
- [cnpj.ai v2](https://cnpj.ai/api/docs)
- [Planos LocalizaCNPJ](https://localizacnpj.com.br/portal-api)
- [Tabela de preços Google Places (New)](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Limites e faturamento Google Places](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)

## Endpoints internos

| Método e rota | Função |
| --- | --- |
| `GET /api/health` | Teste de saúde do backend |
| `GET /api/setup`, `POST /api/setup` | Criação única do administrador |
| `POST /api/auth/login`, `/api/auth/logout` | Autenticação |
| `GET /api/auth/me` | Usuário autenticado |
| `POST /api/search` | Buscar por API selecionada |
| `GET /api/dashboard` | KPIs comerciais e consumo |
| `GET /api/leads`, `POST /api/leads` | Lista e cria lead |
| `GET /api/leads/:id`, `PATCH`, `DELETE` | Ficha e mudanças de lead |
| `POST /api/leads/:id/interactions` | Registra contato |
| `GET /api/leads/export` | Exporta leads permitidos para CSV |
| `GET /api/history` | Histórico de pesquisa |
| `GET /api/limits`, `PATCH /api/limits` | Consumo e limites (PATCH admin) |
| `GET /api/segments`, `POST`, `PATCH`, `DELETE` | Categorias de pesquisa |
| `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` | Gestão de usuários (admin) |

Todas as rotas de negócio exigem sessão válida; alterações exigem validação de origem e autorização no servidor. O limite de API é reservado antes da chamada sob trava transacional em PostgreSQL.

## Qualidade e verificação

```bash
npm run typecheck
npm test
npm run build
```

Os testes unitários incluídos validam CNPJ completo, raiz, prefixos, caracteres alfanuméricos e zeros à esquerda. Para homologação de produção, é obrigatório testar também autenticação, cotas concorrentes, fluxos de busca externa, CRUD de leads, auditoria e integração Vercel/Neon com **chaves reais**; esses testes não podem ser executados sem as conexões do ambiente.

## Privacidade e origem dos dados

- A origem dos registros comerciais fica identificada (`cnpjai`, `localiza` ou `manual`).
- A pesquisa Google Places não é persistida como lista de leads. Apenas os **filtros** e o **número agregado de resultados** são registrados em `search_history`.
- A base local de leads é exportada apenas com autenticação e respeitando o perfil (operadores só veem seus próprios registros).
- Revise a base legal, as licenças das fontes cadastrais, a finalidade de prospecção e os procedimentos LGPD antes do uso comercial efetivo.

## Limitações operacionais

- Os provedores podem mudar limites, disponibilidade e formatos. Reavalie periodicamente a documentação.
- A aplicação não dispara e-mails, WhatsApp ou ligações; registra interações comerciais que o usuário realizar.
- Recuperação de senha é **via administrador** nesta versão, sem envio automático de e-mail.
- O contador interno previne excedentes, mas não substitui limites de faturamento no Google Cloud.
- Não há integração automática com GitHub/Vercel/Neon; as credenciais e vinculações são configuradas pelo responsável.

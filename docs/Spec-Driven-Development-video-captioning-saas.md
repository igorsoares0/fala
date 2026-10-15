# Spec-Driven Development --- SaaS de Legendas para Vídeos

**Versão:** 1.0\
**Status:** Especificação aprovada para implementação do MVP\
**Produto:** Webapp de legendagem automática e edição de legendas para
vídeos curtos\
**Referência de categoria:** ferramentas como Submagic, sem copiar
marca, interface, templates ou ativos proprietários\
**Abordagem:** web-first, foco em UX simples, qualidade de sincronização
e custo operacional controlado

------------------------------------------------------------------------

## 1. Visão do produto

Construir um SaaS web que transforme vídeos enviados pelo usuário em
vídeos legendados, visualmente atraentes e prontos para exportação. O
produto deve tornar o processo simples: enviar vídeo, gerar legendas,
revisar o texto, escolher um estilo, conferir o preview e exportar.

O produto não pretende ser um editor de vídeo completo. A experiência
será centrada em legendas, com edição textual sincronizada e sem
timeline tradicional no MVP.

### 1.1 Princípios do produto

1.  **Fácil de usar:** o usuário deve conseguir produzir um vídeo
    legendado sem aprender um editor complexo.
2.  **Sincronização em primeiro lugar:** as palavras devem aparecer no
    momento certo e o resultado exportado deve corresponder ao preview.
3.  **Boa aparência por padrão:** presets iniciais bem projetados devem
    produzir bons resultados sem ajustes manuais.
4.  **Correções simples:** quando a transcrição ou o timing estiverem
    errados, deve ser fácil corrigir.
5.  **Arquitetura enxuta:** evitar infraestrutura desnecessária antes de
    existir demanda real.
6.  **Processamento assíncrono:** tarefas pesadas não devem bloquear
    requisições web.
7.  **Evolução segura:** manter limites claros entre aplicação, jobs,
    armazenamento e motor de processamento.

### 1.2 Objetivos do MVP

-   Cadastro, login e gerenciamento de conta.
-   Dashboard de projetos.
-   Upload de vídeo diretamente para Cloudflare R2.
-   Validação do arquivo e extração de metadados.
-   Transcrição automática.
-   Timestamps por palavra, usando o melhor mecanismo disponível na
    implementação escolhida.
-   Agrupamento automático de palavras em blocos legíveis.
-   Editor de legendas baseado em texto, sem timeline tradicional.
-   Preview sincronizado em tempo real.
-   Presets de legenda, incluindo **Bold Highlight**, inspirado no
    estilo de vídeos com palavras-chave destacadas.
-   Personalização básica de fonte, cor, destaque, contorno, posição e
    animação.
-   Edição do texto, divisão/junção de blocos e ajuste manual simples de
    timing.
-   Exportação MP4 com legendas incorporadas.
-   Histórico e estado de processamento dos projetos.
-   Planos e limites de uso integrados ao Paddle.
-   E-mails transacionais com Resend.
-   Testes automatizados para fluxos críticos.

### 1.3 Fora do escopo inicial

-   Timeline tradicional com trilhas.
-   Edição de cortes, montagem de cenas ou múltiplas faixas de
    vídeo/áudio.
-   Keyframes e animações personalizadas avançadas.
-   Colaboração em equipe e organizações multiusuário.
-   Aplicativos móveis nativos.
-   API pública.
-   Publicação direta em redes sociais.
-   Geração automática de Shorts/Reels a partir de vídeos longos.
-   AI B-roll, avatares, dublagem e geração de cenas.
-   Biblioteca de stock footage.
-   Tradução avançada e dublagem por IA.
-   Remoção avançada de silêncios.
-   Redis, Kubernetes e microserviços como requisitos iniciais.

------------------------------------------------------------------------

## 2. Stack tecnológica

  -----------------------------------------------------------------------
  Camada                  Tecnologia              Responsabilidade
  ----------------------- ----------------------- -----------------------
  Aplicação web           Next.js, React e        Marketing, dashboard,
                          TypeScript              editor e API

  UI                      Tailwind CSS            Estilização e design
                                                  system

  Estado do editor        Zustand                 Estado local, seleção,
                                                  configurações e preview

  Banco de dados          Neon PostgreSQL         Usuários, projetos,
                                                  transcrições, jobs, uso
                                                  e billing

  ORM                     Prisma                  Schema, migrations e
                                                  acesso tipado

  Autenticação            Auth.js                 Sessões e provedores de
                                                  login

  Armazenamento           Cloudflare R2           Originais, thumbnails,
                                                  proxies futuros e
                                                  exports

  Pagamentos              Paddle                  Checkout, assinaturas e
                                                  eventos de billing

  E-mail                  Resend                  E-mails transacionais

  Processamento           Worker separado na      Transcrição, thumbnails
                          Hetzner                 e renderização

  Vídeo                   FFmpeg                  Metadados, extração de
                                                  áudio, thumbnails e
                                                  exportação

  Transcrição             Whisper ou provedor     Reconhecimento de fala
                          compatível              

  Testes unitários        Vitest                  Regras de negócio e
                                                  utilitários

  Testes E2E              Playwright              Fluxos críticos no
                                                  browser

  Deploy do worker        Docker na Hetzner       Execução isolada e
                                                  reiniciável dos jobs
  -----------------------------------------------------------------------

### 2.1 Decisões de arquitetura

-   Next.js será a aplicação web e o backend HTTP inicial. Não adicionar
    FastAPI.
-   O Next.js não deve processar vídeos longos dentro de Route Handlers
    ou Server Actions.
-   O navegador fará upload diretamente ao R2 usando URL pré-assinada.
-   Um worker independente na Hetzner executará tarefas pesadas.
-   Neon/PostgreSQL pode funcionar como fila simples de jobs no MVP, com
    transações e `FOR UPDATE SKIP LOCKED`.
-   Redis/BullMQ poderá ser considerado quando métricas reais
    justificarem a mudança.
-   O banco armazena metadados, estado e dados estruturados, nunca os
    bytes dos vídeos.
-   Os timestamps e a configuração de estilo serão a fonte de verdade
    compartilhada entre preview e exportação.
-   Todas as operações críticas devem ser autenticadas, autorizadas por
    proprietário do projeto e validadas no servidor.
-   Operações de billing e callbacks de processamento devem ser
    idempotentes.

### 2.2 Organização de repositório sugerida

Monorepo simples para compartilhar contratos entre web e worker:

``` text
/
├── apps/
│   └── web/                 # Next.js
├── services/
│   └── worker/              # Worker assíncrono
├── packages/
│   └── shared/              # Tipos, schemas e contratos
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
├── docker-compose.yml       # Ambiente local quando útil
├── package.json
└── README.md
```

A estrutura pode ser adaptada à ferramenta de gerenciamento de pacotes
escolhida, mantendo separação entre aplicação web, worker e tipos
compartilhados.

------------------------------------------------------------------------

## 3. Personas e casos de uso

### 3.1 Criador de conteúdo

Quer publicar vídeos curtos com legendas bonitas sem editar cada palavra
manualmente.

**Fluxo principal:** login → novo projeto → upload → transcrição →
revisão → estilo → exportação.

### 3.2 Podcaster ou profissional de marketing

Precisa corrigir nomes, termos técnicos ou trechos reconhecidos
incorretamente e aplicar um visual consistente.

**Fluxo principal:** abrir projeto → localizar bloco → corrigir texto →
conferir preview → exportar novamente.

### 3.3 Usuário com plano gratuito

Quer testar a experiência, entendendo claramente os limites de duração e
uso.

**Fluxo principal:** criar conta → processar vídeo dentro dos limites →
acompanhar uso → fazer upgrade quando necessário.

------------------------------------------------------------------------

## 4. Requisitos funcionais

### FR-01 --- Autenticação e conta

-   Login com Google e e-mail/senha.
-   Sessões protegidas.
-   Rotas privadas inacessíveis a usuários não autenticados.
-   Página de configurações básicas da conta.
-   Logout.
-   Fluxos de recuperação de conta compatíveis com a configuração de
    autenticação adotada.
-   Usar Resend para e-mails transacionais quando necessário.
-   Não armazenar senhas em texto puro; delegar armazenamento seguro ao
    mecanismo de autenticação escolhido.

**Critérios de aceite** - Usuário não autenticado não consegue abrir
dashboard, editor ou endpoints privados. - Um usuário não consegue
consultar ou modificar projetos de outro usuário. - Falhas de login e
recuperação não revelam informações sensíveis desnecessárias.

### FR-02 --- Dashboard e projetos

-   Listar projetos do usuário.
-   Criar projeto com nome padrão derivado do arquivo, editável pelo
    usuário.
-   Mostrar thumbnail, duração, data e status.
-   Abrir projeto no editor.
-   Renomear e excluir projeto.
-   Exibir estados como upload, transcrição, pronto, renderizando,
    exportado e erro.
-   Confirmar ações destrutivas.

**Critérios de aceite** - A lista só contém projetos do usuário
autenticado. - Um projeto com processamento em andamento mostra status
atualizado. - Exclusão não deixa jobs pendentes capazes de recriar ou
publicar artefatos inesperados.

### FR-03 --- Upload de vídeo

-   Criar projeto antes do upload.
-   Solicitar ao backend uma URL pré-assinada para upload ao R2.
-   Fazer upload direto do browser ao R2.
-   Validar extensão, MIME type, tamanho e duração no servidor/worker;
    não confiar apenas em validação do browser.
-   Mostrar progresso, falha e opção de tentar novamente.
-   Ao concluir, notificar o backend para validar o objeto e agendar o
    processamento.
-   Limitar tamanho e duração por plano, com limites configuráveis.

**Critérios de aceite** - O arquivo não trafega pelo servidor Next.js. -
Upload interrompido pode ser repetido com segurança. - Um objeto enviado
não é considerado válido até passar pela verificação do
servidor/worker. - URLs pré-assinadas têm expiração curta e acesso
restrito ao objeto esperado.

### FR-04 --- Metadados e preparação do vídeo

-   Extrair duração, dimensões, codec e presença de áudio.
-   Gerar thumbnail.
-   Rejeitar arquivos inválidos, sem áudio utilizável ou fora dos
    limites definidos.
-   Normalizar dados necessários ao processamento sem modificar o
    original.
-   Registrar erros de forma útil para suporte, sem expor detalhes
    internos ao usuário.

### FR-05 --- Transcrição

-   Extrair o áudio usando FFmpeg.
-   Enviar o áudio ao mecanismo de transcrição configurado.
-   Guardar idioma detectado, texto, segmentos e timestamps.
-   Buscar timestamps por palavra sempre que a implementação suportar.
-   Se o mecanismo produzir apenas timestamps por segmento, usar uma
    etapa de alinhamento por palavra quando necessária e viável.
-   Permitir corrigir manualmente o texto reconhecido.
-   Mostrar estados de processamento e erro.
-   Permitir nova tentativa de processamento em caso de falha
    recuperável.

**Critérios de aceite** - A transcrição fica associada ao projeto e à
versão de processamento correspondente. - Falhas não geram transcrições
duplicadas ou estado inconsistente. - O usuário pode corrigir o texto
sem executar a transcrição novamente. - A arquitetura permite substituir
o provedor de transcrição sem reescrever o editor.

### FR-06 --- Segmentação automática de legendas

-   Agrupar palavras em blocos adequados à leitura.
-   Respeitar pausas, limites de caracteres/palavras, duração mínima e
    duração máxima configuráveis.
-   Evitar blocos de uma palavra sem necessidade.
-   Evitar que um bloco ultrapasse a duração do vídeo.
-   Manter timestamps por palavra internamente mesmo quando a interface
    mostra frases.
-   Permitir dividir e juntar blocos.
-   Recalcular a apresentação sem alterar indevidamente os timestamps
    originais das palavras.

**Critérios de aceite** - A segmentação pode ser recalculada a partir
dos dados por palavra. - Dividir/juntar blocos mantém a ordem e não
perde palavras. - As regras de segmentação têm testes unitários para
pausas, frases longas e fala rápida.

### FR-07 --- Editor baseado em texto

O editor não terá timeline tradicional no MVP.

Layout recomendado: - Barra superior: voltar ao dashboard, nome do
projeto, estado salvo e botão Exportar. - Centro: preview do vídeo. -
Painel de legendas: blocos clicáveis, ordenados temporalmente. - Painel
de estilo: presets e controles visuais. - Controles de reprodução:
play/pause, posição atual, duração, pular para trecho anterior/próximo e
velocidade opcional.

Comportamentos: - Selecionar um bloco leva o vídeo ao timestamp inicial
do bloco. - Clicar em uma palavra, quando o modo de palavras estiver
disponível, leva ao timestamp dessa palavra. - Editar texto atualiza o
estado do projeto. - Indicador visual diferencia alterações salvas de
alterações pendentes. - Autosave com debounce e tratamento de
conflito. - Undo/redo básico pode ser incluído se a implementação não
comprometer o escopo; caso contrário, adiar. - Atalhos de teclado
básicos para play/pause e navegação não devem interferir com campos de
texto.

**Critérios de aceite** - É possível concluir o fluxo principal sem
timeline. - Alterações não são perdidas ao navegar acidentalmente quando
já confirmadas como salvas. - A seleção de um bloco mantém preview e
lista sincronizados.

### FR-08 --- Preview sincronizado

-   Usar o elemento HTML `<video>` para reproduzir o vídeo.
-   Renderizar legendas sobre o vídeo por meio de overlay visual.
-   Atualizar palavra destacada com base no tempo atual de reprodução.
-   Reproduzir animações de maneira determinística e sem bloquear a
    reprodução.
-   Ajustar o preview à proporção do vídeo e às dimensões do container.
-   O overlay deve respeitar a área segura do vídeo e não cortar texto.
-   Não gerar um arquivo MP4 novo a cada alteração.
-   Preview pode usar o arquivo original no MVP; proxies são uma
    melhoria futura.

**Critérios de aceite** - O destaque muda de palavra conforme os
timestamps. - Pausar, retomar e buscar no vídeo atualiza corretamente a
legenda ativa. - O preview usa a mesma configuração de estilo que será
enviada à renderização. - O layout do editor funciona em resoluções
desktop comuns e mantém uma experiência aceitável em telas menores.

### FR-09 --- Presets e personalização de estilos

O MVP deve incluir de 3 a 5 presets iniciais:

1.  **Bold Highlight** --- estilo dinâmico inspirado em vídeos com
    palavras-chave destacadas, sem usar nome, logotipo ou identidade
    visual de terceiros.
2.  **Word Highlight** --- palavra atual destacada com cor configurável.
3.  **Clean Podcast** --- texto branco com sombra discreta.
4.  **Classic** --- legenda convencional com alto contraste.
5.  **Minimal** --- visual discreto, sem animações chamativas.

Controles: - Fonte escolhida entre fontes permitidas e
incluídas/licenciadas para uso comercial. - Tamanho. - Peso. - Cor do
texto. - Cor de destaque. - Contorno e espessura. - Sombra. - Posição
vertical. - Caixa alta/baixa. - Número máximo de palavras ou regra de
quebra por bloco. - Animação entre opções predefinidas, como instantânea
ou pop suave.

Regras: - Cada preset possui valores padrão revisados visualmente. - As
configurações do projeto podem ser alteradas sem modificar o preset
global. - Um estilo personalizado pode ser salvo no projeto. - Não
incluir um editor de animações ou keyframes no MVP.

**Critérios de aceite** - Aplicar um preset atualiza o preview
imediatamente. - As configurações ficam persistidas. - O renderizador
consegue interpretar todos os estilos disponíveis no MVP. - O estilo
Bold Highlight destaca palavras com base em timestamps, não em divisão
uniforme estimada da frase.

### FR-10 --- Correção de sincronização

-   Permitir ajuste manual simples do início/fim de um bloco.
-   Ajustes devem ser limitados e validados para impedir tempos
    negativos, duração invertida ou timestamps fora do vídeo.
-   Se o usuário editar o timing de um bloco, o sistema deve preservar
    os dados não afetados.
-   Indicar visualmente quando um bloco apresenta timing suspeito, se
    regras automáticas detectarem o problema.
-   Manter os dados temporais em segundos ou milissegundos com uma
    convenção única documentada; evitar misturar unidades
    silenciosamente.

### FR-11 --- Exportação MP4

-   Criar um job de renderização.
-   Usar o vídeo original como fonte do render final.
-   Aplicar legendas e estilos via FFmpeg e/ou um mecanismo de
    composição compatível.
-   Produzir MP4 com legendas incorporadas.
-   Oferecer resolução de saída definida pelo MVP, inicialmente até
    1080p, respeitando limites do arquivo original.
-   Salvar o export no R2.
-   Exibir progresso/status e permitir baixar quando estiver pronto.
-   Permitir repetir uma exportação após falha.
-   Preservar o projeto editável independentemente dos exports já
    gerados.

**Critérios de aceite** - O usuário não precisa manter a página aberta
para o processamento continuar. - O export é associado a uma versão
específica das configurações do projeto. - O preview e o export usam os
mesmos timestamps, regras de segmentação e valores de estilo. - Uma
alteração feita durante a renderização não muda silenciosamente o job já
iniciado. - Erros de FFmpeg são registrados com contexto suficiente para
diagnóstico e apresentados ao usuário de forma amigável.

### FR-12 --- Histórico de exportações

-   Listar exports do projeto.
-   Mostrar estado, data, duração de processamento e resolução.
-   Permitir download de exports prontos.
-   Marcar exports antigos como versões anteriores sem sobrescrever o
    arquivo por engano.
-   Excluir artefatos conforme política de retenção e solicitação do
    usuário.

### FR-13 --- Billing com Paddle

-   Integrar checkout e portal de assinatura do Paddle.
-   Manter plano e estado de assinatura no banco.
-   Processar webhooks com validação de assinatura.
-   Tratar eventos de forma idempotente.
-   Aplicar limites de uso no backend, não somente na interface.
-   Permitir upgrade, cancelamento e tratamento de pagamento falho.
-   Não considerar o retorno do checkout como prova definitiva de
    pagamento; confirmar pelo webhook.

Os planos e limites exatos são configuração de produto e devem ser
definidos antes do lançamento. O sistema deve suportar, no mínimo, plano
gratuito e plano pago, com limites configuráveis por duração mensal,
duração máxima por vídeo e/ou número de exports.

### FR-14 --- Medição de uso

-   Registrar consumo de minutos processados e, se necessário, minutos
    exportados.
-   Reservar uso de forma transacional antes de iniciar operações que
    gerem custo.
-   Confirmar o consumo quando a operação atingir o estado definido pela
    política do produto.
-   Liberar reservas em falhas definitivas ou cancelamentos.
-   Evitar cobrança dupla por retries do mesmo job.
-   Mostrar ao usuário uso do período e limite restante.
-   Não permitir ultrapassar limites por meio de requisições paralelas.

### FR-15 --- E-mails via Resend

E-mails iniciais: - Boas-vindas. - Verificação/recuperação de conta,
conforme fluxo de Auth.js. - Export concluído, se habilitado pelo
usuário. - Aviso de uso próximo do limite. - Confirmação de eventos de
assinatura relevantes.

Regras: - E-mails devem ser enviados de forma assíncrona quando não
forem necessários para responder à requisição. - Falhas de envio não
podem desfazer uma exportação concluída. - Não incluir links de download
públicos permanentes; usar URLs assinadas com expiração.

### FR-16 --- Exclusão de projetos e dados

-   Usuário pode excluir projetos.
-   A exclusão deve impedir novos jobs do projeto.
-   Jobs em execução devem ser cancelados quando seguro ou impedidos de
    publicar resultados após a exclusão.
-   Objetos associados no R2 devem ser removidos por um processo
    confiável, com retries.
-   Definir política de retenção para arquivos temporários e exports.
-   Exclusão da conta deve iniciar um fluxo controlado para remover
    dados pessoais e arquivos conforme obrigações aplicáveis.

------------------------------------------------------------------------

## 5. Modelo de dados

O schema definitivo deve ser implementado no Prisma. A proposta abaixo
define entidades e relações essenciais, não substitui a validação dos
tipos concretos na implementação.

### 5.1 Entidades

#### User / Auth.js models

Usar os modelos exigidos pela configuração de Auth.js, incluindo `User`,
`Account`, `Session` e `VerificationToken` quando aplicáveis.

#### Project

-   `id`
-   `userId`
-   `name`
-   `status`
-   `sourceObjectKey`
-   `thumbnailObjectKey` opcional
-   `durationMs`
-   `width`
-   `height`
-   `sourceMimeType`
-   `createdAt`
-   `updatedAt`
-   `deletedAt` opcional

#### Transcript

-   `id`
-   `projectId`
-   `provider`
-   `language`
-   `status`
-   `fullText`
-   `wordsJson` ou tabela normalizada de palavras
-   `segmentsJson` ou tabela normalizada de segmentos
-   `providerMetadata` JSON opcional, sem segredos
-   `createdAt`
-   `updatedAt`

Para o MVP, JSON estruturado é aceitável para armazenar arrays de
palavras/segmentos, desde que haja validação de schema. Se consultas ou
edição concorrente exigirem granularidade, migrar para tabelas
normalizadas.

#### CaptionBlock

-   `id`
-   `projectId`
-   `order`
-   `startMs`
-   `endMs`
-   `text`
-   `wordStartIndex`
-   `wordEndIndex`
-   `createdAt`
-   `updatedAt`

O modelo deve preservar uma referência às palavras originais para manter
o timing. Se houver alterações textuais que tornem os índices obsoletos,
a lógica de edição deve atualizar as referências ou marcar o bloco para
realinhamento.

#### ProjectStyle

-   `id`
-   `projectId`
-   `presetKey`
-   `configuration` JSON validado
-   `createdAt`
-   `updatedAt`

#### RenderJob

-   `id`
-   `projectId`
-   `exportId` opcional
-   `type`
-   `status`
-   `payload` JSON
-   `attempts`
-   `maxAttempts`
-   `availableAt`
-   `lockedAt` opcional
-   `lockedBy` opcional
-   `startedAt` opcional
-   `completedAt` opcional
-   `lastErrorCode` opcional
-   `lastErrorMessage` opcional, sanitizada
-   `createdAt`
-   `updatedAt`

#### Export

-   `id`
-   `projectId`
-   `status`
-   `objectKey` opcional
-   `configurationSnapshot`
-   `sourceVersion`
-   `durationMs` opcional
-   `resolution` opcional
-   `fileSizeBytes` opcional
-   `createdAt`
-   `completedAt` opcional

#### Subscription

-   `id`
-   `userId`
-   `paddleCustomerId`
-   `paddleSubscriptionId`
-   `planKey`
-   `status`
-   `currentPeriodStart`
-   `currentPeriodEnd`
-   `createdAt`
-   `updatedAt`

#### UsageLedger

-   `id`
-   `userId`
-   `projectId` opcional
-   `jobId` opcional
-   `periodKey`
-   `usageType`
-   `quantity`
-   `status` (reservado, confirmado, liberado)
-   `idempotencyKey`
-   `createdAt`
-   `updatedAt`

### 5.2 Integridade e índices

-   Índices em `Project.userId`, `Project.status`,
    `RenderJob.status/availableAt`, `Export.projectId` e campos de
    identificação do Paddle.
-   Chaves estrangeiras para manter integridade.
-   Unicidade de `idempotencyKey` em ledger e de identificadores de
    eventos externos quando persistidos.
-   Consultas do usuário devem sempre incluir o `userId` ou validar a
    propriedade antes de alterar um recurso.
-   Usar transações para reservar uso, criar jobs e atualizar estados
    relacionados.
-   JSON persistido deve ser validado na leitura e escrita com schemas
    de runtime, por exemplo Zod.

------------------------------------------------------------------------

## 6. Máquina de estados

### 6.1 Projeto

Estados sugeridos:

-   `CREATED`
-   `UPLOADING`
-   `UPLOADED`
-   `PROCESSING`
-   `READY`
-   `RENDERING`
-   `COMPLETED`
-   `FAILED`
-   `DELETION_PENDING`
-   `DELETED`

A implementação pode separar estado do projeto, transcrição e exportação
quando isso tornar o fluxo mais claro. Não usar um único status para
representar simultaneamente o estado de todos os jobs.

### 6.2 Job

-   `PENDING`
-   `RUNNING`
-   `RETRY_WAIT`
-   `SUCCEEDED`
-   `FAILED`
-   `CANCELLED`

### 6.3 Regras de transição

-   Apenas jobs `PENDING` ou `RETRY_WAIT` elegíveis podem ser adquiridos
    por um worker.
-   Jobs `RUNNING` devem ter lease/lock com prazo para recuperação após
    crash.
-   Retry automático somente para erros recuperáveis e com backoff.
-   Erros permanentes devem ir para `FAILED`.
-   Toda transição deve ser persistida e observável.
-   Jobs devem verificar se o projeto continua válido antes de publicar
    resultados.
-   A aplicação não deve marcar um projeto como pronto apenas porque o
    browser afirmou que o upload terminou.

------------------------------------------------------------------------

## 7. Fila PostgreSQL e worker

### 7.1 Aquisição de jobs

No MVP, PostgreSQL funciona como fila simples. A aquisição precisa
ocorrer em uma transação curta, usando locking compatível com múltiplos
workers, por exemplo `FOR UPDATE SKIP LOCKED`. O worker deve marcar o
job como `RUNNING`, registrar lock/lease e confirmar a transação antes
de iniciar o processamento pesado.

Não manter uma transação de banco aberta durante toda a transcrição ou
renderização.

### 7.2 Worker

Responsabilidades: - Buscar e adquirir jobs. - Validar payload. -
Confirmar que projeto e arquivo existem e continuam autorizados. -
Baixar objetos necessários do R2 para armazenamento temporário. -
Executar FFmpeg/transcrição com limites de CPU, memória, disco e
duração. - Fazer upload dos resultados para R2. - Atualizar estados de
forma idempotente. - Limpar arquivos temporários em `finally`, inclusive
após falhas. - Renovar lease quando o processamento for longo. -
Registrar métricas e logs estruturados.

### 7.3 Tipos de job

-   `VALIDATE_VIDEO`
-   `GENERATE_THUMBNAIL`
-   `TRANSCRIBE_VIDEO`
-   `RENDER_EXPORT`
-   `DELETE_PROJECT_ASSETS`
-   `SEND_NOTIFICATION` opcional

### 7.4 Retries e idempotência

-   Retry com backoff exponencial e limite de tentativas.
-   Não repetir indefinidamente arquivos inválidos.
-   Usar chaves idempotentes para evitar exports duplicados e uso
    duplicado.
-   Armazenar resultados temporários com chaves específicas da versão do
    job.
-   Não sobrescrever um export pronto quando uma nova renderização é
    iniciada.
-   Um job repetido deve produzir um resultado equivalente ou detectar
    que o resultado já existe.

### 7.5 Segurança do processamento

-   Executar FFmpeg com argumentos separados, sem montar comandos por
    concatenação insegura de strings do usuário.
-   Tratar nomes de arquivos e metadados como dados não confiáveis.
-   Limitar tempo, memória, CPU, espaço temporário e tamanho de saída.
-   Não executar arquivos enviados pelo usuário.
-   Atualizar dependências e imagem Docker regularmente.
-   Nunca incluir credenciais do R2, Paddle ou banco nos logs.

------------------------------------------------------------------------

## 8. Upload e armazenamento R2

### 8.1 Convenção de objetos

``` text
users/{userId}/projects/{projectId}/source/{uploadId}.mp4
users/{userId}/projects/{projectId}/thumbnails/{version}.jpg
users/{userId}/projects/{projectId}/exports/{exportId}.mp4
users/{userId}/projects/{projectId}/temp/{jobId}/...
```

As chaves são exemplos; a extensão real deve refletir o arquivo
validado. Não confiar no nome fornecido pelo usuário para definir
caminhos.

### 8.2 Regras

-   Bucket privado por padrão.
-   Downloads por URL assinada com expiração.
-   URLs de upload limitadas a objeto, método e período esperados.
-   Verificar existência, tamanho e metadados do objeto no servidor.
-   Aplicar política de limpeza de temporários.
-   Não tornar originais ou exports públicos por padrão.
-   Definir CORS do R2 somente para origens necessárias.
-   Considerar upload multipart para arquivos grandes quando o limite do
    produto exigir.

------------------------------------------------------------------------

## 9. Motor de legendas e sincronização

A qualidade das legendas é uma característica central do produto e deve
ser tratada como um subsistema próprio.

### 9.1 Contrato de transcrição

Criar uma interface que permita substituir o provedor:

``` ts
export interface TranscriptionProvider {
  transcribe(input: {
    audioPath: string;
    language?: string;
  }): Promise<TranscriptionResult>;
}

export interface TranscriptionResult {
  language?: string;
  text: string;
  words: Array<{
    text: string;
    startMs: number;
    endMs: number;
    confidence?: number;
  }>;
  segments?: Array<{
    text: string;
    startMs: number;
    endMs: number;
  }>;
}
```

Se o provedor não retornar timestamps por palavra, o adaptador deve
executar uma etapa de alinhamento quando apropriado. O produto não deve
inventar timestamps distribuindo uniformemente as palavras como solução
padrão de produção.

### 9.2 Segmentação

Criar um serviço puro, com testes unitários, que transforme palavras em
blocos. Os parâmetros devem ser configuráveis:

-   Máximo de palavras por bloco.
-   Máximo de caracteres por linha.
-   Duração mínima e máxima de um bloco.
-   Pausa que sugere quebra.
-   Número máximo de linhas.
-   Regras para pontuação.
-   Regras específicas por idioma quando necessárias.

Os valores iniciais devem ser definidos com base em testes de vídeos
reais, e não tratados como constantes universais.

### 9.3 Consistência temporal

-   Usar uma unidade interna consistente, preferencialmente
    milissegundos inteiros em persistência.
-   Converter para segundos somente em APIs/bibliotecas que exijam isso.
-   Validar `startMs >= 0`, `endMs > startMs` e limites da duração do
    vídeo.
-   Preservar timestamps das palavras ao editar texto, salvo quando
    houver realinhamento explícito.
-   A posição ativa durante playback deve derivar do relógio do vídeo,
    não de timers independentes.
-   Considerar busca, pausa, retomada, mudança de velocidade e fim do
    vídeo.

### 9.4 Critérios de qualidade

Montar um conjunto de vídeos de avaliação que inclua: - Voz clara e
lenta. - Fala rápida. - Diferentes sotaques. - Ruído de fundo. - Nomes
próprios e termos técnicos. - Pausas longas e curtas. - Mais de um
falante, se suportado pelo escopo inicial. - Vídeos com música de fundo.

Avaliar: - Erros de transcrição. - Desvio temporal de palavras. -
Legendas cortadas ou ilegíveis. - Quebras de frase pouco naturais. -
Diferença entre preview e export.

Não prometer precisão perfeita. Oferecer correção manual para casos
inevitáveis.

------------------------------------------------------------------------

## 10. Renderização e equivalência com preview

### 10.1 Fonte de verdade

Cada export deve capturar um snapshot imutável de: -
Identificador/versão do vídeo de origem. - Palavras e timestamps. -
Blocos de legenda. - Configuração de estilo. - Resolução e parâmetros de
renderização.

Alterações posteriores no editor não podem modificar o job já iniciado.

### 10.2 Renderizador

-   FFmpeg é responsável pela composição final e codificação do vídeo.
-   O texto deve ser escapado corretamente para o mecanismo de
    composição utilizado.
-   Usar fontes incluídas e licenciadas para distribuição comercial.
-   Aplicar posicionamento relativo às dimensões do vídeo, não a pixels
    fixos da tela do editor.
-   Manter legibilidade, contraste e margens seguras.
-   Validar o arquivo final e sua duração antes de marcar o export como
    pronto.

### 10.3 Preview

-   HTML video reproduz a origem.
-   Overlay React mostra o bloco e a palavra ativa.
-   A renderização visual usa um schema compartilhado de estilo.
-   O preview deve respeitar a proporção real do vídeo.
-   O export deve aplicar regras equivalentes usando o renderizador
    server-side.
-   Como fontes e rasterização podem variar entre browser e FFmpeg,
    criar testes visuais e ajustes para minimizar diferenças.

------------------------------------------------------------------------

## 11. API interna

A API deve usar validação de entrada e saída, autenticação, autorização
e respostas de erro consistentes. Os nomes abaixo são uma proposta de
endpoints REST para Route Handlers do Next.js.

### Projetos

-   `GET /api/projects` --- listar projetos.
-   `POST /api/projects` --- criar projeto.
-   `GET /api/projects/:projectId` --- consultar projeto.
-   `PATCH /api/projects/:projectId` --- renomear ou atualizar metadados
    permitidos.
-   `DELETE /api/projects/:projectId` --- solicitar exclusão.

### Upload

-   `POST /api/projects/:projectId/uploads/presign` --- criar URL
    pré-assinada.
-   `POST /api/projects/:projectId/uploads/complete` --- confirmar
    upload e agendar validação.

### Transcrição e legendas

-   `GET /api/projects/:projectId/transcript` --- consultar transcrição.
-   `POST /api/projects/:projectId/transcription/retry` --- repetir
    transcrição quando permitido.
-   `GET /api/projects/:projectId/captions` --- obter blocos.
-   `PATCH /api/projects/:projectId/captions` --- persistir alterações
    de texto/ordem/timing.
-   `PUT /api/projects/:projectId/style` --- salvar estilo do projeto.

### Exports

-   `POST /api/projects/:projectId/exports` --- criar export.
-   `GET /api/projects/:projectId/exports` --- listar exports.
-   `GET /api/exports/:exportId` --- consultar estado.
-   `POST /api/exports/:exportId/retry` --- tentar novamente quando
    permitido.
-   `GET /api/exports/:exportId/download` --- emitir URL assinada para
    download.

### Billing

-   `POST /api/billing/checkout` --- iniciar checkout.
-   `POST /api/billing/portal` --- abrir portal de billing, se
    disponível no produto.
-   `POST /api/webhooks/paddle` --- receber eventos verificados do
    Paddle.

Endpoints e payloads definitivos devem ser documentados e tipados. Não
expor endpoint público para invocar jobs arbitrários.

------------------------------------------------------------------------

## 12. UX e interface

### 12.1 Princípios de interface

-   Poucas ações principais por tela.
-   Estados de processamento sempre claros.
-   Preview grande e central.
-   Lista de legendas fácil de percorrer.
-   Controles visuais agrupados por intenção.
-   Não mostrar opções avançadas que não façam parte do MVP.
-   Feedback imediato para alterações locais e confirmação clara quando
    salvarem.
-   Erros devem explicar o que aconteceu e o que o usuário pode fazer.

### 12.2 Tela do editor

**Barra superior** - Voltar ao dashboard. - Nome do projeto. - Indicador
de salvamento. - Botão Exportar.

**Área central** - Preview de vídeo. - Overlay de legenda. -
Play/pause. - Barra de progresso simples do vídeo --- apenas controle de
reprodução, não uma timeline de edição. - Tempo atual e duração. -
Navegação para legenda anterior/próxima.

**Painel de legendas** - Lista de blocos com timestamps. - Edição
textual inline. - Seleção que sincroniza o vídeo. - Ações dividir/juntar
e ajuste simples de timing.

**Painel de estilos** - Galeria de presets. - Controles de tipografia,
cor, destaque, contorno, posição e animação. - Restaurar padrão do
preset.

### 12.3 Acessibilidade e responsividade

-   Contraste adequado.
-   Controles com labels acessíveis.
-   Navegação por teclado nos fluxos essenciais.
-   Estados de foco visíveis.
-   Não depender somente de cor para indicar status.
-   Editor otimizado para desktop no MVP; telas menores devem manter
    acesso às ações principais sem prometer a mesma eficiência de uma
    workstation.

------------------------------------------------------------------------

## 13. Billing, planos e limites

Os valores comerciais não estão fixados nesta especificação. O sistema
deve permitir configurar os planos sem espalhar valores hardcoded pelo
código.

### 13.1 Limites configuráveis

-   Minutos de vídeo processados por período.
-   Duração máxima por arquivo.
-   Tamanho máximo de upload.
-   Número de exports simultâneos.
-   Resolução de exportação.
-   Recursos premium habilitados.

### 13.2 Regras

-   Validar limites no backend antes de criar jobs.
-   Reservar consumo transacionalmente.
-   Garantir idempotência em retries.
-   Não confiar no estado de billing do cliente.
-   Tratar webhooks do Paddle com validação de assinatura e persistência
    de eventos.
-   Reconciliar assinaturas se eventos chegarem fora de ordem ou forem
    repetidos.
-   Definir política clara para cancelamento, pagamento falho e fim do
    período vigente.

------------------------------------------------------------------------

## 14. Segurança e privacidade

-   Autenticação em todas as rotas privadas.
-   Verificação de propriedade em cada projeto, export e objeto.
-   Validação rigorosa de inputs e payloads.
-   Proteção contra acesso horizontal indevido a IDs.
-   URLs assinadas com prazo limitado.
-   Segredos apenas em variáveis de ambiente/secret manager.
-   Webhooks validados criptograficamente conforme a documentação do
    provedor.
-   Rate limiting nos endpoints sensíveis.
-   Limites de tamanho/duração e concorrência.
-   Logs sem tokens, credenciais, URLs assinadas ou conteúdo sensível
    desnecessário.
-   Política de retenção e exclusão documentada.
-   Considerar obrigações de privacidade aplicáveis, incluindo LGPD.
-   Documentar quais serviços recebem áudio/vídeo e se a transcrição
    ocorre localmente ou por API externa.
-   Se houver transcrição externa, não afirmar que os arquivos nunca
    saem da infraestrutura própria.

------------------------------------------------------------------------

## 15. Observabilidade e operação

### 15.1 Logs

Registrar eventos estruturados com: - `jobId` - `projectId` -
`exportId`, quando aplicável - tipo de job - duração de processamento -
tentativas - estado final - código de erro sanitizado

Nunca registrar tokens ou credenciais.

### 15.2 Métricas operacionais

-   Tempo médio e percentis de transcrição.
-   Tempo de renderização por minuto de vídeo.
-   Taxa de falha por tipo de job.
-   Quantidade de jobs pendentes e idade do job mais antigo.
-   Uso de CPU, RAM e disco temporário.
-   Tamanho médio de upload e export.
-   Custo aproximado de processamento por minuto.
-   Diferenças reportadas entre preview e export.

### 15.3 Recuperação

-   Reinício automático do worker.
-   Lease/lock para recuperar jobs abandonados.
-   Retries limitados com backoff.
-   Limpeza de temporários.
-   Alertas quando a fila cresce ou o disco se aproxima do limite.
-   Backup e estratégia de restauração do banco conforme as opções do
    Neon.

------------------------------------------------------------------------

## 16. Testes

### 16.1 Unitários --- Vitest

Cobrir: - Segmentação de palavras em blocos. - Validação de
timestamps. - Aplicação e serialização de estilos. - Cálculo de uso e
reservas. - Transições de estado. - Chaves idempotentes. - Autorização
de propriedade. - Validação de payloads e limites de plano.

### 16.2 Integração

Cobrir: - Criação de projeto e job. - Aquisição de job por múltiplos
workers. - Retry e recuperação após lease expirar. - Confirmação de
upload. - Persistência de transcrição. - Salvamento de alterações de
legendas. - Criação de export e atualização de status. - Webhooks Paddle
duplicados. - Liberação de reserva de uso após falha. - Exclusão de
projeto com jobs pendentes.

Usar serviços reais isolados ou mocks controlados conforme o custo e a
natureza do teste; não depender de rede externa nos testes unitários.

### 16.3 End-to-end --- Playwright

Fluxos essenciais: 1. Cadastro/login. 2. Dashboard vazio. 3. Criação de
projeto. 4. Upload de arquivo de teste. 5. Estado de transcrição. 6.
Edição de uma legenda. 7. Aplicação do preset Bold Highlight. 8. Preview
e busca no vídeo. 9. Exportação simulada ou em ambiente de teste. 10.
Download de export pronto. 11. Bloqueio por limite de plano. 12. Acesso
negado a projeto de outro usuário.

### 16.4 Testes de mídia

Manter pequenos vídeos de fixture, com licença apropriada, para
testar: - Metadados. - Áudio extraído. - Timestamps. - Renderização de
legendas. - Formato e duração do MP4 final. - Texto cortado, margens e
posicionamento. - Consistência temporal entre preview e export.

Os testes de qualidade da transcrição devem distinguir regressões do
modelo de falhas na aplicação.

------------------------------------------------------------------------

## 17. Variáveis de ambiente

Exemplo conceitual; os nomes definitivos devem seguir as bibliotecas
utilizadas.

``` env
# Web / Auth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=

# Database
DATABASE_URL=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_PUBLIC_BASE_URL=

# Paddle
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_CLIENT_TOKEN=
PADDLE_PRICE_ID_FREE=
PADDLE_PRICE_ID_CREATOR=

# Resend
RESEND_API_KEY=
EMAIL_FROM=

# Worker / Transcription
WORKER_CONCURRENCY=1
TRANSCRIPTION_PROVIDER=
TRANSCRIPTION_API_KEY=
TEMP_DIR=/tmp/video-worker
MAX_UPLOAD_BYTES=
MAX_VIDEO_DURATION_SECONDS=
```

Não versionar `.env` real. Incluir apenas `.env.example` sem valores
secretos. Usar configurações separadas para desenvolvimento, teste e
produção.

------------------------------------------------------------------------

## 18. Deploy e infraestrutura

### 18.1 Web

-   Deploy do Next.js em ambiente compatível com runtime e Route
    Handlers necessários.
-   Usar Neon como banco gerenciado.
-   Configurar domínio, HTTPS, variáveis e logs.
-   Aplicar migrations de maneira controlada durante deploy.
-   Não executar jobs longos dentro do runtime web.

### 18.2 Worker na Hetzner

-   Dockerizar o worker e fixar versões de FFmpeg e dependências.
-   Começar com uma máquina e concorrência baixa.
-   Usar disco temporário com espaço monitorado.
-   Configurar restart automático.
-   Separar permissões e credenciais do worker das permissões do
    frontend sempre que possível.
-   Configurar shutdown gracioso para que o worker pare de adquirir jobs
    e finalize ou libere jobs com segurança.
-   Dimensionar a máquina a partir de benchmarks reais de duração,
    memória e CPU.

### 18.3 Escalabilidade

Primeiro, aumentar recursos ou concorrência de forma controlada em uma
única máquina. Quando a fila e as métricas justificarem, executar
múltiplos workers que compartilhem a fila PostgreSQL. Considerar
Redis/BullMQ somente quando o PostgreSQL não atender aos requisitos
operacionais.

Não adotar Kubernetes no MVP.

------------------------------------------------------------------------

## 19. Roadmap de implementação

### Fase 1 --- Fundação

-   Criar monorepo e configuração TypeScript.
-   Configurar Next.js, Tailwind, Prisma e Neon.
-   Configurar Auth.js.
-   Definir schemas de validação compartilhados.
-   Implementar dashboard e CRUD básico de projetos.
-   Configurar Vitest e Playwright.

**Concluído quando:** usuário consegue autenticar e
criar/renomear/excluir projetos com autorização correta.

### Fase 2 --- Upload e processamento

-   Configurar R2 e URLs pré-assinadas.
-   Implementar validação de upload.
-   Criar schema de jobs no PostgreSQL.
-   Criar worker Docker na Hetzner.
-   Integrar FFmpeg para metadados e thumbnail.
-   Implementar status, retry, logs e limpeza de temporários.

**Concluído quando:** usuário envia um vídeo e vê o projeto validado com
thumbnail e metadados.

### Fase 3 --- Transcrição e sincronização

-   Implementar adaptador de transcrição.
-   Obter timestamps por palavra ou integrar alinhamento.
-   Persistir transcrição.
-   Implementar segmentador de legendas.
-   Criar testes com vídeos de referência.
-   Tratar falhas e reprocessamento.

**Concluído quando:** o projeto mostra blocos de legenda sincronizados e
editáveis.

### Fase 4 --- Editor

-   Construir preview com HTML video e overlay.
-   Implementar lista textual sincronizada.
-   Implementar edição de texto.
-   Implementar dividir/juntar blocos.
-   Implementar ajuste simples de timing.
-   Implementar presets.
-   Implementar Bold Highlight e destaque por palavra.
-   Implementar autosave e estados de salvamento.

**Concluído quando:** usuário consegue revisar e estilizar um vídeo sem
timeline tradicional.

### Fase 5 --- Exportação

-   Criar snapshots de export.
-   Implementar renderização FFmpeg.
-   Fazer upload do resultado ao R2.
-   Implementar status, retries e histórico.
-   Comparar visualmente preview e export.
-   Testar download assinado.

**Concluído quando:** o MP4 exportado apresenta as legendas e os estilos
esperados.

### Fase 6 --- Monetização e lançamento

-   Integrar Paddle checkout e webhooks.
-   Implementar planos e limites configuráveis.
-   Implementar ledger de uso e reservas transacionais.
-   Configurar e-mails Resend.
-   Implementar exclusão de projeto e limpeza de arquivos.
-   Revisar segurança, observabilidade, documentação e backups.
-   Executar testes E2E e checklist de lançamento.

**Concluído quando:** limites e assinaturas são aplicados no backend e o
fluxo comercial está testado.

------------------------------------------------------------------------

## 20. Critérios de aceite globais do MVP

O MVP será considerado pronto para lançamento quando:

-   [ ] Usuários podem autenticar e acessar apenas seus próprios dados.
-   [ ] Upload direto ao R2 funciona com validação no servidor.
-   [ ] Vídeos válidos são processados de forma assíncrona.
-   [ ] A transcrição gera texto e timestamps adequados para o editor.
-   [ ] A segmentação cria blocos legíveis.
-   [ ] É possível corrigir texto, dividir/juntar blocos e ajustar
    timing.
-   [ ] O editor não depende de timeline tradicional.
-   [ ] O preview destaca palavras com base no tempo real do vídeo.
-   [ ] O preset Bold Highlight funciona e pode ser personalizado.
-   [ ] Existem de 3 a 5 presets iniciais.
-   [ ] O export MP4 reflete o snapshot de legendas e estilo.
-   [ ] Os exports são armazenados no R2 e baixados por URLs
    temporárias.
-   [ ] Jobs são idempotentes, recuperáveis e possuem retries limitados.
-   [ ] Paddle aplica corretamente estado de assinatura e limites.
-   [ ] Uso é contabilizado sem duplicação em retries.
-   [ ] Resend envia os e-mails definidos sem bloquear o processamento.
-   [ ] Existem testes unitários, de integração e E2E para os fluxos
    críticos.
-   [ ] Logs e métricas permitem diagnosticar jobs falhos e filas
    atrasadas.
-   [ ] Política de retenção e exclusão de arquivos está implementada.
-   [ ] Segredos não aparecem no repositório ou nos logs.

------------------------------------------------------------------------

## 21. Melhorias futuras --- pós-MVP

Priorizar somente com base em feedback e métricas: - Geração de proxy
para preview mais leve. - Melhorias de alinhamento e revisão de palavras
de baixa confiança. - Dicionário personalizado de nomes e termos. - Mais
idiomas. - Tradução de legendas. - Remoção de silêncios. - Detecção de
highlights. - Templates de marca. - Mais presets e opções de animação. -
API pública. - Integrações com redes sociais. - Redis/BullMQ se
necessário. - Workers especializados e escalabilidade adicional. -
Colaboração e organizações, caso haja demanda comprovada.

------------------------------------------------------------------------

## 22. Decisões finais consolidadas

-   **Produto:** SaaS web de legendagem automática, não editor de vídeo
    generalista.
-   **UX:** editor simples, baseado em texto, sem timeline tradicional
    no MVP.
-   **Qualidade:** prioridade para timestamps por palavra, segmentação
    legível e consistência entre preview e export.
-   **Estilos:** 3--5 presets iniciais, incluindo Bold Highlight
    inspirado em vídeos com palavras destacadas.
-   **Frontend/backend:** Next.js + TypeScript, sem FastAPI no MVP.
-   **Dados:** Neon PostgreSQL + Prisma.
-   **Auth:** Auth.js.
-   **Storage:** Cloudflare R2 com upload direto e URLs assinadas.
-   **Billing:** Paddle.
-   **E-mail:** Resend.
-   **Processamento:** worker independente na Hetzner com FFmpeg e
    provedor de transcrição intercambiável.
-   **Fila inicial:** PostgreSQL com locking, retries e idempotência;
    sem Redis inicialmente.
-   **Testes:** Vitest + Playwright.
-   **Escopo:** entregar primeiro um fluxo completo, confiável e
    comercializável; expandir apenas depois de validar a demanda.

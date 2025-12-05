# Sistema de Ativação SaaS via Telegram

Sistema multi-tenant para gerenciamento de ativações de aplicativos IPTV via Telegram.

## Funcionalidades

### Para o Administrador (você)
- 👥 Gerenciar usuários (revendedores)
- 🔄 Alterar planos manualmente
- ➕ Adicionar ativações
- 📅 Estender validade
- ⏸️ Suspender/Reativar usuários
- 📊 Estatísticas do sistema
- 📢 Broadcast para todos os usuários

### Para os Revendedores
- 🤖 Vincular seu próprio bot do Telegram
- 📱 Configurar produtos e preços
- 🔐 Configurar credenciais (IBO Pro, Mercado Pago)
- 💳 Gerenciar plano e pagamentos
- 📊 Relatórios de ativações

### Para os Clientes Finais
- 📺 Ver produtos disponíveis
- 💳 Pagar via PIX (Mercado Pago)
- ⚡ Ativação automática após pagamento
- ❓ Suporte via WhatsApp

## Planos

| Plano | Ativações | Duração | Preço |
|-------|-----------|---------|-------|
| 🎁 Trial | 20 | 7 dias | Grátis |
| 🥉 Básico | 50 | 30 dias | R$25 |
| 💎 Ilimitado | ∞ | 30 dias | R$50 |

## Estrutura do Projeto

```
ativacao-saas/
├── src/
│   ├── index.js                 # Arquivo principal
│   ├── config.js                # Configurações
│   ├── database/
│   │   ├── index.js             # Operações do banco
│   │   └── schema.js            # Estrutura das tabelas
│   ├── handlers/
│   │   ├── admin.js             # Menu admin
│   │   ├── reseller.js          # Menu revendedor
│   │   └── customer.js          # Menu cliente final
│   ├── services/
│   │   ├── botManager.js        # Gerenciador de bots
│   │   ├── paymentService.js    # Mercado Pago
│   │   ├── activationService.js # Ativações
│   │   └── notificationService.js # Notificações
│   ├── modules/
│   │   └── ibo_pro.js           # Módulo IBO Pro
│   └── cron/
│       └── jobs.js              # Tarefas agendadas
├── data/                        # Banco SQLite
├── package.json
└── README.md
```

## Instalação

```bash
# Clonar/extrair o projeto
cd ativacao-saas

# Instalar dependências
npm install

# Configurar seu Telegram ID como admin (editar src/config.js)
# ADMIN_IDS: ['seu_telegram_id']

# Executar
MASTER_BOT_TOKEN=seu_token_aqui npm start
```

## Configuração

### 1. Criar Bot Master no Telegram
1. Abra @BotFather
2. Envie /newbot
3. Siga as instruções
4. Copie o token

### 2. Descobrir seu Telegram ID
1. Abra @userinfobot
2. Envie /start
3. Copie seu ID

### 3. Configurar config.js
```javascript
ADMIN_IDS: [
  'seu_telegram_id_aqui',
],
```

### 4. Executar
```bash
MASTER_BOT_TOKEN=123456:ABC... npm start
```

## Fluxo de Uso

### Novo Revendedor
1. Acessa o Bot Master
2. Clica em "Criar Conta"
3. Informa nome e WhatsApp
4. Recebe 7 dias de trial com 20 ativações
5. Vincula seu próprio bot (token do @BotFather)
6. Configura credenciais (IBO Pro, Mercado Pago)
7. Adiciona produtos com preços
8. Compartilha link do bot com clientes

### Cliente Final
1. Acessa o bot do revendedor
2. Escolhe o produto
3. Envia o MAC Address
4. Recebe QR Code PIX
5. Paga
6. Recebe confirmação automática

## Notificações Automáticas

- ⏰ Lembrete 1 dia antes do vencimento (7h da manhã)
- 🔄 Verificação de usuários vencidos (a cada hora)

## Módulos de Ativação

### IBO Pro
- Tiers: YEAR (Anual), LIFETIME (Vitalício)
- API: api.iboproapp.com

### Futuros (em desenvolvimento)
- Sigma
- SmartOne
- P2BRAS

## Banco de Dados

SQLite local em `data/database.sqlite`

Tabelas:
- usuarios (revendedores)
- bots (1 por usuário)
- credenciais (criptografadas)
- produtos
- pedidos
- ativacoes (histórico)
- mensalidades
- logs

## Comandos

- `/start` - Menu principal
- `/admin` - Menu admin (apenas admins)

## Produção

Para rodar em produção:

```bash
# Com PM2
pm2 start src/index.js --name ativacao-saas

# Com systemd
# Criar arquivo em /etc/systemd/system/ativacao-saas.service
```

## Suporte

Em caso de problemas, verifique:
1. Token do bot está correto
2. Telegram ID está na lista de admins
3. Credenciais do IBO Pro estão válidas
4. Access Token do Mercado Pago está correto

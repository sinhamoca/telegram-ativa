// src/database/schema.js - Estrutura das tabelas

const schema = `
  -- Tabela de usuários (revendedores)
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    nome TEXT NOT NULL,
    whatsapp TEXT,
    plano_id TEXT DEFAULT 'trial',
    ativacoes_restantes INTEGER DEFAULT 20,
    data_expiracao DATETIME,
    status TEXT DEFAULT 'ativo',
    codigo_afiliado TEXT UNIQUE,
    indicado_por_id INTEGER,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (indicado_por_id) REFERENCES usuarios(id)
  );

  -- Tabela de bots (1 por usuário)
  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER UNIQUE NOT NULL,
    token TEXT UNIQUE,
    bot_username TEXT,
    bot_name TEXT,
    status TEXT DEFAULT 'inativo',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  -- Tabela de credenciais (criptografadas)
  CREATE TABLE IF NOT EXISTS credenciais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    dados TEXT NOT NULL,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    UNIQUE(usuario_id, tipo)
  );

  -- Tabela de produtos (configurados pelo revendedor)
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    modulo TEXT NOT NULL,
    tier TEXT NOT NULL,
    preco REAL NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  -- Tabela de pedidos
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    bot_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    cliente_telegram_id TEXT NOT NULL,
    cliente_nome TEXT,
    cliente_username TEXT,
    mac_address TEXT NOT NULL,
    valor REAL NOT NULL,
    status TEXT DEFAULT 'pendente',
    pagamento_id TEXT,
    pagamento_qrcode TEXT,
    pagamento_copia_cola TEXT,
    erro_msg TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bot_id) REFERENCES bots(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  -- Tabela de ativações (histórico detalhado)
  CREATE TABLE IF NOT EXISTS ativacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    mac_address TEXT NOT NULL,
    modulo TEXT NOT NULL,
    tier TEXT NOT NULL,
    resposta_api TEXT,
    sucesso INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  -- Tabela de pagamentos de mensalidade (para você receber)
  CREATE TABLE IF NOT EXISTS mensalidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    plano_id TEXT NOT NULL,
    valor REAL NOT NULL,
    valor_desconto REAL DEFAULT 0,
    status TEXT DEFAULT 'pendente',
    pagamento_id TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    pago_em DATETIME,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  -- Tabela de renovações para controle de afiliados
  CREATE TABLE IF NOT EXISTS renovacoes_afiliados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicado_id INTEGER NOT NULL,
    indicador_id INTEGER NOT NULL,
    mes_referencia TEXT NOT NULL,
    valor_desconto REAL DEFAULT 5.0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (indicado_id) REFERENCES usuarios(id),
    FOREIGN KEY (indicador_id) REFERENCES usuarios(id),
    UNIQUE(indicado_id, mes_referencia)
  );

  -- Tabela de logs do sistema
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    usuario_id INTEGER,
    dados TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabela de saldos dos clientes (por bot)
  CREATE TABLE IF NOT EXISTS saldos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    cliente_telegram_id TEXT NOT NULL,
    valor REAL DEFAULT 0,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bot_id) REFERENCES bots(id),
    UNIQUE(bot_id, cliente_telegram_id)
  );

  -- Índices para performance
  CREATE INDEX IF NOT EXISTS idx_usuarios_telegram_id ON usuarios(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
  CREATE INDEX IF NOT EXISTS idx_usuarios_codigo_afiliado ON usuarios(codigo_afiliado);
  CREATE INDEX IF NOT EXISTS idx_usuarios_indicado_por ON usuarios(indicado_por_id);
  CREATE INDEX IF NOT EXISTS idx_bots_token ON bots(token);
  CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
  CREATE INDEX IF NOT EXISTS idx_pedidos_codigo ON pedidos(codigo);
  CREATE INDEX IF NOT EXISTS idx_pedidos_pagamento_id ON pedidos(pagamento_id);
  CREATE INDEX IF NOT EXISTS idx_renovacoes_mes ON renovacoes_afiliados(mes_referencia);
`;

module.exports = schema;
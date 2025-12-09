// src/database/index.js - Conexão e operações do banco de dados

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const schema = require('./schema');
const config = require('../config');
const CRYPTO_KEY = process.env.CRYPTO_KEY || 'ativacao-saas-2024-secret-key';


const dbPath = path.join(__dirname, '../../data/database.sqlite');
const dataDir = path.dirname(dbPath);

let db = null;

// ==================== INICIALIZAÇÃO ====================

async function initDb() {
  if (db) return db;

  // Garante que o diretório existe
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Carrega banco existente ou cria novo
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('[DB] Banco de dados carregado');
  } else {
    db = new SQL.Database();
    console.log('[DB] Novo banco de dados criado');
  }

  // Executa schema
  db.run(schema);
  
  // Migração automática: adicionar colunas de afiliados se não existirem
  migrateAfiliados();
  migrateDuplecast();
  migrateSmartone();
  migrateClouddy();
  migratePedidosClouddy();
  migrateModulosImagens();
  migrateJogosConfig();
  migrateQuickPlayer();

  
  saveDb();
  
  console.log('[DB] Schema aplicado com sucesso');
  return db;
}

/**
 * Migração automática para sistema de afiliados
 */
function migrateAfiliados() {
  try {
    // Verificar se coluna codigo_afiliado existe
    const columns = db.exec("PRAGMA table_info(usuarios)")[0]?.values || [];
    const columnNames = columns.map(col => col[1]);
    
    if (!columnNames.includes('codigo_afiliado')) {
      console.log('[DB] Migrando: adicionando coluna codigo_afiliado...');
      db.run('ALTER TABLE usuarios ADD COLUMN codigo_afiliado TEXT UNIQUE');
    }
    
    if (!columnNames.includes('indicado_por_id')) {
      console.log('[DB] Migrando: adicionando coluna indicado_por_id...');
      db.run('ALTER TABLE usuarios ADD COLUMN indicado_por_id INTEGER REFERENCES usuarios(id)');
    }
    
    // Criar tabela renovacoes_afiliados se não existir
    db.run(`
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
      )
    `);
    
    // Criar índices se não existirem
    db.run('CREATE INDEX IF NOT EXISTS idx_usuarios_codigo_afiliado ON usuarios(codigo_afiliado)');
    db.run('CREATE INDEX IF NOT EXISTS idx_usuarios_indicado_por ON usuarios(indicado_por_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_renovacoes_mes ON renovacoes_afiliados(mes_referencia)');
    
    console.log('[DB] Migração de afiliados verificada');
  } catch (e) {
    console.error('[DB] Erro na migração de afiliados:', e.message);
  }
}


/**
 * Migração automática para sistema de cartões Clouddy
 * NOTA: Os dados do cartão são armazenados com criptografia básica
 */
function migrateClouddy() {
  try {
    // Criar tabela clouddy_cards se não existir
    db.run(`
      CREATE TABLE IF NOT EXISTS clouddy_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL UNIQUE,
        card_number_encrypted TEXT NOT NULL,
        card_expiry TEXT NOT NULL,
        card_cvc_encrypted TEXT NOT NULL,
        card_name TEXT NOT NULL,
        card_email TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);
    
    // Criar índice
    db.run('CREATE INDEX IF NOT EXISTS idx_clouddy_cards_usuario ON clouddy_cards(usuario_id)');
    
    console.log('[DB] Migração Clouddy verificada');
  } catch (e) {
    console.error('[DB] Erro na migração Clouddy:', e.message);
  }
}

/**
 * Migração automática para sistema de códigos Duplecast
 */
function migrateDuplecast() {
  try {
    // Criar tabela duplecast_codes se não existir
    db.run(`
      CREATE TABLE IF NOT EXISTS duplecast_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        codigo TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL DEFAULT 'YEAR',
        usado INTEGER DEFAULT 0,
        mac_usado TEXT,
        pedido_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usado_em DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
      )
    `);
    
    // Criar índices
    db.run('CREATE INDEX IF NOT EXISTS idx_duplecast_usuario ON duplecast_codes(usuario_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_duplecast_codigo ON duplecast_codes(codigo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_duplecast_usado ON duplecast_codes(usado)');
    
    console.log('[DB] Migração Duplecast verificada');
  } catch (e) {
    console.error('[DB] Erro na migração Duplecast:', e.message);
  }
}

/**
 * Migração automática para sistema de códigos SmartOne
 */
function migrateSmartone() {
  try {
    // Criar tabela smartone_codes se não existir
    db.run(`
      CREATE TABLE IF NOT EXISTS smartone_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        codigo TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL DEFAULT 'YEAR',
        usado INTEGER DEFAULT 0,
        mac_usado TEXT,
        pedido_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usado_em DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
      )
    `);
    
    // Criar índices
    db.run('CREATE INDEX IF NOT EXISTS idx_smartone_usuario ON smartone_codes(usuario_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_smartone_codigo ON smartone_codes(codigo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_smartone_usado ON smartone_codes(usado)');
    
    console.log('[DB] Migração SmartOne verificada');
  } catch (e) {
    console.error('[DB] Erro na migração SmartOne:', e.message);
  }
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper para executar query e retornar objetos
function query(sql, params = []) {
  const result = db.exec(sql, params);
  if (result.length === 0) return [];
  
  const cols = result[0].columns;
  return result[0].values.map(vals => 
    Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
  );
}

// Helper para executar query e retornar primeiro resultado
function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper para executar comando (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return db.getRowsModified();
}


function migrateQuickPlayer() {
  try {
    const columns = db.exec("PRAGMA table_info(pedidos)")[0]?.values || [];
    const columnNames = columns.map(col => col[1]);
    
    if (!columnNames.includes('dados_extra')) {
      console.log('[DB] Migrando: adicionando coluna dados_extra...');
      db.run('ALTER TABLE pedidos ADD COLUMN dados_extra TEXT');
    }
    
    console.log('[DB] Migração Quick Player verificada');
  } catch (e) {
    console.error('[DB] Erro na migração Quick Player:', e.message);
  }
}



// ==================== USUÁRIOS ====================

const usuarios = {
  criar(telegramId, username, nome, whatsapp) {
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + config.PLANOS.TRIAL.dias);
    
    run(`
      INSERT INTO usuarios (telegram_id, username, nome, whatsapp, plano_id, ativacoes_restantes, data_expiracao)
      VALUES (?, ?, ?, ?, 'trial', ?, ?)
    `, [telegramId, username, nome, whatsapp, config.PLANOS.TRIAL.ativacoes, dataExpiracao.toISOString()]);
    
    return this.buscarPorTelegramId(telegramId);
  },

  getJogosConfig(usuarioId) {
    const usuario = queryOne('SELECT jogos_config FROM usuarios WHERE id = ?', [usuarioId]);
    return usuario?.jogos_config || 'desativado';
  },

  setJogosConfig(usuarioId, novaConfig) {
    const validos = ['desativado', 'apenas_eu', 'eu_e_clientes'];
    if (!validos.includes(novaConfig)) {
      return { success: false, error: 'Configuração inválida' };
    }
    run('UPDATE usuarios SET jogos_config = ? WHERE id = ?', [novaConfig, usuarioId]);
    return { success: true };
  },

  listarComJogosAtivados() {
    const hoje = new Date().toISOString().split('T')[0];
    return query(`
      SELECT * FROM usuarios 
      WHERE jogos_config != 'desativado'
      AND status = 'ativo' 
      AND data_expiracao >= ?
      ORDER BY nome ASC
    `, [hoje]);
  },

  buscarPorTelegramId(telegramId) {
    return queryOne('SELECT * FROM usuarios WHERE telegram_id = ?', [telegramId]);
  },

  buscarPorId(id) {
    return queryOne('SELECT * FROM usuarios WHERE id = ?', [id]);
  },

  listarTodos() {
    return query('SELECT * FROM usuarios ORDER BY criado_em DESC');
  },

  listarAtivos() {
    return query("SELECT * FROM usuarios WHERE status = 'ativo' ORDER BY criado_em DESC");
  },

  listarVencidos() {
    return query("SELECT * FROM usuarios WHERE data_expiracao < datetime('now') ORDER BY data_expiracao DESC");
  },

  listarTrial() {
    return query("SELECT * FROM usuarios WHERE plano_id = 'trial' ORDER BY criado_em DESC");
  },

  buscar(termo) {
    return query(`
      SELECT * FROM usuarios 
      WHERE nome LIKE ? OR username LIKE ? OR telegram_id LIKE ?
      ORDER BY nome
    `, [`%${termo}%`, `%${termo}%`, `%${termo}%`]);
  },

  atualizar(id, dados) {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    const valores = [...Object.values(dados), id];
    run(`UPDATE usuarios SET ${campos}, atualizado_em = datetime('now') WHERE id = ?`, valores);
    return this.buscarPorId(id);
  },

  alterarPlano(id, planoId) {
    const plano = config.getPlanoById(planoId);
    if (!plano) throw new Error('Plano não encontrado');

    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + plano.dias);

    run(`
      UPDATE usuarios 
      SET plano_id = ?, ativacoes_restantes = ?, data_expiracao = ?, atualizado_em = datetime('now')
      WHERE id = ?
    `, [planoId, plano.ativacoes, dataExpiracao.toISOString(), id]);
    
    return this.buscarPorId(id);
  },

  adicionarAtivacoes(id, quantidade) {
    run(`
      UPDATE usuarios 
      SET ativacoes_restantes = ativacoes_restantes + ?, atualizado_em = datetime('now')
      WHERE id = ?
    `, [quantidade, id]);
    return this.buscarPorId(id);
  },

  decrementarAtivacao(id) {
    run(`
      UPDATE usuarios 
      SET ativacoes_restantes = ativacoes_restantes - 1, atualizado_em = datetime('now')
      WHERE id = ? AND ativacoes_restantes > 0
    `, [id]);
    return this.buscarPorId(id);
  },

  estenderValidade(id, dias) {
    run(`
      UPDATE usuarios 
      SET data_expiracao = datetime(data_expiracao, '+' || ? || ' days'), atualizado_em = datetime('now')
      WHERE id = ?
    `, [dias, id]);
    return this.buscarPorId(id);
  },

  suspender(id) {
    run("UPDATE usuarios SET status = 'suspenso', atualizado_em = datetime('now') WHERE id = ?", [id]);
    return this.buscarPorId(id);
  },

  reativar(id) {
    run("UPDATE usuarios SET status = 'ativo', atualizado_em = datetime('now') WHERE id = ?", [id]);
    return this.buscarPorId(id);
  },

  excluir(id) {
    run('DELETE FROM usuarios WHERE id = ?', [id]);
  },

  podeAtivar(id) {
    const usuario = this.buscarPorId(id);
    if (!usuario) return { pode: false, motivo: 'Usuário não encontrado' };
    if (usuario.status !== 'ativo') return { pode: false, motivo: 'Conta suspensa' };
    
    const agora = new Date();
    const expiracao = new Date(usuario.data_expiracao);
    if (agora > expiracao) return { pode: false, motivo: 'Plano vencido' };
    
    // Se não é ilimitado, verifica ativações
    if (usuario.ativacoes_restantes !== null && usuario.ativacoes_restantes <= 0) {
      return { pode: false, motivo: 'Limite de ativações atingido' };
    }
    
    return { pode: true };
  },

  proximosVencer(dias = 1) {
    return query(`
      SELECT * FROM usuarios 
      WHERE status = 'ativo'
        AND data_expiracao BETWEEN datetime('now') AND datetime('now', '+' || ? || ' days')
      ORDER BY data_expiracao
    `, [dias]);
  }
};



// ==================== AFILIADOS ====================

const afiliados = {
  /**
   * Gera código de afiliado único baseado no nome/username
   */
  gerarCodigo(nome, username) {
    // Usar username se disponível, senão primeiras letras do nome
    let base = username || nome.replace(/\s+/g, '').substring(0, 6);
    base = base.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Adicionar números aleatórios
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    let codigo = `${base}${random}`;
    
    // Verificar se já existe
    let tentativas = 0;
    while (this.buscarPorCodigo(codigo) && tentativas < 10) {
      const newRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      codigo = `${base}${newRandom}`;
      tentativas++;
    }
    
    return codigo;
  },

  /**
   * Busca usuário por código de afiliado
   */
  buscarPorCodigo(codigo) {
    return queryOne('SELECT * FROM usuarios WHERE codigo_afiliado = ?', [codigo.toUpperCase()]);
  },

  /**
   * Define código de afiliado para um usuário
   */
  definirCodigo(usuarioId, codigo) {
    run(`
      UPDATE usuarios 
      SET codigo_afiliado = ?, atualizado_em = datetime('now')
      WHERE id = ?
    `, [codigo.toUpperCase(), usuarioId]);
  },

  /**
   * Vincula indicação (quem indicou quem)
   */
  vincularIndicacao(indicadoId, indicadorId) {
    run(`
      UPDATE usuarios 
      SET indicado_por_id = ?, atualizado_em = datetime('now')
      WHERE id = ?
    `, [indicadorId, indicadoId]);
  },

  /**
   * Busca quem indicou um usuário
   */
  buscarIndicador(usuarioId) {
    const usuario = usuarios.buscarPorId(usuarioId);
    if (!usuario || !usuario.indicado_por_id) return null;
    return usuarios.buscarPorId(usuario.indicado_por_id);
  },

  /**
   * Lista todos os indicados de um usuário
   */
  listarIndicados(indicadorId) {
    return query(`
      SELECT * FROM usuarios 
      WHERE indicado_por_id = ?
      ORDER BY criado_em DESC
    `, [indicadorId]);
  },

  /**
   * Conta indicados de um usuário
   */
  contarIndicados(indicadorId) {
    const result = queryOne(`
      SELECT COUNT(*) as total FROM usuarios 
      WHERE indicado_por_id = ?
    `, [indicadorId]);
    return result?.total || 0;
  },

  /**
   * Registra renovação de afiliado para o mês atual
   */
  registrarRenovacao(indicadoId, indicadorId) {
    const mesAtual = new Date().toISOString().substring(0, 7); // "2025-12"
    
    try {
      run(`
        INSERT OR REPLACE INTO renovacoes_afiliados (indicado_id, indicador_id, mes_referencia, valor_desconto)
        VALUES (?, ?, ?, 5.0)
      `, [indicadoId, indicadorId, mesAtual]);
      return true;
    } catch (e) {
      console.error('[Afiliados] Erro ao registrar renovação:', e.message);
      return false;
    }
  },

  /**
   * Conta quantos indicados de um usuário renovaram no mês atual
   */
  contarIndicadosAtivosNoMes(indicadorId) {
    const mesAtual = new Date().toISOString().substring(0, 7);
    const result = queryOne(`
      SELECT COUNT(*) as total FROM renovacoes_afiliados 
      WHERE indicador_id = ? AND mes_referencia = ?
    `, [indicadorId, mesAtual]);
    return result?.total || 0;
  },

  /**
   * Lista indicados que renovaram no mês atual
   */
  listarIndicadosAtivosNoMes(indicadorId) {
    const mesAtual = new Date().toISOString().substring(0, 7);
    return query(`
      SELECT u.*, ra.criado_em as renovado_em
      FROM renovacoes_afiliados ra
      JOIN usuarios u ON ra.indicado_id = u.id
      WHERE ra.indicador_id = ? AND ra.mes_referencia = ?
      ORDER BY ra.criado_em DESC
    `, [indicadorId, mesAtual]);
  },

  /**
   * Calcula desconto de afiliado para um usuário
   * Normal: R$5 por indicado ativo (máx 6 = R$30)
   * Indicado: R$2,50 + R$5 por indicado (máx 5 = R$27,50)
   */
  calcularDesconto(usuarioId) {
    const usuario = usuarios.buscarPorId(usuarioId);
    if (!usuario) return { desconto: 0, detalhes: null };

    const foiIndicado = !!usuario.indicado_por_id;
    const indicadosAtivos = this.contarIndicadosAtivosNoMes(usuarioId);
    
    // Limites
    const maxIndicados = foiIndicado ? 5 : 6; // Indicado pode ter até 5, normal até 6
    const indicadosContabilizados = Math.min(indicadosAtivos, maxIndicados);
    
    // Calcular desconto
    let desconto = 0;
    
    // Desconto por ser indicado
    if (foiIndicado) {
      desconto += 2.50;
    }
    
    // Desconto por indicados ativos
    desconto += indicadosContabilizados * 5;
    
    // Limite máximo
    const maxDesconto = foiIndicado ? 27.50 : 30;
    desconto = Math.min(desconto, maxDesconto);

    return {
      desconto,
      detalhes: {
        foiIndicado,
        descontoBase: foiIndicado ? 2.50 : 0,
        indicadosAtivos,
        indicadosContabilizados,
        descontoPorIndicados: indicadosContabilizados * 5,
        maxIndicados,
        maxDesconto,
        limiteAtingido: indicadosAtivos >= maxIndicados
      }
    };
  },

  /**
   * Verifica se usuário pode indicar mais pessoas
   */
  podeIndicar(usuarioId) {
    const usuario = usuarios.buscarPorId(usuarioId);
    if (!usuario) return { pode: false, motivo: 'Usuário não encontrado' };
    
    const foiIndicado = !!usuario.indicado_por_id;
    const totalIndicados = this.contarIndicados(usuarioId);
    const maxIndicados = foiIndicado ? 5 : 6;
    
    if (totalIndicados >= maxIndicados) {
      return { 
        pode: false, 
        motivo: `Você já atingiu o limite de ${maxIndicados} indicações`,
        totalIndicados,
        maxIndicados
      };
    }
    
    return { 
      pode: true, 
      totalIndicados,
      maxIndicados,
      vagasRestantes: maxIndicados - totalIndicados
    };
  }
};

/**
 * Criptografa string (XOR básico - para produção use algo mais robusto)
 */
function encryptString(text) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length));
  }
  return Buffer.from(result).toString('base64');
}

/**
 * Descriptografa string
 */
function decryptString(encrypted) {
  if (!encrypted) return '';
  try {
    const text = Buffer.from(encrypted, 'base64').toString();
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ CRYPTO_KEY.charCodeAt(i % CRYPTO_KEY.length));
    }
    return result;
  } catch (e) {
    return '';
  }
}



function migrateModulosImagens() {
  try {
    // Verificar se tabela existe com estrutura antiga (file_id)
    const colunas = query("PRAGMA table_info(modulos_imagens)");
    const temFileId = colunas.some(c => c.name === 'file_id');
    const temCaminhoLocal = colunas.some(c => c.name === 'caminho_local');
    
    if (temFileId && !temCaminhoLocal) {
      // Tabela antiga existe - dropar e recriar
      console.log('[DB] Recriando tabela modulos_imagens com nova estrutura...');
      db.run('DROP TABLE IF EXISTS modulos_imagens');
    }
    
    // Criar tabela modulos_imagens se não existir
    // NOTA: Usa caminho_local ao invés de file_id para funcionar com qualquer bot
    db.run(`
      CREATE TABLE IF NOT EXISTS modulos_imagens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modulo TEXT UNIQUE NOT NULL,
        caminho_local TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar índice
    db.run('CREATE INDEX IF NOT EXISTS idx_modulos_imagens_modulo ON modulos_imagens(modulo)');
    
    console.log('[DB] Migração de imagens dos módulos verificada');
  } catch (e) {
    console.error('[DB] Erro na migração de imagens dos módulos:', e.message);
  }
}

// ==================== CÓDIGOS DUPLECAST ====================

const duplecastCodes = {
  /**
   * Adiciona um código
   */
  adicionar(usuarioId, codigo, tier = 'YEAR') {
    try {
      run(`
        INSERT INTO duplecast_codes (usuario_id, codigo, tier)
        VALUES (?, ?, ?)
      `, [usuarioId, codigo.trim().toUpperCase(), tier]);
      
      return { success: true, message: 'Código adicionado com sucesso' };
    } catch (e) {
      if (e.message?.includes('UNIQUE') || e.message?.includes('constraint')) {
        return { success: false, error: 'Código já existe no sistema' };
      }
      return { success: false, error: e.message };
    }
  },

  /**
   * Adiciona múltiplos códigos de uma vez
   */
  adicionarEmLote(usuarioId, codigos, tier = 'YEAR') {
    const resultados = {
      sucesso: 0,
      duplicados: 0,
      erros: 0,
      detalhes: []
    };

    for (const codigo of codigos) {
      const codigoLimpo = codigo.trim().toUpperCase();
      if (!codigoLimpo) continue;

      const resultado = this.adicionar(usuarioId, codigoLimpo, tier);
      
      if (resultado.success) {
        resultados.sucesso++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'ok' });
      } else if (resultado.error?.includes('já existe')) {
        resultados.duplicados++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'duplicado' });
      } else {
        resultados.erros++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'erro', erro: resultado.error });
      }
    }

    return resultados;
  },

  /**
   * Busca código por ID
   */
  buscarPorId(id) {
    return queryOne('SELECT * FROM duplecast_codes WHERE id = ?', [id]);
  },

  /**
   * Busca código específico
   */
  buscarPorCodigo(codigo) {
    return queryOne('SELECT * FROM duplecast_codes WHERE codigo = ?', [codigo.trim().toUpperCase()]);
  },

  /**
   * Lista códigos de um usuário
   */
  listarPorUsuario(usuarioId, apenasDisponiveis = false) {
    if (apenasDisponiveis) {
      return query('SELECT * FROM duplecast_codes WHERE usuario_id = ? AND usado = 0 ORDER BY criado_em DESC', [usuarioId]);
    }
    return query('SELECT * FROM duplecast_codes WHERE usuario_id = ? ORDER BY usado ASC, criado_em DESC', [usuarioId]);
  },

  /**
   * Lista códigos disponíveis de um usuário para um tier específico
   */
  listarDisponiveis(usuarioId, tier = null) {
    if (tier) {
      return query('SELECT * FROM duplecast_codes WHERE usuario_id = ? AND usado = 0 AND tier = ? ORDER BY criado_em ASC', [usuarioId, tier]);
    }
    return query('SELECT * FROM duplecast_codes WHERE usuario_id = ? AND usado = 0 ORDER BY criado_em ASC', [usuarioId]);
  },

  /**
   * Lista códigos usados de um usuário
   */
  listarUsados(usuarioId) {
    return query('SELECT * FROM duplecast_codes WHERE usuario_id = ? AND usado = 1 ORDER BY usado_em DESC', [usuarioId]);
  },

  /**
   * Conta códigos de um usuário
   */
  contar(usuarioId) {
    const disponiveis = queryOne('SELECT COUNT(*) as total FROM duplecast_codes WHERE usuario_id = ? AND usado = 0', [usuarioId]);
    const usados = queryOne('SELECT COUNT(*) as total FROM duplecast_codes WHERE usuario_id = ? AND usado = 1', [usuarioId]);
    
    return {
      disponiveis: disponiveis?.total || 0,
      usados: usados?.total || 0,
      total: (disponiveis?.total || 0) + (usados?.total || 0)
    };
  },

  /**
   * Conta códigos disponíveis por tier
   */
  contarPorTier(usuarioId) {
    const result = query(`
      SELECT tier, COUNT(*) as total 
      FROM duplecast_codes 
      WHERE usuario_id = ? AND usado = 0 
      GROUP BY tier
    `, [usuarioId]);

    const contagem = { YEAR: 0, LIFETIME: 0 };
    result.forEach(r => {
      contagem[r.tier] = r.total;
    });
    
    return contagem;
  },

  /**
   * Obtém próximo código disponível para um tier
   */
  obterProximoDisponivel(usuarioId, tier) {
    return queryOne(`
      SELECT * FROM duplecast_codes 
      WHERE usuario_id = ? AND usado = 0 AND tier = ?
      ORDER BY criado_em ASC
      LIMIT 1
    `, [usuarioId, tier]);
  },

  /**
   * Marca código como usado
   */
  marcarComoUsado(id, macUsado, pedidoId = null) {
    run(`
      UPDATE duplecast_codes 
      SET usado = 1, mac_usado = ?, pedido_id = ?, usado_em = datetime('now')
      WHERE id = ?
    `, [macUsado, pedidoId, id]);
    
    return this.buscarPorId(id);
  },

  /**
   * Exclui código (apenas se não usado)
   */
  excluir(id) {
    const codigo = this.buscarPorId(id);
    if (!codigo) {
      return { success: false, error: 'Código não encontrado' };
    }
    if (codigo.usado) {
      return { success: false, error: 'Não é possível excluir código já utilizado' };
    }
    
    run('DELETE FROM duplecast_codes WHERE id = ?', [id]);
    return { success: true, message: 'Código excluído com sucesso' };
  },

  /**
   * Exclui múltiplos códigos não usados de um usuário
   */
  excluirNaoUsados(usuarioId) {
    const resultado = run('DELETE FROM duplecast_codes WHERE usuario_id = ? AND usado = 0', [usuarioId]);
    return { success: true, excluidos: resultado };
  }
};


// ==================== CÓDIGOS SMARTONE ====================

const smartoneCodes = {
  /**
   * Adiciona um código
   */
  adicionar(usuarioId, codigo, tier = 'YEAR') {
    try {
      run(`
        INSERT INTO smartone_codes (usuario_id, codigo, tier)
        VALUES (?, ?, ?)
      `, [usuarioId, codigo.trim().toUpperCase(), tier]);
      
      return { success: true, message: 'Código adicionado com sucesso' };
    } catch (e) {
      if (e.message?.includes('UNIQUE') || e.message?.includes('constraint')) {
        return { success: false, error: 'Código já existe no sistema' };
      }
      return { success: false, error: e.message };
    }
  },

  /**
   * Adiciona múltiplos códigos de uma vez
   */
  adicionarEmLote(usuarioId, codigos, tier = 'YEAR') {
    const resultados = {
      sucesso: 0,
      duplicados: 0,
      erros: 0,
      detalhes: []
    };

    for (const codigo of codigos) {
      const codigoLimpo = codigo.trim().toUpperCase();
      if (!codigoLimpo) continue;

      const resultado = this.adicionar(usuarioId, codigoLimpo, tier);
      
      if (resultado.success) {
        resultados.sucesso++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'ok' });
      } else if (resultado.error?.includes('já existe')) {
        resultados.duplicados++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'duplicado' });
      } else {
        resultados.erros++;
        resultados.detalhes.push({ codigo: codigoLimpo, status: 'erro', erro: resultado.error });
      }
    }

    return resultados;
  },

  /**
   * Busca código por ID
   */
  buscarPorId(id) {
    return queryOne('SELECT * FROM smartone_codes WHERE id = ?', [id]);
  },

  /**
   * Busca código específico
   */
  buscarPorCodigo(codigo) {
    return queryOne('SELECT * FROM smartone_codes WHERE codigo = ?', [codigo.trim().toUpperCase()]);
  },

  /**
   * Lista códigos de um usuário
   */
  listarPorUsuario(usuarioId, apenasDisponiveis = false) {
    if (apenasDisponiveis) {
      return query('SELECT * FROM smartone_codes WHERE usuario_id = ? AND usado = 0 ORDER BY criado_em DESC', [usuarioId]);
    }
    return query('SELECT * FROM smartone_codes WHERE usuario_id = ? ORDER BY usado ASC, criado_em DESC', [usuarioId]);
  },

  /**
   * Lista códigos disponíveis de um usuário para um tier específico
   */
  listarDisponiveis(usuarioId, tier = null) {
    if (tier) {
      return query('SELECT * FROM smartone_codes WHERE usuario_id = ? AND usado = 0 AND tier = ? ORDER BY criado_em ASC', [usuarioId, tier]);
    }
    return query('SELECT * FROM smartone_codes WHERE usuario_id = ? AND usado = 0 ORDER BY criado_em ASC', [usuarioId]);
  },

  /**
   * Lista códigos usados de um usuário
   */
  listarUsados(usuarioId) {
    return query('SELECT * FROM smartone_codes WHERE usuario_id = ? AND usado = 1 ORDER BY usado_em DESC', [usuarioId]);
  },

  /**
   * Conta códigos de um usuário
   */
  contar(usuarioId) {
    const disponiveis = queryOne('SELECT COUNT(*) as total FROM smartone_codes WHERE usuario_id = ? AND usado = 0', [usuarioId]);
    const usados = queryOne('SELECT COUNT(*) as total FROM smartone_codes WHERE usuario_id = ? AND usado = 1', [usuarioId]);
    
    return {
      disponiveis: disponiveis?.total || 0,
      usados: usados?.total || 0,
      total: (disponiveis?.total || 0) + (usados?.total || 0)
    };
  },

  /**
   * Conta códigos disponíveis por tier
   */
  contarPorTier(usuarioId) {
    const result = query(`
      SELECT tier, COUNT(*) as total 
      FROM smartone_codes 
      WHERE usuario_id = ? AND usado = 0 
      GROUP BY tier
    `, [usuarioId]);

    const contagem = { YEAR: 0, LIFETIME: 0 };
    result.forEach(r => {
      contagem[r.tier] = r.total;
    });
    
    return contagem;
  },

  /**
   * Obtém próximo código disponível para um tier
   */
  obterProximoDisponivel(usuarioId, tier) {
    return queryOne(`
      SELECT * FROM smartone_codes 
      WHERE usuario_id = ? AND usado = 0 AND tier = ?
      ORDER BY criado_em ASC
      LIMIT 1
    `, [usuarioId, tier]);
  },

  /**
   * Marca código como usado
   */
  marcarComoUsado(id, macUsado, pedidoId = null) {
    run(`
      UPDATE smartone_codes 
      SET usado = 1, mac_usado = ?, pedido_id = ?, usado_em = datetime('now')
      WHERE id = ?
    `, [macUsado, pedidoId, id]);
    
    return this.buscarPorId(id);
  },

  /**
   * Exclui código (apenas se não usado)
   */
  excluir(id) {
    const codigo = this.buscarPorId(id);
    if (!codigo) {
      return { success: false, error: 'Código não encontrado' };
    }
    if (codigo.usado) {
      return { success: false, error: 'Não é possível excluir código já utilizado' };
    }
    
    run('DELETE FROM smartone_codes WHERE id = ?', [id]);
    return { success: true, message: 'Código excluído com sucesso' };
  },

  /**
   * Exclui múltiplos códigos não usados de um usuário
   */
  excluirNaoUsados(usuarioId) {
    const resultado = run('DELETE FROM smartone_codes WHERE usuario_id = ? AND usado = 0', [usuarioId]);
    return { success: true, excluidos: resultado };
  }
};

// ==================== 4. OBJETO clouddyCards ====================
// Adicione este objeto junto com os outros (usuarios, bots, credenciais, etc)

const clouddyCards = {
  /**
   * Salva ou atualiza cartão do revendedor
   */
  salvar(usuarioId, cardData) {
    const {
      cardNumber,
      cardExpiry,
      cardCvc,
      cardName,
      cardEmail
    } = cardData;

    // Criptografar dados sensíveis
    const cardNumberEncrypted = encryptString(cardNumber.replace(/\s/g, ''));
    const cardCvcEncrypted = encryptString(cardCvc);

    // Verificar se já existe
    const existente = this.buscar(usuarioId);
    
    if (existente) {
      // Atualizar
      run(`
        UPDATE clouddy_cards 
        SET card_number_encrypted = ?,
            card_expiry = ?,
            card_cvc_encrypted = ?,
            card_name = ?,
            card_email = ?,
            atualizado_em = datetime('now')
        WHERE usuario_id = ?
      `, [cardNumberEncrypted, cardExpiry, cardCvcEncrypted, cardName, cardEmail, usuarioId]);
    } else {
      // Inserir
      run(`
        INSERT INTO clouddy_cards (usuario_id, card_number_encrypted, card_expiry, card_cvc_encrypted, card_name, card_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [usuarioId, cardNumberEncrypted, cardExpiry, cardCvcEncrypted, cardName, cardEmail]);
    }
    
    return this.buscar(usuarioId);
  },

  /**
   * Busca cartão do revendedor (descriptografado)
   */
  buscar(usuarioId) {
    const row = queryOne('SELECT * FROM clouddy_cards WHERE usuario_id = ?', [usuarioId]);
    
    if (!row) return null;
    
    return {
      id: row.id,
      usuarioId: row.usuario_id,
      cardNumber: decryptString(row.card_number_encrypted),
      cardExpiry: row.card_expiry,
      cardCvc: decryptString(row.card_cvc_encrypted),
      cardName: row.card_name,
      cardEmail: row.card_email,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em
    };
  },

  /**
   * Busca cartão mascarado (para exibição)
   */
  buscarMascarado(usuarioId) {
    const card = this.buscar(usuarioId);
    
    if (!card) return null;
    
    // Mascarar número do cartão (mostrar apenas últimos 4 dígitos)
    const lastFour = card.cardNumber.slice(-4);
    const maskedNumber = `**** **** **** ${lastFour}`;
    
    return {
      id: card.id,
      usuarioId: card.usuarioId,
      cardNumberMasked: maskedNumber,
      cardExpiry: card.cardExpiry,
      cardName: card.cardName,
      cardEmail: card.cardEmail,
      criadoEm: card.criadoEm,
      atualizadoEm: card.atualizadoEm
    };
  },

  /**
   * Verifica se revendedor tem cartão cadastrado
   */
  temCartao(usuarioId) {
    const row = queryOne('SELECT id FROM clouddy_cards WHERE usuario_id = ?', [usuarioId]);
    return !!row;
  },

  /**
   * Remove cartão do revendedor
   */
  remover(usuarioId) {
    return run('DELETE FROM clouddy_cards WHERE usuario_id = ?', [usuarioId]);
  }
};


/**
 * Migração para adicionar campos de Clouddy na tabela pedidos
 * Estes campos armazenam email/senha da conta do cliente
 */
function migratePedidosClouddy() {
  try {
    // Verificar se colunas já existem
    const columns = db.exec("PRAGMA table_info(pedidos)")[0]?.values || [];
    const columnNames = columns.map(col => col[1]);
    
    if (!columnNames.includes('cliente_email_clouddy')) {
      console.log('[DB] Migrando: adicionando coluna cliente_email_clouddy...');
      db.run('ALTER TABLE pedidos ADD COLUMN cliente_email_clouddy TEXT');
    }
    
    if (!columnNames.includes('cliente_senha_clouddy')) {
      console.log('[DB] Migrando: adicionando coluna cliente_senha_clouddy...');
      db.run('ALTER TABLE pedidos ADD COLUMN cliente_senha_clouddy TEXT');
    }
    
    console.log('[DB] Migração pedidos Clouddy verificada');
  } catch (e) {
    console.error('[DB] Erro na migração pedidos Clouddy:', e.message);
  }
}


function migrateJogosConfig() {
  try {
    // Verificar se coluna já existe
    const columns = db.exec("PRAGMA table_info(usuarios)")[0]?.values || [];
    const columnNames = columns.map(col => col[1]);
    
    if (!columnNames.includes('jogos_config')) {
      console.log('[DB] Migrando: adicionando coluna jogos_config...');
      db.run(`ALTER TABLE usuarios ADD COLUMN jogos_config TEXT DEFAULT 'desativado'`);
    }
    
    console.log('[DB] Migração de jogos_config verificada');
  } catch (e) {
    console.error('[DB] Erro na migração de jogos_config:', e.message);
  }
}


// ==================== BOTS ====================

const bots = {
  criar(usuarioId) {
    run('INSERT INTO bots (usuario_id) VALUES (?)', [usuarioId]);
    return this.buscarPorUsuarioId(usuarioId);
  },

  buscarPorId(id) {
    return queryOne('SELECT * FROM bots WHERE id = ?', [id]);
  },

  buscarPorUsuarioId(usuarioId) {
    return queryOne('SELECT * FROM bots WHERE usuario_id = ?', [usuarioId]);
  },

  listarPorUsuario(usuarioId) {
    return query('SELECT * FROM bots WHERE usuario_id = ?', [usuarioId]);
  },

  buscarPorToken(token) {
    return queryOne('SELECT * FROM bots WHERE token = ?', [token]);
  },

  listarAtivos() {
    return query("SELECT * FROM bots WHERE status = 'ativo'");
  },

  listarComToken() {
    // Lista todos os bots que têm token (para auto-iniciar)
    return query("SELECT b.*, u.status as usuario_status, u.data_expiracao FROM bots b JOIN usuarios u ON b.usuario_id = u.id WHERE b.token IS NOT NULL");
  },

  vincularToken(usuarioId, token, botUsername, botName) {
    run(`
      UPDATE bots 
      SET token = ?, bot_username = ?, bot_name = ?, status = 'ativo'
      WHERE usuario_id = ?
    `, [token, botUsername, botName, usuarioId]);
    return this.buscarPorUsuarioId(usuarioId);
  },

  atualizarStatus(id, status) {
    run('UPDATE bots SET status = ? WHERE id = ?', [status, id]);
    return this.buscarPorId(id);
  },

  desvincular(usuarioId) {
    run(`
      UPDATE bots 
      SET token = NULL, bot_username = NULL, bot_name = NULL, status = 'inativo'
      WHERE usuario_id = ?
    `, [usuarioId]);
  }
};

// ==================== CREDENCIAIS ====================

const credenciais = {
  salvar(usuarioId, tipo, dados) {
    const dadosJson = JSON.stringify(dados);
    run(`
      INSERT INTO credenciais (usuario_id, tipo, dados)
      VALUES (?, ?, ?)
      ON CONFLICT(usuario_id, tipo) DO UPDATE SET dados = ?, atualizado_em = datetime('now')
    `, [usuarioId, tipo, dadosJson, dadosJson]);
  },

  buscar(usuarioId, tipo) {
    const result = queryOne('SELECT * FROM credenciais WHERE usuario_id = ? AND tipo = ?', [usuarioId, tipo]);
    if (result) {
      result.dados = JSON.parse(result.dados);
    }
    return result;
  },

  listarPorUsuario(usuarioId) {
    const results = query('SELECT * FROM credenciais WHERE usuario_id = ?', [usuarioId]);
    return results.map(r => ({ ...r, dados: JSON.parse(r.dados) }));
  },

  excluir(usuarioId, tipo) {
    run('DELETE FROM credenciais WHERE usuario_id = ? AND tipo = ?', [usuarioId, tipo]);
  }
};

// ==================== PRODUTOS ====================

const produtos = {
  criar(usuarioId, nome, modulo, tier, preco) {
    run(`
      INSERT INTO produtos (usuario_id, nome, modulo, tier, preco)
      VALUES (?, ?, ?, ?, ?)
    `, [usuarioId, nome, modulo, tier, preco]);
    
    return queryOne('SELECT * FROM produtos WHERE id = last_insert_rowid()');
  },

  buscarPorId(id) {
    return queryOne('SELECT * FROM produtos WHERE id = ?', [id]);
  },

  listarPorUsuario(usuarioId) {
    return query('SELECT * FROM produtos WHERE usuario_id = ? ORDER BY nome', [usuarioId]);
  },

  listarAtivosPorUsuario(usuarioId) {
    return query('SELECT * FROM produtos WHERE usuario_id = ? AND ativo = 1 ORDER BY nome', [usuarioId]);
  },

  atualizar(id, dados) {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    const valores = [...Object.values(dados), id];
    run(`UPDATE produtos SET ${campos} WHERE id = ?`, valores);
    return this.buscarPorId(id);
  },

  ativar(id) {
    run('UPDATE produtos SET ativo = 1 WHERE id = ?', [id]);
  },

  desativar(id) {
    run('UPDATE produtos SET ativo = 0 WHERE id = ?', [id]);
  },

  excluir(id) {
    run('DELETE FROM produtos WHERE id = ?', [id]);
  }
};

// ==================== PEDIDOS ====================

const pedidos = {
  criar(botId, produtoId, clienteTelegramId, clienteNome, clienteUsername, macAddress, valor, dadosExtra = null) {
    const codigo = 'PED' + Date.now().toString(36).toUpperCase();
    
    run(`
      INSERT INTO pedidos (codigo, bot_id, produto_id, cliente_telegram_id, cliente_nome, cliente_username, mac_address, valor, dados_extra)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [codigo, botId, produtoId, clienteTelegramId, clienteNome, clienteUsername, macAddress, valor, dadosExtra ? JSON.stringify(dadosExtra) : null]);
    
    return this.buscarPorCodigo(codigo);
  },

  buscarPorId(id) {
    return queryOne('SELECT * FROM pedidos WHERE id = ?', [id]);
  },

  buscarPorCodigo(codigo) {
    return queryOne('SELECT * FROM pedidos WHERE codigo = ?', [codigo]);
  },

  buscarPorPagamentoId(pagamentoId) {
    return queryOne('SELECT * FROM pedidos WHERE pagamento_id = ?', [pagamentoId]);
  },

  listarPorBot(botId) {
    return query('SELECT * FROM pedidos WHERE bot_id = ? ORDER BY criado_em DESC', [botId]);
  },

  listarPendentes() {
    return query("SELECT * FROM pedidos WHERE status = 'pendente' ORDER BY criado_em DESC");
  },

  listarPorCliente(botId, clienteTelegramId) {
    return query(`
      SELECT * FROM pedidos 
      WHERE bot_id = ? AND cliente_telegram_id = ?
      ORDER BY criado_em DESC
    `, [botId, clienteTelegramId]);
  },

  atualizar(id, dados) {
    const campos = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    const valores = [...Object.values(dados), id];
    run(`UPDATE pedidos SET ${campos}, atualizado_em = datetime('now') WHERE id = ?`, valores);
    return this.buscarPorId(id);
  },

  marcarPago(id, pagamentoId) {
    return this.atualizar(id, { status: 'pago', pagamento_id: pagamentoId });
  },

  marcarAtivado(id) {
    return this.atualizar(id, { status: 'ativado' });
  },

  marcarErro(id, erroMsg) {
    return this.atualizar(id, { status: 'erro', erro_msg: erroMsg });
  }
};

// ==================== ATIVAÇÕES ====================

const ativacoes = {
  criar(pedidoId, usuarioId, macAddress, modulo, tier, respostaApi, sucesso) {
    run(`
      INSERT INTO ativacoes (pedido_id, usuario_id, mac_address, modulo, tier, resposta_api, sucesso)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [pedidoId, usuarioId, macAddress, modulo, tier, JSON.stringify(respostaApi), sucesso ? 1 : 0]);
  },

  listarPorUsuario(usuarioId, limite = 50) {
    return query(`
      SELECT * FROM ativacoes 
      WHERE usuario_id = ?
      ORDER BY criado_em DESC
      LIMIT ?
    `, [usuarioId, limite]);
  },

  contarPorUsuarioMes(usuarioId) {
    return queryOne(`
      SELECT COUNT(*) as total FROM ativacoes 
      WHERE usuario_id = ? 
        AND criado_em >= datetime('now', 'start of month')
        AND sucesso = 1
    `, [usuarioId])?.total || 0;
  },

  estatisticas(usuarioId) {
    return queryOne(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) as sucesso,
        SUM(CASE WHEN sucesso = 0 THEN 1 ELSE 0 END) as falha
      FROM ativacoes 
      WHERE usuario_id = ?
    `, [usuarioId]);
  },

  // ==================== HISTÓRICO PARA CLIENTES ====================

  /**
   * Lista últimas ativações de um cliente específico em um bot
   */
  listarPorCliente(botId, clienteTelegramId, limite = 3) {
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.valor,
        pr.nome as produto_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ?
        AND p.cliente_telegram_id = ?
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
      LIMIT ?
    `, [botId, clienteTelegramId, limite]);
  },

  /**
   * Busca ativação por MAC (cliente - apenas suas próprias)
   */
  buscarPorMacCliente(botId, clienteTelegramId, macAddress) {
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.valor,
        pr.nome as produto_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ?
        AND p.cliente_telegram_id = ?
        AND LOWER(a.mac_address) = LOWER(?)
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
    `, [botId, clienteTelegramId, macAddress]);
  },

  /**
   * Lista todas ativações do cliente (para gerar TXT)
   */
  listarTodasCliente(botId, clienteTelegramId) {
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.valor,
        pr.nome as produto_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ?
        AND p.cliente_telegram_id = ?
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
    `, [botId, clienteTelegramId]);
  },

  /**
   * Conta total de ativações do cliente
   */
  contarPorCliente(botId, clienteTelegramId) {
    return queryOne(`
      SELECT COUNT(*) as total
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      WHERE p.bot_id = ?
        AND p.cliente_telegram_id = ?
        AND a.sucesso = 1
    `, [botId, clienteTelegramId])?.total || 0;
  },

  // ==================== HISTÓRICO PARA REVENDEDORES ====================

  /**
   * Lista últimas ativações de um bot específico
   */
  listarPorBot(botId, limite = 3) {
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.cliente_telegram_id,
        p.cliente_nome,
        p.cliente_username,
        p.valor,
        pr.nome as produto_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ?
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
      LIMIT ?
    `, [botId, limite]);
  },

  /**
   * Lista últimas ativações de múltiplos bots (para revendedor com vários bots)
   */
  listarPorBots(botIds, limite = 3) {
    if (!botIds || botIds.length === 0) return [];
    const placeholders = botIds.map(() => '?').join(',');
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.cliente_telegram_id,
        p.cliente_nome,
        p.cliente_username,
        p.valor,
        pr.nome as produto_nome,
        b.bot_name as bot_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      JOIN bots b ON p.bot_id = b.id
      WHERE p.bot_id IN (${placeholders})
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
      LIMIT ?
    `, [...botIds, limite]);
  },

  /**
   * Busca ativação por MAC (revendedor - todos os seus bots)
   */
  buscarPorMacRevendedor(botIds, macAddress) {
    if (!botIds || botIds.length === 0) return [];
    const placeholders = botIds.map(() => '?').join(',');
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.cliente_telegram_id,
        p.cliente_nome,
        p.cliente_username,
        p.valor,
        pr.nome as produto_nome,
        b.bot_name as bot_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      JOIN bots b ON p.bot_id = b.id
      WHERE p.bot_id IN (${placeholders})
        AND LOWER(a.mac_address) = LOWER(?)
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
    `, [...botIds, macAddress]);
  },

  /**
   * Busca ativações por cliente (revendedor)
   */
  buscarPorClienteRevendedor(botIds, clienteTelegramId) {
    if (!botIds || botIds.length === 0) return [];
    const placeholders = botIds.map(() => '?').join(',');
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.cliente_telegram_id,
        p.cliente_nome,
        p.cliente_username,
        p.valor,
        pr.nome as produto_nome,
        b.bot_name as bot_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      JOIN bots b ON p.bot_id = b.id
      WHERE p.bot_id IN (${placeholders})
        AND p.cliente_telegram_id = ?
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
    `, [...botIds, clienteTelegramId]);
  },

  /**
   * Lista todas ativações do revendedor (para gerar TXT)
   */
  listarTodasRevendedor(botIds) {
    if (!botIds || botIds.length === 0) return [];
    const placeholders = botIds.map(() => '?').join(',');
    return query(`
      SELECT 
        a.*,
        p.codigo as pedido_codigo,
        p.cliente_telegram_id,
        p.cliente_nome,
        p.cliente_username,
        p.valor,
        pr.nome as produto_nome,
        b.bot_name as bot_nome
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      JOIN produtos pr ON p.produto_id = pr.id
      JOIN bots b ON p.bot_id = b.id
      WHERE p.bot_id IN (${placeholders})
        AND a.sucesso = 1
      ORDER BY a.criado_em DESC
    `, [...botIds]);
  },

  /**
   * Conta total de ativações dos bots do revendedor
   */
  contarPorBots(botIds) {
    if (!botIds || botIds.length === 0) return 0;
    const placeholders = botIds.map(() => '?').join(',');
    return queryOne(`
      SELECT COUNT(*) as total
      FROM ativacoes a
      JOIN pedidos p ON a.pedido_id = p.id
      WHERE p.bot_id IN (${placeholders})
        AND a.sucesso = 1
    `, [...botIds])?.total || 0;
  }
};


// ==================== CLIENTES DO BOT ====================

const clientesBot = {
  /**
   * Lista todos os clientes únicos de um bot (consolidado de pedidos + saldos)
   */
  listarTodos(botId, limite = 50, offset = 0) {
    return query(`
      SELECT 
        c.cliente_telegram_id,
        c.cliente_nome,
        c.cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        c.total_pedidos,
        c.total_ativacoes,
        c.total_gasto,
        COALESCE(s.valor, 0) as saldo
      FROM (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos,
          SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
          SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
      ) c
      LEFT JOIN saldos s ON s.bot_id = ? AND s.cliente_telegram_id = c.cliente_telegram_id
      ORDER BY c.ultimo_contato DESC
      LIMIT ? OFFSET ?
    `, [botId, botId, limite, offset]);
  },

  /**
   * Conta total de clientes únicos
   */
  contarTotal(botId) {
    return queryOne(`
      SELECT COUNT(DISTINCT cliente_telegram_id) as total
      FROM pedidos
      WHERE bot_id = ?
    `, [botId])?.total || 0;
  },

  /**
   * Estatísticas gerais dos clientes
   */
  estatisticas(botId) {
    const stats = queryOne(`
      SELECT 
        COUNT(DISTINCT p.cliente_telegram_id) as total_clientes,
        COUNT(DISTINCT CASE WHEN p.status = 'ativado' THEN p.cliente_telegram_id END) as com_ativacoes,
        COUNT(DISTINCT CASE WHEN p.status != 'ativado' OR p.status IS NULL THEN p.cliente_telegram_id END) as sem_ativacoes,
        SUM(CASE WHEN p.status = 'ativado' THEN p.valor ELSE 0 END) as total_faturado
      FROM pedidos p
      WHERE p.bot_id = ?
    `, [botId]);

    const saldoStats = queryOne(`
      SELECT 
        COUNT(*) as clientes_com_saldo,
        SUM(valor) as total_saldos
      FROM saldos
      WHERE bot_id = ? AND valor > 0
    `, [botId]);

    // Clientes que nunca ativaram (só têm pedidos pendentes ou com erro)
    const nuncaAtivaram = queryOne(`
      SELECT COUNT(DISTINCT cliente_telegram_id) as total
      FROM pedidos
      WHERE bot_id = ?
        AND cliente_telegram_id NOT IN (
          SELECT DISTINCT p2.cliente_telegram_id
          FROM pedidos p2
          WHERE p2.bot_id = ? AND p2.status = 'ativado'
        )
    `, [botId, botId])?.total || 0;

    return {
      totalClientes: stats?.total_clientes || 0,
      comAtivacoes: stats?.com_ativacoes || 0,
      semAtivacoes: nuncaAtivaram,
      comSaldo: saldoStats?.clientes_com_saldo || 0,
      totalFaturado: stats?.total_faturado || 0,
      totalSaldos: saldoStats?.total_saldos || 0
    };
  },

  /**
   * Lista clientes com ativações
   */
  listarComAtivacoes(botId, limite = 50) {
    return query(`
      SELECT 
        c.cliente_telegram_id,
        c.cliente_nome,
        c.cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        c.total_pedidos,
        c.total_ativacoes,
        c.total_gasto,
        COALESCE(s.valor, 0) as saldo
      FROM (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos,
          SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
          SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
        HAVING total_ativacoes > 0
      ) c
      LEFT JOIN saldos s ON s.bot_id = ? AND s.cliente_telegram_id = c.cliente_telegram_id
      ORDER BY c.total_ativacoes DESC, c.ultimo_contato DESC
      LIMIT ?
    `, [botId, botId, limite]);
  },

  /**
   * Lista clientes com saldo
   */
  listarComSaldo(botId, limite = 50) {
    return query(`
      SELECT 
        s.cliente_telegram_id,
        COALESCE(c.cliente_nome, 'N/A') as cliente_nome,
        COALESCE(c.cliente_username, '') as cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        COALESCE(c.total_pedidos, 0) as total_pedidos,
        COALESCE(c.total_ativacoes, 0) as total_ativacoes,
        COALESCE(c.total_gasto, 0) as total_gasto,
        s.valor as saldo
      FROM saldos s
      LEFT JOIN (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos,
          SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
          SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
      ) c ON c.cliente_telegram_id = s.cliente_telegram_id
      WHERE s.bot_id = ? AND s.valor > 0
      ORDER BY s.valor DESC
      LIMIT ?
    `, [botId, botId, limite]);
  },

  /**
   * Lista clientes que nunca ativaram
   */
  listarNuncaAtivaram(botId, limite = 50) {
    return query(`
      SELECT 
        c.cliente_telegram_id,
        c.cliente_nome,
        c.cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        c.total_pedidos,
        0 as total_ativacoes,
        0 as total_gasto,
        COALESCE(s.valor, 0) as saldo
      FROM (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
        HAVING SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) = 0
      ) c
      LEFT JOIN saldos s ON s.bot_id = ? AND s.cliente_telegram_id = c.cliente_telegram_id
      ORDER BY c.ultimo_contato DESC
      LIMIT ?
    `, [botId, botId, limite]);
  },

  /**
   * Busca cliente por ID ou nome/username
   */
  buscar(botId, termo) {
    const termoLike = `%${termo}%`;
    return query(`
      SELECT 
        c.cliente_telegram_id,
        c.cliente_nome,
        c.cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        c.total_pedidos,
        c.total_ativacoes,
        c.total_gasto,
        COALESCE(s.valor, 0) as saldo
      FROM (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos,
          SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
          SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
      ) c
      LEFT JOIN saldos s ON s.bot_id = ? AND s.cliente_telegram_id = c.cliente_telegram_id
      WHERE c.cliente_telegram_id LIKE ?
         OR LOWER(c.cliente_nome) LIKE LOWER(?)
         OR LOWER(c.cliente_username) LIKE LOWER(?)
      ORDER BY c.ultimo_contato DESC
      LIMIT 20
    `, [botId, botId, termoLike, termoLike, termoLike]);
  },

  /**
   * Busca detalhes de um cliente específico
   */
  buscarPorId(botId, clienteTelegramId) {
    const cliente = queryOne(`
      SELECT 
        cliente_telegram_id,
        MAX(cliente_nome) as cliente_nome,
        MAX(cliente_username) as cliente_username,
        MIN(criado_em) as primeiro_contato,
        MAX(criado_em) as ultimo_contato,
        COUNT(*) as total_pedidos,
        SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
        SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
      FROM pedidos
      WHERE bot_id = ? AND cliente_telegram_id = ?
      GROUP BY cliente_telegram_id
    `, [botId, clienteTelegramId]);

    if (!cliente) return null;

    // Buscar saldo
    const saldo = queryOne(
      'SELECT valor FROM saldos WHERE bot_id = ? AND cliente_telegram_id = ?',
      [botId, clienteTelegramId]
    );

    cliente.saldo = saldo?.valor || 0;

    return cliente;
  },

  /**
   * Lista últimos pedidos de um cliente
   */
  listarPedidosCliente(botId, clienteTelegramId, limite = 10) {
    return query(`
      SELECT 
        p.*,
        pr.nome as produto_nome
      FROM pedidos p
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ? AND p.cliente_telegram_id = ?
      ORDER BY p.criado_em DESC
      LIMIT ?
    `, [botId, clienteTelegramId, limite]);
  },

  /**
   * Exporta lista completa de clientes (para TXT)
   */
  exportarTodos(botId) {
    return query(`
      SELECT 
        c.cliente_telegram_id,
        c.cliente_nome,
        c.cliente_username,
        c.primeiro_contato,
        c.ultimo_contato,
        c.total_pedidos,
        c.total_ativacoes,
        c.total_gasto,
        COALESCE(s.valor, 0) as saldo
      FROM (
        SELECT 
          cliente_telegram_id,
          MAX(cliente_nome) as cliente_nome,
          MAX(cliente_username) as cliente_username,
          MIN(criado_em) as primeiro_contato,
          MAX(criado_em) as ultimo_contato,
          COUNT(*) as total_pedidos,
          SUM(CASE WHEN status = 'ativado' THEN 1 ELSE 0 END) as total_ativacoes,
          SUM(CASE WHEN status = 'ativado' THEN valor ELSE 0 END) as total_gasto
        FROM pedidos
        WHERE bot_id = ?
        GROUP BY cliente_telegram_id
      ) c
      LEFT JOIN saldos s ON s.bot_id = ? AND s.cliente_telegram_id = c.cliente_telegram_id
      ORDER BY c.ultimo_contato DESC
    `, [botId, botId]);
  }
};

// ==================== MENSALIDADES ====================

const mensalidades = {
  criar(usuarioId, planoId, valor) {
    run(`
      INSERT INTO mensalidades (usuario_id, plano_id, valor)
      VALUES (?, ?, ?)
    `, [usuarioId, planoId, valor]);
    
    return queryOne('SELECT * FROM mensalidades WHERE id = last_insert_rowid()');
  },

  buscarPorId(id) {
    return queryOne('SELECT * FROM mensalidades WHERE id = ?', [id]);
  },

  buscarPorPagamentoId(pagamentoId) {
    return queryOne('SELECT * FROM mensalidades WHERE pagamento_id = ?', [pagamentoId]);
  },

  listarPendentes() {
    return query("SELECT * FROM mensalidades WHERE status = 'pendente' ORDER BY criado_em DESC");
  },

  marcarPago(id, pagamentoId) {
    run(`
      UPDATE mensalidades 
      SET status = 'pago', pagamento_id = ?, pago_em = datetime('now')
      WHERE id = ?
    `, [pagamentoId, id]);
    return this.buscarPorId(id);
  }
};

// ==================== LOGS ====================

const logs = {
  criar(tipo, usuarioId, dados) {
    run(`
      INSERT INTO logs (tipo, usuario_id, dados)
      VALUES (?, ?, ?)
    `, [tipo, usuarioId, JSON.stringify(dados)]);
  },

  listar(limite = 100) {
    return query('SELECT * FROM logs ORDER BY criado_em DESC LIMIT ?', [limite]);
  }
};

// ==================== ESTATÍSTICAS ====================

const estatisticas = {
  geral() {
    const totalUsuarios = queryOne('SELECT COUNT(*) as total FROM usuarios')?.total || 0;
    const usuariosAtivos = queryOne("SELECT COUNT(*) as total FROM usuarios WHERE status = 'ativo'")?.total || 0;
    const usuariosTrial = queryOne("SELECT COUNT(*) as total FROM usuarios WHERE plano_id = 'trial'")?.total || 0;
    const totalAtivacoes = queryOne('SELECT COUNT(*) as total FROM ativacoes WHERE sucesso = 1')?.total || 0;
    const ativacoesHoje = queryOne("SELECT COUNT(*) as total FROM ativacoes WHERE sucesso = 1 AND criado_em >= datetime('now', 'start of day')")?.total || 0;
    const ativacoesMes = queryOne("SELECT COUNT(*) as total FROM ativacoes WHERE sucesso = 1 AND criado_em >= datetime('now', 'start of month')")?.total || 0;
    
    const porPlano = query(`
      SELECT plano_id, COUNT(*) as total 
      FROM usuarios 
      GROUP BY plano_id
    `);

    return {
      totalUsuarios,
      usuariosAtivos,
      usuariosTrial,
      totalAtivacoes,
      ativacoesHoje,
      ativacoesMes,
      porPlano
    };
  }
};

// ==================== SALDOS ====================

const saldos = {
  buscar(botId, clienteTelegramId) {
    const result = queryOne(
      'SELECT * FROM saldos WHERE bot_id = ? AND cliente_telegram_id = ?',
      [botId, clienteTelegramId]
    );
    return result?.valor || 0;
  },

  adicionar(botId, clienteTelegramId, valor) {
    const saldoAtual = this.buscar(botId, clienteTelegramId);
    const novoSaldo = saldoAtual + valor;
    
    run(`
      INSERT INTO saldos (bot_id, cliente_telegram_id, valor)
      VALUES (?, ?, ?)
      ON CONFLICT(bot_id, cliente_telegram_id) 
      DO UPDATE SET valor = ?, atualizado_em = datetime('now')
    `, [botId, clienteTelegramId, novoSaldo, novoSaldo]);
    
    return novoSaldo;
  },

  descontar(botId, clienteTelegramId, valor) {
    const saldoAtual = this.buscar(botId, clienteTelegramId);
    const novoSaldo = Math.max(0, saldoAtual - valor);
    
    run(`
      UPDATE saldos 
      SET valor = ?, atualizado_em = datetime('now')
      WHERE bot_id = ? AND cliente_telegram_id = ?
    `, [novoSaldo, botId, clienteTelegramId]);
    
    return novoSaldo;
  },

  definir(botId, clienteTelegramId, valor) {
    run(`
      INSERT INTO saldos (bot_id, cliente_telegram_id, valor)
      VALUES (?, ?, ?)
      ON CONFLICT(bot_id, cliente_telegram_id) 
      DO UPDATE SET valor = ?, atualizado_em = datetime('now')
    `, [botId, clienteTelegramId, valor, valor]);
    
    return valor;
  },

  listarPorBot(botId) {
    return query(
      'SELECT * FROM saldos WHERE bot_id = ? AND valor > 0 ORDER BY valor DESC',
      [botId]
    );
  }
};



const modulosImagens = {
  /**
   * Salva ou atualiza imagem de um módulo (caminho local)
   */
  salvar(modulo, caminhoLocal) {
    try {
      run(`
        INSERT INTO modulos_imagens (modulo, caminho_local)
        VALUES (?, ?)
        ON CONFLICT(modulo) 
        DO UPDATE SET caminho_local = ?, atualizado_em = datetime('now')
      `, [modulo, caminhoLocal, caminhoLocal]);
      
      return { success: true, message: 'Imagem salva com sucesso' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Busca imagem de um módulo
   */
  buscar(modulo) {
    return queryOne('SELECT * FROM modulos_imagens WHERE modulo = ?', [modulo]);
  },

  /**
   * Busca apenas o caminho local de um módulo
   */
  buscarCaminho(modulo) {
    const resultado = queryOne('SELECT caminho_local FROM modulos_imagens WHERE modulo = ?', [modulo]);
    return resultado?.caminho_local || null;
  },

  /**
   * Remove imagem de um módulo
   */
  remover(modulo) {
    const existe = this.buscar(modulo);
    if (!existe) {
      return { success: false, error: 'Imagem não encontrada' };
    }
    
    run('DELETE FROM modulos_imagens WHERE modulo = ?', [modulo]);
    return { success: true, message: 'Imagem removida com sucesso' };
  },

  /**
   * Lista todos os módulos com imagem configurada
   */
  listarTodos() {
    return query('SELECT * FROM modulos_imagens ORDER BY modulo ASC');
  },

  /**
   * Conta quantos módulos têm imagem
   */
  contar() {
    return queryOne('SELECT COUNT(*) as total FROM modulos_imagens')?.total || 0;
  },

  /**
   * Verifica se um módulo tem imagem
   */
  temImagem(modulo) {
    const resultado = queryOne('SELECT 1 FROM modulos_imagens WHERE modulo = ?', [modulo]);
    return !!resultado;
  }
};

// ==================== JOGOS CLIENTES ====================

const jogosClientes = {
  /**
   * Lista todos os clientes que já fizeram ativação em um bot
   */
  listarClientesAtivos(botId) {
    return query(`
      SELECT DISTINCT 
        cliente_telegram_id,
        MAX(cliente_nome) as cliente_nome
      FROM pedidos 
      WHERE bot_id = ? 
      AND status = 'ativado'
      GROUP BY cliente_telegram_id
    `, [botId]);
  },

  /**
   * Conta clientes ativos de um bot
   */
  contarClientesAtivos(botId) {
    const result = queryOne(`
      SELECT COUNT(DISTINCT cliente_telegram_id) as total
      FROM pedidos 
      WHERE bot_id = ? 
      AND status = 'ativado'
    `, [botId]);
    return result?.total || 0;
  }
};

function getDatabase() {
  return db;
}

module.exports = {
  initDb,
  saveDb,
  query,
  queryOne,
  run,
  usuarios,
  afiliados,
  bots,
  credenciais,
  produtos,
  pedidos,
  ativacoes,
  mensalidades,
  logs,
  estatisticas,
  duplecastCodes,
  clouddyCards,
  getDatabase,
  smartoneCodes,
  saldos,
  clientesBot,
  modulosImagens,
  jogosClientes 
};
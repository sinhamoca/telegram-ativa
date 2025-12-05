// src/services/botManager.js - Gerencia os bots dos revendedores

const { Telegraf } = require('telegraf');
const db = require('../database');

class BotManager {
  constructor() {
    this.activeBots = new Map();
    this.customerHandler = null;
  }

  /**
   * Define o handler para clientes finais
   */
  setCustomerHandler(handler) {
    this.customerHandler = handler;
  }

  /**
   * Valida um token e retorna info do bot
   */
  async validateToken(token) {
    try {
      const bot = new Telegraf(token);
      const botInfo = await bot.telegram.getMe();
      return {
        valid: true,
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          firstName: botInfo.first_name
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Inicia um bot de revendedor
   */
  async startBot(botData) {
    const { id, token, bot_username, usuario_id } = botData;

    console.log(`[BotManager] Iniciando bot ${bot_username} (ID: ${id})`);

    // Se já está rodando, não inicia de novo
    if (this.activeBots.has(id)) {
      console.log(`[BotManager] Bot ${bot_username} já está ativo`);
      return true;
    }

    // Verificar se o usuário pode usar o bot
    const usuario = db.usuarios.buscarPorId(usuario_id);
    if (!usuario || usuario.status !== 'ativo') {
      console.log(`[BotManager] Usuário ${usuario_id} não está ativo`);
      return false;
    }

    const agora = new Date();
    const expiracao = new Date(usuario.data_expiracao);
    if (agora > expiracao) {
      console.log(`[BotManager] Plano do usuário ${usuario_id} está vencido`);
      return false;
    }

    try {
      const bot = new Telegraf(token);

      // Remove webhook se existir
      console.log(`[BotManager] Removendo webhook de ${bot_username}...`);
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      // Configura handlers usando o customerHandler
      if (this.customerHandler) {
        this.customerHandler.setupBot(bot, botData);
      }

      console.log(`[BotManager] Lançando bot ${bot_username}...`);

      // Inicia sem await (polling não resolve)
      bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      }).catch(err => {
        console.error(`[BotManager] Erro no polling de ${bot_username}:`, err.message);
      });

      // Aguarda um pouco para verificar se iniciou
      await new Promise(resolve => setTimeout(resolve, 1500));

      this.activeBots.set(id, bot);
      db.bots.atualizarStatus(id, 'ativo');

      console.log(`[BotManager] ✅ Bot ${bot_username} iniciado com sucesso`);
      return true;

    } catch (error) {
      console.error(`[BotManager] ❌ Erro ao iniciar bot ${bot_username}:`, error.message);
      db.bots.atualizarStatus(id, 'erro');
      return false;
    }
  }

  /**
   * Para um bot específico
   */
  async stopBot(botId) {
    const bot = this.activeBots.get(botId);
    if (bot) {
      try {
        await bot.stop();
      } catch (e) {
        // Ignora erros ao parar
      }
      this.activeBots.delete(botId);
      db.bots.atualizarStatus(botId, 'inativo');
      console.log(`[BotManager] Bot ${botId} parado`);
      return true;
    }
    return false;
  }

  /**
   * Reinicia um bot
   */
  async restartBot(botData) {
    await this.stopBot(botData.id);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startBot(botData);
  }

  /**
   * Para todos os bots
   */
  async stopAllBots() {
    console.log(`[BotManager] Parando ${this.activeBots.size} bots...`);
    
    for (const [botId, bot] of this.activeBots) {
      try {
        await bot.stop();
      } catch (e) {
        // Ignora erros
      }
      db.bots.atualizarStatus(botId, 'inativo');
    }
    
    this.activeBots.clear();
    console.log('[BotManager] Todos os bots parados');
  }

  /**
   * Retorna status de um bot
   */
  getBotStatus(botId) {
    return this.activeBots.has(botId) ? 'running' : 'stopped';
  }

  /**
   * Lista bots ativos
   */
  getActiveBotIds() {
    return Array.from(this.activeBots.keys());
  }

  /**
   * Carrega todos os bots salvos (auto-início)
   */
  async loadSavedBots() {
    // Lista bots com token de usuários ativos e não vencidos
    const bots = db.bots.listarComToken();
    console.log(`[BotManager] Encontrados ${bots.length} bots para auto-iniciar...`);

    let iniciados = 0;
    let pulados = 0;

    for (const botData of bots) {
      // Verificar se usuário está ativo e não vencido
      const agora = new Date();
      const expiracao = new Date(botData.data_expiracao);
      
      if (botData.usuario_status !== 'ativo') {
        console.log(`[BotManager] Pulando ${botData.bot_username} - usuário suspenso`);
        pulados++;
        continue;
      }
      
      if (agora > expiracao) {
        console.log(`[BotManager] Pulando ${botData.bot_username} - plano vencido`);
        pulados++;
        continue;
      }

      try {
        await this.startBot(botData);
        iniciados++;
      } catch (error) {
        console.error(`[BotManager] Erro ao carregar ${botData.bot_username}:`, error.message);
      }
      
      // Delay entre inicializações para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[BotManager] Auto-início concluído. Iniciados: ${iniciados}, Pulados: ${pulados}`);
  }

  /**
   * Envia mensagem através de um bot
   */
  async sendMessage(botId, chatId, message, options = {}) {
    const bot = this.activeBots.get(botId);
    if (!bot) {
      throw new Error('Bot não está ativo');
    }
    return await bot.telegram.sendMessage(chatId, message, options);
  }

  /**
   * Verifica e para bots de usuários vencidos
   */
  async checkExpiredUsers() {
    const vencidos = db.usuarios.listarVencidos();
    
    for (const usuario of vencidos) {
      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      if (bot && this.activeBots.has(bot.id)) {
        console.log(`[BotManager] Parando bot de usuário vencido: ${usuario.nome}`);
        await this.stopBot(bot.id);
      }
    }
  }
}

// Singleton
const botManager = new BotManager();

module.exports = botManager;
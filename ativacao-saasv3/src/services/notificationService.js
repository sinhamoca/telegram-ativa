// src/services/notificationService.js - Serviço de notificações

const db = require('../database');
const config = require('../config');

class NotificationService {
  constructor() {
    this.masterBot = null;
  }

  /**
   * Define o bot master para enviar notificações
   */
  setMasterBot(bot) {
    this.masterBot = bot;
  }

  /**
   * Envia notificação para um usuário
   */
  async enviarNotificacao(telegramId, mensagem, opcoes = {}) {
    if (!this.masterBot) {
      console.error('[Notification] Bot master não configurado');
      return false;
    }

    try {
      await this.masterBot.telegram.sendMessage(telegramId, mensagem, {
        parse_mode: 'Markdown',
        ...opcoes
      });
      return true;
    } catch (error) {
      console.error(`[Notification] Erro ao enviar para ${telegramId}:`, error.message);
      return false;
    }
  }

  /**
   * Envia lembretes de vencimento
   */
  async enviarLembretesVencimento() {
    console.log('[Notification] Verificando usuários próximos de vencer...');
    
    const usuarios = db.usuarios.proximosVencer(config.NOTIFICACOES.DIAS_ANTES_VENCIMENTO);
    
    console.log(`[Notification] Encontrados ${usuarios.length} usuários`);

    for (const usuario of usuarios) {
      const plano = config.getPlanoById(usuario.plano_id);
      const dataExpiracao = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
      
      const mensagem = 
        `⚠️ *Aviso de Vencimento*\n\n` +
        `Olá ${usuario.nome}!\n\n` +
        `Seu plano *${plano?.nome || usuario.plano_id}* vence amanhã (${dataExpiracao}).\n\n` +
        `Para continuar usando o sistema, renove seu plano acessando o menu principal.\n\n` +
        `Use /start para acessar o menu.`;

      const enviado = await this.enviarNotificacao(usuario.telegram_id, mensagem);
      
      if (enviado) {
        console.log(`[Notification] ✅ Lembrete enviado para ${usuario.nome}`);
        db.logs.criar('lembrete_vencimento', usuario.id, { enviado: true });
      } else {
        console.log(`[Notification] ❌ Falha ao enviar para ${usuario.nome}`);
        db.logs.criar('lembrete_vencimento', usuario.id, { enviado: false });
      }

      // Delay entre envios
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return usuarios.length;
  }

  /**
   * Envia notificação de plano ativado
   */
  async notificarPlanoAtivado(usuario, plano) {
    const dataExpiracao = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
    
    const mensagem = 
      `✅ *Plano Ativado com Sucesso!*\n\n` +
      `Olá ${usuario.nome}!\n\n` +
      `Seu plano *${plano.nome}* foi ativado.\n\n` +
      `📅 *Válido até:* ${dataExpiracao}\n` +
      `🔢 *Ativações:* ${plano.ativacoes || 'Ilimitadas'}\n\n` +
      `Use /start para acessar o menu.`;

    return await this.enviarNotificacao(usuario.telegram_id, mensagem);
  }

  /**
   * Envia notificação de plano vencido
   */
  async notificarPlanoVencido(usuario) {
    const mensagem = 
      `🔴 *Plano Vencido*\n\n` +
      `Olá ${usuario.nome}!\n\n` +
      `Seu plano venceu e seu bot foi pausado.\n\n` +
      `Para continuar usando o sistema, renove seu plano acessando /start.`;

    return await this.enviarNotificacao(usuario.telegram_id, mensagem);
  }

  /**
   * Envia notificação de limite de ativações atingido
   */
  async notificarLimiteAtingido(usuario) {
    const mensagem = 
      `⚠️ *Limite de Ativações Atingido*\n\n` +
      `Olá ${usuario.nome}!\n\n` +
      `Você atingiu o limite de ativações do seu plano.\n\n` +
      `Para continuar realizando ativações, faça upgrade para o plano Ilimitado ou renove seu plano.\n\n` +
      `Use /start para acessar o menu.`;

    return await this.enviarNotificacao(usuario.telegram_id, mensagem);
  }

  /**
   * Envia broadcast para todos os usuários ativos
   */
  async enviarBroadcast(mensagem, apenasAtivos = true) {
    const usuarios = apenasAtivos ? db.usuarios.listarAtivos() : db.usuarios.listarTodos();
    
    let enviados = 0;
    let falhas = 0;

    for (const usuario of usuarios) {
      const sucesso = await this.enviarNotificacao(usuario.telegram_id, mensagem);
      
      if (sucesso) {
        enviados++;
      } else {
        falhas++;
      }

      // Delay entre envios
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return { total: usuarios.length, enviados, falhas };
  }
}

// Singleton
const notificationService = new NotificationService();

module.exports = notificationService;

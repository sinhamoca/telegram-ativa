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
  async enviarNotificacao(telegramId, mensagem, parseMode = 'Markdown') {
    if (!this.masterBot) {  // ✅ CORRETO
      console.error('[Notification] Bot não configurado');
      return false;
    }

    try {
      await this.masterBot.telegram.sendMessage(telegramId, mensagem, {  // ✅ CORRETO
        parse_mode: parseMode 
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
   * Envia notificação de ativação para o revendedor
   */
  async notificarAtivacao(usuario, dadosAtivacao) {
    // Verificar configuração do usuário
    const config = db.usuarios.getNotifAtivacoes?.(usuario.id) || 'desativado';
    
    if (config === 'desativado') {
      return false;
    }
    
    // Se config é 'apenas_sucesso', só notifica sucesso
    if (config === 'apenas_sucesso' && !dadosAtivacao.sucesso) {
      return false;
    }
    
    // Montar mensagem
    const emoji = dadosAtivacao.sucesso ? '✅' : '❌';
    const titulo = dadosAtivacao.sucesso ? 'Nova Ativação!' : 'Ativação Falhou!';
    
    const dataHora = new Date().toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let mensagem = `${emoji} <b>${titulo}</b>\n\n`;
    
    // Dados do cliente
    const clienteNome = dadosAtivacao.clienteNome || 'Cliente';
    const clienteUsername = dadosAtivacao.clienteUsername ? `@${dadosAtivacao.clienteUsername}` : '';
    mensagem += `👤 <b>Cliente:</b> ${clienteNome} ${clienteUsername}\n`;
    
    // Dados da ativação
    mensagem += `📺 <b>App:</b> ${dadosAtivacao.produtoNome || dadosAtivacao.modulo}\n`;
    mensagem += `📱 <b>MAC:</b> <code>${dadosAtivacao.macAddress}</code>\n`;
    
    if (dadosAtivacao.valor) {
      mensagem += `💰 <b>Valor:</b> R$${dadosAtivacao.valor.toFixed(2)}\n`;
    }
    
    mensagem += `🕐 <b>Hora:</b> ${dataHora}\n`;
    
    // Se falhou, mostrar erro
    if (!dadosAtivacao.sucesso && dadosAtivacao.erro) {
      mensagem += `\n⚠️ <b>Erro:</b> ${dadosAtivacao.erro}`;
    }
    
    // Se sucesso, mostrar validade (se disponível)
    if (dadosAtivacao.sucesso && dadosAtivacao.validade) {
      mensagem += `\n📅 <b>Validade:</b> ${dadosAtivacao.validade}`;
    }

    return await this.enviarNotificacao(usuario.telegram_id, mensagem, 'HTML');
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

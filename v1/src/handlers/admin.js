// src/handlers/admin.js - Menu e handlers do administrador

const { Markup } = require('telegraf');
const db = require('../database');
const config = require('../config');
const botManager = require('../services/botManager');
const notificationService = require('../services/notificationService');

// Estado temporário dos admins
const adminState = new Map();

// ==================== MENUS ====================

const menuAdmin = Markup.inlineKeyboard([
  [Markup.button.callback('👥 Gerenciar Usuários', 'admin_usuarios')],
  [Markup.button.callback('📊 Estatísticas', 'admin_stats')],
  [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
  [Markup.button.callback('⚙️ Configurações', 'admin_config')]
]);

const menuUsuarios = Markup.inlineKeyboard([
  [Markup.button.callback('🔍 Buscar Usuário', 'admin_buscar')],
  [Markup.button.callback('📋 Listar Todos', 'admin_listar_todos')],
  [Markup.button.callback('✅ Listar Ativos', 'admin_listar_ativos')],
  [Markup.button.callback('⏰ Listar Vencidos', 'admin_listar_vencidos')],
  [Markup.button.callback('🎁 Listar Trial', 'admin_listar_trial')],
  [Markup.button.callback('🔙 Voltar', 'admin_menu')]
]);

// ==================== HANDLERS ====================

async function showAdminMenu(ctx) {
  await ctx.reply(
    `👑 *Painel Administrador*\n\n` +
    `Bem-vindo ao painel de controle.\n` +
    `Selecione uma opção:`,
    { parse_mode: 'Markdown', ...menuAdmin }
  );
}

async function handleAdminUsuarios(ctx) {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `👥 *Gerenciar Usuários*\n\nEscolha uma opção:`,
    { parse_mode: 'Markdown', ...menuUsuarios }
  );
}

async function handleAdminStats(ctx) {
  await ctx.answerCbQuery();
  
  const stats = db.estatisticas.geral();
  
  let mensagem = `📊 *Estatísticas do Sistema*\n\n`;
  mensagem += `👥 *Usuários*\n`;
  mensagem += `├ Total: ${stats.totalUsuarios}\n`;
  mensagem += `├ Ativos: ${stats.usuariosAtivos}\n`;
  mensagem += `└ Em Trial: ${stats.usuariosTrial}\n\n`;
  mensagem += `📱 *Ativações*\n`;
  mensagem += `├ Hoje: ${stats.ativacoesHoje}\n`;
  mensagem += `├ Este mês: ${stats.ativacoesMes}\n`;
  mensagem += `└ Total: ${stats.totalAtivacoes}\n\n`;
  mensagem += `📦 *Por Plano*\n`;
  
  for (const p of stats.porPlano) {
    const plano = config.getPlanoById(p.plano_id);
    mensagem += `├ ${plano?.nome || p.plano_id}: ${p.total}\n`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_menu')]])
  });
}

async function handleAdminBuscar(ctx) {
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: 'buscar_usuario' });
  
  await ctx.reply(
    `🔍 *Buscar Usuário*\n\n` +
    `Digite o nome, @username ou Telegram ID do usuário:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'admin_usuarios')]])
    }
  );
}

async function handleListarUsuarios(ctx, tipo) {
  await ctx.answerCbQuery();
  
  let usuarios;
  let titulo;
  
  switch (tipo) {
    case 'todos':
      usuarios = db.usuarios.listarTodos();
      titulo = '📋 Todos os Usuários';
      break;
    case 'ativos':
      usuarios = db.usuarios.listarAtivos();
      titulo = '✅ Usuários Ativos';
      break;
    case 'vencidos':
      usuarios = db.usuarios.listarVencidos();
      titulo = '⏰ Usuários Vencidos';
      break;
    case 'trial':
      usuarios = db.usuarios.listarTrial();
      titulo = '🎁 Usuários em Trial';
      break;
  }

  if (usuarios.length === 0) {
    await ctx.editMessageText(
      `${titulo}\n\nNenhum usuário encontrado.`,
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_usuarios')]]) }
    );
    return;
  }

  // Limitar a 10 usuários por página
  const pagina = usuarios.slice(0, 10);
  
  let mensagem = `${titulo}\n\n`;
  const buttons = [];

  for (const u of pagina) {
    const plano = config.getPlanoById(u.plano_id);
    const status = u.status === 'ativo' ? '🟢' : '🔴';
    mensagem += `${status} *${u.nome}*\n`;
    mensagem += `└ ${plano?.nome || u.plano_id}\n`;
    
    buttons.push([Markup.button.callback(`👤 ${u.nome}`, `admin_ver_${u.id}`)]);
  }

  if (usuarios.length > 10) {
    mensagem += `\n_Mostrando 10 de ${usuarios.length} usuários_`;
  }

  buttons.push([Markup.button.callback('🔙 Voltar', 'admin_usuarios')]);

  await ctx.editMessageText(mensagem, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleVerUsuario(ctx, usuarioId) {
  try {
    await ctx.answerCbQuery();
    
    const usuario = db.usuarios.buscarPorId(usuarioId);
    if (!usuario) {
      await ctx.reply('❌ Usuário não encontrado.');
      return;
    }

    const plano = config.getPlanoById(usuario.plano_id);
    const bot = db.bots.buscarPorUsuarioId(usuario.id);
    const dataExp = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
    
    let botStatus = '⚪ Não vinculado';
    if (bot?.token) {
      botStatus = botManager.getBotStatus(bot.id) === 'running' ? '🟢 Ativo' : '🔴 Inativo';
    }

    // Escapar caracteres HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    const nomeExibir = escapeHtml(usuario.nome) || 'N/A';
    const usernameExibir = usuario.username ? `@${escapeHtml(usuario.username)}` : 'N/A';
    const botUsername = bot?.bot_username ? `@${escapeHtml(bot.bot_username)}` : 'N/A';

    let mensagem = `👤 <b>Detalhes do Usuário</b>\n\n`;
    mensagem += `<b>Nome:</b> ${nomeExibir}\n`;
    mensagem += `<b>Username:</b> ${usernameExibir}\n`;
    mensagem += `<b>Telegram ID:</b> <code>${usuario.telegram_id}</code>\n`;
    mensagem += `<b>WhatsApp:</b> ${usuario.whatsapp || 'N/A'}\n\n`;
    mensagem += `<b>Plano:</b> ${plano?.nome || usuario.plano_id}\n`;
    mensagem += `<b>Ativações:</b> ${usuario.ativacoes_restantes ?? 'Ilimitadas'}\n`;
    mensagem += `<b>Vencimento:</b> ${dataExp}\n`;
    mensagem += `<b>Status:</b> ${usuario.status === 'ativo' ? '🟢 Ativo' : '🔴 Suspenso'}\n\n`;
    mensagem += `<b>Bot:</b> ${botUsername}\n`;
    mensagem += `<b>Status Bot:</b> ${botStatus}\n`;

    const buttons = [
      [Markup.button.callback('🔄 Alterar Plano', `admin_plano_${usuario.id}`)],
      [Markup.button.callback('➕ Adicionar Ativações', `admin_add_ativ_${usuario.id}`)],
      [Markup.button.callback('📅 Estender Validade', `admin_estender_${usuario.id}`)],
      [
        usuario.status === 'ativo' 
          ? Markup.button.callback('⏸️ Suspender', `admin_suspender_${usuario.id}`)
          : Markup.button.callback('▶️ Reativar', `admin_reativar_${usuario.id}`)
      ],
      [Markup.button.callback('🗑️ Excluir', `admin_excluir_${usuario.id}`)],
      [Markup.button.callback('🔙 Voltar', 'admin_usuarios')]
    ];

    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('[Admin] Erro em handleVerUsuario:', error);
    await ctx.reply(`❌ Erro ao carregar usuário: ${error.message}`);
  }
}

async function handleAlterarPlano(ctx, usuarioId) {
  await ctx.answerCbQuery();
  
  const buttons = [
    [Markup.button.callback('🎁 Trial (7 dias, 20 ativ)', `admin_setplano_${usuarioId}_trial`)],
    [Markup.button.callback('🥉 Básico (30 dias, 50 ativ)', `admin_setplano_${usuarioId}_basico`)],
    [Markup.button.callback('💎 Ilimitado (30 dias, ∞)', `admin_setplano_${usuarioId}_ilimitado`)],
    [Markup.button.callback('🔙 Voltar', `admin_ver_${usuarioId}`)]
  ];

  await ctx.editMessageText(
    `🔄 *Alterar Plano*\n\nEscolha o novo plano:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function handleSetPlano(ctx, usuarioId, planoId) {
  await ctx.answerCbQuery('Alterando plano...');
  
  try {
    const usuario = db.usuarios.alterarPlano(usuarioId, planoId);
    const plano = config.getPlanoById(planoId);
    
    // Notificar usuário
    await notificationService.notificarPlanoAtivado(usuario, plano);
    
    // Reiniciar bot se necessário
    const bot = db.bots.buscarPorUsuarioId(usuarioId);
    if (bot?.token) {
      await botManager.restartBot(bot);
    }

    await ctx.editMessageText(
      `✅ *Plano Alterado!*\n\n` +
      `Usuário: ${usuario.nome}\n` +
      `Novo plano: ${plano.nome}\n` +
      `Ativações: ${plano.ativacoes ?? 'Ilimitadas'}\n` +
      `Validade: ${plano.dias} dias`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `admin_ver_${usuarioId}`)]])
      }
    );
  } catch (error) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

async function handleAdicionarAtivacoes(ctx, usuarioId) {
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: 'add_ativacoes', usuarioId });
  
  await ctx.reply(
    `➕ *Adicionar Ativações*\n\nDigite a quantidade de ativações para adicionar:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', `admin_ver_${usuarioId}`)]])
    }
  );
}

async function handleEstenderValidade(ctx, usuarioId) {
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: 'estender_dias', usuarioId });
  
  await ctx.reply(
    `📅 *Estender Validade*\n\nDigite a quantidade de dias para adicionar:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', `admin_ver_${usuarioId}`)]])
    }
  );
}

async function handleSuspender(ctx, usuarioId) {
  await ctx.answerCbQuery('Suspendendo...');
  
  const usuario = db.usuarios.suspender(usuarioId);
  
  // Parar bot
  const bot = db.bots.buscarPorUsuarioId(usuarioId);
  if (bot) {
    await botManager.stopBot(bot.id);
  }

  await ctx.editMessageText(
    `⏸️ Usuário *${usuario.nome}* foi suspenso.`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `admin_ver_${usuarioId}`)]])
    }
  );
}

async function handleReativar(ctx, usuarioId) {
  await ctx.answerCbQuery('Reativando...');
  
  const usuario = db.usuarios.reativar(usuarioId);
  
  // Reiniciar bot
  const bot = db.bots.buscarPorUsuarioId(usuarioId);
  if (bot?.token) {
    await botManager.startBot(bot);
  }

  await ctx.editMessageText(
    `▶️ Usuário *${usuario.nome}* foi reativado.`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `admin_ver_${usuarioId}`)]])
    }
  );
}

async function handleExcluir(ctx, usuarioId) {
  await ctx.answerCbQuery();
  
  await ctx.editMessageText(
    `⚠️ *Confirmar Exclusão*\n\nTem certeza que deseja excluir este usuário?\n\nEsta ação não pode ser desfeita!`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Sim, excluir', `admin_confirma_excluir_${usuarioId}`)],
        [Markup.button.callback('❌ Cancelar', `admin_ver_${usuarioId}`)]
      ])
    }
  );
}

async function handleConfirmaExcluir(ctx, usuarioId) {
  await ctx.answerCbQuery('Excluindo...');
  
  // Parar bot
  const bot = db.bots.buscarPorUsuarioId(usuarioId);
  if (bot) {
    await botManager.stopBot(bot.id);
  }

  db.usuarios.excluir(usuarioId);

  await ctx.editMessageText(
    `🗑️ Usuário excluído com sucesso.`,
    { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_usuarios')]]) }
  );
}

async function handleBroadcast(ctx) {
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: 'broadcast' });
  
  await ctx.reply(
    `📢 *Broadcast*\n\nEnvie a mensagem que deseja enviar para todos os usuários ativos:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'admin_menu')]])
    }
  );
}

// ==================== CONFIGURAÇÕES ====================

async function handleAdminConfig(ctx) {
  await ctx.answerCbQuery();
  
  const config = require('../config');
  const credMP = db.credenciais.buscar(0, 'mercadopago_master');
  const mpStatus = credMP ? '✅ Configurado' : '❌ Não configurado';

  await ctx.editMessageText(
    `⚙️ *Configurações do Sistema*\n\n` +
    `*Mercado Pago (Mensalidades):* ${mpStatus}\n\n` +
    `*Planos:*\n` +
    `├ Trial: ${config.PLANOS.TRIAL.dias} dias, ${config.PLANOS.TRIAL.ativacoes} ativ\n` +
    `├ Básico: R$${config.PLANOS.BASICO.preco}, ${config.PLANOS.BASICO.ativacoes} ativ\n` +
    `└ Ilimitado: R$${config.PLANOS.ILIMITADO.preco}, ∞ ativ\n\n` +
    `*Admins:* ${config.ADMIN_IDS.join(', ')}`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💳 Config. Mercado Pago', 'admin_config_mp')],
        [Markup.button.callback('🔙 Voltar', 'admin_menu')]
      ])
    }
  );
}

async function handleAdminConfigMP(ctx) {
  await ctx.answerCbQuery();
  adminState.set(ctx.from.id, { step: 'config_mp' });
  
  await ctx.reply(
    `💳 *Configurar Mercado Pago (Master)*\n\n` +
    `Este é o Mercado Pago para receber as mensalidades dos revendedores.\n\n` +
    `Digite seu *Access Token* de produção:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'admin_config')]])
    }
  );
}

// ==================== HANDLER DE TEXTO ====================

async function handleAdminText(ctx) {
  const state = adminState.get(ctx.from.id);
  if (!state) return false;

  const text = ctx.message.text;

  switch (state.step) {
    case 'buscar_usuario': {
      const usuarios = db.usuarios.buscar(text);
      adminState.delete(ctx.from.id);
      
      if (usuarios.length === 0) {
        await ctx.reply(
          `🔍 Nenhum usuário encontrado para "${text}"`,
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'admin_usuarios')]])
        );
        return true;
      }

      const buttons = usuarios.slice(0, 10).map(u => 
        [Markup.button.callback(`👤 ${u.nome}`, `admin_ver_${u.id}`)]
      );
      buttons.push([Markup.button.callback('🔙 Voltar', 'admin_usuarios')]);

      await ctx.reply(
        `🔍 *Resultados para "${text}":*\n\nEncontrados: ${usuarios.length}`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
      );
      return true;
    }

    case 'add_ativacoes': {
      const quantidade = parseInt(text);
      if (isNaN(quantidade) || quantidade <= 0) {
        await ctx.reply('❌ Digite um número válido maior que zero.');
        return true;
      }

      const usuario = db.usuarios.adicionarAtivacoes(state.usuarioId, quantidade);
      adminState.delete(ctx.from.id);

      await ctx.reply(
        `✅ Adicionadas ${quantidade} ativações para ${usuario.nome}.\n\nTotal agora: ${usuario.ativacoes_restantes ?? 'Ilimitadas'}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `admin_ver_${state.usuarioId}`)]])
      );
      return true;
    }

    case 'estender_dias': {
      const dias = parseInt(text);
      if (isNaN(dias) || dias <= 0) {
        await ctx.reply('❌ Digite um número válido maior que zero.');
        return true;
      }

      const usuario = db.usuarios.estenderValidade(state.usuarioId, dias);
      const novaData = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
      adminState.delete(ctx.from.id);

      await ctx.reply(
        `✅ Validade estendida em ${dias} dias para ${usuario.nome}.\n\nNova data: ${novaData}`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', `admin_ver_${state.usuarioId}`)]])
      );
      return true;
    }

    case 'broadcast': {
      adminState.delete(ctx.from.id);
      
      await ctx.reply('📤 Enviando mensagem...');
      
      const resultado = await notificationService.enviarBroadcast(text);
      
      await ctx.reply(
        `📢 *Broadcast Concluído*\n\n` +
        `Total: ${resultado.total}\n` +
        `Enviados: ${resultado.enviados}\n` +
        `Falhas: ${resultado.falhas}`,
        { parse_mode: 'Markdown', ...menuAdmin }
      );
      return true;
    }

    case 'config_mp': {
      const { createPaymentService } = require('../services/paymentService');
      
      await ctx.reply('🔍 Testando conexão...');
      
      const paymentService = createPaymentService(text);
      const teste = await paymentService.testarConexao();
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Access Token inválido!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'admin_config_mp')]])
        );
        adminState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais (usuarioId 0 = sistema)
      db.credenciais.salvar(0, 'mercadopago_master', { accessToken: text });
      adminState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Mercado Pago Master configurado!*\n\n` +
        `Conta: ${teste.email}\n\n` +
        `Agora você pode receber pagamentos de mensalidades.`,
        { parse_mode: 'Markdown', ...menuAdmin }
      );
      return true;
    }
  }

  return false;
}

// ==================== VOLTAR AO MENU ====================

async function handleBackToMenu(ctx) {
  await ctx.answerCbQuery();
  adminState.delete(ctx.from.id);
  await ctx.editMessageText(
    `👑 *Painel Administrador*\n\nSelecione uma opção:`,
    { parse_mode: 'Markdown', ...menuAdmin }
  );
}

module.exports = {
  showAdminMenu,
  handleAdminUsuarios,
  handleAdminStats,
  handleAdminBuscar,
  handleListarUsuarios,
  handleVerUsuario,
  handleAlterarPlano,
  handleSetPlano,
  handleAdicionarAtivacoes,
  handleEstenderValidade,
  handleSuspender,
  handleReativar,
  handleExcluir,
  handleConfirmaExcluir,
  handleBroadcast,
  handleAdminConfig,
  handleAdminConfigMP,
  handleAdminText,
  handleBackToMenu,
  adminState
};
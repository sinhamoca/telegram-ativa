// src/handlers/resellerNotificacoes.js - Menu de Notificações do Revendedor

const { Markup } = require('telegraf');
const db = require('../database');

/**
 * Exibe menu de configuração de notificações
 */
async function handleMenuNotificacoes(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) return;

  const configAtual = db.usuarios.getNotifAtivacoes?.(usuario.id) || 'desativado';

  // Ícones e textos de status
  const statusTexto = {
    desativado: '❌ Desativado',
    apenas_sucesso: '✅ Apenas sucessos',
    tudo: '🔔 Sucessos e falhas'
  };

  let mensagem = `🔔 <b>NOTIFICAÇÕES DE ATIVAÇÕES</b>\n\n`;
  mensagem += `Receba alertas em tempo real quando seus clientes fizerem ativações!\n\n`;
  mensagem += `📊 <b>Status atual:</b> ${statusTexto[configAtual]}\n\n`;
  
  if (configAtual === 'tudo') {
    mensagem += `📨 Você receberá notificações de <b>todas</b> as ativações (sucesso e falha).\n\n`;
  } else if (configAtual === 'apenas_sucesso') {
    mensagem += `📨 Você receberá notificações apenas de ativações <b>bem-sucedidas</b>.\n\n`;
  } else {
    mensagem += `📨 Você <b>não</b> está recebendo notificações de ativações.\n\n`;
  }

  mensagem += `<i>Escolha uma opção:</i>`;

  // Botões com indicador do selecionado
  const botoes = [
    [Markup.button.callback(
      `${configAtual === 'desativado' ? '● ' : '○ '}❌ Desativado`, 
      'notif_config_desativado'
    )],
    [Markup.button.callback(
      `${configAtual === 'apenas_sucesso' ? '● ' : '○ '}✅ Apenas sucessos`, 
      'notif_config_apenas_sucesso'
    )],
    [Markup.button.callback(
      `${configAtual === 'tudo' ? '● ' : '○ '}🔔 Sucessos e falhas`, 
      'notif_config_tudo'
    )],
    [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
  ];

  try {
    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(botoes)
    });
  } catch (e) {
    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(botoes)
    });
  }
}

/**
 * Configura opção de notificações
 */
async function handleConfigNotificacoes(ctx, config) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) return;

  // Salvar configuração
  if (db.usuarios.setNotifAtivacoes) {
    db.usuarios.setNotifAtivacoes(usuario.id, config);
  } else {
    // Fallback se função não existir
    db.run?.('UPDATE usuarios SET notif_ativacoes = ? WHERE id = ?', [config, usuario.id]);
  }

  const mensagens = {
    desativado: '❌ Notificações <b>desativadas</b>.\n\nVocê não receberá mais alertas de ativações.',
    apenas_sucesso: '✅ Configurado: <b>Apenas sucessos</b>\n\nVocê receberá notificações quando um cliente ativar com sucesso.',
    tudo: '🔔 Configurado: <b>Sucessos e falhas</b>\n\nVocê receberá notificações de todas as ativações.'
  };

  await ctx.editMessageText(
    `🔔 <b>NOTIFICAÇÕES</b>\n\n${mensagens[config]}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Alterar Configuração', 'reseller_notificacoes')],
        [Markup.button.callback('🔙 Menu Principal', 'reseller_menu')]
      ])
    }
  );

  console.log(`[Notificacoes] ${usuario.nome} configurou notificações: ${config}`);
}

module.exports = {
  handleMenuNotificacoes,
  handleConfigNotificacoes
};

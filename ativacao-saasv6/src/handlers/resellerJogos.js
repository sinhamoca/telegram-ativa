// src/handlers/resellerJogos.js - Menu de Jogos do Revendedor

const { Markup } = require('telegraf');
const db = require('../database');

/**
 * Exibe menu de configuração de jogos
 */
async function handleMenuJogos(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) return;

  const configAtual = db.usuarios.getJogosConfig?.(usuario.id) || 'desativado';
  
  // Contar clientes para mostrar no menu
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  let totalClientes = 0;
  if (bot && db.jogosClientes?.contarClientesAtivos) {
    totalClientes = db.jogosClientes.contarClientesAtivos(bot.id);
  }

  // Ícones de status
  const icones = {
    desativado: '❌',
    apenas_eu: '👤',
    eu_e_clientes: '👥'
  };

  const statusTexto = {
    desativado: '❌ Desativado',
    apenas_eu: '👤 Apenas para mim',
    eu_e_clientes: `👥 Para mim e clientes (${totalClientes})`
  };

  let mensagem = `⚽ <b>JOGOS DO DIA</b>\n\n`;
  mensagem += `Receba diariamente a programação de futebol na TV!\n\n`;
  mensagem += `📊 <b>Status atual:</b> ${statusTexto[configAtual]}\n\n`;
  
  if (configAtual === 'eu_e_clientes') {
    mensagem += `📨 Você e <b>${totalClientes}</b> clientes receberão os jogos às 7:30.\n\n`;
  } else if (configAtual === 'apenas_eu') {
    mensagem += `📨 Você receberá os jogos às 7:30.\n\n`;
  }

  mensagem += `<i>Escolha uma opção:</i>`;

  // Botões com indicador do selecionado
  const botoes = [
    [Markup.button.callback(
      `${configAtual === 'desativado' ? '● ' : '○ '}❌ Desativado`, 
      'jogos_config_desativado'
    )],
    [Markup.button.callback(
      `${configAtual === 'apenas_eu' ? '● ' : '○ '}👤 Apenas para mim`, 
      'jogos_config_apenas_eu'
    )],
    [Markup.button.callback(
      `${configAtual === 'eu_e_clientes' ? '● ' : '○ '}👥 Para mim e meus clientes`, 
      'jogos_config_eu_e_clientes'
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
 * Configura opção de jogos
 */
async function handleConfigJogos(ctx, config) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) return;

  // Salvar configuração
  if (db.usuarios.setJogosConfig) {
    db.usuarios.setJogosConfig(usuario.id, config);
  } else {
    // Fallback se função não existir
    db.run?.('UPDATE usuarios SET jogos_config = ? WHERE id = ?', [config, usuario.id]);
  }

  const mensagens = {
    desativado: '❌ Envio de jogos <b>desativado</b>.\n\nVocê não receberá mais a programação diária.',
    apenas_eu: '✅ Configurado: <b>Apenas para mim</b>\n\nVocê receberá os jogos do dia às 7:30.',
    eu_e_clientes: '✅ Configurado: <b>Para mim e clientes</b>\n\nVocê e todos os seus clientes receberão os jogos às 7:30.'
  };

  await ctx.editMessageText(
    `⚽ <b>JOGOS DO DIA</b>\n\n${mensagens[config]}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Alterar Configuração', 'reseller_jogos')],
        [Markup.button.callback('🔙 Menu Principal', 'reseller_menu')]
      ])
    }
  );

  console.log(`[Jogos] ${usuario.nome} configurou jogos: ${config}`);
}

module.exports = {
  handleMenuJogos,
  handleConfigJogos
};

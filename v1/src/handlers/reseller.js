// src/handlers/reseller.js - Menu e handlers do revendedor

const { Markup } = require('telegraf');
const db = require('../database');
const config = require('../config');
const botManager = require('../services/botManager');
const { createPaymentService } = require('../services/paymentService');
const activationService = require('../services/activationService');

// Estado temporário dos revendedores
const resellerState = new Map();

// ==================== MENUS ====================

const menuPrincipal = Markup.inlineKeyboard([
  [Markup.button.callback('🤖 Meu Bot', 'reseller_bot')],
  [Markup.button.callback('📱 Produtos', 'reseller_produtos')],
  [Markup.button.callback('🔐 Credenciais', 'reseller_credenciais')],
  [Markup.button.callback('💰 Saldo Apps', 'reseller_saldo_apps')],
  [Markup.button.callback('👥 Saldos Clientes', 'reseller_saldos_clientes')],
  [Markup.button.callback('📋 Histórico Ativações', 'reseller_historico')],
  [Markup.button.callback('🎁 Afiliados', 'reseller_afiliados')],
  [Markup.button.callback('💳 Meu Plano', 'reseller_plano')],
  [Markup.button.callback('📊 Relatórios', 'reseller_relatorios')],
  [Markup.button.callback('❓ Ajuda', 'reseller_ajuda')]
]);

// ==================== HANDLERS PRINCIPAIS ====================

async function showResellerMenu(ctx, usuario = null, codigoAfiliado = null) {
  if (!usuario) {
    usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  }

  if (!usuario) {
    // Novo usuário - mostrar cadastro
    // Se veio por link de afiliado, armazenar no estado
    if (codigoAfiliado) {
      const indicador = db.afiliados.buscarPorCodigo(codigoAfiliado);
      if (indicador) {
        resellerState.set(ctx.from.id, { 
          codigoAfiliado: codigoAfiliado,
          indicadorId: indicador.id,
          indicadorNome: indicador.nome
        });
        console.log(`[Afiliado] Novo usuário ${ctx.from.id} indicado por ${indicador.nome} (${codigoAfiliado})`);
      }
    }
    return showCadastro(ctx);
  }

  const plano = config.getPlanoById(usuario.plano_id);
  const dataExp = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
  const ativacoes = usuario.ativacoes_restantes !== null ? usuario.ativacoes_restantes : '∞';

  await ctx.reply(
    `🏠 *Menu Principal*\n\n` +
    `👤 Olá, *${usuario.nome}*!\n\n` +
    `📦 *Plano:* ${plano?.nome || usuario.plano_id}\n` +
    `🔢 *Ativações:* ${ativacoes}\n` +
    `📅 *Válido até:* ${dataExp}\n\n` +
    `Selecione uma opção:`,
    { parse_mode: 'Markdown', ...menuPrincipal }
  );
}

async function showCadastro(ctx) {
  const state = resellerState.get(ctx.from.id);
  
  let mensagem = `👋 *Bem-vindo ao Sistema de Ativação!*\n\n`;
  
  // Se veio por link de afiliado
  if (state?.indicadorNome) {
    mensagem += `🎁 *Você foi indicado por ${state.indicadorNome}!*\n`;
    mensagem += `Ganhe R$2,50 de desconto permanente nas mensalidades.\n\n`;
  }
  
  mensagem += `Você ainda não possui uma conta.\n\n`;
  mensagem += `Ao criar sua conta, você terá:\n`;
  mensagem += `• 7 dias de teste grátis\n`;
  mensagem += `• 20 ativações para testar\n`;
  mensagem += `• Seu próprio bot de vendas\n`;
  mensagem += `• Link de indicação para ganhar descontos\n\n`;
  mensagem += `Deseja criar sua conta agora?`;
  
  await ctx.reply(
    mensagem,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Criar Conta', 'reseller_criar_conta')],
        [Markup.button.callback('❓ Mais informações', 'reseller_info')]
      ])
    }
  );
}

async function handleCriarConta(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cadastro_nome' });
  
  await ctx.reply(
    `📝 *Cadastro - Passo 1/2*\n\n` +
    `Digite seu *nome completo*:`,
    { parse_mode: 'Markdown' }
  );
}

// ==================== MEU BOT ====================

async function handleMeuBot(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);

  if (!bot || !bot.token) {
    await ctx.editMessageText(
      `🤖 *Meu Bot*\n\n` +
      `Você ainda não vinculou um bot.\n\n` +
      `Para vincular:\n` +
      `1. Abra @BotFather no Telegram\n` +
      `2. Crie um novo bot com /newbot\n` +
      `3. Copie o token gerado\n` +
      `4. Clique no botão abaixo e envie o token`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔗 Vincular Bot', 'reseller_vincular_bot')],
          [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
        ])
      }
    );
    return;
  }

  const status = botManager.getBotStatus(bot.id);
  const statusText = status === 'running' ? '🟢 Ativo' : '🔴 Inativo';

  const buttons = [
    status === 'running'
      ? [Markup.button.callback('⏹️ Parar Bot', 'reseller_parar_bot')]
      : [Markup.button.callback('▶️ Iniciar Bot', 'reseller_iniciar_bot')],
    [Markup.button.callback('🔄 Reiniciar Bot', 'reseller_reiniciar_bot')],
    [Markup.button.callback('🔓 Desvincular Bot', 'reseller_desvincular_bot')],
    [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
  ];

  await ctx.editMessageText(
    `🤖 *Meu Bot*\n\n` +
    `*Nome:* ${bot.bot_name}\n` +
    `*Username:* @${bot.bot_username}\n` +
    `*Status:* ${statusText}\n\n` +
    `Link: t.me/${bot.bot_username}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function handleVincularBot(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'vincular_token' });
  
  await ctx.reply(
    `🔗 *Vincular Bot*\n\n` +
    `Envie o token do seu bot:\n\n` +
    `_(O token tem o formato: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)_`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_bot')]])
    }
  );
}

async function handleIniciarBot(ctx) {
  await ctx.answerCbQuery('Iniciando bot...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);

  if (bot?.token) {
    const sucesso = await botManager.startBot(bot);
    
    if (sucesso) {
      await ctx.reply('✅ Bot iniciado com sucesso!');
    } else {
      await ctx.reply('❌ Erro ao iniciar o bot. Verifique se o token ainda é válido.');
    }
  }
}

async function handlePararBot(ctx) {
  await ctx.answerCbQuery('Parando bot...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);

  if (bot) {
    await botManager.stopBot(bot.id);
    await ctx.reply('⏹️ Bot parado.');
  }
}

async function handleReiniciarBot(ctx) {
  await ctx.answerCbQuery('Reiniciando bot...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);

  if (bot?.token) {
    const sucesso = await botManager.restartBot(bot);
    
    if (sucesso) {
      await ctx.reply('🔄 Bot reiniciado com sucesso!');
    } else {
      await ctx.reply('❌ Erro ao reiniciar o bot.');
    }
  }
}

async function handleDesvincularBot(ctx) {
  await ctx.answerCbQuery();
  
  await ctx.editMessageText(
    `⚠️ *Confirmar Desvinculação*\n\n` +
    `Tem certeza que deseja desvincular seu bot?\n\n` +
    `O bot será parado e você precisará vincular um novo token.`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Sim, desvincular', 'reseller_confirma_desvincular')],
        [Markup.button.callback('❌ Cancelar', 'reseller_bot')]
      ])
    }
  );
}

async function handleConfirmaDesvincular(ctx) {
  await ctx.answerCbQuery('Desvinculando...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);

  if (bot) {
    // Parar bot se estiver rodando
    await botManager.stopBot(bot.id);
    
    // Desvincular token
    db.bots.desvincular(usuario.id);
  }

  await ctx.editMessageText(
    `✅ *Bot desvinculado com sucesso!*\n\n` +
    `Você pode vincular um novo bot a qualquer momento.`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_bot')]])
    }
  );
}

// ==================== PRODUTOS ====================

async function handleProdutos(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const produtos = db.produtos.listarPorUsuario(usuario.id);

  if (produtos.length === 0) {
    await ctx.editMessageText(
      `📱 *Meus Produtos*\n\n` +
      `Você ainda não configurou nenhum produto.\n\n` +
      `Adicione produtos para que apareçam no menu do seu bot.`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Adicionar Produto', 'reseller_add_produto')],
          [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
        ])
      }
    );
    return;
  }

  let mensagem = `📱 *Meus Produtos*\n\n`;
  const buttons = [];

  for (const p of produtos) {
    const status = p.ativo ? '🟢' : '🔴';
    mensagem += `${status} *${p.nome}* - R$${p.preco.toFixed(2)}\n`;
    buttons.push([Markup.button.callback(`⚙️ ${p.nome}`, `reseller_edit_produto_${p.id}`)]);
  }

  buttons.push([Markup.button.callback('➕ Adicionar Produto', 'reseller_add_produto')]);
  buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_menu')]);

  await ctx.editMessageText(mensagem, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleAddProduto(ctx) {
  await ctx.answerCbQuery();
  
  // Por enquanto só temos IBO Pro
  const modulos = config.MODULOS;
  const buttons = [];

  for (const [key, modulo] of Object.entries(modulos)) {
    for (const [tierKey, tier] of Object.entries(modulo.tiers)) {
      buttons.push([Markup.button.callback(
        `📱 ${modulo.nome} ${tier.nome}`,
        `reseller_select_produto_${modulo.id}_${tier.id}`
      )]);
    }
  }

  buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_produtos')]);

  await ctx.editMessageText(
    `➕ *Adicionar Produto*\n\nEscolha o produto:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function handleSelectProduto(ctx, modulo, tier) {
  await ctx.answerCbQuery();
  
  const moduloConfig = config.MODULOS[modulo];
  const tierConfig = moduloConfig?.tiers[tier];
  
  if (!moduloConfig || !tierConfig) {
    await ctx.reply('❌ Produto não encontrado.');
    return;
  }
  
  resellerState.set(ctx.from.id, { 
    step: 'definir_preco',
    modulo: modulo,
    tier: tier,
    nome: `${moduloConfig.nome} ${tierConfig.nome}`
  });

  await ctx.reply(
    `💰 *Definir Preço*\n\n` +
    `Produto: *${moduloConfig.nome} ${tierConfig.nome}*\n\n` +
    `Digite o preço de venda (apenas números):\n` +
    `Exemplo: 80 ou 80.00`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_produtos')]])
    }
  );
}

async function handleEditProduto(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  const produto = db.produtos.buscarPorId(produtoId);
  if (!produto) {
    await ctx.reply('❌ Produto não encontrado.');
    return;
  }

  const statusText = produto.ativo ? '🟢 Ativo' : '🔴 Inativo';

  const buttons = [
    [Markup.button.callback('💰 Alterar Preço', `reseller_preco_${produto.id}`)],
    [produto.ativo 
      ? Markup.button.callback('🔴 Desativar', `reseller_desativar_${produto.id}`)
      : Markup.button.callback('🟢 Ativar', `reseller_ativar_${produto.id}`)
    ],
    [Markup.button.callback('🗑️ Excluir', `reseller_excluir_produto_${produto.id}`)],
    [Markup.button.callback('🔙 Voltar', 'reseller_produtos')]
  ];

  await ctx.editMessageText(
    `⚙️ *Editar Produto*\n\n` +
    `*Nome:* ${produto.nome}\n` +
    `*Preço:* R$${produto.preco.toFixed(2)}\n` +
    `*Status:* ${statusText}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function handleAlterarPreco(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  const produto = db.produtos.buscarPorId(produtoId);
  if (!produto) {
    await ctx.reply('❌ Produto não encontrado.');
    return;
  }

  resellerState.set(ctx.from.id, { 
    step: 'alterar_preco', 
    produtoId: produtoId,
    produtoNome: produto.nome
  });

  await ctx.reply(
    `💰 *Alterar Preço*\n\n` +
    `Produto: *${produto.nome}*\n` +
    `Preço atual: R$${produto.preco.toFixed(2)}\n\n` +
    `Digite o *novo preço*:`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_produtos')]])
    }
  );
}

async function handleDesativarProduto(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  db.produtos.desativar(produtoId);
  
  await ctx.reply('✅ Produto desativado!');
  await handleProdutos(ctx);
}

async function handleAtivarProduto(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  db.produtos.ativar(produtoId);
  
  await ctx.reply('✅ Produto ativado!');
  await handleProdutos(ctx);
}

async function handleExcluirProduto(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  const produto = db.produtos.buscarPorId(produtoId);
  if (!produto) {
    await ctx.reply('❌ Produto não encontrado.');
    return;
  }

  await ctx.editMessageText(
    `🗑️ *Confirmar Exclusão*\n\n` +
    `Produto: *${produto.nome}*\n` +
    `Preço: R$${produto.preco.toFixed(2)}\n\n` +
    `⚠️ Esta ação não pode ser desfeita!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar Exclusão', `reseller_confirma_excluir_${produtoId}`)],
        [Markup.button.callback('❌ Cancelar', 'reseller_produtos')]
      ])
    }
  );
}

async function handleConfirmaExcluirProduto(ctx, produtoId) {
  await ctx.answerCbQuery();
  
  db.produtos.excluir(produtoId);
  
  await ctx.reply('✅ Produto excluído!');
  await handleProdutos(ctx);
}

// ==================== CREDENCIAIS ====================

async function handleCredenciais(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const credIboPro = db.credenciais.buscar(usuario.id, 'ibo_pro');
  const credIboSol = db.credenciais.buscar(usuario.id, 'ibosol');
  const credVuPlayer = db.credenciais.buscar(usuario.id, 'vu_player_pro');
  const credEnzoPlayer = db.credenciais.buscar(usuario.id, 'enzo_player');
  const credDreamTV = db.credenciais.buscar(usuario.id, 'dreamtv');
  const credMultiPlayer = db.credenciais.buscar(usuario.id, 'multi_player');
  const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');

  const iboProStatus = credIboPro ? '✅ Configurado' : '❌ Não configurado';
  const iboSolStatus = credIboSol ? '✅ Configurado' : '❌ Não configurado';
  const vuPlayerStatus = credVuPlayer ? '✅ Configurado' : '❌ Não configurado';
  const enzoPlayerStatus = credEnzoPlayer ? '✅ Configurado' : '❌ Não configurado';
  const dreamTVStatus = credDreamTV ? '✅ Configurado' : '❌ Não configurado';
  const multiPlayerStatus = credMultiPlayer ? '✅ Configurado' : '❌ Não configurado';
  const mpStatus = credMP ? '✅ Configurado' : '❌ Não configurado';

  await ctx.editMessageText(
    `🔐 <b>Credenciais</b>\n\n` +
    `<b>IBO Pro:</b> ${iboProStatus}\n` +
    `<b>IboSol:</b> ${iboSolStatus}\n` +
    `<i>(IBO Player, BOB Player, etc)</i>\n` +
    `<b>VU Player Pro:</b> ${vuPlayerStatus}\n` +
    `<b>EnzoPlayer:</b> ${enzoPlayerStatus}\n` +
    `<b>DreamTV:</b> ${dreamTVStatus}\n` +
    `<b>Multi-Player:</b> ${multiPlayerStatus}\n` +
    `<i>(IPTV Player io, OTT, 4K, Duplex, etc)</i>\n` +
    `<b>Mercado Pago:</b> ${mpStatus}\n\n` +
    `Configure suas credenciais para que o sistema funcione corretamente.`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📱 Configurar IBO Pro', 'reseller_cred_ibo')],
        [Markup.button.callback('📺 Configurar IboSol', 'reseller_cred_ibosol')],
        [Markup.button.callback('📺 Configurar VU Player Pro', 'reseller_cred_vuplayer')],
        [Markup.button.callback('📺 Configurar EnzoPlayer', 'reseller_cred_enzo')],
        [Markup.button.callback('📺 Configurar DreamTV', 'reseller_cred_dreamtv')],
        [Markup.button.callback('🎮 Configurar Multi-Player', 'reseller_cred_multiplayer')],
        [Markup.button.callback('💳 Configurar Mercado Pago', 'reseller_cred_mp')],
        [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
      ])
    }
  );
}

async function handleCredIboPro(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_ibo_user' });
  
  await ctx.reply(
    `📱 <b>Configurar IBO Pro</b>\n\n` +
    `Digite seu <b>usuário</b> (email) do painel IBO Pro:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredIboSol(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_ibosol_email' });
  
  await ctx.reply(
    `📺 <b>Configurar IboSol</b>\n\n` +
    `Esta credencial serve para:\n` +
    `• IBO Player\n` +
    `• BOB Player / Pro / Premium\n` +
    `• MAC Player\n` +
    `• SmartOne Pro\n` +
    `• E outros apps IboSol\n\n` +
    `Digite seu <b>email</b> do painel IboSol:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredVuPlayerPro(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_vuplayer_email' });
  
  await ctx.reply(
    `📺 <b>Configurar VU Player Pro</b>\n\n` +
    `Digite seu <b>email</b> do painel VU Player Pro:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredEnzoPlayer(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_enzo_email' });
  
  await ctx.reply(
    `📺 <b>Configurar EnzoPlayer</b>\n\n` +
    `Digite seu <b>email</b> do painel EnzoPlayer:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredDreamTV(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_dreamtv_email' });
  
  await ctx.reply(
    `📺 <b>Configurar DreamTV</b>\n\n` +
    `Digite seu <b>email</b> do painel DreamTV:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredMultiPlayer(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_multiplayer_email' });
  
  await ctx.reply(
    `🎮 <b>Configurar Multi-Player</b>\n\n` +
    `Esta credencial serve para:\n` +
    `• IPTV Player io\n` +
    `• IPTV OTT Player\n` +
    `• IPTV 4K\n` +
    `• IPTV Duplex Player\n` +
    `• IBO Player Premium\n` +
    `• E mais 11 outros apps\n\n` +
    `Digite seu <b>email</b> do painel Multi-Player:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredMP(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_mp' });
  
  await ctx.reply(
    `💳 *Configurar Mercado Pago*\n\n` +
    `Digite seu *Access Token* do Mercado Pago:\n\n` +
    `_Para obter: Mercado Pago > Seu negócio > Configurações > Credenciais > Access Token de produção_`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

// ==================== SALDO APPS ====================

async function handleSaldoApps(ctx) {
  await ctx.answerCbQuery('Consultando saldos...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  
  // Buscar credenciais configuradas
  const credIboPro = db.credenciais.buscar(usuario.id, 'ibo_pro');
  
  let mensagem = `💰 <b>Saldo dos Aplicativos</b>\n\n`;
  
  // IBO Pro
  if (credIboPro) {
    try {
      const resultado = await activationService.getSaldo('ibo_pro', credIboPro.dados);
      
      if (resultado.success) {
        mensagem += `📱 <b>IBO Pro</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `├ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n`;
        mensagem += `└ Tipo: ${resultado.role}\n\n`;
      } else {
        mensagem += `📱 <b>IBO Pro</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📱 <b>IBO Pro</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📱 <b>IBO Pro</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // IboSol (IBO Player, BOB Player, etc)
  const credIboSol = db.credenciais.buscar(usuario.id, 'ibosol');
  
  if (credIboSol) {
    try {
      const resultado = await activationService.getSaldoPorCredencial('ibosol', credIboSol.dados);
      
      if (resultado.success) {
        mensagem += `📺 <b>IboSol</b> <i>(IBO Player, BOB, etc)</i>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Nome: ${resultado.name || 'N/A'}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `📺 <b>IboSol</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📺 <b>IboSol</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📺 <b>IboSol</b> <i>(IBO Player, BOB, etc)</i>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // VU Player Pro
  const credVuPlayer = db.credenciais.buscar(usuario.id, 'vu_player_pro');
  
  if (credVuPlayer) {
    try {
      const resultado = await activationService.getSaldo('vu_player_pro', credVuPlayer.dados);
      
      if (resultado.success) {
        mensagem += `📺 <b>VU Player Pro</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `📺 <b>VU Player Pro</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📺 <b>VU Player Pro</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📺 <b>VU Player Pro</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // EnzoPlayer
  const credEnzoPlayer = db.credenciais.buscar(usuario.id, 'enzo_player');
  
  if (credEnzoPlayer) {
    try {
      const resultado = await activationService.getSaldo('enzo_player', credEnzoPlayer.dados);
      
      if (resultado.success) {
        mensagem += `📺 <b>EnzoPlayer</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `📺 <b>EnzoPlayer</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📺 <b>EnzoPlayer</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📺 <b>EnzoPlayer</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // DreamTV
  const credDreamTV = db.credenciais.buscar(usuario.id, 'dreamtv');
  
  if (credDreamTV) {
    try {
      const resultado = await activationService.getSaldo('dreamtv', credDreamTV.dados);
      
      if (resultado.success) {
        mensagem += `📺 <b>DreamTV</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Nome: ${resultado.name || 'N/A'}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `📺 <b>DreamTV</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📺 <b>DreamTV</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📺 <b>DreamTV</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // Multi-Player
  const credMultiPlayer = db.credenciais.buscar(usuario.id, 'multi_player');
  
  if (credMultiPlayer) {
    try {
      const multiPlayerModule = require('../modules/multi_player');
      const resultado = await multiPlayerModule.getCredits(credMultiPlayer.dados);
      
      if (resultado.success) {
        mensagem += `🎮 <b>Multi-Player</b> <i>(IPTV Player io, OTT, 4K, etc)</i>\n`;
        mensagem += `├ Nome: ${resultado.name}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Dispositivos: ${resultado.deviceCount || 'N/A'}\n\n`;
      } else {
        mensagem += `🎮 <b>Multi-Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `🎮 <b>Multi-Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `🎮 <b>Multi-Player</b> <i>(IPTV Player io, OTT, 4K, etc)</i>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }
  
  mensagem += `<i>Última atualização: ${new Date().toLocaleString('pt-BR')}</i>`;

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'reseller_saldo_apps')],
      [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
    ])
  });
}

// ==================== SALDOS CLIENTES ====================

async function handleSaldosClientes(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.editMessageText(
      `❌ Você precisa vincular um bot primeiro.`,
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_menu')]]) }
    );
    return;
  }

  // Buscar clientes com saldo
  const clientes = db.saldos.listarPorBot(bot.id);
  
  let mensagem = `👥 <b>Saldos dos Clientes</b>\n\n`;
  
  if (clientes.length === 0) {
    mensagem += `<i>Nenhum cliente com saldo encontrado.</i>`;
  } else {
    mensagem += `<b>Total:</b> ${clientes.length} cliente(s) com saldo\n\n`;
    
    let totalSaldo = 0;
    for (const cliente of clientes.slice(0, 10)) { // Mostrar apenas os 10 primeiros
      mensagem += `👤 ID: <code>${cliente.cliente_telegram_id}</code>\n`;
      mensagem += `💰 Saldo: R$${cliente.valor.toFixed(2)}\n\n`;
      totalSaldo += cliente.valor;
    }
    
    if (clientes.length > 10) {
      mensagem += `<i>... e mais ${clientes.length - 10} cliente(s)</i>\n\n`;
    }
    
    mensagem += `📊 <b>Total em saldos:</b> R$${totalSaldo.toFixed(2)}`;
  }

  const buttons = [
    [Markup.button.callback('🔍 Buscar por ID', 'reseller_buscar_saldo')],
    [Markup.button.callback('🔄 Atualizar', 'reseller_saldos_clientes')],
    [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
  ];

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleBuscarSaldo(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'buscar_saldo' });
  
  await ctx.reply(
    `🔍 <b>Buscar Saldo de Cliente</b>\n\n` +
    `Digite o <b>Telegram ID</b> do cliente:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_saldos_clientes')]])
    }
  );
}

async function handleVerSaldoCliente(ctx, clienteId) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const saldo = db.saldos.buscar(bot.id, clienteId);
  
  await ctx.editMessageText(
    `👤 <b>Cliente:</b> <code>${clienteId}</code>\n\n` +
    `💰 <b>Saldo atual:</b> R$${saldo.toFixed(2)}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🗑️ Zerar Saldo', `reseller_zerar_saldo_${clienteId}`)],
        [Markup.button.callback('✏️ Ajustar Saldo', `reseller_ajustar_saldo_${clienteId}`)],
        [Markup.button.callback('🔙 Voltar', 'reseller_saldos_clientes')]
      ])
    }
  );
}

async function handleZerarSaldo(ctx, clienteId) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const saldoAnterior = db.saldos.buscar(bot.id, clienteId);
  
  await ctx.editMessageText(
    `⚠️ <b>Confirmar Zerar Saldo</b>\n\n` +
    `👤 Cliente: <code>${clienteId}</code>\n` +
    `💰 Saldo atual: R$${saldoAnterior.toFixed(2)}\n\n` +
    `<b>Esta ação não pode ser desfeita!</b>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', `reseller_confirma_zerar_${clienteId}`)],
        [Markup.button.callback('❌ Cancelar', 'reseller_saldos_clientes')]
      ])
    }
  );
}

async function handleConfirmaZerarSaldo(ctx, clienteId) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const saldoAnterior = db.saldos.buscar(bot.id, clienteId);
  db.saldos.definir(bot.id, clienteId, 0);
  
  console.log(`[Saldo] Revendedor ${usuario.id} zerou saldo do cliente ${clienteId} (era R$${saldoAnterior})`);

  await ctx.editMessageText(
    `✅ <b>Saldo Zerado!</b>\n\n` +
    `👤 Cliente: <code>${clienteId}</code>\n` +
    `💰 Saldo anterior: R$${saldoAnterior.toFixed(2)}\n` +
    `💰 Saldo atual: R$0.00`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_saldos_clientes')]])
    }
  );
}

async function handleAjustarSaldo(ctx, clienteId) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const saldoAtual = db.saldos.buscar(bot.id, clienteId);
  
  resellerState.set(ctx.from.id, { 
    step: 'ajustar_saldo', 
    clienteId: clienteId,
    saldoAtual: saldoAtual
  });
  
  await ctx.reply(
    `✏️ <b>Ajustar Saldo</b>\n\n` +
    `👤 Cliente: <code>${clienteId}</code>\n` +
    `💰 Saldo atual: R$${saldoAtual.toFixed(2)}\n\n` +
    `Digite o <b>novo valor</b> do saldo:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_saldos_clientes')]])
    }
  );
}

// ==================== MEU PLANO ====================

async function handleMeuPlano(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const plano = config.getPlanoById(usuario.plano_id);
  const dataExp = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
  const ativacoes = usuario.ativacoes_restantes !== null ? usuario.ativacoes_restantes : '∞';

  // Verificar se está vencido
  const agora = new Date();
  const expiracao = new Date(usuario.data_expiracao);
  const vencido = agora > expiracao;

  let mensagem = `💳 *Meu Plano*\n\n`;
  mensagem += `*Plano atual:* ${plano?.nome || usuario.plano_id}\n`;
  mensagem += `*Ativações restantes:* ${ativacoes}\n`;
  mensagem += `*Válido até:* ${dataExp}\n`;
  
  if (vencido) {
    mensagem += `\n⚠️ *Seu plano está vencido!*\n`;
  }

  mensagem += `\n*Planos disponíveis:*\n`;
  mensagem += `🥉 Básico: R$25/mês (50 ativações)\n`;
  mensagem += `💎 Ilimitado: R$50/mês (∞ ativações)`;

  await ctx.editMessageText(mensagem, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🥉 Assinar Básico - R$25', 'reseller_assinar_basico')],
      [Markup.button.callback('💎 Assinar Ilimitado - R$50', 'reseller_assinar_ilimitado')],
      [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
    ])
  });
}

// ==================== RELATÓRIOS ====================

async function handleRelatorios(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const stats = db.ativacoes.estatisticas(usuario.id);
  const ativacoesMes = db.ativacoes.contarPorUsuarioMes(usuario.id);

  await ctx.editMessageText(
    `📊 *Relatórios*\n\n` +
    `*Este mês:* ${ativacoesMes} ativações\n` +
    `*Total:* ${stats?.total || 0} ativações\n` +
    `*Sucesso:* ${stats?.sucesso || 0}\n` +
    `*Falhas:* ${stats?.falha || 0}`,
    { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_menu')]])
    }
  );
}

// ==================== HANDLER DE TEXTO ====================

async function handleResellerText(ctx) {
  const state = resellerState.get(ctx.from.id);
  if (!state) return false;

  const text = ctx.message.text;
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());

  switch (state.step) {
    // CADASTRO
    case 'cadastro_nome': {
      // Preservar dados de afiliado se existirem
      const dadosAfiliado = {
        codigoAfiliado: state.codigoAfiliado,
        indicadorId: state.indicadorId,
        indicadorNome: state.indicadorNome
      };
      
      resellerState.set(ctx.from.id, { 
        step: 'cadastro_whatsapp', 
        nome: text,
        ...dadosAfiliado
      });
      await ctx.reply(
        `📝 *Cadastro - Passo 2/2*\n\n` +
        `Digite seu *WhatsApp* (com DDD):\n` +
        `Exemplo: 11999998888`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'cadastro_whatsapp': {
      const nome = state.nome;
      const whatsapp = text.replace(/\D/g, '');
      
      try {
        // Verificar se usuário tem username definido no Telegram
        if (!ctx.from.username) {
          await ctx.reply(
            `⚠️ *Você precisa criar um @username no Telegram!*\n\n` +
            `📱 *Como criar seu username:*\n\n` +
            `1️⃣ Abra as *Configurações* do Telegram\n` +
            `2️⃣ Toque em *Editar perfil*\n` +
            `3️⃣ Toque em *Nome de usuário*\n` +
            `4️⃣ Escolha um nome único (ex: @seunome123)\n` +
            `5️⃣ Salve e volte aqui para se cadastrar!\n\n` +
            `💡 O username é necessário para gerar seu link de indicação.`,
            { parse_mode: 'Markdown' }
          );
          resellerState.delete(ctx.from.id);
          return true;
        }
        
        console.log(`[Cadastro] Iniciando cadastro para ${nome}, WhatsApp: ${whatsapp}`);
        
        // Verificar se usuário já existe
        const existente = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
        if (existente) {
          console.log(`[Cadastro] Usuário já existe: ID=${existente.id}`);
          await ctx.reply('⚠️ Você já possui uma conta cadastrada!');
          resellerState.delete(ctx.from.id);
          await showResellerMenu(ctx, existente);
          return true;
        }
        
        // Criar usuário
        console.log('[Cadastro] Criando usuário...');
        const novoUsuario = db.usuarios.criar(
          ctx.from.id.toString(),
          ctx.from.username,
          nome,
          whatsapp
        );
        
        if (!novoUsuario) {
          throw new Error('Falha ao criar usuário - retornou null');
        }
        console.log(`[Cadastro] Usuário criado: ID=${novoUsuario.id}`);

        // Gerar código de afiliado
        console.log('[Cadastro] Gerando código de afiliado...');
        const codigoAfiliado = db.afiliados.gerarCodigo(nome, ctx.from.username, ctx.from.id);
        console.log(`[Cadastro] Código gerado: ${codigoAfiliado}`);
        
        console.log('[Cadastro] Definindo código no banco...');
        db.afiliados.definirCodigo(novoUsuario.id, codigoAfiliado);
        console.log('[Cadastro] Código definido com sucesso');
      
      // Vincular indicação se veio por link de afiliado
      if (state.indicadorId) {
        db.afiliados.vincularIndicacao(novoUsuario.id, state.indicadorId);
        console.log(`[Afiliado] ${nome} (${novoUsuario.id}) vinculado ao indicador ${state.indicadorNome} (${state.indicadorId})`);
      }

      // Criar registro de bot vazio
      db.bots.criar(novoUsuario.id);

      resellerState.delete(ctx.from.id);

      let mensagem = `✅ *Conta criada com sucesso!*\n\n`;
      mensagem += `Você tem *7 dias* de teste grátis com *20 ativações*.\n\n`;
      
      // Mostrar benefício de indicação
      if (state.indicadorId) {
        mensagem += `🎁 *Bônus de indicação ativo!*\n`;
        mensagem += `Você ganha R$2,50 de desconto permanente nas mensalidades.\n\n`;
      }
      
      mensagem += `🔗 *Seu link de indicação:*\n`;
      mensagem += `\`t.me/${ctx.botInfo.username}?start=ref_${codigoAfiliado}\`\n`;
      mensagem += `Compartilhe e ganhe R$5 de desconto por indicado!\n\n`;
      
      mensagem += `Próximos passos:\n`;
      mensagem += `1. Configure seu bot\n`;
      mensagem += `2. Configure suas credenciais\n`;
      mensagem += `3. Adicione produtos\n`;
      mensagem += `4. Comece a vender!`;

      await ctx.reply(mensagem, { parse_mode: 'Markdown' });

      // Buscar usuário atualizado com código de afiliado
      const usuarioAtualizado = db.usuarios.buscarPorId(novoUsuario.id);
      await showResellerMenu(ctx, usuarioAtualizado);
      return true;
      
      } catch (error) {
        console.error('[Cadastro] Erro ao criar conta:', error);
        console.error('[Cadastro] Tipo do erro:', typeof error);
        console.error('[Cadastro] Message:', error?.message);
        console.error('[Cadastro] Stack:', error?.stack);
        
        const errorMsg = error?.message || error || 'Erro desconhecido';
        await ctx.reply(
          `❌ *Erro ao criar conta*\n\n` +
          `Ocorreu um erro: ${errorMsg}\n\n` +
          `Por favor, tente novamente ou entre em contato com o suporte.`,
          { parse_mode: 'Markdown' }
        );
        resellerState.delete(ctx.from.id);
        return true;
      }
    }

    // VINCULAR BOT
    case 'vincular_token': {
      await ctx.reply('🔍 Validando token...');
      
      const validation = await botManager.validateToken(text);
      
      if (!validation.valid) {
        await ctx.reply(
          `❌ Token inválido!\n\nErro: ${validation.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_bot')]])
        );
        return true;
      }

      // Verificar se token já está em uso
      const existente = db.bots.buscarPorToken(text);
      if (existente) {
        await ctx.reply('❌ Este token já está em uso por outro usuário.');
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Vincular
      db.bots.vincularToken(
        usuario.id,
        text,
        validation.botInfo.username,
        validation.botInfo.firstName
      );

      // Iniciar bot
      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      await botManager.startBot(bot);

      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Bot vinculado com sucesso!*\n\n` +
        `*Nome:* ${validation.botInfo.firstName}\n` +
        `*Username:* @${validation.botInfo.username}\n\n` +
        `Seu bot já está ativo!\n` +
        `Acesse: t.me/${validation.botInfo.username}`,
        { parse_mode: 'Markdown', ...menuPrincipal }
      );
      return true;
    }

    // DEFINIR PREÇO DO PRODUTO
    case 'definir_preco': {
      const preco = parseFloat(text.replace(',', '.'));
      
      if (isNaN(preco) || preco <= 0) {
        await ctx.reply('❌ Digite um preço válido. Exemplo: 80 ou 80.00');
        return true;
      }

      db.produtos.criar(
        usuario.id,
        state.nome,
        state.modulo,
        state.tier,
        preco
      );

      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Produto adicionado!*\n\n` +
        `*${state.nome}*\n` +
        `Preço: R$${preco.toFixed(2)}`,
        { parse_mode: 'Markdown', ...menuPrincipal }
      );
      return true;
    }

    // ALTERAR PREÇO DE PRODUTO
    case 'alterar_preco': {
      const novoPreco = parseFloat(text.replace(',', '.'));
      
      if (isNaN(novoPreco) || novoPreco <= 0) {
        await ctx.reply(
          '❌ Digite um preço válido. Exemplo: 80 ou 80.00',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_produtos')]])
        );
        return true;
      }

      db.produtos.atualizar(state.produtoId, { preco: novoPreco });

      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Preço atualizado!*\n\n` +
        `*${state.produtoNome}*\n` +
        `Novo preço: R$${novoPreco.toFixed(2)}`,
        { parse_mode: 'Markdown', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS IBO PRO
    case 'cred_ibo_user': {
      resellerState.set(ctx.from.id, { step: 'cred_ibo_pass', username: text });
      await ctx.reply(
        `🔐 *Configurar IBO Pro*\n\n` +
        `Agora digite sua *senha*:`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'cred_ibo_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        username: state.username,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('ibo_pro', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_ibo')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'ibo_pro', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Credenciais IBO Pro salvas com sucesso!*`,
        { parse_mode: 'Markdown', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS MERCADO PAGO
    case 'cred_mp': {
      await ctx.reply('🔍 Testando conexão...');
      
      const paymentService = createPaymentService(text);
      const teste = await paymentService.testarConexao();
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Access Token inválido!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_mp')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'mercadopago', { accessToken: text });
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ *Mercado Pago configurado!*\n\n` +
        `Conta: ${teste.email}`,
        { parse_mode: 'Markdown', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS IBOSOL
    case 'cred_ibosol_email': {
      resellerState.set(ctx.from.id, { step: 'cred_ibosol_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar IboSol</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_ibosol_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais usando ibo_player como teste
      const teste = await activationService.testarCredenciais('ibo_player', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_ibosol')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'ibosol', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais IboSol salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS VU PLAYER PRO
    case 'cred_vuplayer_email': {
      resellerState.set(ctx.from.id, { step: 'cred_vuplayer_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar VU Player Pro</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_vuplayer_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('vu_player_pro', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_vuplayer')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'vu_player_pro', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais VU Player Pro salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS ENZOPLAYER
    case 'cred_enzo_email': {
      resellerState.set(ctx.from.id, { step: 'cred_enzo_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar EnzoPlayer</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_enzo_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('enzo_player', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_enzo')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'enzo_player', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais EnzoPlayer salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS DREAMTV
    case 'cred_dreamtv_email': {
      resellerState.set(ctx.from.id, { step: 'cred_dreamtv_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar DreamTV</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_dreamtv_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('dreamtv', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_dreamtv')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'dreamtv', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais DreamTV salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS MULTI-PLAYER
    case 'cred_multiplayer_email': {
      resellerState.set(ctx.from.id, { step: 'cred_multiplayer_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Multi-Player</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_multiplayer_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais usando o módulo multi_player
      const multiPlayerModule = require('../modules/multi_player');
      const teste = await multiPlayerModule.testConnection(credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_multiplayer')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'multi_player', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais Multi-Player salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}\n` +
        `💰 Créditos: ${teste.credits || 'N/A'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // BUSCAR SALDO CLIENTE
    case 'buscar_saldo': {
      const clienteId = text.trim();
      
      if (!/^\d+$/.test(clienteId)) {
        await ctx.reply(
          '❌ ID inválido. Digite apenas números.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_saldos_clientes')]])
        );
        return true;
      }

      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      if (!bot) {
        await ctx.reply('❌ Bot não encontrado.');
        resellerState.delete(ctx.from.id);
        return true;
      }

      const saldo = db.saldos.buscar(bot.id, clienteId);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `👤 <b>Cliente:</b> <code>${clienteId}</code>\n\n` +
        `💰 <b>Saldo atual:</b> R$${saldo.toFixed(2)}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🗑️ Zerar Saldo', `reseller_zerar_saldo_${clienteId}`)],
            [Markup.button.callback('✏️ Ajustar Saldo', `reseller_ajustar_saldo_${clienteId}`)],
            [Markup.button.callback('🔙 Voltar', 'reseller_saldos_clientes')]
          ])
        }
      );
      return true;
    }

    // AJUSTAR SALDO CLIENTE
    case 'ajustar_saldo': {
      const novoValor = parseFloat(text.replace(',', '.'));
      
      if (isNaN(novoValor) || novoValor < 0) {
        await ctx.reply(
          '❌ Valor inválido. Digite um número válido (mínimo 0).',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_saldos_clientes')]])
        );
        return true;
      }

      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      if (!bot) {
        await ctx.reply('❌ Bot não encontrado.');
        resellerState.delete(ctx.from.id);
        return true;
      }

      const clienteId = state.clienteId;
      const saldoAnterior = state.saldoAtual;
      
      db.saldos.definir(bot.id, clienteId, novoValor);
      
      console.log(`[Saldo] Revendedor ${usuario.id} ajustou saldo do cliente ${clienteId}: R$${saldoAnterior} → R$${novoValor}`);

      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Saldo Ajustado!</b>\n\n` +
        `👤 Cliente: <code>${clienteId}</code>\n` +
        `💰 Saldo anterior: R$${saldoAnterior.toFixed(2)}\n` +
        `💰 Saldo novo: R$${novoValor.toFixed(2)}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_saldos_clientes')]])
        }
      );
      return true;
    }

    // BUSCAR MAC NO HISTÓRICO (REVENDEDOR)
    case 'buscar_mac_revendedor': {
      const macBusca = text.trim().toLowerCase();
      
      // Validar formato - aceita MACs atípicos (letras fora do hex como J, K, Z, etc)
      const macRegex = /^([0-9a-z]{1,2}[:-]){5}([0-9a-z]{1,2})$/i;
      const macSemSeparador = /^[0-9a-z]{12}$/i;
      
      if (!macRegex.test(macBusca) && !macSemSeparador.test(macBusca)) {
        await ctx.reply(
          '❌ Formato de MAC inválido.\n\n' +
          'Digite o MAC completo no formato:\n' +
          '<code>00:1A:2B:3C:4D:5E</code>\n' +
          '<code>JK:01:ZC:LB:12:00</code>',
          { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_historico')]])
          }
        );
        return true;
      }

      // Formatar MAC para busca
      let macFormatado = macBusca;
      if (macSemSeparador.test(macBusca)) {
        macFormatado = macBusca.replace(/(.{2})/g, '$1:').slice(0, -1);
      }

      const bots = db.bots.listarPorUsuario(usuario.id);
      const botIds = bots.map(b => b.id);
      const ativacoes = db.ativacoes.buscarPorMacRevendedor(botIds, macFormatado);

      resellerState.delete(ctx.from.id);

      if (ativacoes.length === 0) {
        await ctx.reply(
          `🔍 <b>Resultado da Busca</b>\n\n` +
          `Nenhuma ativação encontrada para o MAC:\n` +
          `<code>${macFormatado}</code>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔍 Nova Busca', 'reseller_buscar_mac')],
              [Markup.button.callback('🔙 Voltar', 'reseller_historico')]
            ])
          }
        );
        return true;
      }

      let mensagem = `🔍 <b>Resultado da Busca</b>\n\n`;
      mensagem += `MAC: <code>${macFormatado}</code>\n\n`;

      ativacoes.forEach((a, i) => {
        const validade = extrairValidadeHist(a.resposta_api, a.tier);
        const cliente = a.cliente_nome || a.cliente_username || a.cliente_telegram_id;
        mensagem += `<b>${i + 1}. ${a.produto_nome}</b>\n`;
        mensagem += `   👤 Cliente: ${cliente}\n`;
        mensagem += `   📅 Data: ${formatarDataHist(a.criado_em)}\n`;
        mensagem += `   ⏰ Validade: ${validade}\n`;
        mensagem += `   🎫 Código: ${a.pedido_codigo}\n\n`;
      });

      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Nova Busca', 'reseller_buscar_mac')],
          [Markup.button.callback('🔙 Voltar', 'reseller_historico')]
        ])
      });
      return true;
    }

    // BUSCAR CLIENTE NO HISTÓRICO (REVENDEDOR)
    case 'buscar_cliente_revendedor': {
      const clienteIdBusca = text.trim();
      
      if (!/^\d+$/.test(clienteIdBusca)) {
        await ctx.reply(
          '❌ ID inválido. Digite apenas números.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_historico')]])
        );
        return true;
      }

      const bots = db.bots.listarPorUsuario(usuario.id);
      const botIds = bots.map(b => b.id);
      const ativacoes = db.ativacoes.buscarPorClienteRevendedor(botIds, clienteIdBusca);

      resellerState.delete(ctx.from.id);

      if (ativacoes.length === 0) {
        await ctx.reply(
          `🔍 <b>Resultado da Busca</b>\n\n` +
          `Nenhuma ativação encontrada para o cliente:\n` +
          `<code>${clienteIdBusca}</code>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('👤 Nova Busca', 'reseller_buscar_cliente')],
              [Markup.button.callback('🔙 Voltar', 'reseller_historico')]
            ])
          }
        );
        return true;
      }

      let mensagem = `🔍 <b>Resultado da Busca</b>\n\n`;
      const primeiraAtiv = ativacoes[0];
      const clienteNome = primeiraAtiv.cliente_nome || primeiraAtiv.cliente_username || clienteIdBusca;
      mensagem += `👤 Cliente: ${clienteNome}\n`;
      mensagem += `🆔 ID: <code>${clienteIdBusca}</code>\n\n`;
      mensagem += `Total: ${ativacoes.length} ativação(ões)\n\n`;

      // Mostrar últimas 5
      const ultimas = ativacoes.slice(0, 5);
      ultimas.forEach((a, i) => {
        const validade = extrairValidadeHist(a.resposta_api, a.tier);
        mensagem += `<b>${i + 1}. ${a.produto_nome}</b>\n`;
        mensagem += `   📍 MAC: <code>${a.mac_address}</code>\n`;
        mensagem += `   📅 Data: ${formatarDataHist(a.criado_em)}\n`;
        mensagem += `   ⏰ Validade: ${validade}\n\n`;
      });

      if (ativacoes.length > 5) {
        mensagem += `<i>Mostrando últimas 5 de ${ativacoes.length} ativações.</i>`;
      }

      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👤 Nova Busca', 'reseller_buscar_cliente')],
          [Markup.button.callback('🔙 Voltar', 'reseller_historico')]
        ])
      });
      return true;
    }
  }

  return false;
}

// ==================== VOLTAR AO MENU ====================

async function handleBackToMenu(ctx) {
  await ctx.answerCbQuery();
  resellerState.delete(ctx.from.id);
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const plano = config.getPlanoById(usuario.plano_id);
  const dataExp = new Date(usuario.data_expiracao).toLocaleDateString('pt-BR');
  const ativacoes = usuario.ativacoes_restantes !== null ? usuario.ativacoes_restantes : '∞';

  await ctx.editMessageText(
    `🏠 *Menu Principal*\n\n` +
    `👤 Olá, *${usuario.nome}*!\n\n` +
    `📦 *Plano:* ${plano?.nome || usuario.plano_id}\n` +
    `🔢 *Ativações:* ${ativacoes}\n` +
    `📅 *Válido até:* ${dataExp}\n\n` +
    `Selecione uma opção:`,
    { parse_mode: 'Markdown', ...menuPrincipal }
  );
}

// ==================== HISTÓRICO DE ATIVAÇÕES (REVENDEDOR) ====================

/**
 * Formata data para exibição
 */
function formatarDataHist(dataStr) {
  if (!dataStr) return '-';
  const data = new Date(dataStr);
  return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Extrai validade da resposta da API
 */
function extrairValidadeHist(respostaApi, tier) {
  try {
    if (!respostaApi) {
      if (tier === 'LIFETIME') return 'VITALÍCIO';
      const data = new Date();
      data.setDate(data.getDate() + 365);
      return data.toLocaleDateString('pt-BR');
    }

    const resposta = typeof respostaApi === 'string' ? JSON.parse(respostaApi) : respostaApi;
    
    if (resposta.activated_devices?.[0]?.expire_date) {
      const expireDate = resposta.activated_devices[0].expire_date;
      if (expireDate.includes('209') || expireDate.includes('210')) {
        return 'VITALÍCIO';
      }
      return new Date(expireDate).toLocaleDateString('pt-BR');
    }
    
    if (resposta.expire_date) {
      return new Date(resposta.expire_date).toLocaleDateString('pt-BR');
    }

    if (tier === 'LIFETIME') return 'VITALÍCIO';
    const data = new Date();
    data.setDate(data.getDate() + 365);
    return data.toLocaleDateString('pt-BR');
    
  } catch (e) {
    if (tier === 'LIFETIME') return 'VITALÍCIO';
    const data = new Date();
    data.setDate(data.getDate() + 365);
    return data.toLocaleDateString('pt-BR');
  }
}

/**
 * Mostra histórico de ativações do revendedor
 */
async function handleHistoricoAtivacoes(ctx) {
  await ctx.answerCbQuery();

  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) {
    await ctx.reply('❌ Usuário não encontrado.');
    return;
  }

  // Buscar todos os bots do revendedor
  const bots = db.bots.listarPorUsuario(usuario.id);
  const botIds = bots.map(b => b.id);

  if (botIds.length === 0) {
    await ctx.editMessageText(
      `📋 <b>Histórico de Ativações</b>\n\n` +
      `Você ainda não possui nenhum bot configurado.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_menu')]])
      }
    );
    return;
  }

  const ativacoes = db.ativacoes.listarPorBots(botIds, 3);
  const total = db.ativacoes.contarPorBots(botIds);

  if (ativacoes.length === 0) {
    await ctx.editMessageText(
      `📋 <b>Histórico de Ativações</b>\n\n` +
      `Nenhuma ativação realizada ainda.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_menu')]])
      }
    );
    return;
  }

  let mensagem = `📋 <b>Histórico de Ativações</b>\n\n`;
  mensagem += `Total: ${total} ativação(ões)\n\n`;

  ativacoes.forEach((a, i) => {
    const validade = extrairValidadeHist(a.resposta_api, a.tier);
    const cliente = a.cliente_nome || a.cliente_username || a.cliente_telegram_id;
    mensagem += `<b>${i + 1}. ${a.produto_nome}</b>\n`;
    mensagem += `   👤 Cliente: ${cliente}\n`;
    mensagem += `   📍 MAC: <code>${a.mac_address}</code>\n`;
    mensagem += `   📅 Data: ${formatarDataHist(a.criado_em)}\n`;
    mensagem += `   ⏰ Validade: ${validade}\n`;
    if (bots.length > 1 && a.bot_nome) {
      mensagem += `   🤖 Bot: ${a.bot_nome}\n`;
    }
    mensagem += `\n`;
  });

  if (total > 3) {
    mensagem += `<i>Mostrando últimas 3 de ${total} ativações.</i>`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Buscar por MAC', 'reseller_buscar_mac')],
      [Markup.button.callback('👤 Buscar por Cliente', 'reseller_buscar_cliente')],
      [Markup.button.callback('📥 Baixar Histórico', 'reseller_baixar_historico')],
      [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
    ])
  });
}

/**
 * Solicita MAC para busca (revendedor)
 */
async function handleBuscarMacRevendedor(ctx) {
  await ctx.answerCbQuery();

  resellerState.set(ctx.from.id, { step: 'buscar_mac_revendedor' });

  await ctx.editMessageText(
    `🔍 <b>Buscar por MAC</b>\n\n` +
    `Digite o <b>MAC Address completo</b>:\n\n` +
    `Exemplo: <code>00:1A:2B:3C:4D:5E</code>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancelar', 'reseller_historico')]
      ])
    }
  );
}

/**
 * Solicita ID do cliente para busca
 */
async function handleBuscarClienteRevendedor(ctx) {
  await ctx.answerCbQuery();

  resellerState.set(ctx.from.id, { step: 'buscar_cliente_revendedor' });

  await ctx.editMessageText(
    `👤 <b>Buscar por Cliente</b>\n\n` +
    `Digite o <b>Telegram ID</b> do cliente:\n\n` +
    `Exemplo: <code>123456789</code>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancelar', 'reseller_historico')]
      ])
    }
  );
}

/**
 * Gera e envia arquivo TXT com histórico (revendedor)
 */
async function handleBaixarHistoricoRevendedor(ctx) {
  await ctx.answerCbQuery();
  
  await ctx.reply('⏳ Gerando arquivo...');

  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bots = db.bots.listarPorUsuario(usuario.id);
  const botIds = bots.map(b => b.id);

  const ativacoes = db.ativacoes.listarTodasRevendedor(botIds);

  if (ativacoes.length === 0) {
    await ctx.reply('❌ Nenhuma ativação encontrada.');
    return;
  }

  // Gerar conteúdo do TXT
  let conteudo = '═══════════════════════════════════════════════\n';
  conteudo += '       HISTÓRICO COMPLETO DE ATIVAÇÕES\n';
  conteudo += `       Revendedor: ${usuario.nome}\n`;
  conteudo += '═══════════════════════════════════════════════\n\n';

  ativacoes.forEach((a, i) => {
    const validade = extrairValidadeHist(a.resposta_api, a.tier);
    const cliente = a.cliente_nome || a.cliente_username || a.cliente_telegram_id;
    conteudo += `#${i + 1} - ${a.produto_nome}\n`;
    conteudo += `    Cliente: ${cliente} (ID: ${a.cliente_telegram_id})\n`;
    conteudo += `    MAC: ${a.mac_address}\n`;
    conteudo += `    Data: ${formatarDataHist(a.criado_em)}\n`;
    conteudo += `    Validade: ${validade}\n`;
    conteudo += `    Código: ${a.pedido_codigo}\n`;
    if (bots.length > 1 && a.bot_nome) {
      conteudo += `    Bot: ${a.bot_nome}\n`;
    }
    conteudo += '───────────────────────────────────────────────\n\n';
  });

  conteudo += `Total: ${ativacoes.length} ativação(ões)\n`;
  conteudo += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;

  // Enviar como arquivo
  const buffer = Buffer.from(conteudo, 'utf-8');
  await ctx.replyWithDocument(
    { source: buffer, filename: `historico_ativacoes_${usuario.id}.txt` },
    { caption: `📄 Histórico completo: ${ativacoes.length} ativação(ões)` }
  );
}

// ==================== AFILIADOS ====================

/**
 * Menu de Afiliados
 */
async function handleAfiliados(ctx) {
  await ctx.answerCbQuery();

  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  if (!usuario) {
    await ctx.reply('❌ Usuário não encontrado.');
    return;
  }

  // Gerar código se não tiver
  if (!usuario.codigo_afiliado) {
    const codigo = db.afiliados.gerarCodigo(usuario.nome, usuario.username, usuario.telegram_id);
    db.afiliados.definirCodigo(usuario.id, codigo);
    usuario.codigo_afiliado = codigo;
  }

  // Buscar estatísticas
  const foiIndicado = !!usuario.indicado_por_id;
  const indicados = db.afiliados.listarIndicados(usuario.id);
  const indicadosAtivosNoMes = db.afiliados.listarIndicadosAtivosNoMes(usuario.id);
  const descontoInfo = db.afiliados.calcularDesconto(usuario.id);
  const podeIndicar = db.afiliados.podeIndicar(usuario.id);

  // Limites
  const maxIndicados = foiIndicado ? 5 : 6;
  
  let mensagem = `🎁 <b>Programa de Afiliados</b>\n\n`;
  
  // Link de indicação
  mensagem += `🔗 <b>Seu link de indicação:</b>\n`;
  mensagem += `<code>t.me/${ctx.botInfo.username}?start=ref_${usuario.codigo_afiliado}</code>\n\n`;
  
  // Status de indicação
  if (foiIndicado) {
    const indicador = db.afiliados.buscarIndicador(usuario.id);
    mensagem += `👤 <b>Indicado por:</b> ${indicador?.nome || 'Usuário removido'}\n`;
    mensagem += `💰 <b>Desconto por indicação:</b> R$2,50/mês\n\n`;
  }
  
  // Estatísticas de indicados
  mensagem += `📊 <b>Seus indicados:</b>\n`;
  mensagem += `├ Total: ${indicados.length}/${maxIndicados}\n`;
  mensagem += `├ Ativos este mês: ${indicadosAtivosNoMes.length}\n`;
  mensagem += `└ Vagas: ${podeIndicar.pode ? podeIndicar.vagasRestantes : 0}\n\n`;
  
  // Desconto atual
  mensagem += `💰 <b>Desconto atual:</b> R$${descontoInfo.desconto.toFixed(2)}\n`;
  
  if (descontoInfo.detalhes) {
    const d = descontoInfo.detalhes;
    if (d.foiIndicado) {
      mensagem += `├ Por ser indicado: R$${d.descontoBase.toFixed(2)}\n`;
    }
    mensagem += `├ Por indicados ativos: R$${d.descontoPorIndicados.toFixed(2)}\n`;
    mensagem += `└ Máximo possível: R$${d.maxDesconto.toFixed(2)}\n\n`;
  }
  
  // Lista de indicados
  if (indicados.length > 0) {
    mensagem += `👥 <b>Seus indicados:</b>\n`;
    
    const indicadosAtivosIds = new Set(indicadosAtivosNoMes.map(i => i.id));
    
    indicados.slice(0, 6).forEach(ind => {
      const ativo = indicadosAtivosIds.has(ind.id);
      const status = ativo ? '✅' : '⏳';
      mensagem += `${status} ${ind.nome}\n`;
    });
    
    if (indicados.length > 6) {
      mensagem += `<i>... e mais ${indicados.length - 6}</i>\n`;
    }
    mensagem += `\n`;
  }
  
  // Dica
  if (podeIndicar.pode) {
    mensagem += `💡 <b>Dica:</b> Compartilhe seu link e ganhe R$5 de desconto por cada pessoa que se cadastrar e renovar!`;
  } else {
    mensagem += `🎉 <b>Parabéns!</b> Você atingiu o limite máximo de indicações!`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'reseller_afiliados')],
      [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
    ])
  });
}

module.exports = {
  showResellerMenu,
  showCadastro,
  handleCriarConta,
  handleMeuBot,
  handleVincularBot,
  handleIniciarBot,
  handlePararBot,
  handleReiniciarBot,
  handleDesvincularBot,
  handleConfirmaDesvincular,
  handleProdutos,
  handleAddProduto,
  handleSelectProduto,
  handleEditProduto,
  handleAlterarPreco,
  handleDesativarProduto,
  handleAtivarProduto,
  handleExcluirProduto,
  handleConfirmaExcluirProduto,
  handleCredenciais,
  handleCredIboPro,
  handleCredIboSol,
  handleCredVuPlayerPro,
  handleCredEnzoPlayer,
  handleCredDreamTV,
  handleCredMultiPlayer,
  handleCredMP,
  handleSaldoApps,
  handleSaldosClientes,
  handleBuscarSaldo,
  handleZerarSaldo,
  handleConfirmaZerarSaldo,
  handleAjustarSaldo,
  handleHistoricoAtivacoes,
  handleBuscarMacRevendedor,
  handleBuscarClienteRevendedor,
  handleBaixarHistoricoRevendedor,
  handleAfiliados,
  handleMeuPlano,
  handleRelatorios,
  handleResellerText,
  handleBackToMenu,
  resellerState
};
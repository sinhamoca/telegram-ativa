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
  [Markup.button.callback('🤖 Meu Bot', 'reseller_bot'), Markup.button.callback('📱 Produtos', 'reseller_produtos')],
  [Markup.button.callback('🔐 Credenciais', 'reseller_credenciais'), Markup.button.callback('💰 Saldo Apps', 'reseller_saldo_apps')],
  [Markup.button.callback('👥 Clientes', 'reseller_clientes'), Markup.button.callback('📋 Histórico', 'reseller_historico')],
  [Markup.button.callback('🎁 Afiliados', 'reseller_afiliados'), Markup.button.callback('💳 Meu Plano', 'reseller_plano')],
  [Markup.button.callback('⚽ Jogos do Dia', 'reseller_jogos'), Markup.button.callback('📊 Relatórios', 'reseller_relatorios')],
  [Markup.button.callback('🔔 Notificações', 'reseller_notificacoes')]
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

const PRODUTOS_POR_PAGINA = 8;

async function handleProdutos(ctx, pagina = 0) {
  await ctx.answerCbQuery().catch(() => {});
  
  // Garantir que pagina é um número válido (Telegraf passa 'next' como segundo parâmetro)
  if (typeof pagina !== 'number' || isNaN(pagina)) {
    pagina = 0;
  }
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const produtos = db.produtos.listarPorUsuario(usuario.id);

  if (produtos.length === 0) {
    await ctx.editMessageText(
      `📱 *Meus Produtos*\n\n` +
      `Você ainda não configurou nenhum produto.\n\n` +
      `Use o *Cadastro Rápido* para configurar todos de uma vez!`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⚡ Cadastro Rápido', 'reseller_cadastro_rapido')],
          [Markup.button.callback('➕ Adicionar Um Produto', 'reseller_add_produto_0')],
          [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
        ])
      }
    );
    return;
  }

  // Calcular paginação
  const totalPaginas = Math.ceil(produtos.length / PRODUTOS_POR_PAGINA);
  const paginaAtual = Math.min(Math.max(0, pagina), totalPaginas - 1);
  const inicio = paginaAtual * PRODUTOS_POR_PAGINA;
  const fim = Math.min(inicio + PRODUTOS_POR_PAGINA, produtos.length);
  const produtosPagina = produtos.slice(inicio, fim);

  let mensagem = `📱 *Meus Produtos* (${produtos.length} total)\n\n`;
  const buttons = [];

  for (const p of produtosPagina) {
    const status = p.ativo ? '🟢' : '🔴';
    mensagem += `${status} *${p.nome}* - R$${p.preco.toFixed(2)}\n`;
    buttons.push([Markup.button.callback(`⚙️ ${p.nome}`, `reseller_edit_produto_${p.id}`)]);
  }

  // Botões de navegação se houver mais de uma página
  if (totalPaginas > 1) {
    const navButtons = [];
    if (paginaAtual > 0) {
      navButtons.push(Markup.button.callback('◀️ Anterior', `reseller_produtos_page_${paginaAtual - 1}`));
    }
    navButtons.push(Markup.button.callback(`📄 ${paginaAtual + 1}/${totalPaginas}`, 'noop'));
    if (paginaAtual < totalPaginas - 1) {
      navButtons.push(Markup.button.callback('Próximo ▶️', `reseller_produtos_page_${paginaAtual + 1}`));
    }
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('⚡ Cadastro Rápido', 'reseller_cadastro_rapido')]);
  buttons.push([Markup.button.callback('➕ Adicionar Um Produto', 'reseller_add_produto_0')]);
  buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_menu')]);

  await ctx.editMessageText(mensagem, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
}

// Handler para navegação de páginas de produtos
async function handleProdutosPage(ctx) {
  const match = ctx.match[0].match(/reseller_produtos_page_(\d+)/);
  const pagina = match ? parseInt(match[1]) : 0;
  await handleProdutos(ctx, pagina);
}

const APPS_POR_PAGINA = 10;

async function handleAddProduto(ctx, pagina = 0) {
  await ctx.answerCbQuery().catch(() => {});
  
  // Garantir que pagina é um número válido (Telegraf passa 'next' como segundo parâmetro)
  if (typeof pagina !== 'number' || isNaN(pagina)) {
    pagina = 0;
  }
  
  // Gerar lista de todos os produtos (módulo + tier)
  const todosProdutos = [];
  for (const [key, modulo] of Object.entries(config.MODULOS)) {
    for (const [tierKey, tier] of Object.entries(modulo.tiers)) {
      todosProdutos.push({
        modulo: key,
        moduloId: modulo.id,
        tier: tierKey,
        tierId: tier.id,
        nome: `${modulo.nome} ${tier.nome}`
      });
    }
  }

  // Calcular paginação
  const totalPaginas = Math.ceil(todosProdutos.length / APPS_POR_PAGINA);
  const paginaAtual = Math.min(Math.max(0, pagina), totalPaginas - 1);
  const inicio = paginaAtual * APPS_POR_PAGINA;
  const fim = Math.min(inicio + APPS_POR_PAGINA, todosProdutos.length);
  const produtosPagina = todosProdutos.slice(inicio, fim);

  const buttons = [];

  for (const p of produtosPagina) {
    buttons.push([Markup.button.callback(
      `📱 ${p.nome}`,
      `reseller_select_produto_${p.moduloId}_${p.tierId}`
    )]);
  }

  // Botões de navegação
  if (totalPaginas > 1) {
    const navButtons = [];
    if (paginaAtual > 0) {
      navButtons.push(Markup.button.callback('◀️ Anterior', `reseller_add_produto_${paginaAtual - 1}`));
    }
    navButtons.push(Markup.button.callback(`📄 ${paginaAtual + 1}/${totalPaginas}`, 'noop'));
    if (paginaAtual < totalPaginas - 1) {
      navButtons.push(Markup.button.callback('Próximo ▶️', `reseller_add_produto_${paginaAtual + 1}`));
    }
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_produtos_page_0')]);

  await ctx.editMessageText(
    `➕ *Adicionar Produto*\n\n` +
    `📋 Total: ${todosProdutos.length} produtos disponíveis\n\n` +
    `Escolha o produto:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// Handler para navegação de páginas ao adicionar produto
async function handleAddProdutoPage(ctx) {
  const match = ctx.match[0].match(/reseller_add_produto_(\d+)/);
  const pagina = match ? parseInt(match[1]) : 0;
  await handleAddProduto(ctx, pagina);
}

// ==================== CADASTRO RÁPIDO ====================

/**
 * Gera lista de todos os produtos possíveis (módulo + tier)
 */
function gerarListaProdutos() {
  const lista = [];
  for (const [key, modulo] of Object.entries(config.MODULOS)) {
    for (const [tierKey, tier] of Object.entries(modulo.tiers)) {
      lista.push({
        modulo: key,
        tier: tierKey,
        nome: `${modulo.nome} ${tier.nome}`,
        nomeModulo: modulo.nome,
        nomeTier: tier.nome
      });
    }
  }
  return lista;
}

/**
 * Inicia o cadastro rápido
 */
async function handleCadastroRapido(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const produtosExistentes = db.produtos.listarPorUsuario(usuario.id);
  
  // Gerar lista de todos os produtos possíveis
  const todosProdutos = gerarListaProdutos();
  
  // Mapear produtos já cadastrados
  const cadastrados = new Set();
  for (const p of produtosExistentes) {
    cadastrados.add(`${p.modulo}_${p.tier}`);
  }
  
  // Filtrar apenas os que ainda não foram cadastrados
  const produtosParaCadastrar = todosProdutos.filter(p => 
    !cadastrados.has(`${p.modulo}_${p.tier}`)
  );
  
  if (produtosParaCadastrar.length === 0) {
    await ctx.editMessageText(
      `⚡ *Cadastro Rápido*\n\n` +
      `✅ Todos os produtos já estão cadastrados!\n\n` +
      `Você pode editar os preços individualmente no menu de produtos.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_produtos')]])
      }
    );
    return;
  }
  
  // Salvar estado
  resellerState.set(ctx.from.id, {
    step: 'cadastro_rapido',
    produtos: produtosParaCadastrar,
    indice: 0,
    cadastrados: 0,
    pulados: 0
  });
  
  // Mostrar explicação e primeiro produto
  await ctx.editMessageText(
    `⚡ *Cadastro Rápido*\n\n` +
    `📊 *${produtosParaCadastrar.length}* produtos para cadastrar.\n\n` +
    `Para cada produto:\n` +
    `• Digite o *valor* para ativar\n` +
    `• Clique em *Pular* para deixar inativo\n\n` +
    `Vamos começar!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('▶️ Começar', 'cadastro_rapido_proximo')],
        [Markup.button.callback('❌ Cancelar', 'reseller_produtos')]
      ])
    }
  );
}

/**
 * Mostra o próximo produto para cadastrar
 */
async function mostrarProximoProduto(ctx, isEdit = true) {
  const state = resellerState.get(ctx.from.id);
  
  if (!state || state.step !== 'cadastro_rapido') {
    return handleProdutos(ctx);
  }
  
  const { produtos, indice, cadastrados, pulados } = state;
  
  // Se acabou, mostrar resumo
  if (indice >= produtos.length) {
    resellerState.delete(ctx.from.id);
    
    const mensagem = `✅ *Cadastro Rápido Finalizado!*\n\n` +
      `📊 *Resumo:*\n` +
      `• ✅ Cadastrados: *${cadastrados}*\n` +
      `• ⏭️ Pulados: *${pulados}*\n` +
      `• 📦 Total: *${produtos.length}*`;
    
    const buttons = [[Markup.button.callback('📱 Ver Produtos', 'reseller_produtos')]];
    
    if (isEdit) {
      try {
        await ctx.editMessageText(mensagem, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      } catch(e) {
        await ctx.reply(mensagem, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        });
      }
    } else {
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
    return;
  }
  
  const produtoAtual = produtos[indice];
  const progresso = `${indice + 1}/${produtos.length}`;
  
  const mensagem = `⚡ *Cadastro Rápido* (${progresso})\n\n` +
    `📱 *${produtoAtual.nome}*\n\n` +
    `Digite o *valor de venda* ou clique em Pular:\n\n` +
    `_Exemplo: 50 ou 50.00_`;
  
  const buttons = [
    [Markup.button.callback('⏭️ Pular', 'cadastro_rapido_pular')],
    [Markup.button.callback('❌ Cancelar', 'cadastro_rapido_cancelar')]
  ];
  
  if (isEdit) {
    try {
      await ctx.editMessageText(mensagem, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch(e) {
      await ctx.reply(mensagem, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  } else {
    await ctx.reply(mensagem, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

/**
 * Pula o produto atual
 */
async function handlePularProduto(ctx) {
  await ctx.answerCbQuery('⏭️ Pulado');
  
  const state = resellerState.get(ctx.from.id);
  if (!state || state.step !== 'cadastro_rapido') {
    return handleProdutos(ctx);
  }
  
  // Avançar para próximo
  state.indice++;
  state.pulados++;
  resellerState.set(ctx.from.id, state);
  
  await mostrarProximoProduto(ctx, true);
}

/**
 * Cancela o cadastro rápido
 */
async function handleCancelarCadastroRapido(ctx) {
  await ctx.answerCbQuery('Cancelado');
  resellerState.delete(ctx.from.id);
  await handleProdutos(ctx);
}

/**
 * Processa o valor digitado no cadastro rápido
 */
async function processarValorCadastroRapido(ctx, texto) {
  const state = resellerState.get(ctx.from.id);
  
  if (!state || state.step !== 'cadastro_rapido') {
    return false;
  }
  
  // Validar valor
  const preco = parseFloat(texto.replace(',', '.'));
  
  if (isNaN(preco) || preco <= 0) {
    await ctx.reply(
      `❌ Valor inválido. Digite apenas números.\n\n` +
      `Exemplo: *50* ou *50.00*`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
  
  const { produtos, indice } = state;
  const produtoAtual = produtos[indice];
  
  // Buscar usuário
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  
  // Verificar se já existe (pode ter sido cadastrado de outra forma)
  const existente = db.queryOne(`
    SELECT * FROM produtos 
    WHERE usuario_id = ? AND modulo = ? AND tier = ?
  `, [usuario.id, produtoAtual.modulo, produtoAtual.tier]);
  
  if (existente) {
    // Atualizar preço e ativar
    db.produtos.atualizar(existente.id, { preco: preco });
    db.produtos.ativar(existente.id);
  } else {
    // Criar novo produto
    db.produtos.criar(usuario.id, produtoAtual.nome, produtoAtual.modulo, produtoAtual.tier, preco);
  }
  
  // Avançar para próximo
  state.indice++;
  state.cadastrados++;
  resellerState.set(ctx.from.id, state);
  
  // Mostrar confirmação rápida e próximo
  await ctx.reply(`✅ *${produtoAtual.nome}* - R$${preco.toFixed(2)}`, { parse_mode: 'Markdown' });
  
  // Pequeno delay para não parecer instantâneo demais
  await new Promise(resolve => setTimeout(resolve, 300));
  
  await mostrarProximoProduto(ctx, false);
  
  return true;
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
  const credLazerPlay = db.credenciais.buscar(usuario.id, 'lazer_play');
  const credLumina = db.credenciais.buscar(usuario.id, 'lumina');
  const credAssistPlus = db.credenciais.buscar(usuario.id, 'assist_plus');
  const credMultiPlayer = db.credenciais.buscar(usuario.id, 'multi_player');
  const credVivoPlayer = db.credenciais.buscar(usuario.id, 'vivo_player');
  const credQuickPlayer = db.credenciais.buscar(usuario.id, 'quick_player');
  const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');

  // Duplecast e SmartOne usam códigos, não credenciais
  const duplecastContagem = db.duplecastCodes.contar(usuario.id);
  const smartoneContagem = db.smartoneCodes.contar(usuario.id);

  const iboProStatus = credIboPro ? '✅ Configurado' : '❌ Não configurado';
  const iboSolStatus = credIboSol ? '✅ Configurado' : '❌ Não configurado';
  const vuPlayerStatus = credVuPlayer ? '✅ Configurado' : '❌ Não configurado';
  const enzoPlayerStatus = credEnzoPlayer ? '✅ Configurado' : '❌ Não configurado';
  const dreamTVStatus = credDreamTV ? '✅ Configurado' : '❌ Não configurado';
  const lazerPlayStatus = credLazerPlay ? '✅ Configurado' : '❌ Não configurado';
  const luminaStatus = credLumina ? '✅ Configurado' : '❌ Não configurado';
  const assistPlusStatus = credAssistPlus ? '✅ Configurado' : '❌ Não configurado';
  const duplecastStatus = duplecastContagem.disponiveis > 0 ? `✅ ${duplecastContagem.disponiveis} códigos` : '❌ Sem códigos';
  const smartoneStatus = smartoneContagem.disponiveis > 0 ? `✅ ${smartoneContagem.disponiveis} códigos` : '❌ Sem códigos';
  const multiPlayerStatus = credMultiPlayer ? '✅ Configurado' : '❌ Não configurado';
  const vivoPlayerStatus = credVivoPlayer ? '✅ Configurado' : '❌ Não configurado';
  const quickPlayerStatus = credQuickPlayer ? '✅ Configurado' : '❌ Não configurado';
  const mpStatus = credMP ? '✅ Configurado' : '❌ Não configurado';

  await ctx.editMessageText(
    `🔐 <b>Credenciais</b>\n\n` +
    `<b>IBO Pro:</b> ${iboProStatus}\n` +
    `<b>IboSol:</b> ${iboSolStatus}\n` +
    `<i>(IBO Player, BOB Player, etc)</i>\n` +
    `<b>VU Player Pro:</b> ${vuPlayerStatus}\n` +
    `<b>EnzoPlayer:</b> ${enzoPlayerStatus}\n` +
    `<b>DreamTV:</b> ${dreamTVStatus}\n` +
    `<b>Lazer Play:</b> ${lazerPlayStatus}\n` +
    `<b>Lumina:</b> ${luminaStatus}\n` +
    `<b>Assist+:</b> ${assistPlusStatus}\n` +
    `<b>Duplecast:</b> ${duplecastStatus}\n` +
    `<b>SmartOne:</b> ${smartoneStatus}\n` +
    `<b>Vivo Player:</b> ${vivoPlayerStatus}\n` +
    `<b>Quick Player:</b> ${quickPlayerStatus}\n` +
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
        [Markup.button.callback('🎮 Configurar Lazer Play', 'reseller_cred_lazerplay')],
        [Markup.button.callback('💡 Configurar Lumina', 'reseller_cred_lumina')],
        [Markup.button.callback('➕ Configurar Assist+', 'reseller_cred_assistplus')],
        [Markup.button.callback('📦 Gerenciar Códigos Duplecast', 'reseller_duplecast_codes')],
        [Markup.button.callback('📺 Gerenciar Códigos SmartOne', 'reseller_smartone_codes')],
        [Markup.button.callback('💳 Cartão Clouddy', 'reseller_clouddy_card')],
        [Markup.button.callback('📺 Configurar Vivo Player', 'reseller_cred_vivoplayer')],
        [Markup.button.callback('⚡ Configurar Quick Player', 'reseller_cred_quickplayer')],
        [Markup.button.callback('🎯 Configurar Rivolut', 'reseller_cred_rivolut')],
        [Markup.button.callback('🧢 Configurar Cap Player', 'reseller_cred_capplayer')],
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

async function handleCredRivolut(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_rivolut_email' });
  
  await ctx.reply(
    `🎯 <b>Configurar Rivolut Player</b>\n\n` +
    `Digite seu <b>email</b> do painel Rivolut:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredCapPlayer(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_capplayer_email' });
  
  await ctx.reply(
    `🧢 <b>Configurar Cap Player</b>\n\n` +
    `Digite seu <b>email</b> do painel Cap Player:`,
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

async function handleCredLazerPlay(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_lazerplay_email' });
  
  await ctx.reply(
    `🎮 <b>Configurar Lazer Play</b>\n\n` +
    `⚠️ <b>Nota:</b> Este app requer resolução de CAPTCHA.\n` +
    `O sistema resolve automaticamente usando 2Captcha.\n\n` +
    `Digite seu <b>email</b> do painel Lazer Play:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredLumina(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_lumina_email' });
  
  await ctx.reply(
    `💡 <b>Configurar Lumina Player</b>\n\n` +
    `Digite seu <b>email</b> do painel Lumina:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredAssistPlus(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_assistplus_email' });
  
  await ctx.reply(
    `➕ <b>Configurar Assist+</b>\n\n` +
    `Digite seu <b>email</b> do painel Assist+:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredVivoPlayer(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_vivoplayer_email' });
  
  await ctx.reply(
    `📺 <b>Configurar Vivo Player</b>\n\n` +
    `Digite seu <b>email</b> do painel Vivo Player:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

async function handleCredQuickPlayer(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'cred_quickplayer_user' });
  
  await ctx.reply(
    `⚡ <b>Configurar Quick Player</b>\n\n` +
    `O Quick Player usa o painel Meta Player.\n\n` +
    `Digite seu <b>username</b> do painel Meta Player:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_credenciais')]])
    }
  );
}

// ==================== CÓDIGOS DUPLECAST ====================

async function handleDuplecastCodes(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const contagem = db.duplecastCodes.contar(usuario.id);
  const porTier = db.duplecastCodes.contarPorTier(usuario.id);

  let mensagem = `📦 <b>Códigos Duplecast</b>\n\n`;
  
  mensagem += `<b>Resumo:</b>\n`;
  mensagem += `├ 🟢 Disponíveis: <b>${contagem.disponiveis}</b>\n`;
  mensagem += `├ 🔴 Usados: ${contagem.usados}\n`;
  mensagem += `└ 📊 Total: ${contagem.total}\n\n`;
  
  mensagem += `<b>Por tipo:</b>\n`;
  mensagem += `├ 📅 Anual: <b>${porTier.YEAR}</b> disponíveis\n`;
  mensagem += `└ ♾️ Vitalício: <b>${porTier.LIFETIME}</b> disponíveis\n\n`;
  
  mensagem += `<i>Adicione códigos para poder ativar dispositivos Duplecast.</i>`;

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Adicionar Código', 'reseller_duplecast_add')],
      [Markup.button.callback('📥 Adicionar em Lote', 'reseller_duplecast_add_batch')],
      [Markup.button.callback('📋 Ver Disponíveis', 'reseller_duplecast_list_available')],
      [Markup.button.callback('📜 Histórico (Usados)', 'reseller_duplecast_list_used')],
      [Markup.button.callback('🔙 Voltar', 'reseller_credenciais')]
    ])
  });
}

async function handleDuplecastAdd(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'duplecast_add_code' });
  
  await ctx.reply(
    `➕ <b>Adicionar Código Duplecast</b>\n\n` +
    `Digite o <b>código de ativação</b>:\n\n` +
    `<i>Exemplo: ABC123456</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]])
    }
  );
}

async function handleDuplecastAddBatch(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'duplecast_add_batch' });
  
  await ctx.reply(
    `📥 <b>Adicionar Códigos em Lote</b>\n\n` +
    `Cole os códigos, <b>um por linha</b>:\n\n` +
    `<i>Exemplo:\nABC123456\nDEF789012\nGHI345678</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]])
    }
  );
}

async function handleDuplecastSelectTier(ctx, tier) {
  await ctx.answerCbQuery();
  
  const state = resellerState.get(ctx.from.id);
  if (!state || !state.codigos) {
    await ctx.reply('❌ Sessão expirada. Tente novamente.');
    return;
  }

  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  
  // Adicionar códigos com o tier selecionado
  const resultado = db.duplecastCodes.adicionarEmLote(usuario.id, state.codigos, tier);
  
  resellerState.delete(ctx.from.id);

  let mensagem = `✅ <b>Códigos Processados!</b>\n\n`;
  mensagem += `📅 <b>Tipo:</b> ${tier === 'YEAR' ? 'Anual' : 'Vitalício'}\n\n`;
  mensagem += `✅ Adicionados: <b>${resultado.sucesso}</b>\n`;
  
  if (resultado.duplicados > 0) {
    mensagem += `⚠️ Duplicados (ignorados): ${resultado.duplicados}\n`;
  }
  if (resultado.erros > 0) {
    mensagem += `❌ Erros: ${resultado.erros}\n`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📦 Ver Códigos', 'reseller_duplecast_codes')],
      [Markup.button.callback('➕ Adicionar Mais', 'reseller_duplecast_add')],
      [Markup.button.callback('🔙 Voltar', 'reseller_credenciais')]
    ])
  });
}

async function handleDuplecastListAvailable(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const codigos = db.duplecastCodes.listarDisponiveis(usuario.id);

  let mensagem = `📋 <b>Códigos Disponíveis</b>\n\n`;

  if (codigos.length === 0) {
    mensagem += `<i>Nenhum código disponível.</i>\n`;
    mensagem += `<i>Adicione códigos para ativar dispositivos.</i>`;
  } else {
    // Agrupar por tier
    const anuais = codigos.filter(c => c.tier === 'YEAR');
    const vitalicios = codigos.filter(c => c.tier === 'LIFETIME');

    if (anuais.length > 0) {
      mensagem += `📅 <b>Anuais (${anuais.length}):</b>\n`;
      anuais.slice(0, 10).forEach(c => {
        mensagem += `├ <code>${c.codigo}</code>\n`;
      });
      if (anuais.length > 10) {
        mensagem += `└ <i>... e mais ${anuais.length - 10}</i>\n`;
      }
      mensagem += `\n`;
    }

    if (vitalicios.length > 0) {
      mensagem += `♾️ <b>Vitalícios (${vitalicios.length}):</b>\n`;
      vitalicios.slice(0, 10).forEach(c => {
        mensagem += `├ <code>${c.codigo}</code>\n`;
      });
      if (vitalicios.length > 10) {
        mensagem += `└ <i>... e mais ${vitalicios.length - 10}</i>\n`;
      }
    }
  }

  const buttons = [
    [Markup.button.callback('➕ Adicionar', 'reseller_duplecast_add')],
    [Markup.button.callback('🗑️ Excluir Código', 'reseller_duplecast_delete')],
    [Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]
  ];

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleDuplecastListUsed(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const codigos = db.duplecastCodes.listarUsados(usuario.id);

  let mensagem = `📜 <b>Histórico de Códigos Usados</b>\n\n`;

  if (codigos.length === 0) {
    mensagem += `<i>Nenhum código utilizado ainda.</i>`;
  } else {
    codigos.slice(0, 15).forEach(c => {
      const data = c.usado_em ? new Date(c.usado_em).toLocaleDateString('pt-BR') : 'N/A';
      const tierIcon = c.tier === 'YEAR' ? '📅' : '♾️';
      mensagem += `${tierIcon} <code>${c.codigo}</code>\n`;
      mensagem += `   └ MAC: <code>${c.mac_usado || 'N/A'}</code> | ${data}\n`;
    });
    
    if (codigos.length > 15) {
      mensagem += `\n<i>... e mais ${codigos.length - 15} códigos</i>`;
    }
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]
    ])
  });
}

async function handleDuplecastDelete(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'duplecast_delete_code' });
  
  await ctx.reply(
    `🗑️ <b>Excluir Código</b>\n\n` +
    `Digite o <b>código</b> que deseja excluir:\n\n` +
    `<i>⚠️ Apenas códigos NÃO utilizados podem ser excluídos.</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]])
    }
  );
}

// ==================== CÓDIGOS SMARTONE ====================

async function handleSmartOneCodes(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const contagem = db.smartoneCodes.contar(usuario.id);
  const porTier = db.smartoneCodes.contarPorTier(usuario.id);

  let mensagem = `📺 <b>Códigos SmartOne IPTV</b>\n\n`;
  
  mensagem += `<b>Resumo:</b>\n`;
  mensagem += `├ 🟢 Disponíveis: <b>${contagem.disponiveis}</b>\n`;
  mensagem += `├ 🔴 Usados: ${contagem.usados}\n`;
  mensagem += `└ 📊 Total: ${contagem.total}\n\n`;
  
  mensagem += `<b>Por tipo:</b>\n`;
  mensagem += `├ 📅 Anual: <b>${porTier.YEAR}</b> disponíveis\n`;
  mensagem += `└ ♾️ Vitalício: <b>${porTier.LIFETIME}</b> disponíveis\n\n`;
  
  mensagem += `<i>Adicione códigos para poder ativar dispositivos SmartOne.</i>`;

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Adicionar Código', 'reseller_smartone_add')],
      [Markup.button.callback('📥 Adicionar em Lote', 'reseller_smartone_add_batch')],
      [Markup.button.callback('📋 Ver Disponíveis', 'reseller_smartone_list_available')],
      [Markup.button.callback('📜 Histórico (Usados)', 'reseller_smartone_list_used')],
      [Markup.button.callback('🔙 Voltar', 'reseller_credenciais')]
    ])
  });
}

async function handleSmartOneAdd(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'smartone_add_code' });
  
  await ctx.reply(
    `➕ <b>Adicionar Código SmartOne</b>\n\n` +
    `Digite o <b>código de ativação</b>:\n\n` +
    `<i>Exemplo: 109283908</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]])
    }
  );
}

async function handleSmartOneAddBatch(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'smartone_add_batch' });
  
  await ctx.reply(
    `📥 <b>Adicionar Códigos em Lote</b>\n\n` +
    `Cole os códigos, <b>um por linha</b>:\n\n` +
    `<i>Exemplo:\n109283908\n209384756\n384756129</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]])
    }
  );
}

async function handleSmartOneSelectTier(ctx, tier) {
  await ctx.answerCbQuery();
  
  const state = resellerState.get(ctx.from.id);
  if (!state || !state.codigos) {
    await ctx.reply('❌ Sessão expirada. Tente novamente.');
    return;
  }

  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  
  // Adicionar códigos com o tier selecionado
  const resultado = db.smartoneCodes.adicionarEmLote(usuario.id, state.codigos, tier);
  
  resellerState.delete(ctx.from.id);

  let mensagem = `✅ <b>Códigos Processados!</b>\n\n`;
  mensagem += `📅 <b>Tipo:</b> ${tier === 'YEAR' ? 'Anual' : 'Vitalício'}\n\n`;
  mensagem += `✅ Adicionados: <b>${resultado.sucesso}</b>\n`;
  
  if (resultado.duplicados > 0) {
    mensagem += `⚠️ Duplicados (ignorados): ${resultado.duplicados}\n`;
  }
  if (resultado.erros > 0) {
    mensagem += `❌ Erros: ${resultado.erros}\n`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📺 Ver Códigos', 'reseller_smartone_codes')],
      [Markup.button.callback('➕ Adicionar Mais', 'reseller_smartone_add')],
      [Markup.button.callback('🔙 Voltar', 'reseller_credenciais')]
    ])
  });
}

async function handleSmartOneListAvailable(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const codigos = db.smartoneCodes.listarDisponiveis(usuario.id);

  let mensagem = `📋 <b>Códigos SmartOne Disponíveis</b>\n\n`;

  if (codigos.length === 0) {
    mensagem += `<i>Nenhum código disponível.</i>\n`;
    mensagem += `<i>Adicione códigos para ativar dispositivos.</i>`;
  } else {
    // Agrupar por tier
    const anuais = codigos.filter(c => c.tier === 'YEAR');
    const vitalicios = codigos.filter(c => c.tier === 'LIFETIME');

    if (anuais.length > 0) {
      mensagem += `📅 <b>Anuais (${anuais.length}):</b>\n`;
      anuais.slice(0, 10).forEach(c => {
        mensagem += `├ <code>${c.codigo}</code>\n`;
      });
      if (anuais.length > 10) {
        mensagem += `└ <i>... e mais ${anuais.length - 10}</i>\n`;
      }
      mensagem += `\n`;
    }

    if (vitalicios.length > 0) {
      mensagem += `♾️ <b>Vitalícios (${vitalicios.length}):</b>\n`;
      vitalicios.slice(0, 10).forEach(c => {
        mensagem += `├ <code>${c.codigo}</code>\n`;
      });
      if (vitalicios.length > 10) {
        mensagem += `└ <i>... e mais ${vitalicios.length - 10}</i>\n`;
      }
    }
  }

  const buttons = [
    [Markup.button.callback('➕ Adicionar', 'reseller_smartone_add')],
    [Markup.button.callback('🗑️ Excluir Código', 'reseller_smartone_delete')],
    [Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]
  ];

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function handleSmartOneListUsed(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const codigos = db.smartoneCodes.listarUsados(usuario.id);

  let mensagem = `📜 <b>Histórico de Códigos SmartOne Usados</b>\n\n`;

  if (codigos.length === 0) {
    mensagem += `<i>Nenhum código utilizado ainda.</i>`;
  } else {
    codigos.slice(0, 15).forEach(c => {
      const data = c.usado_em ? new Date(c.usado_em).toLocaleDateString('pt-BR') : 'N/A';
      const tierIcon = c.tier === 'YEAR' ? '📅' : '♾️';
      mensagem += `${tierIcon} <code>${c.codigo}</code>\n`;
      mensagem += `   └ MAC: <code>${c.mac_usado || 'N/A'}</code> | ${data}\n`;
    });
    
    if (codigos.length > 15) {
      mensagem += `\n<i>... e mais ${codigos.length - 15} códigos</i>`;
    }
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]
    ])
  });
}

async function handleSmartOneDelete(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'smartone_delete_code' });
  
  await ctx.reply(
    `🗑️ <b>Excluir Código SmartOne</b>\n\n` +
    `Digite o <b>código</b> que deseja excluir:\n\n` +
    `<i>⚠️ Apenas códigos NÃO utilizados podem ser excluídos.</i>`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]])
    }
  );
}

// ==================== CLOUDDY CARD ====================

/**
 * Menu de gerenciamento do cartão Clouddy
 */
async function handleClouddyCard(ctx) {
  await ctx.answerCbQuery();
  
  const telegramId = ctx.from.id.toString();
  const usuario = db.usuarios.buscarPorTelegramId(telegramId);
  
  if (!usuario) {
    await ctx.reply('❌ Usuário não encontrado.');
    return;
  }

  const cartao = db.clouddyCards.buscarMascarado(usuario.id);
  
  let mensagem = `💳 <b>Cartão Clouddy</b>\n\n`;
  
  if (cartao) {
    mensagem += `<b>Status:</b> ✅ Configurado\n\n`;
    mensagem += `<b>Cartão:</b> ${cartao.cardNumberMasked}\n`;
    mensagem += `<b>Validade:</b> ${cartao.cardExpiry.slice(0,2)}/${cartao.cardExpiry.slice(2)}\n`;
    mensagem += `<b>Nome:</b> ${cartao.cardName}\n`;
    mensagem += `<b>Email:</b> ${cartao.cardEmail}\n`;
    mensagem += `<b>Atualizado:</b> ${new Date(cartao.atualizadoEm).toLocaleString('pt-BR')}\n`;
  } else {
    mensagem += `<b>Status:</b> ❌ Não configurado\n\n`;
    mensagem += `⚠️ <i>Você precisa cadastrar seu cartão de crédito para vender ativações Clouddy.</i>\n\n`;
    mensagem += `<b>Como funciona:</b>\n`;
    mensagem += `1. Você cadastra seu cartão\n`;
    mensagem += `2. Cliente solicita ativação informando email/senha da conta Clouddy\n`;
    mensagem += `3. Sistema usa seu cartão para pagar $2.00 por ativação\n`;
    mensagem += `4. Você cobra o valor que quiser do cliente\n`;
  }

  const buttons = [];
  
  if (cartao) {
    buttons.push([Markup.button.callback('✏️ Atualizar Cartão', 'reseller_clouddy_update')]);
    buttons.push([Markup.button.callback('🗑️ Remover Cartão', 'reseller_clouddy_remove')]);
  } else {
    buttons.push([Markup.button.callback('➕ Cadastrar Cartão', 'reseller_clouddy_add')]);
  }
  
  buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_credenciais')]);

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

/**
 * Inicia cadastro de cartão
 */
async function handleClouddyAdd(ctx) {
  await ctx.answerCbQuery();
  
  resellerState.set(ctx.from.id, { step: 'clouddy_card_number' });

  await ctx.reply(
    `💳 <b>Cadastrar Cartão Clouddy</b>\n\n` +
    `⚠️ <b>ATENÇÃO:</b> Seus dados serão armazenados de forma segura.\n\n` +
    `📝 <b>Passo 1/5:</b> Digite o <b>número do cartão</b> (apenas números):\n\n` +
    `Exemplo: 4111222233334444`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
    }
  );
}

/**
 * Inicia atualização de cartão
 */
async function handleClouddyUpdate(ctx) {
  await ctx.answerCbQuery();
  
  resellerState.set(ctx.from.id, { step: 'clouddy_card_number', isUpdate: true });

  await ctx.reply(
    `✏️ <b>Atualizar Cartão Clouddy</b>\n\n` +
    `📝 <b>Passo 1/5:</b> Digite o <b>número do cartão</b> (apenas números):\n\n` +
    `Exemplo: 4111222233334444`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
    }
  );
}

/**
 * Remove cartão
 */
async function handleClouddyRemove(ctx) {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    `🗑️ <b>Remover Cartão</b>\n\n` +
    `⚠️ Tem certeza que deseja remover seu cartão?\n\n` +
    `<i>Você não poderá vender ativações Clouddy até cadastrar um novo cartão.</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Sim, Remover', 'reseller_clouddy_confirm_remove')],
        [Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]
      ])
    }
  );
}

/**
 * Confirma remoção do cartão
 */
async function handleClouddyConfirmRemove(ctx) {
  await ctx.answerCbQuery();
  
  const telegramId = ctx.from.id.toString();
  const usuario = db.usuarios.buscarPorTelegramId(telegramId);
  
  if (!usuario) {
    await ctx.reply('❌ Usuário não encontrado.');
    return;
  }

  db.clouddyCards.remover(usuario.id);

  await ctx.editMessageText(
    `✅ <b>Cartão Removido!</b>\n\n` +
    `Seu cartão foi removido com sucesso.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_clouddy_card')]])
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

  // =============================================
  // LAZER PLAY - COMENTADO TEMPORARIAMENTE
  // Descomentar se quiser reativar no futuro
  // =============================================
  /*
  // Lazer Play
  const credLazerPlay = db.credenciais.buscar(usuario.id, 'lazer_play');
  
  if (credLazerPlay) {
    try {
      const resultado = await activationService.getSaldo('lazer_play', credLazerPlay.dados);
      
      if (resultado.success) {
        mensagem += `🎮 <b>Lazer Play</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Nome: ${resultado.name || 'N/A'}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `🎮 <b>Lazer Play</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `🎮 <b>Lazer Play</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `🎮 <b>Lazer Play</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }
  */

  // Lumina
  const credLumina = db.credenciais.buscar(usuario.id, 'lumina');
  
  if (credLumina) {
    try {
      const resultado = await activationService.getSaldo('lumina', credLumina.dados);
      
      if (resultado.success) {
        mensagem += `💡 <b>Lumina Player</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Nome: ${resultado.name || 'N/A'}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `💡 <b>Lumina Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `💡 <b>Lumina Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `💡 <b>Lumina Player</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // Assist+
  const credAssistPlus = db.credenciais.buscar(usuario.id, 'assist_plus');
  
  if (credAssistPlus) {
    try {
      const resultado = await activationService.getSaldo('assist_plus', credAssistPlus.dados);
      
      if (resultado.success) {
        mensagem += `➕ <b>Assist+</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Nome: ${resultado.name || 'N/A'}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `➕ <b>Assist+</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `➕ <b>Assist+</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `➕ <b>Assist+</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // Duplecast (códigos)
  const contagem = db.duplecastCodes.contar(usuario.id);
  const porTier = db.duplecastCodes.contarPorTier(usuario.id);
  
  mensagem += `📦 <b>Duplecast</b>\n`;
  mensagem += `├ Códigos disponíveis: <b>${contagem.disponiveis}</b>\n`;
  mensagem += `├ Anual: ${porTier.YEAR} | Vitalício: ${porTier.LIFETIME}\n`;
  mensagem += `└ Usados: ${contagem.usados}\n\n`;

  // SmartOne (códigos)
  const contagemSmartone = db.smartoneCodes.contar(usuario.id);
  const porTierSmartone = db.smartoneCodes.contarPorTier(usuario.id);
  
  mensagem += `📺 <b>SmartOne IPTV</b>\n`;
  mensagem += `├ Códigos disponíveis: <b>${contagemSmartone.disponiveis}</b>\n`;
  mensagem += `├ Anual: ${porTierSmartone.YEAR} | Vitalício: ${porTierSmartone.LIFETIME}\n`;
  mensagem += `└ Usados: ${contagemSmartone.usados}\n\n`;

  // Clouddy (cartão)
  const temCartaoClouddy = db.clouddyCards.temCartao(usuario.id);
  
  mensagem += `💳 <b>Clouddy</b>\n`;
  if (temCartaoClouddy) {
    const cartaoMascarado = db.clouddyCards.buscarMascarado(usuario.id);
    mensagem += `├ Status: ✅ Cartão configurado\n`;
    mensagem += `├ Cartão: ${cartaoMascarado.cardNumberMasked}\n`;
    mensagem += `└ Cobrança: $2.00 por ativação\n\n`;
  } else {
    mensagem += `└ ⚠️ Cartão não configurado\n\n`;
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

  // Vivo Player
  const credVivoPlayer = db.credenciais.buscar(usuario.id, 'vivo_player');
  
  if (credVivoPlayer) {
    try {
      const resultado = await activationService.getSaldo('vivo_player', credVivoPlayer.dados);
      
      if (resultado.success) {
        mensagem += `📺 <b>Vivo Player</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: ${resultado.active ? '🟢 Ativo' : '🔴 Inativo'}\n\n`;
      } else {
        mensagem += `📺 <b>Vivo Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `📺 <b>Vivo Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `📺 <b>Vivo Player</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // Quick Player
  const credQuickPlayer = db.credenciais.buscar(usuario.id, 'quick_player');
  
  if (credQuickPlayer) {
    try {
      const quickPlayerModule = require('../modules/quick_player');
      const resultado = await quickPlayerModule.getCredits(credQuickPlayer.dados);
      
      if (resultado.success) {
        mensagem += `⚡ <b>Quick Player</b>\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: 🟢 Ativo\n\n`;
      } else {
        mensagem += `⚡ <b>Quick Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `⚡ <b>Quick Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `⚡ <b>Quick Player</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

// =====================================================
// TRECHO 1: reseller.js - handleSaldoApps
// Procure por "// Rivolut" e substitua TODO o bloco do Rivolut por este:
// =====================================================

  // Rivolut
  const credRivolut = db.credenciais.buscar(usuario.id, 'rivolut');
  
  if (credRivolut) {
    try {
      const genericModule = require('../modules/generic_reseller');
      const resultado = await genericModule.getCredits('rivolutplayer.com', credRivolut.dados, { name: 'Rivolut Player' });
      
      if (resultado.success) {
        mensagem += `🎯 <b>Rivolut Player</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: 🟢 Ativo\n\n`;
      } else {
        mensagem += `🎯 <b>Rivolut Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `🎯 <b>Rivolut Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `🎯 <b>Rivolut Player</b>\n`;
    mensagem += `└ ⚠️ Credenciais não configuradas\n\n`;
  }

  // Cap Player
  const credCapPlayer = db.credenciais.buscar(usuario.id, 'cap_player');
  
  if (credCapPlayer) {
    try {
      const genericModule = require('../modules/generic_reseller');
      const resultado = await genericModule.getCredits('capplayer.com', credCapPlayer.dados, { name: 'Cap Player' });
      
      if (resultado.success) {
        mensagem += `🧢 <b>Cap Player</b>\n`;
        mensagem += `├ Usuário: ${resultado.username}\n`;
        mensagem += `├ Créditos: <b>${resultado.credits}</b>\n`;
        mensagem += `└ Status: 🟢 Ativo\n\n`;
      } else {
        mensagem += `🧢 <b>Cap Player</b>\n`;
        mensagem += `└ ❌ Erro: ${resultado.error}\n\n`;
      }
    } catch (error) {
      mensagem += `🧢 <b>Cap Player</b>\n`;
      mensagem += `└ ❌ Erro ao consultar\n\n`;
    }
  } else {
    mensagem += `🧢 <b>Cap Player</b>\n`;
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

// ==================== CLIENTES ====================

/**
 * Menu principal de clientes
 */
async function handleClientes(ctx) {
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

  // Buscar estatísticas
  const stats = db.clientesBot.estatisticas(bot.id);
  const ultimosClientes = db.clientesBot.listarTodos(bot.id, 5);

  let mensagem = `👥 <b>CLIENTES</b>\n\n`;
  
  mensagem += `📊 <b>Resumo Geral:</b>\n`;
  mensagem += `├ 👤 Total de clientes: <b>${stats.totalClientes}</b>\n`;
  mensagem += `├ ✅ Com ativações: <b>${stats.comAtivacoes}</b>\n`;
  mensagem += `├ ⏳ Nunca ativaram: <b>${stats.semAtivacoes}</b>\n`;
  mensagem += `├ 💰 Com saldo: <b>${stats.comSaldo}</b>\n`;
  mensagem += `├ 💵 Total faturado: <b>R$${(stats.totalFaturado || 0).toFixed(2)}</b>\n`;
  mensagem += `└ 💳 Total em saldos: <b>R$${(stats.totalSaldos || 0).toFixed(2)}</b>\n\n`;

  if (ultimosClientes.length > 0) {
    mensagem += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    mensagem += `📋 <b>Últimos clientes:</b>\n\n`;
    
    ultimosClientes.forEach((c, i) => {
      const nome = c.cliente_nome || c.cliente_username || 'Cliente';
      const username = c.cliente_username ? `@${c.cliente_username}` : '';
      const ativStatus = c.total_ativacoes > 0 ? `✅ ${c.total_ativacoes}` : '⏳ 0';
      const saldoStr = c.saldo > 0 ? `R$${c.saldo.toFixed(2)}` : 'R$0';
      
      mensagem += `<b>${i + 1}. ${nome}</b> ${username}\n`;
      mensagem += `   ID: <code>${c.cliente_telegram_id}</code>\n`;
      mensagem += `   ${ativStatus} ativações | 💰 ${saldoStr}\n\n`;
    });
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📋 Ver todos', 'reseller_clientes_todos')],
      [
        Markup.button.callback('✅ Com ativações', 'reseller_clientes_ativados'),
        Markup.button.callback('💰 Com saldo', 'reseller_clientes_saldo')
      ],
      [Markup.button.callback('⏳ Nunca ativaram', 'reseller_clientes_inativos')],
      [Markup.button.callback('🔍 Buscar cliente', 'reseller_buscar_cliente_menu')],
      [Markup.button.callback('📥 Exportar lista', 'reseller_exportar_clientes')],
      [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
    ])
  });
}

/**
 * Lista todos os clientes
 */
async function handleClientesTodos(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) return;

  const clientes = db.clientesBot.listarTodos(bot.id, 15);
  const total = db.clientesBot.contarTotal(bot.id);

  let mensagem = `📋 <b>Todos os Clientes</b>\n`;
  mensagem += `<i>Total: ${total} cliente(s)</i>\n\n`;

  if (clientes.length === 0) {
    mensagem += `<i>Nenhum cliente encontrado.</i>`;
  } else {
    clientes.forEach((c, i) => {
      const nome = c.cliente_nome || 'Cliente';
      const username = c.cliente_username ? ` (@${c.cliente_username})` : '';
      const ativStatus = c.total_ativacoes > 0 ? `✅${c.total_ativacoes}` : '⏳';
      const saldoStr = c.saldo > 0 ? `💰R$${c.saldo.toFixed(2)}` : '';
      
      mensagem += `${i + 1}. <b>${nome}</b>${username}\n`;
      mensagem += `   <code>${c.cliente_telegram_id}</code> ${ativStatus} ${saldoStr}\n`;
    });

    if (total > 15) {
      mensagem += `\n<i>Mostrando 15 de ${total}. Use busca para encontrar outros.</i>`;
    }
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Buscar', 'reseller_buscar_cliente_menu')],
      [Markup.button.callback('🔄 Atualizar', 'reseller_clientes_todos')],
      [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
    ])
  });
}

/**
 * Lista clientes com ativações
 */
async function handleClientesComAtivacoes(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) return;

  const clientes = db.clientesBot.listarComAtivacoes(bot.id, 15);

  let mensagem = `✅ <b>Clientes com Ativações</b>\n`;
  mensagem += `<i>Total: ${clientes.length} cliente(s)</i>\n\n`;

  if (clientes.length === 0) {
    mensagem += `<i>Nenhum cliente com ativações.</i>`;
  } else {
    clientes.forEach((c, i) => {
      const nome = c.cliente_nome || 'Cliente';
      const username = c.cliente_username ? ` (@${c.cliente_username})` : '';
      const saldoStr = c.saldo > 0 ? ` | 💰R$${c.saldo.toFixed(2)}` : '';
      const gastoStr = c.total_gasto > 0 ? ` | 💵R$${c.total_gasto.toFixed(2)}` : '';
      
      mensagem += `${i + 1}. <b>${nome}</b>${username}\n`;
      mensagem += `   <code>${c.cliente_telegram_id}</code>\n`;
      mensagem += `   ✅ ${c.total_ativacoes} ativações${gastoStr}${saldoStr}\n\n`;
    });
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'reseller_clientes_ativados')],
      [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
    ])
  });
}

/**
 * Lista clientes com saldo
 */
async function handleClientesComSaldo(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) return;

  const clientes = db.clientesBot.listarComSaldo(bot.id, 15);
  
  let totalSaldo = 0;
  clientes.forEach(c => totalSaldo += c.saldo);

  let mensagem = `💰 <b>Clientes com Saldo</b>\n`;
  mensagem += `<i>Total: ${clientes.length} cliente(s) | R$${totalSaldo.toFixed(2)}</i>\n\n`;

  if (clientes.length === 0) {
    mensagem += `<i>Nenhum cliente com saldo.</i>`;
  } else {
    clientes.forEach((c, i) => {
      const nome = c.cliente_nome || 'Cliente';
      const username = c.cliente_username ? ` (@${c.cliente_username})` : '';
      const ativStr = c.total_ativacoes > 0 ? ` | ✅${c.total_ativacoes}` : '';
      
      mensagem += `${i + 1}. <b>${nome}</b>${username}\n`;
      mensagem += `   <code>${c.cliente_telegram_id}</code>\n`;
      mensagem += `   💰 <b>R$${c.saldo.toFixed(2)}</b>${ativStr}\n\n`;
    });
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'reseller_clientes_saldo')],
      [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
    ])
  });
}

/**
 * Lista clientes que nunca ativaram
 */
async function handleClientesNuncaAtivaram(ctx) {
  await ctx.answerCbQuery();
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) return;

  const clientes = db.clientesBot.listarNuncaAtivaram(bot.id, 15);

  let mensagem = `⏳ <b>Clientes que Nunca Ativaram</b>\n`;
  mensagem += `<i>Total: ${clientes.length} cliente(s)</i>\n\n`;

  if (clientes.length === 0) {
    mensagem += `<i>Todos os clientes já fizeram ativações! 🎉</i>`;
  } else {
    mensagem += `<i>Estes clientes iniciaram compras mas não concluíram:</i>\n\n`;
    
    clientes.forEach((c, i) => {
      const nome = c.cliente_nome || 'Cliente';
      const username = c.cliente_username ? ` (@${c.cliente_username})` : '';
      const saldoStr = c.saldo > 0 ? ` | 💰R$${c.saldo.toFixed(2)}` : '';
      
      mensagem += `${i + 1}. <b>${nome}</b>${username}\n`;
      mensagem += `   <code>${c.cliente_telegram_id}</code>\n`;
      mensagem += `   🛒 ${c.total_pedidos} pedido(s)${saldoStr}\n\n`;
    });
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'reseller_clientes_inativos')],
      [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
    ])
  });
}

/**
 * Menu de busca de cliente
 */
async function handleBuscarClienteMenu(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'buscar_cliente' });
  
  await ctx.reply(
    `🔍 <b>Buscar Cliente</b>\n\n` +
    `Digite o <b>Telegram ID</b>, <b>nome</b> ou <b>@username</b>:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clientes')]])
    }
  );
}

/**
 * Ver detalhes de um cliente específico
 */
async function handleVerCliente(ctx, clienteId) {
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const cliente = db.clientesBot.buscarPorId(bot.id, clienteId);
  
  if (!cliente) {
    await ctx.reply(
      `❌ Cliente não encontrado.`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_clientes')]])
    );
    return;
  }

  // Buscar últimos pedidos
  const pedidos = db.clientesBot.listarPedidosCliente(bot.id, clienteId, 5);

  const nome = cliente.cliente_nome || 'Cliente';
  const username = cliente.cliente_username ? `@${cliente.cliente_username}` : 'N/A';
  const primeiroContato = cliente.primeiro_contato ? new Date(cliente.primeiro_contato).toLocaleDateString('pt-BR') : 'N/A';
  const ultimoContato = cliente.ultimo_contato ? new Date(cliente.ultimo_contato).toLocaleDateString('pt-BR') : 'N/A';

  let mensagem = `👤 <b>Detalhes do Cliente</b>\n\n`;
  mensagem += `<b>Nome:</b> ${nome}\n`;
  mensagem += `<b>Username:</b> ${username}\n`;
  mensagem += `<b>Telegram ID:</b> <code>${clienteId}</code>\n\n`;
  
  mensagem += `📊 <b>Estatísticas:</b>\n`;
  mensagem += `├ ✅ Ativações: <b>${cliente.total_ativacoes}</b>\n`;
  mensagem += `├ 🛒 Pedidos: ${cliente.total_pedidos}\n`;
  mensagem += `├ 💵 Total gasto: R$${(cliente.total_gasto || 0).toFixed(2)}\n`;
  mensagem += `└ 💰 Saldo atual: <b>R$${cliente.saldo.toFixed(2)}</b>\n\n`;
  
  mensagem += `📅 <b>Histórico:</b>\n`;
  mensagem += `├ Primeiro contato: ${primeiroContato}\n`;
  mensagem += `└ Último contato: ${ultimoContato}\n`;

  if (pedidos.length > 0) {
    mensagem += `\n📋 <b>Últimos pedidos:</b>\n`;
    pedidos.forEach(p => {
      const data = new Date(p.criado_em).toLocaleDateString('pt-BR');
      const status = p.status === 'ativado' ? '✅' : p.status === 'pago' ? '💳' : '⏳';
      mensagem += `${status} ${p.produto_nome} - R$${p.valor.toFixed(2)} (${data})\n`;
    });
  }

  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ Ajustar Saldo', `reseller_ajustar_saldo_${clienteId}`),
      Markup.button.callback('🗑️ Zerar Saldo', `reseller_zerar_saldo_${clienteId}`)
    ],
    [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
  ]);

  // Se veio de callback, edita. Se veio de texto, envia nova mensagem
  if (ctx.callbackQuery) {
    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...buttons
    });
  } else {
    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...buttons
    });
  }
}

/**
 * Exportar lista de clientes em TXT
 */
async function handleExportarClientes(ctx) {
  await ctx.answerCbQuery('Gerando arquivo...');
  
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  
  if (!bot) {
    await ctx.reply('❌ Bot não encontrado.');
    return;
  }

  const clientes = db.clientesBot.exportarTodos(bot.id);
  const stats = db.clientesBot.estatisticas(bot.id);

  if (clientes.length === 0) {
    await ctx.reply('❌ Nenhum cliente para exportar.');
    return;
  }

  // Gerar conteúdo do arquivo
  let conteudo = `RELATÓRIO DE CLIENTES - ${bot.bot_name || 'Bot'}\n`;
  conteudo += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
  conteudo += `${'='.repeat(60)}\n\n`;

  conteudo += `RESUMO:\n`;
  conteudo += `- Total de clientes: ${stats.totalClientes}\n`;
  conteudo += `- Com ativações: ${stats.comAtivacoes}\n`;
  conteudo += `- Nunca ativaram: ${stats.semAtivacoes}\n`;
  conteudo += `- Com saldo: ${stats.comSaldo}\n`;
  conteudo += `- Total faturado: R$${(stats.totalFaturado || 0).toFixed(2)}\n`;
  conteudo += `- Total em saldos: R$${(stats.totalSaldos || 0).toFixed(2)}\n\n`;

  conteudo += `${'='.repeat(60)}\n`;
  conteudo += `LISTA DE CLIENTES:\n`;
  conteudo += `${'='.repeat(60)}\n\n`;

  clientes.forEach((c, i) => {
    const nome = c.cliente_nome || 'N/A';
    const username = c.cliente_username || 'N/A';
    const primeiro = c.primeiro_contato ? new Date(c.primeiro_contato).toLocaleDateString('pt-BR') : 'N/A';
    const ultimo = c.ultimo_contato ? new Date(c.ultimo_contato).toLocaleDateString('pt-BR') : 'N/A';

    conteudo += `${i + 1}. ${nome} (@${username})\n`;
    conteudo += `   Telegram ID: ${c.cliente_telegram_id}\n`;
    conteudo += `   Ativações: ${c.total_ativacoes} | Pedidos: ${c.total_pedidos}\n`;
    conteudo += `   Total gasto: R$${(c.total_gasto || 0).toFixed(2)} | Saldo: R$${c.saldo.toFixed(2)}\n`;
    conteudo += `   Primeiro contato: ${primeiro} | Último: ${ultimo}\n`;
    conteudo += `${'-'.repeat(40)}\n`;
  });

  // Enviar arquivo
  const buffer = Buffer.from(conteudo, 'utf-8');
  const dataHora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  await ctx.replyWithDocument(
    { source: buffer, filename: `clientes_${dataHora}.txt` },
    { caption: `📥 Lista de ${clientes.length} cliente(s) exportada!` }
  );
}

// Funções de saldo mantidas para compatibilidade
async function handleSaldosClientes(ctx) {
  // Redireciona para o novo menu de clientes com saldo
  return handleClientesComSaldo(ctx);
}

async function handleBuscarSaldo(ctx) {
  await ctx.answerCbQuery();
  resellerState.set(ctx.from.id, { step: 'buscar_saldo' });
  
  await ctx.reply(
    `🔍 <b>Buscar Saldo de Cliente</b>\n\n` +
    `Digite o <b>Telegram ID</b> do cliente:`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clientes')]])
    }
  );
}

async function handleVerSaldoCliente(ctx, clienteId) {
  // Redireciona para ver detalhes completos do cliente
  return handleVerCliente(ctx, clienteId);
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
        [Markup.button.callback('❌ Cancelar', 'reseller_clientes')]
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
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_clientes')]])
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
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clientes')]])
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
  
  // Buscar todos os bots do usuário para pegar as ativações
  const bot = db.bots.buscarPorUsuarioId(usuario.id);
  if (!bot) {
    await ctx.editMessageText(
      `📊 <b>Relatórios</b>\n\n` +
      `⚠️ Você ainda não tem um bot configurado.\n` +
      `Configure seu bot primeiro para ver os relatórios.`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_menu')]])
      }
    );
    return;
  }

  // Estatísticas básicas
  const stats = db.ativacoes.estatisticas(usuario.id);
  const total = stats?.total || 0;
  const sucesso = stats?.sucesso || 0;
  const falhas = stats?.falha || 0;
  const taxaSucesso = total > 0 ? ((sucesso / total) * 100).toFixed(1) : 0;

  // Calcular datas
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let ativacoesHoje = 0;
  let ativacoes7dias = 0;
  let ativacoes30dias = 0;
  let ativacoesMes = 0;
  let topApps = [];
  let ativacoesPorDia = [];

  try {
    // Usar os helpers query e queryOne do database
    
    // Ativações hoje
    const resHoje = db.queryOne(`
      SELECT COUNT(*) as total FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', 'start of day')
    `, [usuario.id]);
    ativacoesHoje = resHoje?.total || 0;

    // Ativações últimos 7 dias
    const res7dias = db.queryOne(`
      SELECT COUNT(*) as total FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', '-7 days')
    `, [usuario.id]);
    ativacoes7dias = res7dias?.total || 0;

    // Ativações últimos 30 dias
    const res30dias = db.queryOne(`
      SELECT COUNT(*) as total FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', '-30 days')
    `, [usuario.id]);
    ativacoes30dias = res30dias?.total || 0;

    // Ativações do mês atual
    const resMes = db.queryOne(`
      SELECT COUNT(*) as total FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', 'start of month')
    `, [usuario.id]);
    ativacoesMes = resMes?.total || 0;

    // Top 10 apps mais ativados (últimos 30 dias)
    topApps = db.query(`
      SELECT modulo as app_nome, COUNT(*) as quantidade 
      FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', '-30 days')
      GROUP BY modulo 
      ORDER BY quantidade DESC 
      LIMIT 10
    `, [usuario.id]) || [];

    // Ativações por dia (últimos 7 dias) para gráfico
    ativacoesPorDia = db.query(`
      SELECT date(criado_em) as dia, COUNT(*) as quantidade 
      FROM ativacoes 
      WHERE usuario_id = ? AND sucesso = 1 AND criado_em >= datetime('now', '-7 days')
      GROUP BY date(criado_em) 
      ORDER BY dia ASC
    `, [usuario.id]) || [];

  } catch (e) {
    console.error('[Relatorios] Erro ao buscar estatísticas:', e.message);
    ativacoesMes = db.ativacoes.contarPorUsuarioMes(usuario.id);
  }

  // Montar gráfico simples de barras (últimos 7 dias)
  let grafico = '';
  if (ativacoesPorDia.length > 0 || true) {
    const maxAtiv = Math.max(...ativacoesPorDia.map(d => d.quantidade), 1);
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    grafico = '\n📈 <b>Últimos 7 dias:</b>\n<pre>';
    
    // Preencher dias faltantes
    const diasMap = new Map(ativacoesPorDia.map(d => [d.dia, d.quantidade]));
    for (let i = 6; i >= 0; i--) {
      const data = new Date(hoje.getTime() - i * 24 * 60 * 60 * 1000);
      const diaStr = data.toISOString().split('T')[0];
      const qtd = diasMap.get(diaStr) || 0;
      const barras = maxAtiv > 0 ? Math.round((qtd / maxAtiv) * 8) : 0;
      const diaSemana = diasSemana[data.getDay()];
      grafico += `${diaSemana}: ${'█'.repeat(barras)}${'░'.repeat(8 - barras)} ${qtd}\n`;
    }
    grafico += '</pre>';
  }

  // Montar lista de top apps
  let topAppsTexto = '';
  if (topApps.length > 0) {
    topAppsTexto = '\n🏆 <b>Top Apps (30 dias):</b>\n';
    const medalhas = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    topApps.slice(0, 10).forEach((app, i) => {
      const nomeApp = app.app_nome || 'N/A';
      topAppsTexto += `${medalhas[i]} ${nomeApp}: <b>${app.quantidade}</b>\n`;
    });
  }

  // Montar mensagem final
  let mensagem = `📊 <b>Relatórios</b>\n\n`;
  
  mensagem += `📅 <b>Ativações por Período:</b>\n`;
  mensagem += `├ Hoje: <b>${ativacoesHoje}</b>\n`;
  mensagem += `├ 7 dias: <b>${ativacoes7dias}</b>\n`;
  mensagem += `├ 30 dias: <b>${ativacoes30dias}</b>\n`;
  mensagem += `├ Este mês: <b>${ativacoesMes}</b>\n`;
  mensagem += `└ Total geral: <b>${total}</b>\n`;
  
  mensagem += `\n📈 <b>Desempenho:</b>\n`;
  mensagem += `├ ✅ Sucesso: <b>${sucesso}</b>\n`;
  mensagem += `├ ❌ Falhas: <b>${falhas}</b>\n`;
  mensagem += `└ 📊 Taxa: <b>${taxaSucesso}%</b>\n`;
  
  mensagem += grafico;
  mensagem += topAppsTexto;

  // Tentar editar mensagem com tratamento de erro
  try {
    await ctx.editMessageText(mensagem, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Atualizar', 'reseller_relatorios')],
        [Markup.button.callback('🔙 Voltar', 'reseller_menu')]
      ])
    });
  } catch (e) {
    // Se a mensagem não foi modificada, mostra toast informativo
    if (e.message.includes('message is not modified')) {
      await ctx.answerCbQuery('✅ Dados já estão atualizados!', { show_alert: false });
    } else {
      // Se for outro erro, loga e repassa
      console.error('[Relatorios] Erro ao editar mensagem:', e.message);
      throw e;
    }
  }
}

// ==================== HANDLER DE TEXTO ====================

async function handleResellerText(ctx) {
  const state = resellerState.get(ctx.from.id);
  if (!state) return false;

  const text = ctx.message.text;
  const usuario = db.usuarios.buscarPorTelegramId(ctx.from.id.toString());

  // Processar cadastro rápido (antes do switch para ter prioridade)
  if (state.step === 'cadastro_rapido') {
    const processado = await processarValorCadastroRapido(ctx, text);
    if (processado) return true;
  }

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

    // CREDENCIAIS RIVOLUT
    case 'cred_rivolut_email': {
      resellerState.set(ctx.from.id, { step: 'cred_rivolut_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Rivolut Player</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_rivolut_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais usando módulo genérico
      try {
        const genericModule = require('../modules/generic_reseller');
        const teste = await genericModule.testConnection('rivolutplayer.com', credentials, { name: 'Rivolut Player' });
        
        if (!teste.success) {
          await ctx.reply(
            `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
            Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_rivolut')]])
          );
          resellerState.delete(ctx.from.id);
          return true;
        }

        // Salvar credenciais
        db.credenciais.salvar(usuario.id, 'rivolut', credentials);
        resellerState.delete(ctx.from.id);

        await ctx.reply(
          `✅ <b>Credenciais Rivolut salvas com sucesso!</b>\n\n` +
          `${teste.message || 'Conexão OK'}`,
          { parse_mode: 'HTML', ...menuPrincipal }
        );
      } catch (error) {
        await ctx.reply(
          `❌ Erro ao testar credenciais: ${error.message}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_rivolut')]])
        );
        resellerState.delete(ctx.from.id);
      }
      return true;
    }

    // CREDENCIAIS CAP PLAYER
    case 'cred_capplayer_email': {
      resellerState.set(ctx.from.id, { step: 'cred_capplayer_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Cap Player</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_capplayer_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais usando módulo genérico
      try {
        const genericModule = require('../modules/generic_reseller');
        const teste = await genericModule.testConnection('capplayer.com', credentials, { name: 'Cap Player' });
        
        if (!teste.success) {
          await ctx.reply(
            `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
            Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_capplayer')]])
          );
          resellerState.delete(ctx.from.id);
          return true;
        }

        // Salvar credenciais
        db.credenciais.salvar(usuario.id, 'cap_player', credentials);
        resellerState.delete(ctx.from.id);

        await ctx.reply(
          `✅ <b>Credenciais Cap Player salvas com sucesso!</b>\n\n` +
          `${teste.message || 'Conexão OK'}`,
          { parse_mode: 'HTML', ...menuPrincipal }
        );
      } catch (error) {
        await ctx.reply(
          `❌ Erro ao testar credenciais: ${error.message}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_capplayer')]])
        );
        resellerState.delete(ctx.from.id);
      }
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

    // CREDENCIAIS LAZER PLAY
    case 'cred_lazerplay_email': {
      resellerState.set(ctx.from.id, { step: 'cred_lazerplay_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Lazer Play</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_lazerplay_pass': {
      await ctx.reply('🔍 Testando credenciais...\n⏳ Isso pode levar até 60 segundos (resolução de CAPTCHA)');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('lazer_play', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_lazerplay')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'lazer_play', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais Lazer Play salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS LUMINA
    case 'cred_lumina_email': {
      resellerState.set(ctx.from.id, { step: 'cred_lumina_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Lumina Player</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_lumina_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('lumina', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_lumina')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'lumina', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais Lumina salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS ASSIST+
    case 'cred_assistplus_email': {
      resellerState.set(ctx.from.id, { step: 'cred_assistplus_pass', email: text });
      await ctx.reply(
        `🔐 <b>Configurar Assist+</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_assistplus_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        password: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('assist_plus', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_assistplus')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'assist_plus', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais Assist+ salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // CREDENCIAIS VIVO PLAYER
    case 'cred_vivoplayer_email': {
      resellerState.set(ctx.from.id, { step: 'cred_vivoplayer_pass', email: text.trim() });
      await ctx.reply(
        `🔐 <b>Configurar Vivo Player</b>\n\n` +
        `Agora digite sua <b>senha</b>:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    case 'cred_vivoplayer_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const credentials = {
        email: state.email,
        senha: text
      };

      // Testar credenciais
      const teste = await activationService.testarCredenciais('vivo_player', credentials);
      
      if (!teste.success) {
        await ctx.reply(
          `❌ Credenciais inválidas!\n\nErro: ${teste.error}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_vivoplayer')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      // Salvar credenciais
      db.credenciais.salvar(usuario.id, 'vivo_player', credentials);
      resellerState.delete(ctx.from.id);

      await ctx.reply(
        `✅ <b>Credenciais Vivo Player salvas com sucesso!</b>\n\n` +
        `${teste.message || 'Conexão OK'}`,
        { parse_mode: 'HTML', ...menuPrincipal }
      );
      return true;
    }

    // QUICK PLAYER - USERNAME
    case 'cred_quickplayer_user': {
      resellerState.set(ctx.from.id, { step: 'cred_quickplayer_pass', username: text.trim() });
      await ctx.reply(
        `🔐 <b>Configurar Quick Player</b>\n\n` +
        `Agora digite sua <b>senha</b> do Meta Player:`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    // QUICK PLAYER - SENHA
    case 'cred_quickplayer_pass': {
      await ctx.reply('🔍 Testando credenciais...');
      
      const quickCredentials = {
        username: state.username,
        password: text
      };

      // Testar credenciais consultando saldo
      try {
        const quickPlayerModule = require('../modules/quick_player');
        const saldoResult = await quickPlayerModule.getCredits(quickCredentials);
        
        if (!saldoResult.success) {
          await ctx.reply(
            `❌ Credenciais inválidas!\n\nErro: ${saldoResult.error}\n\nTente novamente:`,
            Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_quickplayer')]])
          );
          resellerState.delete(ctx.from.id);
          return true;
        }

        // Salvar credenciais
        db.credenciais.salvar(usuario.id, 'quick_player', quickCredentials);
        resellerState.delete(ctx.from.id);

        await ctx.reply(
          `✅ <b>Credenciais Quick Player salvas com sucesso!</b>\n\n` +
          `💰 Saldo: <b>${saldoResult.credits}</b> créditos`,
          { parse_mode: 'HTML', ...menuPrincipal }
        );
      } catch (error) {
        await ctx.reply(
          `❌ Erro ao testar credenciais: ${error.message}\n\nTente novamente:`,
          Markup.inlineKeyboard([[Markup.button.callback('🔄 Tentar novamente', 'reseller_cred_quickplayer')]])
        );
        resellerState.delete(ctx.from.id);
      }
      return true;
    }

    // CÓDIGOS DUPLECAST - ADICIONAR CÓDIGO
    case 'duplecast_add_code': {
      const codigo = text.trim().toUpperCase();
      
      if (codigo.length < 3) {
        await ctx.reply(
          '❌ Código muito curto. Digite um código válido.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]])
        );
        return true;
      }

      // Armazenar código e pedir tier
      resellerState.set(ctx.from.id, { 
        step: 'duplecast_select_tier', 
        codigos: [codigo] 
      });

      await ctx.reply(
        `🔑 <b>Código:</b> <code>${codigo}</code>\n\n` +
        `Selecione o <b>tipo</b> do código:`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Anual', 'reseller_duplecast_tier_YEAR')],
            [Markup.button.callback('♾️ Vitalício', 'reseller_duplecast_tier_LIFETIME')],
            [Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]
          ])
        }
      );
      return true;
    }

    // CÓDIGOS DUPLECAST - ADICIONAR EM LOTE
    case 'duplecast_add_batch': {
      const linhas = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (linhas.length === 0) {
        await ctx.reply(
          '❌ Nenhum código detectado. Cole os códigos, um por linha.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]])
        );
        return true;
      }

      // Armazenar códigos e pedir tier
      resellerState.set(ctx.from.id, { 
        step: 'duplecast_select_tier', 
        codigos: linhas 
      });

      await ctx.reply(
        `🔑 <b>${linhas.length} código(s) detectado(s)</b>\n\n` +
        `Selecione o <b>tipo</b> para TODOS os códigos:`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Anual', 'reseller_duplecast_tier_YEAR')],
            [Markup.button.callback('♾️ Vitalício', 'reseller_duplecast_tier_LIFETIME')],
            [Markup.button.callback('❌ Cancelar', 'reseller_duplecast_codes')]
          ])
        }
      );
      return true;
    }

    // CÓDIGOS DUPLECAST - EXCLUIR
    case 'duplecast_delete_code': {
      const codigo = text.trim().toUpperCase();
      
      const codigoExistente = db.duplecastCodes.buscarPorCodigo(codigo);
      
      if (!codigoExistente) {
        await ctx.reply(
          '❌ Código não encontrado.',
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      if (codigoExistente.usuario_id !== usuario.id) {
        await ctx.reply(
          '❌ Este código não pertence a você.',
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      const resultado = db.duplecastCodes.excluir(codigoExistente.id);
      resellerState.delete(ctx.from.id);

      if (resultado.success) {
        await ctx.reply(
          `✅ Código <code>${codigo}</code> excluído com sucesso!`,
          { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]])
          }
        );
      } else {
        await ctx.reply(
          `❌ ${resultado.error}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_duplecast_codes')]])
        );
      }
      return true;
    }

    // CÓDIGOS SMARTONE - ADICIONAR CÓDIGO
    case 'smartone_add_code': {
      const codigo = text.trim().toUpperCase();
      
      if (codigo.length < 3) {
        await ctx.reply(
          '❌ Código muito curto. Digite um código válido.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]])
        );
        return true;
      }

      // Armazenar código e pedir tier
      resellerState.set(ctx.from.id, { 
        step: 'smartone_select_tier', 
        codigos: [codigo] 
      });

      await ctx.reply(
        `🔑 <b>Código:</b> <code>${codigo}</code>\n\n` +
        `Selecione o <b>tipo</b> do código:`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Anual', 'reseller_smartone_tier_YEAR')],
            [Markup.button.callback('♾️ Vitalício', 'reseller_smartone_tier_LIFETIME')],
            [Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]
          ])
        }
      );
      return true;
    }

    // CÓDIGOS SMARTONE - ADICIONAR EM LOTE
    case 'smartone_add_batch': {
      const linhas = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (linhas.length === 0) {
        await ctx.reply(
          '❌ Nenhum código detectado. Cole os códigos, um por linha.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]])
        );
        return true;
      }

      // Armazenar códigos e pedir tier
      resellerState.set(ctx.from.id, { 
        step: 'smartone_select_tier', 
        codigos: linhas 
      });

      await ctx.reply(
        `🔑 <b>${linhas.length} código(s) detectado(s)</b>\n\n` +
        `Selecione o <b>tipo</b> para TODOS os códigos:`,
        { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Anual', 'reseller_smartone_tier_YEAR')],
            [Markup.button.callback('♾️ Vitalício', 'reseller_smartone_tier_LIFETIME')],
            [Markup.button.callback('❌ Cancelar', 'reseller_smartone_codes')]
          ])
        }
      );
      return true;
    }

    // CÓDIGOS SMARTONE - EXCLUIR
    case 'smartone_delete_code': {
      const codigo = text.trim().toUpperCase();
      
      const codigoExistente = db.smartoneCodes.buscarPorCodigo(codigo);
      
      if (!codigoExistente) {
        await ctx.reply(
          '❌ Código não encontrado.',
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      if (codigoExistente.usuario_id !== usuario.id) {
        await ctx.reply(
          '❌ Este código não pertence a você.',
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]])
        );
        resellerState.delete(ctx.from.id);
        return true;
      }

      const resultado = db.smartoneCodes.excluir(codigoExistente.id);
      resellerState.delete(ctx.from.id);

      if (resultado.success) {
        await ctx.reply(
          `✅ Código <code>${codigo}</code> excluído com sucesso!`,
          { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]])
          }
        );
      } else {
        await ctx.reply(
          `❌ ${resultado.error}`,
          Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'reseller_smartone_codes')]])
        );
      }
      return true;
    }

    // ========== CLOUDDY CARD ==========
    case 'clouddy_card_number': {
      const cardNumber = text.replace(/\s/g, '').replace(/\D/g, '');
      
      if (cardNumber.length < 13 || cardNumber.length > 19) {
        await ctx.reply(
          '❌ Número de cartão inválido. Deve ter entre 13 e 19 dígitos.\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      resellerState.set(ctx.from.id, {
        ...state,
        step: 'clouddy_card_expiry',
        cardNumber: cardNumber
      });

      await ctx.reply(
        `✅ Número do cartão salvo!\n\n` +
        `📝 <b>Passo 2/5:</b> Digite a <b>validade</b> do cartão (MMAA):\n\n` +
        `Exemplo: 0726 (para 07/2026)`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        }
      );
      return true;
    }

    case 'clouddy_card_expiry': {
      const cardExpiry = text.replace(/\D/g, '');
      
      if (cardExpiry.length !== 4) {
        await ctx.reply(
          '❌ Validade inválida. Use o formato MMAA (4 dígitos).\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      const month = parseInt(cardExpiry.slice(0, 2));
      if (month < 1 || month > 12) {
        await ctx.reply(
          '❌ Mês inválido. Deve ser entre 01 e 12.\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      resellerState.set(ctx.from.id, {
        ...state,
        step: 'clouddy_card_cvc',
        cardExpiry: cardExpiry
      });

      await ctx.reply(
        `✅ Validade salva!\n\n` +
        `📝 <b>Passo 3/5:</b> Digite o <b>CVV/CVC</b> do cartão (3 ou 4 dígitos):\n\n` +
        `Exemplo: 123`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        }
      );
      return true;
    }

    case 'clouddy_card_cvc': {
      const cardCvc = text.replace(/\D/g, '');
      
      if (cardCvc.length < 3 || cardCvc.length > 4) {
        await ctx.reply(
          '❌ CVV inválido. Deve ter 3 ou 4 dígitos.\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      resellerState.set(ctx.from.id, {
        ...state,
        step: 'clouddy_card_name',
        cardCvc: cardCvc
      });

      await ctx.reply(
        `✅ CVV salvo!\n\n` +
        `📝 <b>Passo 4/5:</b> Digite o <b>nome</b> como está no cartão:\n\n` +
        `Exemplo: JOAO M SILVA`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        }
      );
      return true;
    }

    case 'clouddy_card_name': {
      const cardName = text.toUpperCase().trim();
      
      if (cardName.length < 3) {
        await ctx.reply(
          '❌ Nome muito curto.\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      resellerState.set(ctx.from.id, {
        ...state,
        step: 'clouddy_card_email',
        cardName: cardName
      });

      await ctx.reply(
        `✅ Nome salvo!\n\n` +
        `📝 <b>Passo 5/5:</b> Digite o <b>email</b> para recibo do Stripe:\n\n` +
        `Exemplo: seuemail@gmail.com`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        }
      );
      return true;
    }

    case 'clouddy_card_email': {
      const cardEmail = text.trim().toLowerCase();
      
      // Validar email básico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cardEmail)) {
        await ctx.reply(
          '❌ Email inválido.\n\nDigite novamente:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clouddy_card')]])
        );
        return true;
      }

      try {
        db.clouddyCards.salvar(usuario.id, {
          cardNumber: state.cardNumber,
          cardExpiry: state.cardExpiry,
          cardCvc: state.cardCvc,
          cardName: state.cardName,
          cardEmail: cardEmail
        });

        const maskedNumber = `**** **** **** ${state.cardNumber.slice(-4)}`;

        await ctx.reply(
          `✅ <b>Cartão ${state.isUpdate ? 'Atualizado' : 'Cadastrado'} com Sucesso!</b>\n\n` +
          `💳 <b>Cartão:</b> ${maskedNumber}\n` +
          `📅 <b>Validade:</b> ${state.cardExpiry.slice(0,2)}/${state.cardExpiry.slice(2)}\n` +
          `👤 <b>Nome:</b> ${state.cardName}\n` +
          `📧 <b>Email:</b> ${cardEmail}\n\n` +
          `✅ Agora você pode vender ativações Clouddy!`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💳 Ver Cartão', 'reseller_clouddy_card')],
              [Markup.button.callback('🔙 Menu', 'reseller_menu')]
            ])
          }
        );
      } catch (error) {
        console.error('Erro ao salvar cartão:', error);
        await ctx.reply('❌ Erro ao salvar cartão. Tente novamente.');
      }

      resellerState.delete(ctx.from.id);
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

    // BUSCAR CLIENTE (novo)
    case 'buscar_cliente': {
      const termo = text.trim();
      
      if (termo.length < 2) {
        await ctx.reply(
          '❌ Digite pelo menos 2 caracteres para buscar.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clientes')]])
        );
        return true;
      }

      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      if (!bot) {
        await ctx.reply('❌ Bot não encontrado.');
        resellerState.delete(ctx.from.id);
        return true;
      }

      const clientes = db.clientesBot.buscar(bot.id, termo);
      resellerState.delete(ctx.from.id);

      if (clientes.length === 0) {
        await ctx.reply(
          `❌ Nenhum cliente encontrado para "<b>${termo}</b>"`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔍 Nova busca', 'reseller_buscar_cliente_menu')],
              [Markup.button.callback('🔙 Voltar', 'reseller_clientes')]
            ])
          }
        );
        return true;
      }

      if (clientes.length === 1) {
        // Se encontrou apenas 1, mostra direto os detalhes
        await handleVerCliente(ctx, clientes[0].cliente_telegram_id);
        return true;
      }

      // Mostrar lista de resultados
      let mensagem = `🔍 <b>Resultados para "${termo}"</b>\n`;
      mensagem += `<i>Encontrados: ${clientes.length} cliente(s)</i>\n\n`;

      const buttons = [];
      clientes.slice(0, 10).forEach((c, i) => {
        const nome = c.cliente_nome || 'Cliente';
        const ativStr = c.total_ativacoes > 0 ? `✅${c.total_ativacoes}` : '⏳';
        mensagem += `${i + 1}. <b>${nome}</b> ${ativStr}\n`;
        mensagem += `   <code>${c.cliente_telegram_id}</code>\n\n`;
        
        buttons.push([Markup.button.callback(`${i + 1}. ${nome.substring(0, 20)}`, `reseller_ver_cliente_${c.cliente_telegram_id}`)]);
      });

      buttons.push([Markup.button.callback('🔍 Nova busca', 'reseller_buscar_cliente_menu')]);
      buttons.push([Markup.button.callback('🔙 Voltar', 'reseller_clientes')]);

      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
      return true;
    }

    // BUSCAR SALDO CLIENTE
    case 'buscar_saldo': {
      const clienteId = text.trim();
      
      if (!/^\d+$/.test(clienteId)) {
        await ctx.reply(
          '❌ ID inválido. Digite apenas números.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'reseller_clientes')]])
        );
        return true;
      }

      const bot = db.bots.buscarPorUsuarioId(usuario.id);
      if (!bot) {
        await ctx.reply('❌ Bot não encontrado.');
        resellerState.delete(ctx.from.id);
        return true;
      }

      resellerState.delete(ctx.from.id);
      
      // Redirecionar para ver detalhes completos do cliente
      await handleVerCliente(ctx, clienteId);
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
  handleProdutosPage,
  handleAddProduto,
  handleAddProdutoPage,
  handleCadastroRapido,
  mostrarProximoProduto,
  handlePularProduto,
  handleCancelarCadastroRapido,
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
  handleCredRivolut,
  handleCredCapPlayer,
  handleCredDreamTV,
  handleCredLazerPlay,
  handleCredLumina,
  handleCredAssistPlus,
  handleCredVivoPlayer,
  handleCredQuickPlayer,
  handleDuplecastCodes,
  handleDuplecastAdd,
  handleDuplecastAddBatch,
  handleDuplecastSelectTier,
  handleDuplecastListAvailable,
  handleDuplecastListUsed,
  handleDuplecastDelete,
  handleSmartOneCodes,
  handleSmartOneAdd,
  handleSmartOneAddBatch,
  handleSmartOneSelectTier,
  handleSmartOneListAvailable,
  handleSmartOneListUsed,
  handleSmartOneDelete,
  handleClouddyCard,
  handleClouddyAdd,
  handleClouddyUpdate,
  handleClouddyRemove,
  handleClouddyConfirmRemove,
  handleCredMultiPlayer,
  handleCredMP,
  handleSaldoApps,
  // Clientes
  handleClientes,
  handleClientesTodos,
  handleClientesComAtivacoes,
  handleClientesComSaldo,
  handleClientesNuncaAtivaram,
  handleBuscarClienteMenu,
  handleVerCliente,
  handleExportarClientes,
  // Compatibilidade (saldos)
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
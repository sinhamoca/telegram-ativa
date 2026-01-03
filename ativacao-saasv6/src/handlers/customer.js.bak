// src/handlers/customer.js - Menu e handlers do cliente final (bot do revendedor)

const { Markup } = require('telegraf');
const db = require('../database');
const config = require('../config');
const fs = require('fs');
const { createPaymentService } = require('../services/paymentService');
const activationService = require('../services/activationService');
const { getMacExtractor } = require('../services/macExtractor');

// Estado temporário dos clientes
const customerState = new Map();

// Mapeamento de apps "irmãos" que podem ser confundidos
const APPS_IRMAOS = {
  'ibo_player': { irmao: 'ibo_pro', nome: 'IBO Pro', credencial: 'ibo_pro' },
  'ibo_pro': { irmao: 'ibo_player', nome: 'IBO Player', credencial: 'ibosol' }
};

/**
 * Configura os handlers para um bot de revendedor
 */
function setupBot(bot, botData) {
  console.log(`[Customer] Configurando handlers para bot ${botData.bot_username}`);

  // Comando /start - não é callback
  bot.start((ctx) => handleStart(ctx, botData, false));

  // Callbacks
  bot.action(/produto_(\d+)/, (ctx) => handleSelectProduto(ctx, botData));
  bot.action('suporte', (ctx) => handleSuporte(ctx, botData));
  bot.action('verificar_pagamento', (ctx) => handleVerificarPagamento(ctx, botData));
  bot.action('cancelar', (ctx) => handleCancelar(ctx, botData));
  bot.action('voltar_menu', (ctx) => handleStart(ctx, botData, true));
  bot.action('tentar_novamente', (ctx) => handleTentarNovamente(ctx, botData));
  
  // Callback de pesquisa
  bot.action('pesquisar_produto', (ctx) => handlePesquisarProduto(ctx, botData));
  
  // Callbacks de paginação de aplicativos
  bot.action(/todos_aplicativos_(\d+)/, (ctx) => {
    const pagina = parseInt(ctx.match[1]);
    handleTodosAplicativos(ctx, botData, pagina);
  });
  bot.action('noop', (ctx) => ctx.answerCbQuery()); // Botão de página atual (não faz nada)
  
  // Callbacks de histórico
  bot.action('minhas_ativacoes', (ctx) => handleMinhasAtivacoes(ctx, botData));
  bot.action('buscar_mac_cliente', (ctx) => handleBuscarMacCliente(ctx, botData));
  bot.action('baixar_historico_cliente', (ctx) => handleBaixarHistoricoCliente(ctx, botData));

  // Mensagens de texto
  bot.on('text', (ctx) => handleText(ctx, botData));

  // Mensagens de foto (para extração de MAC)
  bot.on('photo', (ctx) => handlePhoto(ctx, botData));

  // Callbacks de confirmação de MAC extraído
  bot.action('confirmar_mac_foto', (ctx) => handleConfirmarMacFoto(ctx, botData));
  bot.action('rejeitar_mac_foto', (ctx) => handleRejeitarMacFoto(ctx, botData));

  // Callbacks de fallback IBO Player ↔ IBO Pro
  bot.action('tentar_app_irmao', (ctx) => handleTentarAppIrmao(ctx, botData));
  bot.action('rejeitar_app_irmao', (ctx) => handleRejeitarAppIrmao(ctx, botData));

  // Erros
  bot.catch((err, ctx) => {
    console.error(`[Bot ${botData.bot_username}] Erro:`, err.message);
  });
}

/**
 * Busca os top N apps mais ativados pelo cliente
 */
function getTopAppsCliente(botId, clienteTelegramId, limite = 5) {
  try {
    const topApps = db.query(`
      SELECT 
        pr.id as produto_id,
        pr.nome,
        pr.modulo,
        pr.preco,
        COUNT(*) as total_ativacoes
      FROM pedidos p
      JOIN produtos pr ON p.produto_id = pr.id
      WHERE p.bot_id = ? 
        AND p.cliente_telegram_id = ?
        AND p.status = 'ativado'
      GROUP BY pr.id
      ORDER BY total_ativacoes DESC
      LIMIT ?
    `, [botId, clienteTelegramId, limite]);
    
    return topApps || [];
  } catch (e) {
    console.error('[Customer] Erro ao buscar top apps:', e.message);
    return [];
  }
}

/**
 * Menu inicial do bot do revendedor
 */
async function handleStart(ctx, botData, isCallback = false) {
  if (isCallback) {
    try { await ctx.answerCbQuery(); } catch(e) {}
  }

  // Limpar estado anterior
  const stateKey = `${botData.id}_${ctx.from.id}`;
  customerState.delete(stateKey);

  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  if (!usuario) {
    await ctx.reply('❌ Este bot não está configurado corretamente.');
    return;
  }

  // Verificar se revendedor está ativo
  const podeAtivar = db.usuarios.podeAtivar(usuario.id);
  if (!podeAtivar.pode) {
    await ctx.reply('⚠️ Este bot está temporariamente indisponível. Tente novamente mais tarde.');
    return;
  }

  // Buscar saldo do cliente
  const saldo = db.saldos.buscar(botData.id, ctx.from.id.toString());

  // Buscar top 5 apps mais ativados pelo cliente
  const topApps = getTopAppsCliente(botData.id, ctx.from.id.toString(), 5);

  // Montar botões
  const buttons = [];
  
  // Adicionar top apps (se tiver)
  if (topApps.length > 0) {
    const produtosPorLinha = 2;
    for (let i = 0; i < topApps.length; i += produtosPorLinha) {
      const linha = [];
      for (let j = i; j < i + produtosPorLinha && j < topApps.length; j++) {
        const p = topApps[j];
        const nomeCompacto = p.nome.length > 18 ? p.nome.substring(0, 16) + '..' : p.nome;
        linha.push(Markup.button.callback(`${nomeCompacto} R$${p.preco.toFixed(0)}`, `produto_${p.produto_id}`));
      }
      buttons.push(linha);
    }
  }
  
  // Botões principais
  buttons.push([Markup.button.callback('📱 Ativar Aplicativo', 'todos_aplicativos_0')]);
  buttons.push([Markup.button.callback('🔍 Pesquisar', 'pesquisar_produto')]);
  buttons.push([Markup.button.callback('📜 Minhas Ativações', 'minhas_ativacoes')]);
  buttons.push([Markup.button.callback('❓ Suporte', 'suporte')]);

  // Montar mensagem
  let mensagem = `👋 <b>Olá, ${ctx.from.first_name}!</b>\n\n`;
  mensagem += `Bem-vindo à nossa loja de ativações.\n\n`;
  
  // Mostrar saldo se tiver
  if (saldo > 0) {
    mensagem += `💰 <b>Seu saldo:</b> R$${saldo.toFixed(2)}\n\n`;
  }
  
  // Mensagem baseada nos top apps
  if (topApps.length > 0) {
    mensagem += `⭐ <b>Seus apps favoritos:</b>`;
  } else {
    mensagem += `📺 <b>Clique em "Ativar Aplicativo" para começar!</b>`;
  }

  // Só edita se for callback, senão envia nova mensagem
  if (isCallback && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    } catch (e) {
      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  } else {
    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

/**
 * Lista todos os aplicativos disponíveis com paginação
 */
async function handleTodosAplicativos(ctx, botData, pagina = 0) {
  try { await ctx.answerCbQuery(); } catch(e) {}

  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  if (!usuario) return;

  // Buscar todos os produtos ativos
  const todosProdutos = db.produtos.listarAtivosPorUsuario(usuario.id);
  
  if (todosProdutos.length === 0) {
    await ctx.editMessageText(
      '⚠️ Nenhum produto disponível no momento.',
      { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'voltar_menu')]]) }
    );
    return;
  }

  const porPagina = 10; // 10 produtos por página (5 linhas de 2)
  const totalPaginas = Math.ceil(todosProdutos.length / porPagina);
  const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));
  
  const inicio = paginaAtual * porPagina;
  const fim = Math.min(inicio + porPagina, todosProdutos.length);
  const produtosPagina = todosProdutos.slice(inicio, fim);

  // Montar botões dos produtos (2 por linha)
  const buttons = [];
  const produtosPorLinha = 2;
  
  for (let i = 0; i < produtosPagina.length; i += produtosPorLinha) {
    const linha = [];
    for (let j = i; j < i + produtosPorLinha && j < produtosPagina.length; j++) {
      const p = produtosPagina[j];
      const nomeCompacto = p.nome.length > 18 ? p.nome.substring(0, 16) + '..' : p.nome;
      linha.push(Markup.button.callback(`${nomeCompacto} R$${p.preco.toFixed(0)}`, `produto_${p.id}`));
    }
    buttons.push(linha);
  }

  // Botões de navegação
  const navButtons = [];
  
  if (paginaAtual > 0) {
    navButtons.push(Markup.button.callback('◀️ Anterior', `todos_aplicativos_${paginaAtual - 1}`));
  }
  
  navButtons.push(Markup.button.callback(`${paginaAtual + 1}/${totalPaginas}`, 'noop'));
  
  if (paginaAtual < totalPaginas - 1) {
    navButtons.push(Markup.button.callback('Próximo ▶️', `todos_aplicativos_${paginaAtual + 1}`));
  }
  
  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }

  // Botão de pesquisa e voltar
  buttons.push([Markup.button.callback('🔍 Pesquisar', 'pesquisar_produto')]);
  buttons.push([Markup.button.callback('🔙 Voltar', 'voltar_menu')]);

  const mensagem = `📱 <b>Todos os Aplicativos</b>\n\n` +
    `📊 Total: ${todosProdutos.length} aplicativos\n` +
    `📄 Página ${paginaAtual + 1} de ${totalPaginas}\n\n` +
    `<i>Selecione o aplicativo que deseja ativar:</i>`;

  try {
    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (e) {
    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
}

/**
 * Cliente quer pesquisar produto
 */
async function handlePesquisarProduto(ctx, botData) {
  await ctx.answerCbQuery();
  
  const stateKey = `${botData.id}_${ctx.from.id}`;
  
  customerState.set(stateKey, {
    step: 'pesquisar_produto'
  });

  await ctx.editMessageText(
    `🔍 <b>Pesquisar Aplicativo</b>\n\n` +
    `Digite o nome do aplicativo que procura:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'voltar_menu')]])
    }
  );
}

/**
 * Cliente selecionou um produto
 */
async function handleSelectProduto(ctx, botData) {
  await ctx.answerCbQuery();

  const produtoId = parseInt(ctx.match[1]);
  const produto = db.produtos.buscarPorId(produtoId);

  if (!produto) {
    await ctx.reply('❌ Produto não encontrado.');
    return;
  }

  // Buscar saldo do cliente
  const saldo = db.saldos.buscar(botData.id, ctx.from.id.toString());
  const valorProduto = produto.preco;
  const valorAPagar = Math.max(0, valorProduto - saldo);

  const stateKey = `${botData.id}_${ctx.from.id}`;

  // ==========================================
  // VERIFICAR SE É CLOUDDY (usa cartão, não MAC)
  // ==========================================
  const moduloConfig = config.MODULOS[produto.modulo];
  const isClouddy = moduloConfig?.usaCartao === true;

  if (isClouddy) {
    // Clouddy: pedir email ao invés de MAC
    customerState.set(stateKey, {
      step: 'clouddy_email',
      produtoId: produtoId,
      valorProduto: valorProduto,
      valorPago: 0,
      saldoUsado: Math.min(saldo, valorProduto)
    });

    let mensagem = `📱 <b>${produto.nome}</b>\n\n`;
    mensagem += `💰 <b>Valor:</b> R$${valorProduto.toFixed(2)}\n`;
    
    if (saldo > 0) {
      mensagem += `💳 <b>Seu saldo:</b> R$${saldo.toFixed(2)}\n`;
      if (valorAPagar > 0) {
        mensagem += `💵 <b>A pagar:</b> R$${valorAPagar.toFixed(2)}\n`;
      } else {
        mensagem += `✅ <b>Nada a pagar!</b>\n`;
      }
    }
    
    mensagem += `\n<b>ℹ️ Como funciona:</b>\n`;
    mensagem += `1. Você informa o email/senha da sua conta Clouddy\n`;
    mensagem += `2. Nossa automação faz a renovação\n`;
    mensagem += `3. Sua conta fica ativa por mais 1 ano!\n\n`;
    mensagem += `📧 <b>Informe o EMAIL da sua conta Clouddy:</b>`;

    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
    });
    return;
  }

  // ==========================================
  // FLUXO NORMAL (outros apps - pede MAC)
  // ==========================================

  // Salvar estado
  customerState.set(stateKey, {
    step: valorAPagar > 0 ? 'aguardando_pagamento' : 'aguardando_mac',
    produtoId: produtoId,
    valorProduto: valorProduto,
    valorPago: 0,
    saldoUsado: Math.min(saldo, valorProduto)
  });

  // Se tem saldo suficiente, pula para pedir MAC
  if (valorAPagar <= 0) {
    let mensagem = `📱 <b>${produto.nome}</b>\n`;
    mensagem += `💰 <b>Valor:</b> R$${valorProduto.toFixed(2)}\n`;
    mensagem += `💳 <b>Usando saldo:</b> R$${saldo.toFixed(2)}\n`;
    mensagem += `✅ <b>Nada a pagar!</b>\n\n`;
    mensagem += `📝 <b>Envie o MAC Address do seu aparelho:</b>\n\n`;
    mensagem += `Você pode:\n`;
    mensagem += `• <b>Digitar:</b> <code>AA:BB:CC:DD:EE:FF</code>\n`;
    mensagem += `• <b>Enviar uma FOTO/PRINT</b> do app`;

    // Verificar se o módulo tem imagem configurada (caminho local)
    const imagemCaminho = db.modulosImagens?.buscarCaminho(produto.modulo);
    
    if (imagemCaminho && fs.existsSync(imagemCaminho)) {
      // Tem imagem - enviar foto com caption
      try {
        await ctx.deleteMessage(); // Remove mensagem anterior
      } catch (e) { /* ignora se não conseguir deletar */ }
      
      await ctx.replyWithPhoto(
        { source: imagemCaminho },
        {
          caption: mensagem,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
    } else {
      // Sem imagem - enviar só texto (comportamento original)
      await ctx.editMessageText(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      });
    }
    
    // Atualizar estado para aguardar MAC
    customerState.set(stateKey, {
      ...customerState.get(stateKey),
      step: 'aguardando_mac'
    });
    return;
  }

  // Precisa gerar PIX
  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');

  if (!credMP) {
    await ctx.reply('❌ Erro de configuração. Entre em contato com o suporte.');
    customerState.delete(stateKey);
    return;
  }

  // Criar pedido
  const pedido = db.pedidos.criar(
    botData.id,
    produto.id,
    ctx.from.id.toString(),
    ctx.from.first_name,
    ctx.from.username,
    'PENDENTE', // MAC será preenchido depois
    valorAPagar // Valor a pagar (diferença)
  );

  // Atualizar estado com pedido
  customerState.set(stateKey, {
    ...customerState.get(stateKey),
    pedidoId: pedido.id,
    valorPago: valorAPagar
  });

  await ctx.editMessageText('💳 Gerando pagamento PIX...', { parse_mode: 'HTML' });

  // Gerar PIX
  const paymentService = createPaymentService(credMP.dados.accessToken);
  const pix = await paymentService.criarPixPayment(
    valorAPagar,
    `${produto.nome}`,
    pedido.codigo
  );

  if (!pix.success) {
    await ctx.reply(`❌ Erro ao gerar pagamento: ${pix.error}`);
    db.pedidos.marcarErro(pedido.id, pix.error);
    customerState.delete(stateKey);
    return;
  }

  // Atualizar pedido com dados do pagamento
  db.pedidos.atualizar(pedido.id, {
    pagamento_id: pix.paymentId,
    pagamento_qrcode: pix.qrCodeBase64,
    pagamento_copia_cola: pix.copiaCola
  });

  // Montar mensagem
  let mensagemPix = `📱 <b>${produto.nome}</b>\n`;
  mensagemPix += `💰 <b>Valor total:</b> R$${valorProduto.toFixed(2)}\n`;
  
  if (saldo > 0) {
    mensagemPix += `💳 <b>Seu saldo:</b> -R$${saldo.toFixed(2)}\n`;
    mensagemPix += `💵 <b>A pagar:</b> R$${valorAPagar.toFixed(2)}\n`;
  }

  // Array para armazenar IDs das mensagens de pagamento
  const mensagensPagamento = [];

  // Enviar QR Code
  if (pix.qrCodeBase64) {
    const imageBuffer = Buffer.from(pix.qrCodeBase64, 'base64');
    const qrMsg = await ctx.replyWithPhoto(
      { source: imageBuffer },
      { caption: mensagemPix, parse_mode: 'HTML' }
    );
    mensagensPagamento.push(qrMsg.message_id);
  }

  // Enviar código copia e cola
  const pixMsg = await ctx.reply(
    `📋 <b>Código PIX (Copia e Cola):</b>\n\n` +
    `<code>${pix.copiaCola}</code>\n\n` +
    `⏱️ <b>Validade:</b> 30 minutos\n\n` +
    `✅ O pagamento será confirmado automaticamente.\n` +
    `Aguarde a confirmação...`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        // Botão de verificação manual comentado - descomentar se necessário:
        // [Markup.button.callback('✅ Já paguei', 'verificar_pagamento')],
        [Markup.button.callback('❌ Cancelar', 'voltar_menu')]
      ])
    }
  );
  mensagensPagamento.push(pixMsg.message_id);

  // Armazenar IDs das mensagens no estado
  customerState.set(stateKey, {
    ...customerState.get(stateKey),
    mensagensPagamento: mensagensPagamento
  });

  // Iniciar verificação automática de pagamento (30 minutos timeout)
  startPaymentCheck(ctx, botData, pedido.id);
}

/**
 * Processa texto enviado pelo cliente (MAC, email, senha)
 */
async function handleText(ctx, botData) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state) return;

  const text = ctx.message.text;

  // ==========================================
  // PESQUISAR PRODUTO
  // ==========================================
  if (state.step === 'pesquisar_produto') {
    const termo = text.trim().toLowerCase();
    
    if (termo.length < 2) {
      await ctx.reply(
        '❌ Digite pelo menos 2 caracteres para pesquisar.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar', 'voltar_menu')]])
      );
      return;
    }
    
    // Buscar usuário do bot
    const bot = db.bots.buscarPorId(botData.id);
    const usuario = db.usuarios.buscarPorId(bot.usuario_id);
    
    // Buscar produtos que contenham o termo
    const todosProdutos = db.produtos.listarAtivosPorUsuario(usuario.id);
    const produtosFiltrados = todosProdutos.filter(p => 
      p.nome.toLowerCase().includes(termo)
    );
    
    customerState.delete(stateKey);
    
    if (produtosFiltrados.length === 0) {
      await ctx.reply(
        `🔍 Nenhum resultado para "<b>${termo}</b>"\n\n` +
        `Tente outro termo ou volte ao menu.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Nova pesquisa', 'pesquisar_produto')],
            [Markup.button.callback('🔙 Voltar ao menu', 'voltar_menu')]
          ])
        }
      );
      return;
    }
    
    // Montar botões de resultado (2 por linha)
    const buttons = [];
    const produtosPorLinha = 2;
    
    for (let i = 0; i < produtosFiltrados.length; i += produtosPorLinha) {
      const linha = [];
      for (let j = i; j < i + produtosPorLinha && j < produtosFiltrados.length; j++) {
        const p = produtosFiltrados[j];
        const nomeCompacto = p.nome.length > 18 ? p.nome.substring(0, 16) + '..' : p.nome;
        linha.push(Markup.button.callback(`${nomeCompacto} R$${p.preco.toFixed(0)}`, `produto_${p.id}`));
      }
      buttons.push(linha);
    }
    
    buttons.push([Markup.button.callback('🔍 Nova pesquisa', 'pesquisar_produto')]);
    buttons.push([Markup.button.callback('🔙 Voltar ao menu', 'voltar_menu')]);
    
    await ctx.reply(
      `🔍 Resultados para "<b>${termo}</b>":\n` +
      `<i>Encontrados: ${produtosFiltrados.length} produto(s)</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      }
    );
    return;
  }

  // ==========================================
  // CLOUDDY: PEDIR EMAIL
  // ==========================================
  if (state.step === 'clouddy_email') {
    const email = text.trim().toLowerCase();
    
    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await ctx.reply(
        '❌ Email inválido. Digite um email válido:',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      );
      return;
    }
    
    customerState.set(stateKey, {
      ...state,
      step: 'clouddy_senha',
      clienteEmailClouddy: email
    });
    
    await ctx.reply(
      `✅ Email: <code>${email}</code>\n\n` +
      `🔐 Agora informe a <b>SENHA</b> da sua conta Clouddy:`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      }
    );
    return;
  }

  // ==========================================
  // CLOUDDY: PEDIR SENHA E PROCESSAR
  // ==========================================
  if (state.step === 'clouddy_senha') {
    const senha = text.trim();
    
    if (senha.length < 3) {
      await ctx.reply(
        '❌ Senha muito curta. Digite uma senha válida:',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      );
      return;
    }

    const produto = db.produtos.buscarPorId(state.produtoId);
    if (!produto) {
      await ctx.reply('❌ Erro: produto não encontrado.');
      customerState.delete(stateKey);
      return;
    }

    const saldo = db.saldos.buscar(botData.id, ctx.from.id.toString());
    const valorAPagar = Math.max(0, produto.preco - saldo);

    // Salvar email e senha no estado
    customerState.set(stateKey, {
      ...state,
      clienteSenhaClouddy: senha
    });

    if (valorAPagar > 0) {
      // ============ PRECISA PAGAR ============
      const usuario = db.usuarios.buscarPorId(botData.usuario_id);
      const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');
      
      if (!credMP) {
        await ctx.reply('❌ Erro de configuração. Entre em contato com o suporte.');
        customerState.delete(stateKey);
        return;
      }
      
      // Criar pedido COM email/senha do Clouddy
      const pedido = db.pedidos.criar(
        botData.id,
        produto.id,
        ctx.from.id.toString(),
        ctx.from.first_name,
        ctx.from.username,
        'CLOUDDY_EMAIL_AUTH', // Placeholder para MAC
        valorAPagar
      );
      
      // Atualizar pedido com email/senha do Clouddy
      db.pedidos.atualizar(pedido.id, {
        cliente_email_clouddy: state.clienteEmailClouddy,
        cliente_senha_clouddy: senha
      });
      
      // Atualizar estado
      customerState.set(stateKey, {
        ...state,
        step: 'aguardando_pagamento',
        pedidoId: pedido.id,
        valorPago: valorAPagar,
        clienteSenhaClouddy: senha,
        isClouddy: true
      });
      
      await ctx.reply('💳 Gerando pagamento PIX...');
      
      // Gerar PIX
      const paymentService = createPaymentService(credMP.dados.accessToken);
      const pix = await paymentService.criarPixPayment(
        valorAPagar,
        produto.nome,
        pedido.codigo
      );
      
      if (!pix.success) {
        await ctx.reply(`❌ Erro ao gerar pagamento: ${pix.error}`);
        db.pedidos.marcarErro(pedido.id, pix.error);
        customerState.delete(stateKey);
        return;
      }
      
      // Atualizar pedido com dados do pagamento
      db.pedidos.atualizar(pedido.id, {
        pagamento_id: pix.paymentId,
        pagamento_qrcode: pix.qrCodeBase64,
        pagamento_copia_cola: pix.copiaCola
      });
      
      // Array para armazenar IDs das mensagens de pagamento
      const mensagensPagamento = [];
      
      // Montar mensagem
      let mensagemPix = `📱 <b>${produto.nome}</b>\n`;
      mensagemPix += `💰 <b>Valor total:</b> R$${produto.preco.toFixed(2)}\n`;
      
      if (saldo > 0) {
        mensagemPix += `💳 <b>Seu saldo:</b> -R$${saldo.toFixed(2)}\n`;
        mensagemPix += `💵 <b>A pagar:</b> R$${valorAPagar.toFixed(2)}\n`;
      }
      
      // Enviar QR Code
      if (pix.qrCodeBase64) {
        const imageBuffer = Buffer.from(pix.qrCodeBase64, 'base64');
        const qrMsg = await ctx.replyWithPhoto(
          { source: imageBuffer },
          { caption: mensagemPix, parse_mode: 'HTML' }
        );
        mensagensPagamento.push(qrMsg.message_id);
      }
      
      // Enviar código copia e cola
      const pixMsg = await ctx.reply(
        `📋 <b>Código PIX (Copia e Cola):</b>\n\n` +
        `<code>${pix.copiaCola}</code>\n\n` +
        `⏱️ <b>Validade:</b> 30 minutos\n\n` +
        `✅ O pagamento será confirmado automaticamente.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
      mensagensPagamento.push(pixMsg.message_id);
      
      // Armazenar IDs das mensagens no estado
      customerState.set(stateKey, {
        ...customerState.get(stateKey),
        mensagensPagamento: mensagensPagamento
      });
      
      // Iniciar verificação automática de pagamento
      startPaymentCheck(ctx, botData, pedido.id);
      
    } else {
      // ============ TEM SALDO SUFICIENTE - PROCESSAR DIRETO ============
      // Criar pedido
      const pedido = db.pedidos.criar(
        botData.id,
        produto.id,
        ctx.from.id.toString(),
        ctx.from.first_name,
        ctx.from.username,
        'CLOUDDY_EMAIL_AUTH',
        0
      );
      
      // Atualizar pedido com email/senha do Clouddy
      db.pedidos.atualizar(pedido.id, {
        cliente_email_clouddy: state.clienteEmailClouddy,
        cliente_senha_clouddy: senha
      });
      
      // Marcar como pago
      db.pedidos.marcarPago(pedido.id, 'SALDO');
      
      // Processar ativação Clouddy
      await processarAtivacaoClouddy(ctx, botData, pedido.id, produto, state.clienteEmailClouddy);
    }
    return;
  }

  // ==========================================
  // SELECIONAR MAC (múltiplos encontrados na foto)
  // ==========================================
  if (state.step === 'selecionar_mac') {
    const input = text.trim();
    let macSelecionado = null;

    // Verificar se é um número (índice)
    const indice = parseInt(input);
    if (!isNaN(indice) && indice >= 1 && indice <= state.macsEncontrados.length) {
      macSelecionado = state.macsEncontrados[indice - 1];
    } else {
      // Tentar como MAC direto
      const produto = db.produtos.buscarPorId(state.produtoId);
      if (produto) {
        const validacao = activationService.validarMac(produto.modulo, input);
        if (validacao.valido) {
          macSelecionado = validacao.macFormatado;
        }
      }
    }

    if (!macSelecionado) {
      await ctx.reply(
        `❌ Opção inválida.\n\n` +
        `Digite o número (1-${state.macsEncontrados.length}) ou o MAC completo:`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      );
      return;
    }

    // MAC selecionado - pedir confirmação
    customerState.set(stateKey, {
      ...state,
      step: 'aguardando_mac',
      macPendente: macSelecionado,
      macsEncontrados: null
    });

    await ctx.reply(
      `📷 <b>MAC selecionado:</b>\n\n` +
      `<code>${macSelecionado}</code>\n\n` +
      `Este é o MAC correto?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Sim, ativar!', 'confirmar_mac_foto'),
            Markup.button.callback('❌ Não', 'rejeitar_mac_foto')
          ],
          [Markup.button.callback('🔙 Cancelar', 'voltar_menu')]
        ])
      }
    );
    return;
  }

  // Busca por MAC no histórico
  if (state.step === 'buscar_mac_historico') {
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
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'minhas_ativacoes')]])
        }
      );
      return;
    }

    // Formatar MAC para busca
    let macFormatado = macBusca;
    if (macSemSeparador.test(macBusca)) {
      macFormatado = macBusca.replace(/(.{2})/g, '$1:').slice(0, -1);
    }

    const clienteId = ctx.from.id.toString();
    const ativacoes = db.ativacoes.buscarPorMacCliente(botData.id, clienteId, macFormatado);

    customerState.delete(stateKey);

    if (ativacoes.length === 0) {
      await ctx.reply(
        `🔍 <b>Resultado da Busca</b>\n\n` +
        `Nenhuma ativação encontrada para o MAC:\n` +
        `<code>${macFormatado}</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Nova Busca', 'buscar_mac_cliente')],
            [Markup.button.callback('🔙 Voltar', 'minhas_ativacoes')]
          ])
        }
      );
      return;
    }

    let mensagem = `🔍 <b>Resultado da Busca</b>\n\n`;
    mensagem += `MAC: <code>${macFormatado}</code>\n\n`;

    ativacoes.forEach((a, i) => {
      const validade = extrairValidade(a.resposta_api, a.tier);
      mensagem += `<b>${i + 1}. ${a.produto_nome}</b>\n`;
      mensagem += `   📅 Data: ${formatarData(a.criado_em)}\n`;
      mensagem += `   ⏰ Validade: ${validade}\n`;
      mensagem += `   🎫 Código: ${a.pedido_codigo}\n\n`;
    });

    await ctx.reply(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Nova Busca', 'buscar_mac_cliente')],
        [Markup.button.callback('🔙 Voltar', 'minhas_ativacoes')]
      ])
    });
    return;
  }

  if (state.step === 'aguardando_mac') {
    const produto = db.produtos.buscarPorId(state.produtoId);
    if (!produto) {
      await ctx.reply('❌ Erro: produto não encontrado.');
      customerState.delete(stateKey);
      return;
    }

    // Validar MAC
    const validacao = activationService.validarMac(produto.modulo, text);
    
    if (!validacao.valido) {
      await ctx.reply(
        `❌ ${validacao.erro}\n\n` +
        `Envie o MAC no formato correto:\n` +
        `• <b>Digitar:</b> <code>AA:BB:CC:DD:EE:FF</code>\n` +
        `• <b>Ou enviar uma FOTO</b> do app`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
      return;
    }

    const macAddress = validacao.macFormatado;

    // Verificar se o módulo requer código OTP
    const moduloConfig = config.MODULOS[produto.modulo];
    if (moduloConfig?.requerOtp) {
      // Atualizar estado para aguardar OTP
      customerState.set(stateKey, {
        ...state,
        step: 'aguardando_otp',
        macAddress: macAddress
      });

      await ctx.reply(
        `✅ <b>MAC confirmado:</b> <code>${macAddress}</code>\n\n` +
        `📲 Agora, digite o <b>código de 6 dígitos</b> que aparece no aplicativo:\n\n` +
        `<i>O código aparece na tela do app quando você tenta conectar.</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
      return;
    }

    // Atualizar estado com MAC
    customerState.set(stateKey, {
      ...state,
      macAddress: macAddress
    });

    // Se já pagou (ou usou saldo), processar ativação
    await processarAtivacao(ctx, botData);
  }

  // ========== AGUARDANDO OTP (Quick Player e similares) ==========
  if (state.step === 'aguardando_otp') {
    const otpCode = text.replace(/\D/g, ''); // Remover não-numéricos
    
    if (otpCode.length < 4 || otpCode.length > 8) {
      await ctx.reply(
        `❌ Código inválido.\n\n` +
        `Digite apenas os <b>números</b> que aparecem no aplicativo.\n` +
        `Geralmente são 6 dígitos.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
      return;
    }

    // Atualizar estado com OTP
    customerState.set(stateKey, {
      ...state,
      otpCode: otpCode
    });

    // Processar ativação
    await processarAtivacao(ctx, botData);
  }
}

/**
 * Processa foto enviada pelo cliente (extração de MAC por OCR)
 */
async function handlePhoto(ctx, botData) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  // Verificar se está aguardando MAC
  if (!state || state.step !== 'aguardando_mac') {
    return; // Ignora fotos fora do contexto
  }

  const produto = db.produtos.buscarPorId(state.produtoId);
  if (!produto) {
    await ctx.reply('❌ Erro: produto não encontrado.');
    customerState.delete(stateKey);
    return;
  }

  // Informar que está processando
  const processingMsg = await ctx.reply('🔍 Analisando imagem...');

  try {
    // Pegar a foto de maior resolução
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; // Última = maior resolução

    // Baixar a foto
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Extrair MAC usando OCR
    const extractor = getMacExtractor();
    const result = await extractor.extractFromBuffer(buffer, `${photo.file_id}.jpg`);

    // Deletar mensagem de processamento
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
    } catch (e) {}

    if (result.count === 0) {
      // Nenhum MAC encontrado
      await ctx.reply(
        `❌ <b>Não foi possível encontrar um MAC na imagem.</b>\n\n` +
        `Tente:\n` +
        `• Enviar uma foto mais nítida\n` +
        `• Ou digitar o MAC manualmente: <code>AA:BB:CC:DD:EE:FF</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
        }
      );
      return;
    }

    if (result.count === 1) {
      // Encontrou exatamente 1 MAC - pedir confirmação
      const macEncontrado = result.macs[0];

      // Validar o MAC encontrado
      const validacao = activationService.validarMac(produto.modulo, macEncontrado);
      
      if (!validacao.valido) {
        await ctx.reply(
          `⚠️ <b>MAC encontrado mas parece inválido:</b>\n\n` +
          `<code>${macEncontrado}</code>\n\n` +
          `Por favor, digite o MAC manualmente:`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
          }
        );
        return;
      }

      // Salvar MAC no estado para confirmação
      customerState.set(stateKey, {
        ...state,
        macPendente: validacao.macFormatado
      });

      await ctx.reply(
        `📷 <b>MAC encontrado na imagem:</b>\n\n` +
        `<code>${validacao.macFormatado}</code>\n\n` +
        `Este é o MAC correto?`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Sim, ativar!', 'confirmar_mac_foto'),
              Markup.button.callback('❌ Não', 'rejeitar_mac_foto')
            ],
            [Markup.button.callback('🔙 Cancelar', 'voltar_menu')]
          ])
        }
      );

    } else {
      // Encontrou múltiplos MACs - mostrar lista
      let mensagem = `📷 <b>Encontrei ${result.count} MACs na imagem:</b>\n\n`;
      
      result.macs.forEach((mac, i) => {
        mensagem += `${i + 1}. <code>${mac}</code>\n`;
      });
      
      mensagem += `\n<b>Qual é o MAC correto?</b>\n`;
      mensagem += `Digite o número (1-${result.count}) ou o MAC completo:`;

      // Salvar MACs encontrados no estado
      customerState.set(stateKey, {
        ...state,
        step: 'selecionar_mac',
        macsEncontrados: result.macs
      });

      await ctx.reply(mensagem, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      });
    }

  } catch (error) {
    console.error('[MacExtractor] Erro ao processar foto:', error);
    
    // Deletar mensagem de processamento
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
    } catch (e) {}

    await ctx.reply(
      `❌ <b>Erro ao processar a imagem.</b>\n\n` +
      `Por favor, digite o MAC manualmente:\n` +
      `Exemplo: <code>AA:BB:CC:DD:EE:FF</code>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      }
    );
  }
}

/**
 * Confirma MAC extraído da foto e processa ativação
 */
async function handleConfirmarMacFoto(ctx, botData) {
  await ctx.answerCbQuery('Processando...');

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state || !state.macPendente) {
    await ctx.reply('❌ Erro: MAC não encontrado. Tente novamente.');
    return;
  }

  // Atualizar estado com MAC confirmado
  customerState.set(stateKey, {
    ...state,
    macAddress: state.macPendente,
    macPendente: null
  });

  // Editar mensagem de confirmação
  try {
    await ctx.editMessageText(
      `✅ <b>MAC confirmado:</b> <code>${state.macPendente}</code>\n\n` +
      `Processando ativação...`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}

  // Processar ativação
  await processarAtivacao(ctx, botData);
}

/**
 * Rejeita MAC extraído e pede para digitar
 */
async function handleRejeitarMacFoto(ctx, botData) {
  await ctx.answerCbQuery();

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state) {
    await handleStart(ctx, botData, true);
    return;
  }

  // Limpar MAC pendente
  customerState.set(stateKey, {
    ...state,
    macPendente: null
  });

  await ctx.editMessageText(
    `📝 <b>OK! Digite o MAC correto:</b>\n\n` +
    `Formato: <code>AA:BB:CC:DD:EE:FF</code>\n\n` +
    `Ou envie outra foto.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
    }
  );
}

/**
 * Verifica pagamento manualmente
 */
async function handleVerificarPagamento(ctx, botData) {
  await ctx.answerCbQuery('Verificando...');

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state || !state.pedidoId) {
    await ctx.reply('ℹ️ Nenhum pagamento pendente encontrado.');
    return;
  }

  const pedido = db.pedidos.buscarPorId(state.pedidoId);
  if (!pedido) {
    await ctx.reply('❌ Pedido não encontrado.');
    return;
  }

  // Buscar credenciais
  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');

  if (!credMP) {
    await ctx.reply('❌ Erro de configuração.');
    return;
  }

  // Consultar pagamento
  const paymentService = createPaymentService(credMP.dados.accessToken);
  const status = await paymentService.consultarPagamento(pedido.pagamento_id);

  if (!status.success) {
    await ctx.reply('⏳ Aguardando confirmação do pagamento...');
    return;
  }

  if (status.pago) {
    await confirmarPagamento(ctx, botData, state);
  } else {
    await ctx.reply(
      `⏳ <b>Pagamento ainda não confirmado</b>\n\n` +
      `Status: ${status.status}\n\n` +
      `Aguarde alguns instantes e tente novamente.`,
      { parse_mode: 'HTML' }
    );
  }
}

/**
 * Confirma pagamento e pede MAC (ou processa Clouddy direto)
 */
async function confirmarPagamento(ctx, botData, state) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  
  // IMPORTANTE: Verificar se já foi confirmado para evitar duplicação
  const stateAtual = customerState.get(stateKey);
  if (stateAtual?.pagamentoConfirmado) {
    console.log(`[Saldo] Pagamento já confirmado para cliente ${ctx.from.id}, ignorando duplicação`);
    return;
  }

  // Verificar se pedido já está pago no banco
  if (state.pedidoId) {
    const pedido = db.pedidos.buscarPorId(state.pedidoId);
    if (pedido && pedido.status !== 'pendente') {
      console.log(`[Saldo] Pedido ${pedido.codigo} já processado (status: ${pedido.status}), ignorando`);
      return;
    }
  }

  // Marcar como confirmado ANTES de adicionar saldo
  customerState.set(stateKey, {
    ...state,
    pagamentoConfirmado: true
  });

  // Deletar mensagens de pagamento (QR code e copia/cola)
  await deletarMensagensPagamento(ctx, state.mensagensPagamento);
  
  // Adicionar valor pago ao saldo
  const novoSaldo = db.saldos.adicionar(botData.id, ctx.from.id.toString(), state.valorPago);
  
  console.log(`[Saldo] Cliente ${ctx.from.id} pagou R$${state.valorPago}, saldo agora: R$${novoSaldo}`);

  // Marcar pedido como pago
  if (state.pedidoId) {
    const pedido = db.pedidos.buscarPorId(state.pedidoId);
    db.pedidos.marcarPago(state.pedidoId, pedido?.pagamento_id);
  }

  // ==========================================
  // VERIFICAR SE É CLOUDDY - PROCESSAR DIRETO
  // ==========================================
  if (state.isClouddy || state.clienteEmailClouddy) {
    const produto = db.produtos.buscarPorId(state.produtoId);
    
    // Processar ativação Clouddy direto (já tem email/senha)
    await processarAtivacaoClouddy(ctx, botData, state.pedidoId, produto, state.clienteEmailClouddy);
    return;
  }

  // ==========================================
  // FLUXO NORMAL - PEDIR MAC
  // ==========================================

  // Atualizar estado para aguardar MAC
  customerState.set(stateKey, {
    ...state,
    step: 'aguardando_mac',
    saldoAtual: novoSaldo,
    pagamentoConfirmado: true,
    mensagensPagamento: [] // Limpar referências
  });

  const produto = db.produtos.buscarPorId(state.produtoId);

  const mensagemMac = 
    `✅ <b>Pagamento confirmado!</b>\n\n` +
    `💰 Seu saldo: R$${novoSaldo.toFixed(2)}\n\n` +
    `📱 <b>Produto:</b> ${produto?.nome}\n\n` +
    `📝 <b>Agora envie o MAC Address do seu aparelho:</b>\n\n` +
    `Você pode:\n` +
    `• <b>Digitar:</b> <code>AA:BB:CC:DD:EE:FF</code>\n` +
    `• <b>Enviar uma FOTO/PRINT</b> do app`;

  // Verificar se o módulo tem imagem configurada (caminho local)
  const imagemCaminho = produto ? db.modulosImagens?.buscarCaminho(produto.modulo) : null;

  if (imagemCaminho && fs.existsSync(imagemCaminho)) {
    // Tem imagem - enviar foto com caption
    await ctx.replyWithPhoto(
      { source: imagemCaminho },
      {
        caption: mensagemMac,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      }
    );
  } else {
    // Sem imagem - enviar só texto
    await ctx.reply(mensagemMac, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
    });
  }
}

/**
 * Processa ativação Clouddy
 */
async function processarAtivacaoClouddy(ctx, botData, pedidoId, produto, clienteEmail) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  
  await ctx.reply(
    `⏳ <b>Processando ativação Clouddy...</b>\n\n` +
    `📧 Conta: ${clienteEmail}\n\n` +
    `<i>⚠️ Isso pode levar até 2 minutos. Aguarde...</i>`,
    { parse_mode: 'HTML' }
  );

  // Buscar saldo atual antes da ativação
  const saldoAntes = db.saldos.buscar(botData.id, ctx.from.id.toString());

  // Processar ativação
  const resultado = await activationService.processarAtivacao(pedidoId);

  if (resultado.success) {
    // SUCESSO: descontar saldo
    const saldoRestante = db.saldos.descontar(botData.id, ctx.from.id.toString(), produto.preco);
    
    console.log(`[Saldo] Cliente ${ctx.from.id} ativação Clouddy OK, descontou R$${produto.preco}, saldo restante: R$${saldoRestante}`);

    // Calcular validade (1 ano)
    const validade = new Date();
    validade.setFullYear(validade.getFullYear() + 1);
    const validadeStr = validade.toLocaleDateString('pt-BR');

    let mensagemSucesso = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    mensagemSucesso += `📱 <b>App:</b> ${produto.nome}\n`;
    mensagemSucesso += `📧 <b>Conta:</b> ${clienteEmail}\n`;
    mensagemSucesso += `📅 <b>Validade:</b> ${validadeStr}\n`;
    mensagemSucesso += `💰 <b>Valor:</b> R$${produto.preco.toFixed(2)}`;
    
    if (saldoRestante > 0) {
      mensagemSucesso += `\n\n💰 <b>Saldo restante:</b> R$${saldoRestante.toFixed(2)}`;
    }

    await ctx.reply(mensagemSucesso, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu inicial', 'voltar_menu')]])
    });
    
    customerState.delete(stateKey);
  } else {
    // FALHA: manter saldo
    const saldoMantido = db.saldos.buscar(botData.id, ctx.from.id.toString());
    
    console.log(`[Saldo] Cliente ${ctx.from.id} ativação Clouddy FALHOU, saldo mantido: R$${saldoMantido}`);

    await ctx.reply(
      `❌ <b>Erro na ativação</b>\n\n` +
      `<b>Motivo:</b> ${resultado.error}\n\n` +
      `💰 <b>Seu saldo:</b> R$${saldoMantido.toFixed(2)}\n\n` +
      `Possíveis causas:\n` +
      `• Email ou senha incorretos\n` +
      `• Conta Clouddy não existe\n` +
      `• Problema temporário no servidor\n\n` +
      `Você pode tentar novamente. Seu saldo está preservado!`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Tentar novamente', 'tentar_novamente')],
          [Markup.button.callback('🏠 Menu inicial', 'voltar_menu')],
          [Markup.button.callback('❓ Suporte', 'suporte')]
        ])
      }
    );
    
    customerState.delete(stateKey);
  }
}

/**
 * Processa ativação após receber MAC (fluxo normal)
 */
async function processarAtivacao(ctx, botData) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state || !state.macAddress) {
    await ctx.reply('❌ Erro: MAC não encontrado.');
    return;
  }

  const produto = db.produtos.buscarPorId(state.produtoId);
  if (!produto) {
    await ctx.reply('❌ Erro: produto não encontrado.');
    return;
  }

  await ctx.reply('💫 Processando ativação...');

  // Buscar saldo atual
  const saldoAtual = db.saldos.buscar(botData.id, ctx.from.id.toString());
  
  // Verificar se tem saldo suficiente
  if (saldoAtual < produto.preco) {
    await ctx.reply(
      `❌ <b>Saldo insuficiente</b>\n\n` +
      `💰 Seu saldo: R$${saldoAtual.toFixed(2)}\n` +
      `💵 Valor do produto: R$${produto.preco.toFixed(2)}\n\n` +
      `Selecione o produto novamente para pagar a diferença.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Voltar ao menu', 'voltar_menu')]])
      }
    );
    customerState.delete(stateKey);
    return;
  }

  // Criar ou atualizar pedido para a ativação
  let pedidoId = state.pedidoId;
  
  // Preparar dados extras (OTP para Quick Player e similares)
  const dadosExtra = state.otpCode ? { otpCode: state.otpCode } : null;
  
  if (!pedidoId) {
    // Criar pedido para quando usou só saldo
    const pedido = db.pedidos.criar(
      botData.id,
      produto.id,
      ctx.from.id.toString(),
      ctx.from.first_name,
      ctx.from.username,
      state.macAddress,
      produto.preco,
      dadosExtra
    );
    pedidoId = pedido.id;
    db.pedidos.marcarPago(pedidoId, 'SALDO');
  } else {
    // Atualizar MAC e dados extras no pedido existente
    const updateData = { mac_address: state.macAddress };
    if (dadosExtra) {
      updateData.dados_extra = JSON.stringify(dadosExtra);
    }
    db.pedidos.atualizar(pedidoId, updateData);
  }

  // Processar ativação
  const resultado = await activationService.processarAtivacao(pedidoId);

  if (resultado.success) {
    // SUCESSO: descontar saldo
    const saldoRestante = db.saldos.descontar(botData.id, ctx.from.id.toString(), produto.preco);
    
    console.log(`[Saldo] Cliente ${ctx.from.id} ativação OK, descontou R$${produto.preco}, saldo restante: R$${saldoRestante}`);

    let mensagemSucesso = resultado.message;
    
    if (saldoRestante > 0) {
      mensagemSucesso += `\n\n💰 <b>Saldo restante:</b> R$${saldoRestante.toFixed(2)}`;
    }

    await ctx.reply(mensagemSucesso, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu inicial', 'voltar_menu')]])
    });
    
    customerState.delete(stateKey);
  } else {
    // FALHA: verificar se pode tentar com app irmão
    const appIrmaoInfo = APPS_IRMAOS[produto.modulo];
    
    if (appIrmaoInfo && !state.jaTestouIrmao) {
      // Verificar se revendedor tem credenciais do app irmão
      const usuario = db.usuarios.buscarPorId(botData.usuario_id);
      const credIrmao = db.credenciais.buscar(usuario.id, appIrmaoInfo.credencial);
      
      if (credIrmao) {
        // Tem credencial do app irmão - oferecer fallback
        console.log(`[Fallback] Oferecendo ${appIrmaoInfo.nome} como alternativa para cliente ${ctx.from.id}`);
        
        const saldoMantido = db.saldos.buscar(botData.id, ctx.from.id.toString());
        
        // Salvar estado para fallback
        customerState.set(stateKey, {
          ...state,
          pedidoId: pedidoId,
          erroOriginal: resultado.error,
          appOriginal: produto.modulo,
          appOriginalNome: produto.nome,
          appIrmao: appIrmaoInfo.irmao,
          appIrmaoNome: appIrmaoInfo.nome
        });
        
        await ctx.reply(
          `⚠️ <b>Falha na ativação do ${produto.nome}</b>\n\n` +
          `<b>Motivo:</b> ${resultado.error}\n\n` +
          `💡 <b>Dica:</b> Muita gente confunde ${produto.nome} com ${appIrmaoInfo.nome}.\n\n` +
          `Deseja tentar ativar como <b>${appIrmaoInfo.nome}</b>?\n\n` +
          `💰 <b>Seu saldo:</b> R$${saldoMantido.toFixed(2)} (preservado)`,
          { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`✅ Sim, tentar ${appIrmaoInfo.nome}`, 'tentar_app_irmao')],
              [Markup.button.callback('❌ Não, obrigado', 'rejeitar_app_irmao')],
              [Markup.button.callback('❓ Suporte', 'suporte')]
            ])
          }
        );
        return;
      }
    }
    
    // Sem fallback disponível - mostrar erro normal
    const saldoMantido = db.saldos.buscar(botData.id, ctx.from.id.toString());
    
    console.log(`[Saldo] Cliente ${ctx.from.id} ativação FALHOU, saldo mantido: R$${saldoMantido}`);

    await ctx.reply(
      `❌ <b>Erro na ativação</b>\n\n` +
      `<b>Motivo:</b> ${resultado.error}\n\n` +
      `💰 <b>Seu saldo:</b> R$${saldoMantido.toFixed(2)}\n\n` +
      `Você pode tentar novamente com outro produto ou corrigir o MAC.\n` +
      `Seu saldo está preservado!`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Tentar novamente', 'tentar_novamente')],
          [Markup.button.callback('🏠 Menu inicial', 'voltar_menu')],
          [Markup.button.callback('❓ Suporte', 'suporte')]
        ])
      }
    );
    
    // Limpar estado mas manter no menu
    customerState.delete(stateKey);
  }
}

/**
 * Cliente aceita tentar com app irmão (IBO Player ↔ IBO Pro)
 */
async function handleTentarAppIrmao(ctx, botData) {
  await ctx.answerCbQuery('Tentando...');

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state || !state.appIrmao) {
    await ctx.reply('❌ Erro: dados não encontrados. Tente novamente.');
    customerState.delete(stateKey);
    return;
  }

  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  
  // Buscar produto do app irmão com mesmo tier
  const produtoOriginal = db.produtos.buscarPorId(state.produtoId);
  
  // Buscar produto equivalente do app irmão
  const produtosUsuario = db.produtos.listarAtivosPorUsuario(usuario.id);
  const produtoIrmao = produtosUsuario.find(p => 
    p.modulo === state.appIrmao && 
    p.tier === produtoOriginal.tier
  );

  if (!produtoIrmao) {
    // Revendedor não tem produto configurado para o app irmão
    await ctx.editMessageText(
      `❌ <b>Não foi possível tentar como ${state.appIrmaoNome}</b>\n\n` +
      `O revendedor não tem este produto configurado.\n\n` +
      `Entre em contato com o suporte.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Tentar outro app', 'tentar_novamente')],
          [Markup.button.callback('❓ Suporte', 'suporte')]
        ])
      }
    );
    customerState.delete(stateKey);
    return;
  }

  await ctx.editMessageText(
    `🔄 <b>Tentando como ${state.appIrmaoNome}...</b>\n\n` +
    `MAC: <code>${state.macAddress}</code>`,
    { parse_mode: 'HTML' }
  );

  // Criar novo pedido com o app irmão
  const novoPedido = db.pedidos.criar(
    botData.id,
    produtoIrmao.id,
    ctx.from.id.toString(),
    ctx.from.first_name,
    ctx.from.username,
    state.macAddress,
    produtoOriginal.preco // Usar preço do produto original
  );
  
  db.pedidos.marcarPago(novoPedido.id, 'FALLBACK');

  // Marcar que já testou irmão para não entrar em loop
  customerState.set(stateKey, {
    ...state,
    jaTestouIrmao: true,
    pedidoIdIrmao: novoPedido.id
  });

  // Processar ativação com app irmão
  const resultado = await activationService.processarAtivacao(novoPedido.id);

  if (resultado.success) {
    // SUCESSO com app irmão!
    const saldoRestante = db.saldos.descontar(botData.id, ctx.from.id.toString(), produtoOriginal.preco);
    
    console.log(`[Fallback] ✅ Cliente ${ctx.from.id} ativou com ${state.appIrmaoNome} (fallback de ${state.appOriginalNome})`);

    let mensagemSucesso = resultado.message;
    
    // Adicionar nota sobre o fallback
    mensagemSucesso += `\n\n💡 <i>Nota: Originalmente tentou ${state.appOriginalNome}, mas ativou como ${state.appIrmaoNome}.</i>`;
    
    if (saldoRestante > 0) {
      mensagemSucesso += `\n\n💰 <b>Saldo restante:</b> R$${saldoRestante.toFixed(2)}`;
    }

    await ctx.reply(mensagemSucesso, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu inicial', 'voltar_menu')]])
    });
    
    customerState.delete(stateKey);
  } else {
    // FALHOU nos dois apps
    const saldoMantido = db.saldos.buscar(botData.id, ctx.from.id.toString());
    
    console.log(`[Fallback] ❌ Cliente ${ctx.from.id} falhou tanto em ${state.appOriginalNome} quanto em ${state.appIrmaoNome}`);

    await ctx.reply(
      `❌ <b>Falha nos dois aplicativos</b>\n\n` +
      `<b>${state.appOriginalNome}:</b> ${state.erroOriginal}\n` +
      `<b>${state.appIrmaoNome}:</b> ${resultado.error}\n\n` +
      `💰 <b>Seu saldo:</b> R$${saldoMantido.toFixed(2)} (preservado)\n\n` +
      `Verifique se o MAC está correto e tente novamente.`,
      { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Tentar novamente', 'tentar_novamente')],
          [Markup.button.callback('🏠 Menu inicial', 'voltar_menu')],
          [Markup.button.callback('❓ Suporte', 'suporte')]
        ])
      }
    );
    
    customerState.delete(stateKey);
  }
}

/**
 * Cliente rejeita tentar com app irmão
 */
async function handleRejeitarAppIrmao(ctx, botData) {
  await ctx.answerCbQuery();

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  const saldoMantido = db.saldos.buscar(botData.id, ctx.from.id.toString());

  await ctx.editMessageText(
    `❌ <b>Erro na ativação</b>\n\n` +
    `<b>Motivo:</b> ${state?.erroOriginal || 'Erro desconhecido'}\n\n` +
    `💰 <b>Seu saldo:</b> R$${saldoMantido.toFixed(2)} (preservado)\n\n` +
    `Você pode tentar novamente com outro produto ou corrigir o MAC.`,
    { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Tentar novamente', 'tentar_novamente')],
        [Markup.button.callback('🏠 Menu inicial', 'voltar_menu')],
        [Markup.button.callback('❓ Suporte', 'suporte')]
      ])
    }
  );
  
  customerState.delete(stateKey);
}

/**
 * Tentar novamente após falha
 */
async function handleTentarNovamente(ctx, botData) {
  await handleStart(ctx, botData, true);
}

/**
 * Inicia verificação automática de pagamento
 */
function startPaymentCheck(ctx, botData, pedidoId) {
  let attempts = 0;
  const maxAttempts = 360; // 30 minutos (5s * 360 = 1800s = 30min)
  
  const interval = setInterval(async () => {
    attempts++;
    
    const stateKey = `${botData.id}_${ctx.from.id}`;
    const state = customerState.get(stateKey);
    
    // Se não tem mais estado ou já passou do pagamento, para
    if (!state || state.step !== 'aguardando_pagamento') {
      clearInterval(interval);
      return;
    }

    // Se pagamento já foi confirmado, para
    if (state.pagamentoConfirmado) {
      clearInterval(interval);
      return;
    }

    // TIMEOUT: 30 minutos sem pagamento
    if (attempts > maxAttempts) {
      clearInterval(interval);
      
      console.log(`[Pagamento] Timeout de 30min para cliente ${ctx.from.id}, cancelando pagamento`);
      
      // Deletar mensagens de pagamento (QR code e copia/cola)
      await deletarMensagensPagamento(ctx, state.mensagensPagamento);
      
      // Marcar pedido como expirado
      const pedido = db.pedidos.buscarPorId(pedidoId);
      if (pedido && pedido.status === 'pendente') {
        db.pedidos.marcarErro(pedidoId, 'Pagamento expirado (30 min)');
      }
      
      // Limpar estado
      customerState.delete(stateKey);
      
      // Notificar usuário e voltar ao menu
      try {
        await ctx.reply(
          `⏰ <b>Pagamento expirado!</b>\n\n` +
          `O tempo de 30 minutos para pagamento foi excedido.\n\n` +
          `Se ainda deseja ativar, inicie uma nova compra.`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Principal', 'voltar_menu')]])
          }
        );
      } catch (e) {
        console.error('[Pagamento] Erro ao notificar timeout:', e.message);
      }
      
      return;
    }

    const pedido = db.pedidos.buscarPorId(pedidoId);
    if (!pedido || pedido.status !== 'pendente') {
      clearInterval(interval);
      return;
    }

    try {
      const usuario = db.usuarios.buscarPorId(botData.usuario_id);
      const credMP = db.credenciais.buscar(usuario.id, 'mercadopago');
      
      if (!credMP) {
        clearInterval(interval);
        return;
      }

      const paymentService = createPaymentService(credMP.dados.accessToken);
      const status = await paymentService.consultarPagamento(pedido.pagamento_id);

      if (status.success && status.pago) {
        clearInterval(interval);
        await confirmarPagamento(ctx, botData, state);
      }
    } catch (error) {
      console.error('[PaymentCheck] Erro:', error.message);
    }
  }, 5000); // Verifica a cada 5 segundos
}

/**
 * Deleta mensagens de pagamento (QR code e copia/cola)
 */
async function deletarMensagensPagamento(ctx, mensagensPagamento) {
  if (!mensagensPagamento || mensagensPagamento.length === 0) return;
  
  for (const msgId of mensagensPagamento) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, msgId);
    } catch (e) {
      // Mensagem pode já ter sido deletada ou não existir mais
      console.log(`[Pagamento] Não foi possível deletar mensagem ${msgId}:`, e.message);
    }
  }
}

/**
 * Suporte - redireciona para WhatsApp
 */
async function handleSuporte(ctx, botData) {
  await ctx.answerCbQuery();

  const usuario = db.usuarios.buscarPorId(botData.usuario_id);
  
  if (!usuario || !usuario.whatsapp) {
    await ctx.reply('❓ Entre em contato com o administrador.');
    return;
  }

  const whatsappLink = `https://wa.me/55${usuario.whatsapp}`;

  await ctx.reply(
    `📞 <b>Suporte</b>\n\n` +
    `Clique no botão abaixo para falar conosco no WhatsApp:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('💬 Abrir WhatsApp', whatsappLink)],
        [Markup.button.callback('🔙 Voltar', 'voltar_menu')]
      ])
    }
  );
}

/**
 * Cancelar operação
 */
async function handleCancelar(ctx, botData) {
  await ctx.answerCbQuery();

  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);
  
  // Deletar mensagens de pagamento se existirem
  if (state?.mensagensPagamento) {
    await deletarMensagensPagamento(ctx, state.mensagensPagamento);
  }
  
  // Marcar pedido como cancelado se existir
  if (state?.pedidoId) {
    const pedido = db.pedidos.buscarPorId(state.pedidoId);
    if (pedido && pedido.status === 'pendente') {
      db.pedidos.marcarErro(state.pedidoId, 'Cancelado pelo cliente');
    }
  }
  
  customerState.delete(stateKey);

  await handleStart(ctx, botData, true);
}

// ==================== HISTÓRICO DE ATIVAÇÕES ====================

/**
 * Formata data para exibição
 */
function formatarData(dataStr) {
  if (!dataStr) return '-';
  const data = new Date(dataStr);
  return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Extrai validade da resposta da API
 */
function extrairValidade(respostaApi, tier) {
  try {
    if (!respostaApi) {
      // Sem resposta - usar validade simulada
      if (tier === 'LIFETIME') return 'VITALÍCIO';
      const data = new Date();
      data.setDate(data.getDate() + 365);
      return data.toLocaleDateString('pt-BR');
    }

    const resposta = typeof respostaApi === 'string' ? JSON.parse(respostaApi) : respostaApi;
    
    // IboSol - tem expire_date dentro de activated_devices
    if (resposta.activated_devices?.[0]?.expire_date) {
      const expireDate = resposta.activated_devices[0].expire_date;
      // Se ano > 2090, considerar vitalício
      if (expireDate.includes('209') || expireDate.includes('210')) {
        return 'VITALÍCIO';
      }
      return new Date(expireDate).toLocaleDateString('pt-BR');
    }
    
    // IBO Pro - tem expire_date direto
    if (resposta.expire_date) {
      return new Date(resposta.expire_date).toLocaleDateString('pt-BR');
    }

    // Fallback - usar tier
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
 * Mostra últimas ativações do cliente
 */
async function handleMinhasAtivacoes(ctx, botData) {
  await ctx.answerCbQuery();

  const clienteId = ctx.from.id.toString();
  const ativacoes = db.ativacoes.listarPorCliente(botData.id, clienteId, 3);
  const total = db.ativacoes.contarPorCliente(botData.id, clienteId);

  if (ativacoes.length === 0) {
    await ctx.editMessageText(
      `📜 <b>Minhas Ativações</b>\n\n` +
      `Você ainda não realizou nenhuma ativação.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Voltar', 'voltar_menu')]
        ])
      }
    );
    return;
  }

  let mensagem = `📜 <b>Minhas Ativações</b>\n\n`;
  mensagem += `Total: ${total} ativação(ões)\n\n`;

  ativacoes.forEach((a, i) => {
    const validade = extrairValidade(a.resposta_api, a.tier);
    mensagem += `<b>${i + 1}. ${a.produto_nome}</b>\n`;
    
    // Para Clouddy, mostrar email ao invés de MAC
    if (a.mac_address === 'CLOUDDY_EMAIL_AUTH' || a.mac_address?.includes('@')) {
      mensagem += `   📧 Email: <code>${a.mac_address}</code>\n`;
    } else {
      mensagem += `   📍 MAC: <code>${a.mac_address}</code>\n`;
    }
    
    mensagem += `   📅 Data: ${formatarData(a.criado_em)}\n`;
    mensagem += `   ⏰ Validade: ${validade}\n\n`;
  });

  if (total > 3) {
    mensagem += `<i>Mostrando últimas 3 de ${total} ativações.</i>\n`;
    mensagem += `<i>Use a busca por MAC ou baixe o histórico completo.</i>`;
  }

  await ctx.editMessageText(mensagem, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Buscar por MAC', 'buscar_mac_cliente')],
      [Markup.button.callback('📥 Baixar Histórico', 'baixar_historico_cliente')],
      [Markup.button.callback('🔙 Voltar', 'voltar_menu')]
    ])
  });
}

/**
 * Solicita MAC para busca
 */
async function handleBuscarMacCliente(ctx, botData) {
  await ctx.answerCbQuery();

  const stateKey = `${botData.id}_${ctx.from.id}`;
  customerState.set(stateKey, { step: 'buscar_mac_historico' });

  await ctx.editMessageText(
    `🔍 <b>Buscar Ativação</b>\n\n` +
    `Digite o <b>MAC Address completo</b> que deseja buscar:\n\n` +
    `Exemplo: <code>00:1A:2B:3C:4D:5E</code>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancelar', 'minhas_ativacoes')]
      ])
    }
  );
}

/**
 * Gera e envia arquivo TXT com histórico
 */
async function handleBaixarHistoricoCliente(ctx, botData) {
  await ctx.answerCbQuery();
  
  await ctx.reply('⏳ Gerando arquivo...');

  const clienteId = ctx.from.id.toString();
  const ativacoes = db.ativacoes.listarTodasCliente(botData.id, clienteId);

  if (ativacoes.length === 0) {
    await ctx.reply('❌ Nenhuma ativação encontrada.');
    return;
  }

  // Gerar conteúdo do TXT
  let conteudo = '═══════════════════════════════════════════════\n';
  conteudo += '         HISTÓRICO DE ATIVAÇÕES\n';
  conteudo += `         Cliente: ${ctx.from.first_name}\n`;
  conteudo += '═══════════════════════════════════════════════\n\n';

  ativacoes.forEach((a, i) => {
    const validade = extrairValidade(a.resposta_api, a.tier);
    conteudo += `#${i + 1} - ${a.produto_nome}\n`;
    
    // Para Clouddy, mostrar email ao invés de MAC
    if (a.mac_address === 'CLOUDDY_EMAIL_AUTH' || a.mac_address?.includes('@')) {
      conteudo += `    Email: ${a.mac_address}\n`;
    } else {
      conteudo += `    MAC: ${a.mac_address}\n`;
    }
    
    conteudo += `    Data: ${formatarData(a.criado_em)}\n`;
    conteudo += `    Validade: ${validade}\n`;
    conteudo += `    Código: ${a.pedido_codigo}\n`;
    conteudo += '───────────────────────────────────────────────\n\n';
  });

  conteudo += `Total: ${ativacoes.length} ativação(ões)\n`;
  conteudo += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;

  // Enviar como arquivo
  const buffer = Buffer.from(conteudo, 'utf-8');
  await ctx.replyWithDocument(
    { source: buffer, filename: `historico_ativacoes_${clienteId}.txt` },
    { caption: `📄 Histórico completo: ${ativacoes.length} ativação(ões)` }
  );
}

module.exports = {
  setupBot,
  customerState
};
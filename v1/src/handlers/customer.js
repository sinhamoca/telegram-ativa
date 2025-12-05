// src/handlers/customer.js - Menu e handlers do cliente final (bot do revendedor)

const { Markup } = require('telegraf');
const db = require('../database');
const { createPaymentService } = require('../services/paymentService');
const activationService = require('../services/activationService');

// Estado temporário dos clientes
const customerState = new Map();

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
  
  // Callbacks de histórico
  bot.action('minhas_ativacoes', (ctx) => handleMinhasAtivacoes(ctx, botData));
  bot.action('buscar_mac_cliente', (ctx) => handleBuscarMacCliente(ctx, botData));
  bot.action('baixar_historico_cliente', (ctx) => handleBaixarHistoricoCliente(ctx, botData));

  // Mensagens de texto
  bot.on('text', (ctx) => handleText(ctx, botData));

  // Erros
  bot.catch((err, ctx) => {
    console.error(`[Bot ${botData.bot_username}] Erro:`, err.message);
  });
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

  // Buscar produtos ativos
  const produtos = db.produtos.listarAtivosPorUsuario(usuario.id);

  if (produtos.length === 0) {
    await ctx.reply('⚠️ Nenhum produto disponível no momento.');
    return;
  }

  // Buscar saldo do cliente
  const saldo = db.saldos.buscar(botData.id, ctx.from.id.toString());

  // Montar menu de produtos
  const buttons = produtos.map(p => 
    [Markup.button.callback(`📱 ${p.nome} - R$${p.preco.toFixed(2)}`, `produto_${p.id}`)]
  );
  
  buttons.push([Markup.button.callback('📜 Minhas Ativações', 'minhas_ativacoes')]);
  buttons.push([Markup.button.callback('❓ Suporte', 'suporte')]);

  let mensagem = `👋 <b>Olá, ${ctx.from.first_name}!</b>\n\n`;
  mensagem += `Bem-vindo à nossa loja de ativações.\n\n`;
  
  // Mostrar saldo se tiver
  if (saldo > 0) {
    mensagem += `💰 <b>Seu saldo:</b> R$${saldo.toFixed(2)}\n\n`;
  }
  
  mensagem += `📺 <b>Escolha o aplicativo que deseja ativar:</b>`;

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

  // Salvar estado
  const stateKey = `${botData.id}_${ctx.from.id}`;
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
    mensagem += `<i>Formato: AA:BB:CC:DD:EE:FF</i>`;

    await ctx.editMessageText(mensagem, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
    });
    
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
 * Processa texto enviado pelo cliente (MAC)
 */
async function handleText(ctx, botData) {
  const stateKey = `${botData.id}_${ctx.from.id}`;
  const state = customerState.get(stateKey);

  if (!state) return;

  const text = ctx.message.text;

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
        `Exemplo: AA:BB:CC:DD:EE:FF`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
      );
      return;
    }

    const macAddress = validacao.macFormatado;

    // Atualizar estado com MAC
    customerState.set(stateKey, {
      ...state,
      macAddress: macAddress
    });

    // Se já pagou (ou usou saldo), processar ativação
    await processarAtivacao(ctx, botData);
  }
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
 * Confirma pagamento e pede MAC
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

  // Atualizar estado para aguardar MAC
  customerState.set(stateKey, {
    ...state,
    step: 'aguardando_mac',
    saldoAtual: novoSaldo,
    pagamentoConfirmado: true,
    mensagensPagamento: [] // Limpar referências
  });

  const produto = db.produtos.buscarPorId(state.produtoId);

  await ctx.reply(
    `✅ <b>Pagamento confirmado!</b>\n\n` +
    `💰 Seu saldo: R$${novoSaldo.toFixed(2)}\n\n` +
    `📱 <b>Produto:</b> ${produto?.nome}\n\n` +
    `📝 <b>Agora envie o MAC Address do seu aparelho:</b>\n\n` +
    `<i>Formato: AA:BB:CC:DD:EE:FF</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'voltar_menu')]])
    }
  );
}

/**
 * Processa ativação após receber MAC
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
  
  if (!pedidoId) {
    // Criar pedido para quando usou só saldo
    const pedido = db.pedidos.criar(
      botData.id,
      produto.id,
      ctx.from.id.toString(),
      ctx.from.first_name,
      ctx.from.username,
      state.macAddress,
      produto.preco
    );
    pedidoId = pedido.id;
    db.pedidos.marcarPago(pedidoId, 'SALDO');
  } else {
    // Atualizar MAC no pedido existente
    db.pedidos.atualizar(pedidoId, { mac_address: state.macAddress });
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
    // FALHA: manter saldo, permitir nova tentativa
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
    mensagem += `   📍 MAC: <code>${a.mac_address}</code>\n`;
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
    conteudo += `    MAC: ${a.mac_address}\n`;
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
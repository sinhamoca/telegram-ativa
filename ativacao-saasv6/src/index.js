// src/index.js - Arquivo principal do sistema

const { Telegraf } = require('telegraf');
const path = require('path');
const fs = require('fs');

// Garantir diretório de dados
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Importações
const config = require('./config');
const db = require('./database');
const botManager = require('./services/botManager');
const notificationService = require('./services/notificationService');
const cronJobs = require('./cron/jobs');  // Importa todo o módulo


// Handlers
const adminHandlers = require('./handlers/admin');
const resellerHandlers = require('./handlers/reseller');
const customerHandler = require('./handlers/customer');
const adminImagens = require('./handlers/adminImagens');
const resellerJogos = require('./handlers/resellerJogos');
const resellerNotificacoes = require('./handlers/resellerNotificacoes');


// Inicialização
async function start() {
  console.log('🚀 Iniciando Sistema de Ativação SaaS...\n');

  // 1. Inicializar banco de dados
  await db.initDb();
  console.log('✅ Banco de dados inicializado');

  // 2. Criar bot master
  const masterBot = new Telegraf(config.MASTER_BOT_TOKEN);

  // 3. Configurar serviço de notificações
  notificationService.setMasterBot(masterBot);

  // 3.1. Configurar cron jobs com bot master (para saldo diário)
  cronJobs.setMasterBot(masterBot);

  // 4. Configurar customer handler no bot manager
  botManager.setCustomerHandler(customerHandler);

  // 5. Middleware de log
  masterBot.use(async (ctx, next) => {
    const userId = ctx.from?.id?.toString() || 'unknown';
    const updateType = ctx.updateType;
    console.log(`[Master] ${updateType} de ${userId}`);
    return next();
  });

  // 6. Comando /start (com suporte a deep link de afiliado)
  masterBot.start(async (ctx) => {
    // Detectar código de afiliado no deep link: /start ref_CODIGO
    const payload = ctx.startPayload;
    let codigoAfiliado = null;
    
    if (payload && payload.startsWith('ref_')) {
      codigoAfiliado = payload.substring(4).toUpperCase();
      console.log(`[Afiliado] Deep link detectado: ${codigoAfiliado}`);
    }
    
    if (config.isAdmin(ctx.from.id)) {
      // Admin vê menu admin
      await adminHandlers.showAdminMenu(ctx);
    } else {
      // Usuário normal vê menu de revendedor
      await resellerHandlers.showResellerMenu(ctx, null, codigoAfiliado);
    }
  });

  // 7. Comando /admin (atalho para admins)
  masterBot.command('admin', async (ctx) => {
    if (!config.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ Acesso negado.');
    }
    await adminHandlers.showAdminMenu(ctx);
  });

  // ==================== CALLBACKS ADMIN ====================
  
  masterBot.action('admin_menu', adminHandlers.handleBackToMenu);
  masterBot.action('admin_usuarios', adminHandlers.handleAdminUsuarios);
  masterBot.action('admin_stats', adminHandlers.handleAdminStats);
  masterBot.action('admin_buscar', adminHandlers.handleAdminBuscar);
  masterBot.action('admin_broadcast', adminHandlers.handleBroadcast);
  masterBot.action('admin_config', adminHandlers.handleAdminConfig);
  masterBot.action('admin_config_mp', adminHandlers.handleAdminConfigMP);
  
  masterBot.action('admin_listar_todos', (ctx) => adminHandlers.handleListarUsuarios(ctx, 'todos'));
  masterBot.action('admin_listar_ativos', (ctx) => adminHandlers.handleListarUsuarios(ctx, 'ativos'));
  masterBot.action('admin_listar_vencidos', (ctx) => adminHandlers.handleListarUsuarios(ctx, 'vencidos'));
  masterBot.action('admin_listar_trial', (ctx) => adminHandlers.handleListarUsuarios(ctx, 'trial'));

  masterBot.action(/admin_ver_(\d+)/, (ctx) => adminHandlers.handleVerUsuario(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_plano_(\d+)/, (ctx) => adminHandlers.handleAlterarPlano(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_setplano_(\d+)_(\w+)/, (ctx) => adminHandlers.handleSetPlano(ctx, parseInt(ctx.match[1]), ctx.match[2]));
  masterBot.action(/admin_add_ativ_(\d+)/, (ctx) => adminHandlers.handleAdicionarAtivacoes(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_estender_(\d+)/, (ctx) => adminHandlers.handleEstenderValidade(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_suspender_(\d+)/, (ctx) => adminHandlers.handleSuspender(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_reativar_(\d+)/, (ctx) => adminHandlers.handleReativar(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_excluir_(\d+)/, (ctx) => adminHandlers.handleExcluir(ctx, parseInt(ctx.match[1])));
  masterBot.action(/admin_confirma_excluir_(\d+)/, (ctx) => adminHandlers.handleConfirmaExcluir(ctx, parseInt(ctx.match[1])));

  // ==================== CALLBACKS ADMIN - IMAGENS DOS MÓDULOS ====================
  
  // Menu principal de imagens
  masterBot.action('admin_imagens', async (ctx) => {
    await adminImagens.handleImagensModulos(ctx);
  });

  // Ver/configurar imagem de um módulo específico (cuidado com a ordem dos regex!)
  masterBot.action(/admin_img_trocar_(.+)/, async (ctx) => {
    const moduloId = ctx.match[1];
    await adminImagens.handleTrocarImagem(ctx, moduloId);
  });

  masterBot.action(/admin_img_remover_(.+)/, async (ctx) => {
    const moduloId = ctx.match[1];
    await adminImagens.handleConfirmarRemoverImagem(ctx, moduloId);
  });

  masterBot.action(/admin_img_confirmar_rem_(.+)/, async (ctx) => {
    const moduloId = ctx.match[1];
    await adminImagens.handleExecutarRemocao(ctx, moduloId);
  });

  // Este deve vir por último (regex mais genérico)
  masterBot.action(/admin_img_(.+)/, async (ctx) => {
    const moduloId = ctx.match[1];
    // Ignorar se já foi tratado pelos handlers acima
    if (moduloId.startsWith('trocar_') || moduloId.startsWith('remover_') || moduloId.startsWith('confirmar_rem_')) {
      return;
    }
    await adminImagens.handleImagemModulo(ctx, moduloId);
  });

  // ==================== CALLBACKS REVENDEDOR ====================
  
  masterBot.action('reseller_menu', resellerHandlers.handleBackToMenu);
  masterBot.action('reseller_criar_conta', resellerHandlers.handleCriarConta);
  masterBot.action('reseller_bot', resellerHandlers.handleMeuBot);
  masterBot.action('reseller_vincular_bot', resellerHandlers.handleVincularBot);
  masterBot.action('reseller_iniciar_bot', resellerHandlers.handleIniciarBot);
  masterBot.action('reseller_parar_bot', resellerHandlers.handlePararBot);
  masterBot.action('reseller_reiniciar_bot', resellerHandlers.handleReiniciarBot);
  masterBot.action('reseller_desvincular_bot', resellerHandlers.handleDesvincularBot);
  masterBot.action('reseller_confirma_desvincular', resellerHandlers.handleConfirmaDesvincular);
  
  // Produtos - com paginação
  masterBot.action('reseller_produtos', resellerHandlers.handleProdutos);
  masterBot.action(/reseller_produtos_page_(\d+)/, resellerHandlers.handleProdutosPage);
  masterBot.action(/reseller_add_produto_(\d+)/, resellerHandlers.handleAddProdutoPage);
  masterBot.action('noop', (ctx) => ctx.answerCbQuery()); // Botão de página atual (não faz nada)
  
  // Cadastro Rápido de Produtos
  masterBot.action('reseller_cadastro_rapido', resellerHandlers.handleCadastroRapido);
  masterBot.action('cadastro_rapido_proximo', (ctx) => resellerHandlers.mostrarProximoProduto(ctx, true));
  masterBot.action('cadastro_rapido_pular', resellerHandlers.handlePularProduto);
  masterBot.action('cadastro_rapido_cancelar', resellerHandlers.handleCancelarCadastroRapido);
  masterBot.action('reseller_credenciais', resellerHandlers.handleCredenciais);
  masterBot.action('reseller_cred_ibo', resellerHandlers.handleCredIboPro);
  masterBot.action('reseller_cred_ibosol', resellerHandlers.handleCredIboSol);
  masterBot.action('reseller_cred_vuplayer', resellerHandlers.handleCredVuPlayerPro);
  masterBot.action('reseller_cred_enzo', resellerHandlers.handleCredEnzoPlayer);
  masterBot.action('reseller_cred_rivolut', resellerHandlers.handleCredRivolut);
  masterBot.action('reseller_cred_capplayer', resellerHandlers.handleCredCapPlayer);
  masterBot.action('reseller_cred_dreamtv', resellerHandlers.handleCredDreamTV);
  masterBot.action('reseller_cred_lazerplay', resellerHandlers.handleCredLazerPlay);
  masterBot.action('reseller_cred_lumina', resellerHandlers.handleCredLumina);
  masterBot.action('reseller_cred_assistplus', resellerHandlers.handleCredAssistPlus);
  masterBot.action('reseller_duplecast_codes', resellerHandlers.handleDuplecastCodes);
  masterBot.action('reseller_duplecast_add', resellerHandlers.handleDuplecastAdd);
  masterBot.action('reseller_duplecast_add_batch', resellerHandlers.handleDuplecastAddBatch);
  masterBot.action('reseller_duplecast_list_available', resellerHandlers.handleDuplecastListAvailable);
  masterBot.action('reseller_duplecast_list_used', resellerHandlers.handleDuplecastListUsed);
  masterBot.action('reseller_duplecast_delete', resellerHandlers.handleDuplecastDelete);
  masterBot.action('reseller_smartone_codes', resellerHandlers.handleSmartOneCodes);
  masterBot.action('reseller_smartone_add', resellerHandlers.handleSmartOneAdd);
  masterBot.action('reseller_smartone_add_batch', resellerHandlers.handleSmartOneAddBatch);
  masterBot.action('reseller_smartone_list_available', resellerHandlers.handleSmartOneListAvailable);
  masterBot.action('reseller_smartone_list_used', resellerHandlers.handleSmartOneListUsed);
  masterBot.action('reseller_smartone_delete', resellerHandlers.handleSmartOneDelete);
  masterBot.action(/reseller_smartone_tier_(.+)/, (ctx) => {
    const tier = ctx.match[1]; // YEAR ou LIFETIME
    return resellerHandlers.handleSmartOneSelectTier(ctx, tier);
  });
  masterBot.action(/reseller_duplecast_tier_(.+)/, (ctx) => {
    const tier = ctx.match[1]; // YEAR ou LIFETIME
    return resellerHandlers.handleDuplecastSelectTier(ctx, tier);
  });
  masterBot.action('reseller_clouddy_card', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClouddyCard(ctx);
  });

  masterBot.action('reseller_clouddy_add', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClouddyAdd(ctx);
  });

  masterBot.action('reseller_clouddy_update', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClouddyUpdate(ctx);
  });

  masterBot.action('reseller_clouddy_remove', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClouddyRemove(ctx);
  });

  masterBot.action('reseller_clouddy_confirm_remove', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClouddyConfirmRemove(ctx);
  });
  masterBot.action('reseller_cred_vivoplayer', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleCredVivoPlayer(ctx);
  });
  masterBot.action('reseller_cred_quickplayer', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleCredQuickPlayer(ctx);
  });
  masterBot.action('reseller_cred_multiplayer', resellerHandlers.handleCredMultiPlayer);
  masterBot.action('reseller_cred_mp', resellerHandlers.handleCredMP);
  masterBot.action('reseller_plano', resellerHandlers.handleMeuPlano);
  masterBot.action('reseller_relatorios', resellerHandlers.handleRelatorios);
  masterBot.action('reseller_saldo_apps', resellerHandlers.handleSaldoApps);
  masterBot.action('reseller_saldos_clientes', resellerHandlers.handleSaldosClientes);
  masterBot.action('reseller_buscar_saldo', resellerHandlers.handleBuscarSaldo);

  // ==================== JOGOS DO DIA ====================
  masterBot.action('reseller_jogos', resellerJogos.handleMenuJogos);
  masterBot.action('jogos_config_desativado', (ctx) => resellerJogos.handleConfigJogos(ctx, 'desativado'));
  masterBot.action('jogos_config_apenas_eu', (ctx) => resellerJogos.handleConfigJogos(ctx, 'apenas_eu'));
  masterBot.action('jogos_config_eu_e_clientes', (ctx) => resellerJogos.handleConfigJogos(ctx, 'eu_e_clientes'));

  // ==================== NOTIFICAÇÕES DE ATIVAÇÕES ====================
  masterBot.action('reseller_notificacoes', resellerNotificacoes.handleMenuNotificacoes);
  masterBot.action('notif_config_desativado', (ctx) => resellerNotificacoes.handleConfigNotificacoes(ctx, 'desativado'));
  masterBot.action('notif_config_apenas_sucesso', (ctx) => resellerNotificacoes.handleConfigNotificacoes(ctx, 'apenas_sucesso'));
  masterBot.action('notif_config_tudo', (ctx) => resellerNotificacoes.handleConfigNotificacoes(ctx, 'tudo'));


  // Menu principal de Clientes
  masterBot.action('reseller_clientes', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClientes(ctx);
  });

  // Listar todos os clientes
  masterBot.action('reseller_clientes_todos', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClientesTodos(ctx);
  });

  // Clientes com ativações
  masterBot.action('reseller_clientes_ativados', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClientesComAtivacoes(ctx);
  });

  // Clientes com saldo
  masterBot.action('reseller_clientes_saldo', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClientesComSaldo(ctx);
  });

  // Clientes que nunca ativaram
  masterBot.action('reseller_clientes_inativos', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleClientesNuncaAtivaram(ctx);
  });

  // Menu de busca de cliente
  masterBot.action('reseller_buscar_cliente_menu', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleBuscarClienteMenu(ctx);
  });

  // Ver detalhes de cliente específico (com ID dinâmico)
  masterBot.action(/reseller_ver_cliente_(.+)/, async (ctx) => {
    const reseller = require('./handlers/reseller');
    const clienteId = ctx.match[1];
    await reseller.handleVerCliente(ctx, clienteId);
  });

  // Exportar lista de clientes
  masterBot.action('reseller_exportar_clientes', async (ctx) => {
    const reseller = require('./handlers/reseller');
    await reseller.handleExportarClientes(ctx);
  });
  
  // Callbacks de histórico de ativações
  masterBot.action('reseller_historico', resellerHandlers.handleHistoricoAtivacoes);
  masterBot.action('reseller_buscar_mac', resellerHandlers.handleBuscarMacRevendedor);
  masterBot.action('reseller_buscar_cliente', resellerHandlers.handleBuscarClienteRevendedor);
  masterBot.action('reseller_baixar_historico', resellerHandlers.handleBaixarHistoricoRevendedor);
  
  // Callback de afiliados
  masterBot.action('reseller_afiliados', resellerHandlers.handleAfiliados);
  
  // Callbacks dinâmicos para saldo de clientes
  masterBot.action(/reseller_zerar_saldo_(\d+)/, (ctx) => 
    resellerHandlers.handleZerarSaldo(ctx, ctx.match[1])
  );
  masterBot.action(/reseller_confirma_zerar_(\d+)/, (ctx) => 
    resellerHandlers.handleConfirmaZerarSaldo(ctx, ctx.match[1])
  );
  masterBot.action(/reseller_ajustar_saldo_(\d+)/, (ctx) => 
    resellerHandlers.handleAjustarSaldo(ctx, ctx.match[1])
  );

  masterBot.action(/reseller_select_produto_(\w+)_(\w+)/, (ctx) => 
    resellerHandlers.handleSelectProduto(ctx, ctx.match[1], ctx.match[2])
  );
  masterBot.action(/reseller_edit_produto_(\d+)/, (ctx) => 
    resellerHandlers.handleEditProduto(ctx, parseInt(ctx.match[1]))
  );
  masterBot.action(/reseller_preco_(\d+)/, (ctx) => 
    resellerHandlers.handleAlterarPreco(ctx, parseInt(ctx.match[1]))
  );
  masterBot.action(/reseller_desativar_(\d+)/, (ctx) => 
    resellerHandlers.handleDesativarProduto(ctx, parseInt(ctx.match[1]))
  );
  masterBot.action(/reseller_ativar_(\d+)/, (ctx) => 
    resellerHandlers.handleAtivarProduto(ctx, parseInt(ctx.match[1]))
  );
  masterBot.action(/reseller_excluir_produto_(\d+)/, (ctx) => 
    resellerHandlers.handleExcluirProduto(ctx, parseInt(ctx.match[1]))
  );
  masterBot.action(/reseller_confirma_excluir_(\d+)/, (ctx) => 
    resellerHandlers.handleConfirmaExcluirProduto(ctx, parseInt(ctx.match[1]))
  );

  // ==================== HANDLER DE FOTO (ADMIN) ====================
  
  masterBot.on('photo', async (ctx) => {
    // Verificar se é admin configurando imagem de módulo
    if (config.isAdmin(ctx.from.id)) {
      const handled = await adminImagens.handleAdminPhoto(ctx);
      if (handled) return;
    }
    
    // Se não foi tratado, ignora (ou pode adicionar outro handler aqui)
  });

  // ==================== HANDLER DE TEXTO ====================
  
  masterBot.on('text', async (ctx) => {
    // Primeiro tenta handler admin
    if (config.isAdmin(ctx.from.id)) {
      const handled = await adminHandlers.handleAdminText(ctx);
      if (handled) return;
    }

    // Depois tenta handler de revendedor
    const handled = await resellerHandlers.handleResellerText(ctx);
    if (handled) return;

    // Se não está em nenhum fluxo, mostra menu
    if (config.isAdmin(ctx.from.id)) {
      await adminHandlers.showAdminMenu(ctx);
    } else {
      await resellerHandlers.showResellerMenu(ctx);
    }
  });

  // ==================== TRATAMENTO DE ERROS ====================
  
  masterBot.catch((err, ctx) => {
    console.error('[Master] Erro completo:', err);
    console.error('[Master] Tipo:', typeof err);
    console.error('[Master] Message:', err?.message);
    console.error('[Master] Stack:', err?.stack);
    ctx.reply('❌ Ocorreu um erro. Tente novamente.').catch(() => {});
  });

  // ==================== GRACEFUL SHUTDOWN ====================
  
  const shutdown = async (signal) => {
    console.log(`\n${signal} recebido. Encerrando...`);
    
    await botManager.stopAllBots();
    masterBot.stop(signal);
    
    console.log('✅ Sistema encerrado com sucesso.');
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // ==================== INICIAR ====================

  // Carregar bots dos revendedores
  await botManager.loadSavedBots();

  // Configurar bot master para cron de saldo diário
  cronJobs.setMasterBot(masterBot);

  // Iniciar cron jobs
  cronJobs.initCronJobs();

  // Iniciar bot master
  await masterBot.launch();

  const botInfo = await masterBot.telegram.getMe();
  console.log(`\n✅ Bot Master iniciado: @${botInfo.username}`);
  console.log(`👑 Admins: ${config.ADMIN_IDS.join(', ')}`);
  console.log(`🤖 Bots ativos: ${botManager.getActiveBotIds().length}`);
  console.log('\n📋 Aguardando comandos...\n');
}

// Executar
start().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
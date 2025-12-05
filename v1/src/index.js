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
const { initCronJobs } = require('./cron/jobs');

// Handlers
const adminHandlers = require('./handlers/admin');
const resellerHandlers = require('./handlers/reseller');
const customerHandler = require('./handlers/customer');

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
  masterBot.action('reseller_produtos', resellerHandlers.handleProdutos);
  masterBot.action('reseller_add_produto', resellerHandlers.handleAddProduto);
  masterBot.action('reseller_credenciais', resellerHandlers.handleCredenciais);
  masterBot.action('reseller_cred_ibo', resellerHandlers.handleCredIboPro);
  masterBot.action('reseller_cred_ibosol', resellerHandlers.handleCredIboSol);
  masterBot.action('reseller_cred_vuplayer', resellerHandlers.handleCredVuPlayerPro);
  masterBot.action('reseller_cred_enzo', resellerHandlers.handleCredEnzoPlayer);
  masterBot.action('reseller_cred_dreamtv', resellerHandlers.handleCredDreamTV);
  masterBot.action('reseller_cred_multiplayer', resellerHandlers.handleCredMultiPlayer);
  masterBot.action('reseller_cred_mp', resellerHandlers.handleCredMP);
  masterBot.action('reseller_plano', resellerHandlers.handleMeuPlano);
  masterBot.action('reseller_relatorios', resellerHandlers.handleRelatorios);
  masterBot.action('reseller_saldo_apps', resellerHandlers.handleSaldoApps);
  masterBot.action('reseller_saldos_clientes', resellerHandlers.handleSaldosClientes);
  masterBot.action('reseller_buscar_saldo', resellerHandlers.handleBuscarSaldo);
  
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

  // Iniciar cron jobs
  initCronJobs();

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
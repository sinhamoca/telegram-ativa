// src/cron/jobs.js - Tarefas agendadas

const cron = require('node-cron');
const config = require('../config');
const db = require('../database');
const notificationService = require('../services/notificationService');
const botManager = require('../services/botManager');
const activationService = require('../services/activationService');
const { getJogosHoje, formatarMensagem, executarScrapingDiario } = require('../services/scraperFutebol');

// Variável para armazenar referência do bot master
let masterBotInstance = null;

/**
 * Define a instância do bot master para enviar mensagens
 */
function setMasterBot(bot) {
  masterBotInstance = bot;
  console.log('[Cron] Bot master configurado para envio de saldos');
}

/**
 * Retorna data atual no fuso horário de São Paulo (YYYY-MM-DD)
 */
function getDataBrasil() {
  const agora = new Date();
  const opcoes = { 
    timeZone: 'America/Sao_Paulo', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  };
  const partes = agora.toLocaleDateString('pt-BR', opcoes).split('/');
  return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

/**
 * Busca todos os usuários ativos (status = 'ativo', com plano válido)
 */
function buscarUsuariosAtivos() {
  const hoje = getDataBrasil();
  
  // Tenta usar função do db se existir
  if (db.usuarios.listarAtivos) {
    return db.usuarios.listarAtivos();
  }
  
  // Fallback: query direta
  if (db.query) {
    return db.query(`
      SELECT * FROM usuarios 
      WHERE status = 'ativo' 
      AND data_expiracao >= ?
      ORDER BY nome ASC
    `, [hoje]);
  }
  
  // Último fallback: listar todos e filtrar
  const todos = db.usuarios.listarTodos?.() || [];
  return todos.filter(u => u.status === 'ativo' && new Date(u.data_expiracao) >= new Date());
}

/**
 * Busca saldo de todos os apps de um revendedor
 */
async function buscarSaldosRevendedor(usuario) {
  const saldos = [];

  // IBO Pro
  const credIboPro = db.credenciais.buscar(usuario.id, 'ibo_pro');
  if (credIboPro) {
    try {
      const resultado = await activationService.getSaldo('ibo_pro', credIboPro.dados);
      if (resultado.success) {
        saldos.push({
          app: '🔵 IBO Pro',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // IboSol
  const credIboSol = db.credenciais.buscar(usuario.id, 'ibosol');
  if (credIboSol) {
    try {
      const resultado = await activationService.getSaldo('ibo_player', credIboSol.dados);
      if (resultado.success) {
        saldos.push({
          app: '🟢 IboSol',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // VU Player Pro
  const credVuPlayer = db.credenciais.buscar(usuario.id, 'vu_player_pro');
  if (credVuPlayer) {
    try {
      const resultado = await activationService.getSaldo('vu_player_pro', credVuPlayer.dados);
      if (resultado.success) {
        saldos.push({
          app: '🟣 VU Player',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // EnzoPlayer
  const credEnzo = db.credenciais.buscar(usuario.id, 'enzo_player');
  if (credEnzo) {
    try {
      const resultado = await activationService.getSaldo('enzo_player', credEnzo.dados);
      if (resultado.success) {
        saldos.push({
          app: '🟠 EnzoPlayer',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // DreamTV
  const credDreamTV = db.credenciais.buscar(usuario.id, 'dreamtv');
  if (credDreamTV) {
    try {
      const resultado = await activationService.getSaldo('dreamtv', credDreamTV.dados);
      if (resultado.success) {
        saldos.push({
          app: '📺 DreamTV',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Lumina
  const credLumina = db.credenciais.buscar(usuario.id, 'lumina');
  if (credLumina) {
    try {
      const resultado = await activationService.getSaldo('lumina', credLumina.dados);
      if (resultado.success) {
        saldos.push({
          app: '💡 Lumina',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Assist+
  const credAssistPlus = db.credenciais.buscar(usuario.id, 'assist_plus');
  if (credAssistPlus) {
    try {
      const resultado = await activationService.getSaldo('assist_plus', credAssistPlus.dados);
      if (resultado.success) {
        saldos.push({
          app: '🅰️ Assist+',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Duplecast (códigos)
  if (db.duplecastCodes?.contarDisponiveis) {
    const codigosDuplecast = db.duplecastCodes.contarDisponiveis(usuario.id);
    if (codigosDuplecast !== undefined && codigosDuplecast > 0) {
      saldos.push({
        app: '📡 Duplecast',
        creditos: `${codigosDuplecast} códigos`,
        status: codigosDuplecast > 0 ? '🟢' : '🔴'
      });
    }
  }

  // SmartOne (códigos)
  if (db.smartoneCodes?.contarDisponiveis) {
    const codigosSmartOne = db.smartoneCodes.contarDisponiveis(usuario.id);
    if (codigosSmartOne !== undefined && codigosSmartOne > 0) {
      saldos.push({
        app: '📱 SmartOne',
        creditos: `${codigosSmartOne} códigos`,
        status: codigosSmartOne > 0 ? '🟢' : '🔴'
      });
    }
  }

  // Multi Player
  const credMultiPlayer = db.credenciais.buscar(usuario.id, 'multi_player');
  if (credMultiPlayer) {
    try {
      const resultado = await activationService.getSaldo('multi_player', credMultiPlayer.dados);
      if (resultado.success) {
        saldos.push({
          app: '🎬 MultiPlayer',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Vivo Player
  const credVivoPlayer = db.credenciais.buscar(usuario.id, 'vivo_player');
  if (credVivoPlayer) {
    try {
      const resultado = await activationService.getSaldo('vivo_player', credVivoPlayer.dados);
      if (resultado.success) {
        saldos.push({
          app: '📲 Vivo Player',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Quick Player
  const credQuickPlayer = db.credenciais.buscar(usuario.id, 'quick_player');
  if (credQuickPlayer) {
    try {
      const quickPlayerModule = require('../modules/quick_player');
      const resultado = await quickPlayerModule.getCredits(credQuickPlayer.dados);
      if (resultado.success) {
        saldos.push({
          app: '⚡ Quick Player',
          creditos: resultado.credits,
          status: '🟢'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Rivolut
  const credRivolut = db.credenciais.buscar(usuario.id, 'rivolut');
  if (credRivolut) {
    try {
      const genericModule = require('../modules/generic_reseller');
      const resultado = await genericModule.getCredits('rivolutplayer.com', credRivolut.dados, { name: 'Rivolut Player' });
      if (resultado.success) {
        saldos.push({
          app: '🎯 Rivolut',
          creditos: resultado.credits,
          status: '🟢'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Lazer Play
  const credLazerPlay = db.credenciais.buscar(usuario.id, 'lazer_play');
  if (credLazerPlay) {
    try {
      const resultado = await activationService.getSaldo('lazer_play', credLazerPlay.dados);
      if (resultado.success) {
        saldos.push({
          app: '🎮 Lazer Play',
          creditos: resultado.credits,
          status: resultado.active ? '🟢' : '🔴'
        });
      }
    } catch (e) { /* ignora */ }
  }

  // Cap Player
  const credCapPlayer = db.credenciais.buscar(usuario.id, 'cap_player');
  if (credCapPlayer) {
    try {
      const genericModule = require('../modules/generic_reseller');
      const resultado = await genericModule.getCredits('capplayer.com', credCapPlayer.dados, { name: 'Cap Player' });
      if (resultado.success) {
        saldos.push({
          app: '🧢 Cap Player',
          creditos: resultado.credits,
          status: '🟢'
        });
      }
    } catch (e) { /* ignora */ }
  }

  return saldos;
}

/**
 * Envia relatório de saldo para um revendedor
 */
async function enviarSaldoRevendedor(usuario) {
  if (!masterBotInstance) {
    console.error('[CronSaldo] Bot master não configurado');
    return false;
  }

  try {
    const saldos = await buscarSaldosRevendedor(usuario);

    // Se não tem nenhuma credencial configurada, não envia
    if (saldos.length === 0) {
      console.log(`[CronSaldo] ${usuario.nome} não tem credenciais configuradas`);
      return false;
    }

    // Montar mensagem
    const dataHora = new Date().toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let mensagem = `☀️ <b>Bom dia, ${usuario.nome}!</b>\n\n`;
    mensagem += `📊 <b>Resumo de Saldos</b>\n`;
    mensagem += `📅 ${dataHora}\n\n`;

    for (const saldo of saldos) {
      mensagem += `${saldo.app}\n`;
      mensagem += `└ ${saldo.status} <b>${saldo.creditos}</b>\n\n`;
    }

    mensagem += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    mensagem += `<i>💡 Use /start para acessar o menu</i>`;

    // Enviar mensagem
    await masterBotInstance.telegram.sendMessage(usuario.telegram_id, mensagem, {
      parse_mode: 'HTML'
    });

    console.log(`[CronSaldo] Saldo enviado para ${usuario.nome} (${usuario.telegram_id})`);
    return true;

  } catch (error) {
    // Se o usuário bloqueou o bot, ignora silenciosamente
    if (error.message?.includes('bot was blocked') || error.message?.includes('user is deactivated')) {
      console.log(`[CronSaldo] ${usuario.nome} bloqueou o bot ou está inativo`);
      return false;
    }
    console.error(`[CronSaldo] Erro ao enviar saldo para ${usuario.nome}:`, error.message);
    return false;
  }
}

/**
 * Executa envio de saldo para todos os revendedores ativos
 */
async function executarEnvioSaldoDiario() {
  console.log('[CronSaldo] Iniciando envio de saldo diário...');

  const usuarios = buscarUsuariosAtivos();
  console.log(`[CronSaldo] ${usuarios.length} revendedores ativos encontrados`);

  let enviados = 0;
  let erros = 0;

  for (const usuario of usuarios) {
    try {
      // Delay entre cada envio para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const sucesso = await enviarSaldoRevendedor(usuario);
      if (sucesso) enviados++;
    } catch (e) {
      erros++;
      console.error(`[CronSaldo] Erro com ${usuario.nome}:`, e.message);
    }
  }

  console.log(`[CronSaldo] Finalizado! Enviados: ${enviados}, Erros: ${erros}`);
}

// ==========================================
// JOGOS DO DIA
// ==========================================

/**
 * Envia jogos para um revendedor
 */
async function enviarJogosRevendedor(usuario, mensagemJogos) {
  if (!masterBotInstance) {
    console.error('[CronJogos] Bot master não configurado');
    return false;
  }

  try {
    await masterBotInstance.telegram.sendMessage(usuario.telegram_id, mensagemJogos, {
      parse_mode: 'HTML'
    });
    console.log(`[CronJogos] Jogos enviados para ${usuario.nome}`);
    return true;
  } catch (error) {
    if (error.message?.includes('bot was blocked') || error.message?.includes('user is deactivated')) {
      console.log(`[CronJogos] ${usuario.nome} bloqueou o bot ou está inativo`);
      return false;
    }
    console.error(`[CronJogos] Erro ao enviar para ${usuario.nome}:`, error.message);
    return false;
  }
}

/**
 * Envia jogos para clientes de um bot
 */
async function enviarJogosClientes(botToken, clientes, mensagemJogos) {
  if (!clientes || clientes.length === 0) return 0;

  const { Telegraf } = require('telegraf');
  let enviados = 0;

  try {
    const botCliente = new Telegraf(botToken);

    for (const cliente of clientes) {
      try {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
        
        await botCliente.telegram.sendMessage(cliente.cliente_telegram_id, mensagemJogos, {
          parse_mode: 'HTML'
        });
        enviados++;
      } catch (e) {
        // Ignora erros individuais (bloqueou, inativo, etc)
      }
    }
  } catch (e) {
    console.error('[CronJogos] Erro ao enviar para clientes:', e.message);
  }

  return enviados;
}

/**
 * Executa envio de jogos para todos os revendedores/clientes configurados
 */
async function executarEnvioJogosDiario() {
  console.log('[CronJogos] Iniciando envio de jogos diário...');

  // Buscar jogos do cache
  let jogosHoje;
  try {
    jogosHoje = await getJogosHoje(false); // false = usar cache
  } catch (e) {
    console.error('[CronJogos] Erro ao buscar jogos:', e.message);
    return;
  }

  if (!jogosHoje || jogosHoje.length === 0) {
    console.log('[CronJogos] Nenhum jogo encontrado para hoje');
    return;
  }

  // Formatar mensagem
  const mensagemJogos = formatarMensagem(jogosHoje);
  if (!mensagemJogos) {
    console.log('[CronJogos] Erro ao formatar mensagem');
    return;
  }

  console.log(`[CronJogos] ${jogosHoje.length} jogos encontrados`);

  // Buscar usuários com jogos ativados
  let usuarios;
  if (db.usuarios.listarComJogosAtivados) {
    usuarios = db.usuarios.listarComJogosAtivados();
  } else {
    // Fallback
    usuarios = buscarUsuariosAtivos().filter(u => 
      u.jogos_config && u.jogos_config !== 'desativado'
    );
  }

  console.log(`[CronJogos] ${usuarios.length} revendedores com jogos ativados`);

  let revendedoresEnviados = 0;
  let clientesEnviados = 0;

  for (const usuario of usuarios) {
    try {
      // Delay entre cada revendedor
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Enviar para o revendedor
      const enviou = await enviarJogosRevendedor(usuario, mensagemJogos);
      if (enviou) revendedoresEnviados++;

      // Se config é 'eu_e_clientes', enviar para clientes também
      if (usuario.jogos_config === 'eu_e_clientes') {
        const bot = db.bots.buscarPorUsuarioId(usuario.id);
        
        if (bot && bot.token && db.jogosClientes?.listarClientesAtivos) {
          const clientes = db.jogosClientes.listarClientesAtivos(bot.id);
          
          if (clientes.length > 0) {
            console.log(`[CronJogos] Enviando para ${clientes.length} clientes de ${usuario.nome}`);
            const enviouClientes = await enviarJogosClientes(bot.token, clientes, mensagemJogos);
            clientesEnviados += enviouClientes;
          }
        }
      }
    } catch (e) {
      console.error(`[CronJogos] Erro com ${usuario.nome}:`, e.message);
    }
  }

  console.log(`[CronJogos] Finalizado! Revendedores: ${revendedoresEnviados}, Clientes: ${clientesEnviados}`);
}

/**
 * Inicializa todos os cron jobs
 */
function initCronJobs() {
  console.log('[Cron] Inicializando tarefas agendadas...');

  // ==========================================
  // LEMBRETE DE VENCIMENTO - Todo dia às 7h
  // ==========================================
  const horaLembrete = config.NOTIFICACOES.HORA_ENVIO;
  
  cron.schedule(`0 ${horaLembrete} * * *`, async () => {
    console.log('[Cron] Executando: Lembretes de vencimento');
    
    try {
      const enviados = await notificationService.enviarLembretesVencimento();
      console.log(`[Cron] Lembretes enviados: ${enviados}`);
    } catch (error) {
      console.error('[Cron] Erro nos lembretes:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log(`[Cron] ✅ Lembrete de vencimento agendado para ${horaLembrete}h`);

  // ==========================================
  // VERIFICAR USUÁRIOS VENCIDOS - A cada hora
  // ==========================================
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Executando: Verificação de usuários vencidos');
    
    try {
      await botManager.checkExpiredUsers();
    } catch (error) {
      console.error('[Cron] Erro na verificação:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Cron] ✅ Verificação de vencidos agendada (a cada hora)');

  // ==========================================
  // ENVIO DE SALDO DIÁRIO - Todo dia às 7h
  // ==========================================
  cron.schedule('0 7 * * *', async () => {
    console.log('[Cron] Executando: Envio de saldo diário');
    
    try {
      await executarEnvioSaldoDiario();
    } catch (error) {
      console.error('[Cron] Erro no envio de saldos:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Cron] ✅ Envio de saldo diário agendado para 7h');

  // ==========================================
  // SCRAPING DE JOGOS - Todo dia às 5h
  // ==========================================
  cron.schedule('0 5 * * *', async () => {
    console.log('[Cron] Executando: Scraping de jogos');
    
    try {
      await executarScrapingDiario();
    } catch (error) {
      console.error('[Cron] Erro no scraping de jogos:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Cron] ✅ Scraping de jogos agendado para 5h');

  // ==========================================
  // ENVIO DE JOGOS - Todo dia às 7:30
  // ==========================================
  cron.schedule('30 7 * * *', async () => {
    console.log('[Cron] Executando: Envio de jogos diário');
    
    try {
      await executarEnvioJogosDiario();
    } catch (error) {
      console.error('[Cron] Erro no envio de jogos:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });

  console.log('[Cron] ✅ Envio de jogos agendado para 7:30');

  console.log('[Cron] Todas as tarefas agendadas com sucesso');
}

module.exports = { 
  initCronJobs,
  setMasterBot,
  executarEnvioSaldoDiario,
  enviarSaldoRevendedor,
  executarEnvioJogosDiario,  // Para teste manual
  executarScrapingDiario     // Para teste manual
};
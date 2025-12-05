// src/cron/jobs.js - Tarefas agendadas

const cron = require('node-cron');
const config = require('../config');
const notificationService = require('../services/notificationService');
const botManager = require('../services/botManager');

/**
 * Inicializa todos os cron jobs
 */
function initCronJobs() {
  console.log('[Cron] Inicializando tarefas agendadas...');

  // Lembrete de vencimento - Todo dia às 7h
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

  // Verificar usuários vencidos - A cada hora
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

  console.log('[Cron] Todas as tarefas agendadas com sucesso');
}

module.exports = { initCronJobs };

// src/modules/quick_player.js - Módulo de ativação Quick Player (via Meta Player API)
// CORRIGIDO: Adicionado comprovante de ativação com data de validade simulada

const AutomationClient = require('../services/automation-client');
const config = require('../config');

// Configuração do módulo
const QUICK_PLAYER_CONFIG = {
  name: 'Quick Player',
  packages: {
    YEAR: { id: 'YEAR', name: 'Anual', days: 365 }
  }
};

/**
 * Calcula data de expiração
 * @param {string} tier - Tier da ativação
 * @returns {string} - Data formatada ou "VITALÍCIO"
 */
function calculateExpireDate(tier) {
  if (tier === 'LIFETIME') {
    return 'VITALÍCIO';
  }
  
  const dataExpiracao = new Date();
  dataExpiracao.setDate(dataExpiracao.getDate() + 365);
  return dataExpiracao.toLocaleDateString('pt-BR');
}

/**
 * Formata mensagem de sucesso (comprovante)
 * @param {string} macAddress - MAC do dispositivo
 * @param {string} otpCode - Código OTP usado
 * @param {string} tier - Tier da ativação
 * @param {string} expireDate - Data de expiração formatada
 * @returns {string} - Mensagem formatada em HTML
 */
function formatSuccessMessage(macAddress, otpCode, tier, expireDate) {
  const tierName = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
  
  let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
  message += `📱 <b>Aplicativo:</b> ${QUICK_PLAYER_CONFIG.name}\n`;
  message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
  message += `🔑 <b>Código OTP:</b> <code>${otpCode}</code>\n`;
  message += `⭐ <b>Plano:</b> ${tierName}\n`;
  message += `📅 <b>Válido até:</b> ${expireDate}\n`;
  
  message += `\n📲 <b>Próximos passos:</b>\n`;
  message += `1. Abra o aplicativo ${QUICK_PLAYER_CONFIG.name}\n`;
  message += `2. O aplicativo já deve estar liberado!\n\n`;
  message += `🙏 Obrigado pela preferência!`;

  return message;
}

/**
 * Cria um ativador Quick Player
 * @param {object} credentials - { username, password }
 */
function createActivator(credentials) {
  const { username, password } = credentials;
  
  // Configuração do cliente de automação
  const client = new AutomationClient({
    baseUrl: config.AUTOMATION_API_URL || 'http://95.217.161.109:3099',
    secret: config.AUTOMATION_API_SECRET || 'sua_chave_secreta_aqui',
    timeout: 180000 // 3 minutos para ativações
  });

  return {
    /**
     * Extrai e valida MAC Address
     * @param {string} mac - MAC Address a ser validado
     * @returns {string|null} - MAC formatado ou null se inválido
     */
    extractMacAddress(mac) {
      if (!mac) return null;
      
      // Remove espaços e converte para maiúsculo
      let cleaned = mac.trim().toUpperCase();
      
      // Remove caracteres não hexadecimais (exceto : e -)
      cleaned = cleaned.replace(/[^A-F0-9:-]/g, '');
      
      // Se não tem separadores, adiciona :
      if (!cleaned.includes(':') && !cleaned.includes('-')) {
        if (cleaned.length === 12) {
          cleaned = cleaned.match(/.{2}/g).join(':');
        }
      }
      
      // Normaliza separadores para :
      cleaned = cleaned.replace(/-/g, ':');
      
      // Valida formato XX:XX:XX:XX:XX:XX
      const macRegex = /^([A-F0-9]{2}:){5}[A-F0-9]{2}$/;
      
      if (macRegex.test(cleaned)) {
        return cleaned;
      }
      
      return null;
    },

    /**
     * Ativa um dispositivo Quick Player
     * @param {string} mac - MAC Address do dispositivo
     * @param {string} tier - Tier (YEAR)
     * @param {object} extra - Dados extras { otpCode }
     */
    async activate(mac, tier, extra = {}) {
      const { otpCode } = extra;
      
      if (!otpCode) {
        return {
          success: false,
          error: 'Código OTP não informado'
        };
      }

      console.log(`[QuickPlayer] Ativando MAC: ${mac}, OTP: ${otpCode}`);

      try {
        // Verificar saúde da API primeiro
        const health = await client.health();
        if (health.status !== 'ok') {
          return {
            success: false,
            error: 'API de automação indisponível'
          };
        }

        // Executar fluxo completo: Login → Connect → Buscar ID → Ativar
        const result = await client.metaPlayerFull(username, password, mac, otpCode);

        if (result.success) {
          console.log(`[QuickPlayer] Ativação bem-sucedida: ${mac}`);
          
          // Calcular data de expiração (1 ano)
          const expireDate = calculateExpireDate(tier || 'YEAR');
          
          return {
            success: true,
            message: formatSuccessMessage(mac, otpCode, tier || 'YEAR', expireDate),
            macAddress: mac,
            expireDate: expireDate,
            data: {
              mac: result.mac || mac,
              deviceId: result.deviceId,
              playlist: result.playlist,
              otpCode: otpCode
            }
          };
        } else {
          console.log(`[QuickPlayer] Falha na ativação: ${result.message || result.error}`);
          return {
            success: false,
            error: result.message || result.error || 'Erro desconhecido na ativação'
          };
        }

      } catch (error) {
        console.error(`[QuickPlayer] Erro:`, error.message);
        return {
          success: false,
          error: `Erro na comunicação: ${error.message}`
        };
      }
    },

    /**
     * Consulta saldo de créditos
     */
    async getCredits() {
      try {
        const result = await client.metaPlayerCredits(username, password);
        
        if (result.success) {
          return {
            success: true,
            credits: result.credits,
            raw: result
          };
        } else {
          return {
            success: false,
            error: result.message || result.error || 'Erro ao consultar saldo'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Erro na comunicação: ${error.message}`
        };
      }
    },

    /**
     * Verifica se as credenciais são válidas
     */
    async validateCredentials() {
      try {
        const result = await client.metaPlayerCredits(username, password);
        return {
          valid: result.success,
          error: result.success ? null : (result.message || result.error)
        };
      } catch (error) {
        return {
          valid: false,
          error: error.message
        };
      }
    }
  };
}

/**
 * Consulta saldo de créditos Quick Player
 * @param {object} credentials - { username, password }
 */
async function getCredits(credentials) {
  const activator = createActivator(credentials);
  return activator.getCredits();
}

module.exports = {
  createActivator,
  getCredits,
  QUICK_PLAYER_CONFIG
};
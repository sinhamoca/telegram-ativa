// src/modules/quick_player.js - Módulo de ativação Quick Player (via Meta Player API)

const AutomationClient = require('../services/automation-client');
const config = require('../config');

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
          return {
            success: true,
            message: result.message || 'Dispositivo ativado com sucesso!',
            data: {
              mac: result.mac || mac,
              deviceId: result.deviceId,
              playlist: result.playlist
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
  getCredits
};
// src/modules/ibo_pro.js - Módulo de Ativação IBO Pro
// SOLUÇÃO: Cloudflare Worker como proxy (gratuito, 100k req/dia)
// VERSÃO CORRIGIDA - Compatível com Worker Genérico v2

const axios = require('axios');

class IboProActivator {
  constructor(credentials = {}) {
    this.credentials = {
      username: credentials.username,
      password: credentials.password
    };
    
    // Configuração do Cloudflare Worker
    this.config = {
      // Worker URL - pode ser sobrescrito por variável de ambiente
      workerUrl: process.env.IBO_PRO_WORKER_URL || 'https://mute-water-e65cibo-proxy.isaacofc2.workers.dev',
      workerSecret: process.env.IBO_PRO_WORKER_SECRET || 'MinhaChave123',
      // URL base da API IBO Pro
      iboProApiUrl: 'https://api.iboproapp.com',
      timeout: 30000
    };
    
    this.accessToken = null;
    this.tokenExpiresAt = null;
    
    // Regex flexível para aceitar MACs atípicos
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
    this.strictMacRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  }

  /**
   * Valida se as credenciais estão configuradas
   */
  isConfigured() {
    return !!(this.credentials.username && this.credentials.password);
  }

  /**
   * Extrai MAC address dos dados enviados
   */
  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (this.macRegex.test(trimmed)) {
          return trimmed.toLowerCase().replace(/-/g, ':');
        }
        
        const macWithoutSeparators = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toLowerCase();
          return `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[IBO Pro] Erro ao extrair MAC:', error);
      return null;
    }
  }

  /**
   * Valida formato do MAC
   */
  isValidMac(mac) {
    return this.macRegex.test(mac);
  }

  /**
   * Faz login na API do IBO Pro via Cloudflare Worker
   */
  async login() {
    try {
      console.log('[IBO Pro] Fazendo login via Cloudflare Worker...');
      
      const response = await axios.post(
        `${this.config.workerUrl}/login`,
        {
          username: this.credentials.username,
          password: this.credentials.password
        },
        {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Proxy-Secret': this.config.workerSecret
          }
        }
      );

      if (response.status === 200 && response.data.status === true) {
        this.accessToken = response.data.accessToken;
        
        // Calcula expiração do token
        try {
          const payload = JSON.parse(Buffer.from(this.accessToken.split('.')[1], 'base64').toString());
          this.tokenExpiresAt = new Date(payload.exp * 1000);
        } catch (e) {
          this.tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
        }

        console.log('[IBO Pro] ✅ Login realizado com sucesso via Worker');
        return { success: true };
      }

      return {
        success: false,
        error: response.data.message || 'Login falhou'
      };

    } catch (error) {
      console.error('[IBO Pro] Erro no login:', error.message);
      
      if (error.response) {
        // Erro 401 = Secret incorreto
        if (error.response.status === 401) {
          return {
            success: false,
            error: 'Worker Secret incorreto. Verifique IBO_PRO_WORKER_SECRET'
          };
        }
        return {
          success: false,
          error: `Erro ${error.response.status}: ${error.response.data?.message || error.response.statusText}`
        };
      }
      
      return {
        success: false,
        error: error.code === 'ECONNABORTED' ? 'Timeout na conexão' : error.message
      };
    }
  }

  /**
   * Ativa dispositivo na API via Cloudflare Worker
   * CORRIGIDO: Usa formato correto para o Worker Genérico v2
   */
  async activateDevice(macAddress, tier) {
    try {
      console.log(`[IBO Pro] Ativando MAC ${macAddress} com tier ${tier}...`);
      
      const activationPayload = {
        mac_address: macAddress,
        tier: tier,
        name: '',
        note: `Ativado via Telegram - ${new Date().toISOString()}`
      };

      console.log(`[IBO Pro] Payload de ativação:`, activationPayload);

      // CORRIGIDO: Usar formato correto para o endpoint /proxy
      const response = await axios.post(
        `${this.config.workerUrl}/proxy`,
        {
          method: 'POST',
          url: `${this.config.iboProApiUrl}/admin/devices/activate`,  // ✅ URL completa
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,  // ✅ Headers corretos
            'Content-Type': 'application/json'
          },
          body: activationPayload
        },
        {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Proxy-Secret': this.config.workerSecret
          }
        }
      );

      console.log('[IBO Pro] Resposta da ativação:', response.status, response.data);

      // O Worker retorna { success, status, data }
      const result = response.data;
      
      if (result.success && result.data?.status === true) {
        return {
          success: true,
          data: result.data
        };
      }

      // Verificar se a ativação foi bem-sucedida mesmo com status diferente
      if (result.status === 200 || result.status === 201) {
        if (result.data?.status === true || result.data?.expire_date) {
          return {
            success: true,
            data: result.data
          };
        }
      }

      return {
        success: false,
        error: result.data?.message || result.error || 'Ativação falhou',
        apiResponse: result.data
      };

    } catch (error) {
      console.error('[IBO Pro] Erro na ativação:', error.message);
      
      if (error.response) {
        console.error('[IBO Pro] Resposta de erro:', error.response.data);
        return {
          success: false,
          error: error.response.data?.error || error.response.data?.message || error.response.statusText,
          apiResponse: error.response.data
        };
      }
      
      return {
        success: false,
        error: error.code === 'ECONNABORTED' ? 'Timeout na ativação' : error.message
      };
    }
  }

  /**
   * Método principal de ativação
   */
  async activate(macAddressRaw, tier) {
    try {
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'Credenciais IBO Pro não configuradas'
        };
      }

      const macAddress = this.extractMacAddress(macAddressRaw);
      if (!macAddress) {
        return {
          success: false,
          error: 'MAC Address inválido. Envie no formato: AA:BB:CC:DD:EE:FF'
        };
      }

      console.log(`[IBO Pro] MAC extraído: ${macAddress}`);

      const loginResult = await this.login();
      if (!loginResult.success) {
        return {
          success: false,
          error: `Falha no login: ${loginResult.error}`
        };
      }

      const activationResult = await this.activateDevice(macAddress, tier);
      
      if (activationResult.success) {
        return {
          success: true,
          macAddress: macAddress,
          tier: tier,
          expireDate: activationResult.data.expire_date,
          apiResponse: activationResult.data,
          message: this.formatSuccessMessage(macAddress, tier, activationResult.data)
        };
      }

      return {
        success: false,
        error: activationResult.error,
        apiResponse: activationResult.apiResponse
      };

    } catch (error) {
      console.error('[IBO Pro] Erro geral na ativação:', error);
      return {
        success: false,
        error: `Erro interno: ${error.message}`
      };
    }
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(macAddress, tier, apiResponse) {
    const tierNome = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
    
    let message = '✅ *ATIVAÇÃO REALIZADA COM SUCESSO!*\n\n';
    message += '📱 *Aplicativo:* IBO Pro\n';
    message += `📧 *MAC:* \`${macAddress}\`\n`;
    message += `⭐ *Plano:* ${tierNome}\n`;
    
    if (apiResponse.expire_date) {
      const expireDate = new Date(apiResponse.expire_date).toLocaleDateString('pt-BR');
      message += `📅 *Válido até:* ${expireDate}\n`;
    }
    
    message += '\n📲 *Próximos passos:*\n';
    message += '1. Abra o aplicativo IBO Pro\n';
    message += '2. O aplicativo já deve estar liberado!\n\n';
    message += '🙏 Obrigado pela preferência!';

    return message;
  }

  /**
   * Testa conexão com a API
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'Credenciais não configuradas' };
    }

    const loginResult = await this.login();
    return {
      success: loginResult.success,
      error: loginResult.error,
      message: loginResult.success ? 'Conexão OK via Cloudflare Worker' : 'Falha na conexão',
      method: 'Cloudflare Worker'
    };
  }

  /**
   * Busca saldo de créditos da conta
   */
  async getSaldo() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      // Fazer login se não tiver token
      if (!this.accessToken) {
        const loginResult = await this.login();
        if (!loginResult.success) {
          return { success: false, error: `Falha no login: ${loginResult.error}` };
        }
      }

      console.log('[IBO Pro] Buscando saldo via Worker...');

      const response = await axios.get(
        `${this.config.workerUrl}/me`,
        {
          timeout: this.config.timeout,
          headers: {
            'X-Proxy-Secret': this.config.workerSecret,
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      console.log('[IBO Pro] Resposta do saldo:', response.data);

      if (response.status === 200 && response.data) {
        return {
          success: true,
          credits: response.data.credits || 0,
          username: response.data.username,
          role: response.data.role,
          active: response.data.active
        };
      }

      return {
        success: false,
        error: 'Resposta inválida da API'
      };

    } catch (error) {
      console.error('[IBO Pro] Erro ao buscar saldo:', error.message);
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.message || error.response.statusText
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Cria instância do ativador
 */
function createActivator(credentials) {
  return new IboProActivator(credentials);
}

module.exports = {
  IboProActivator,
  createActivator
};
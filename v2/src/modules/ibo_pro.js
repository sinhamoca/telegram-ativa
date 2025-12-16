// src/modules/ibo_pro.js - Módulo de Ativação IBO Pro

const axios = require('axios');

class IboProActivator {
  constructor(credentials = {}) {
    this.credentials = {
      username: credentials.username,
      password: credentials.password
    };
    
    this.config = {
      loginUrl: 'https://api.iboproapp.com/admin/login',
      activateUrl: 'https://api.iboproapp.com/admin/devices/activate',
      timeout: 15000
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
        
        // Teste com regex flexível
        if (this.macRegex.test(trimmed)) {
          return trimmed.toLowerCase().replace(/-/g, ':');
        }
        
        // MAC sem separadores (12 caracteres)
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
   * Faz login na API do IBO Pro
   */
  async login() {
    try {
      console.log('[IBO Pro] Fazendo login...');
      
      const response = await axios.post(this.config.loginUrl, {
        username: this.credentials.username,
        password: this.credentials.password
      }, {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://cms.iboproapp.com',
          'Referer': 'https://cms.iboproapp.com/'
        }
      });

      if (response.status === 200 && response.data.status === true) {
        this.accessToken = response.data.accessToken;
        
        // Calcula expiração do token
        try {
          const payload = JSON.parse(Buffer.from(this.accessToken.split('.')[1], 'base64').toString());
          this.tokenExpiresAt = new Date(payload.exp * 1000);
        } catch (e) {
          this.tokenExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
        }

        console.log('[IBO Pro] Login realizado com sucesso');
        return { success: true };
      }

      return {
        success: false,
        error: response.data.message || 'Login falhou'
      };

    } catch (error) {
      console.error('[IBO Pro] Erro no login:', error.message);
      
      if (error.response) {
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
   * Ativa dispositivo na API
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

      const response = await axios.post(this.config.activateUrl, activationPayload, {
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://cms.iboproapp.com',
          'Referer': 'https://cms.iboproapp.com/'
        }
      });

      console.log('[IBO Pro] Resposta da ativação:', response.status, response.data);

      if (response.status === 200 && response.data.status === true) {
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: false,
        error: response.data.message || 'Ativação falhou',
        apiResponse: response.data
      };

    } catch (error) {
      console.error('[IBO Pro] Erro na ativação:', error.message);
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.message || error.response.statusText,
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
      // Validar credenciais
      if (!this.isConfigured()) {
        return {
          success: false,
          error: 'Credenciais IBO Pro não configuradas'
        };
      }

      // Extrair MAC
      const macAddress = this.extractMacAddress(macAddressRaw);
      if (!macAddress) {
        return {
          success: false,
          error: 'MAC Address inválido. Envie no formato: AA:BB:CC:DD:EE:FF'
        };
      }

      console.log(`[IBO Pro] MAC extraído: ${macAddress}`);

      // Login
      const loginResult = await this.login();
      if (!loginResult.success) {
        return {
          success: false,
          error: `Falha no login: ${loginResult.error}`
        };
      }

      // Ativar
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
    message += `🔧 *MAC:* \`${macAddress}\`\n`;
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
      message: loginResult.success ? 'Conexão OK' : 'Falha na conexão'
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

      console.log('[IBO Pro] Buscando saldo...');

      const response = await axios.get('https://api.iboproapp.com/admin/me', {
        timeout: this.config.timeout,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://cms.iboproapp.com',
          'Referer': 'https://cms.iboproapp.com/'
        }
      });

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
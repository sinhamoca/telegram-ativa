// src/modules/rivolut.js - Módulo Rivolut Player
const axios = require('axios');

class RivolutActivator {
  constructor(config = {}) {
    this.config = {
      name: 'Rivolut Player',
      baseUrl: 'https://rivolutplayer.com',
      loginUrl: 'https://rivolutplayer.com/reseller/login',
      activateUrl: 'https://rivolutplayer.com/reseller/post-activate',
      saldoUrl: 'https://rivolutplayer.com/reseller/activate-device',
      credentials: {
        email: config.email,
        password: config.password
      },
      timeout: config.timeout || 15000
    };
    
    this.sessionCookie = null;
    
    // Mapeamento de tiers para créditos
    this.tierCredits = {
      'YEAR': 1,      // Anual = 1 crédito
      'LIFETIME': 2   // Vitalício = 2 créditos
    };
    
    // Regex para validar MAC address
    this.macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  }

  isConfigured() {
    return !!(this.config.credentials.email && this.config.credentials.password);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extrai e valida MAC Address
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
  }

  /**
   * Login na plataforma
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[Rivolut] Fazendo login...`);
      
      // Primeiro GET para obter cookies iniciais
      const getResponse = await axios.get(this.config.loginUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: this.config.timeout
      });

      let initialCookies = '';
      if (getResponse.headers['set-cookie']) {
        initialCookies = getResponse.headers['set-cookie']
          .map(cookie => cookie.split(';')[0])
          .join('; ');
      }

      // Aguardar um pouco
      await this.sleep(500);

      // POST de login
      const formData = new URLSearchParams();
      formData.append('email', this.config.credentials.email);
      formData.append('password', this.config.credentials.password);

      const response = await axios.post(this.config.loginUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': this.config.baseUrl,
          'Referer': this.config.loginUrl,
          'Cookie': initialCookies
        },
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
        timeout: this.config.timeout
      });

      console.log(`[Rivolut] Resposta login: ${response.status}`);

      // Verificar redirect de sucesso
      if (response.status === 302 && response.headers.location?.includes('/reseller/')) {
        if (response.headers['set-cookie']) {
          this.sessionCookie = response.headers['set-cookie']
            .map(cookie => cookie.split(';')[0])
            .join('; ');
          
          console.log(`[Rivolut] Login OK`);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'Login falhou - credenciais inválidas'
      };

    } catch (error) {
      console.error('[Rivolut] Erro no login:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca saldo de créditos
   */
  async getSaldo() {
    try {
      if (!this.sessionCookie) {
        const loginResult = await this.login();
        if (!loginResult.success) {
          return { success: false, error: loginResult.error };
        }
      }

      console.log(`[Rivolut] Buscando saldo...`);

      const response = await axios.get(this.config.saldoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookie
        },
        timeout: this.config.timeout
      });

      // Extrair saldo do HTML
      const html = response.data;
      const match = html.match(/id="remain_count">(\d+)</);
      
      if (match) {
        const credits = parseInt(match[1]);
        console.log(`[Rivolut] Saldo: ${credits}`);
        
        return {
          success: true,
          credits: credits,
          username: this.config.credentials.email,
          active: true
        };
      }

      return {
        success: false,
        error: 'Não foi possível extrair o saldo'
      };

    } catch (error) {
      console.error('[Rivolut] Erro ao buscar saldo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão
   */
  async testConnection() {
    const loginResult = await this.login();
    if (!loginResult.success) {
      return loginResult;
    }

    const saldoResult = await this.getSaldo();
    return {
      success: saldoResult.success,
      error: saldoResult.error,
      message: saldoResult.success ? `Conectado! Saldo: ${saldoResult.credits} créditos` : null
    };
  }

  /**
   * Ativa um dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      // Validar MAC
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Login se necessário
      if (!this.sessionCookie) {
        const loginResult = await this.login();
        if (!loginResult.success) {
          return {
            success: false,
            error: `Falha no login: ${loginResult.error}`
          };
        }
      }

      // Determinar créditos baseado no tier
      const creditCount = this.tierCredits[tier] || 1;
      
      console.log(`[Rivolut] Ativando ${mac} com ${creditCount} crédito(s)...`);

      // Payload de ativação
      const formData = new URLSearchParams();
      formData.append('mac_address', mac.toLowerCase()); // Rivolut usa minúsculo
      formData.append('note', `Ativado via Telegram - ${new Date().toISOString()}`);
      formData.append('credit_count', creditCount.toString());

      console.log(`[Rivolut] Payload:`, formData.toString());

      const response = await axios.post(this.config.activateUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookie,
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: this.config.timeout
      });

      console.log(`[Rivolut] Resposta:`, response.status, response.data);

      if (response.data?.status === 'success') {
        return {
          success: true,
          message: this.formatSuccessMessage(response.data, mac, tier),
          expireDate: null,
          apiResponse: response.data
        };
      }

      return {
        success: false,
        error: response.data?.msg || 'Ativação falhou',
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[Rivolut] Erro na ativação:`, error.message);
      
      // Se erro de autenticação, tentar login novamente
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('[Rivolut] Tentando relogin...');
        this.sessionCookie = null;
        
        const loginResult = await this.login();
        if (loginResult.success) {
          return this.activate(macAddress, tier);
        }
      }
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.msg || error.response.statusText
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(apiResponse, macAddress, tier) {
    const tierName = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
    
    let message = `✅ Dispositivo ativado com sucesso!\n\n`;
    message += `📺 App: Rivolut Player\n`;
    message += `📱 MAC: ${macAddress}\n`;
    message += `⏱️ Plano: ${tierName}\n`;
    
    if (apiResponse.remain_count !== undefined) {
      message += `💰 Créditos restantes: ${apiResponse.remain_count}`;
    }
    
    return message;
  }

  /**
   * Retorna créditos (alias para getSaldo)
   */
  async getCredits() {
    return this.getSaldo();
  }

  /**
   * Valida credenciais
   */
  async validateCredentials() {
    const result = await this.testConnection();
    return {
      valid: result.success,
      error: result.error
    };
  }
}

/**
 * Cria instância do ativador
 */
function createActivator(credentials) {
  const activator = new RivolutActivator({
    email: credentials.email,
    password: credentials.password
  });

  return {
    activate: (mac, tier, extra) => activator.activate(mac, tier),
    getCredits: () => activator.getCredits(),
    extractMacAddress: (mac) => activator.extractMacAddress(mac),
    validateCredentials: () => activator.validateCredentials(),
    testConnection: () => activator.testConnection()
  };
}

/**
 * Consulta saldo
 */
async function getCredits(credentials) {
  const activator = new RivolutActivator(credentials);
  return activator.getSaldo();
}

/**
 * Testa conexão
 */
async function testConnection(credentials) {
  const activator = new RivolutActivator(credentials);
  return activator.testConnection();
}

module.exports = {
  RivolutActivator,
  createActivator,
  getCredits,
  testConnection
};

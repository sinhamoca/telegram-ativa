// src/modules/enzo_player.js - Módulo EnzoPlayer
// Baseado no VU Player Pro (mesmo sistema, URLs diferentes)

const axios = require('axios');

class EnzoPlayerActivator {
  constructor(config = {}) {
    this.config = {
      name: 'EnzoPlayer',
      baseUrl: 'https://enzoplayer.com',
      loginUrl: 'https://enzoplayer.com/reseller/login',
      activateUrl: 'https://enzoplayer.com/reseller/post-activate',
      saldoUrl: 'https://enzoplayer.com/reseller/activate-device',
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
    
    // Regex para validar MAC address (aceita MACs atípicos)
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
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
   * Login na plataforma
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[EnzoPlayer] Fazendo login...`);
      
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
      await this.sleep(1000);

      // POST de login
      const formData = new URLSearchParams();
      formData.append('email', this.config.credentials.email);
      formData.append('password', this.config.credentials.password);
      formData.append('submit', '');

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

      console.log(`[EnzoPlayer] Resposta login: ${response.status}`);

      // Verificar redirect de sucesso
      if (response.status === 302 && response.headers.location?.includes('/reseller/')) {
        if (response.headers['set-cookie']) {
          this.sessionCookie = response.headers['set-cookie']
            .map(cookie => cookie.split(';')[0])
            .join('; ');
          
          console.log(`[EnzoPlayer] Login OK`);
          return { success: true };
        }
      }

      return {
        success: false,
        error: 'Login falhou - credenciais inválidas'
      };

    } catch (error) {
      console.error('[EnzoPlayer] Erro no login:', error.message);
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

      console.log(`[EnzoPlayer] Buscando saldo...`);

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
        console.log(`[EnzoPlayer] Saldo: ${credits}`);
        
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
      console.error('[EnzoPlayer] Erro ao buscar saldo:', error.message);
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
      message: saldoResult.success ? `Conexão OK - ${saldoResult.credits} créditos` : 'Falha na conexão'
    };
  }

  /**
   * Extrai MAC address
   */
  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // MAC com separadores
        if (this.macRegex.test(trimmed)) {
          return trimmed.toLowerCase().replace(/-/g, ':');
        }
        
        // MAC sem separadores (12 caracteres alfanuméricos - aceita MACs atípicos)
        const macWithoutSep = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSep) {
          const mac = macWithoutSep[0].toLowerCase();
          return `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Ativa dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      console.log(`[EnzoPlayer] Iniciando ativação...`);
      console.log(`[EnzoPlayer] MAC: ${macAddress}, Tier: ${tier}`);

      // Extrair MAC se necessário
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
      
      console.log(`[EnzoPlayer] Ativando com ${creditCount} crédito(s)...`);

      // Payload de ativação
      const formData = new URLSearchParams();
      formData.append('mac_address', mac);
      formData.append('note', `Ativado via Telegram - ${new Date().toISOString()}`);
      formData.append('credit_count', creditCount.toString());

      console.log(`[EnzoPlayer] Payload:`, formData.toString());

      const response = await axios.post(this.config.activateUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookie,
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: this.config.timeout
      });

      console.log(`[EnzoPlayer] Resposta:`, response.status, response.data);

      if (response.data?.status === 'success') {
        return {
          success: true,
          message: this.formatSuccessMessage(response.data, mac, tier),
          expireDate: this.calculateExpireDate(tier),
          macAddress: mac,
          apiResponse: response.data
        };
      }

      // Tratar erro de dispositivo não encontrado
      if (response.data?.msg === "Sorry, device does not exist") {
        return {
          success: false,
          error: 'MAC inválido! Dispositivo não encontrado.',
          apiResponse: response.data
        };
      }

      return {
        success: false,
        error: response.data?.msg || 'Ativação falhou',
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[EnzoPlayer] Erro na ativação:`, error.message);
      
      // Se erro de autenticação, tentar login novamente
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('[EnzoPlayer] Tentando relogin...');
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
   * Calcula data de expiração simulada
   */
  calculateExpireDate(tier) {
    if (tier === 'LIFETIME') {
      return 'VITALÍCIO';
    }
    
    const dataExpiracao = new Date();
    dataExpiracao.setFullYear(dataExpiracao.getFullYear() + 1);
    return dataExpiracao.toLocaleDateString('pt-BR');
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(apiResponse, macAddress, tier) {
    const tierName = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
    const validade = this.calculateExpireDate(tier);
    
    let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> EnzoPlayer\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${tierName}\n`;
    message += `📅 <b>Válido até:</b> ${validade}\n`;
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo EnzoPlayer\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Cria ativador
 */
function createActivator(credentials) {
  return new EnzoPlayerActivator({
    email: credentials.email,
    password: credentials.password
  });
}

module.exports = {
  EnzoPlayerActivator,
  createActivator
};
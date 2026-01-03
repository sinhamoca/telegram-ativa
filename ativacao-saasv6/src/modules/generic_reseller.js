// src/modules/generic_reseller.js - Módulo genérico para painéis de revenda
// Suporta: VU Player Pro, EnzoPlayer, Rivolut, Cap Player e similares
// CORRIGIDO: Suporte a MAC atípico (ex: 74:4f:co:nl:jz:4k)

const axios = require('axios');

class GenericResellerActivator {
  constructor(dominio, credentials, options = {}) {
    this.dominio = dominio;
    this.config = {
      name: options.name || dominio,
      baseUrl: `https://${dominio}`,
      loginUrl: `https://${dominio}/reseller/login`,
      activateUrl: `https://${dominio}/reseller/post-activate`,
      saldoUrl: `https://${dominio}/reseller/activate-device`,
      credentials: {
        email: credentials.email,
        password: credentials.password
      },
      timeout: options.timeout || 15000
    };
    
    this.sessionCookie = null;
    
    // Mapeamento de tiers para créditos (padrão para todos)
    this.tierCredits = {
      'YEAR': 1,      // Anual = 1 crédito
      'LIFETIME': 2   // Vitalício = 2 créditos
    };
    
    // CORRIGIDO: Regex flexível para aceitar MACs atípicos (letras fora do hex como J, K, Z)
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
   * Extrai e valida MAC Address
   * CORRIGIDO: Aceita caracteres alfanuméricos, não apenas hexadecimais
   */
  extractMacAddress(mac) {
    if (!mac) return null;
    
    // Remove espaços extras
    let cleaned = mac.trim();
    
    // Tenta extrair MAC de texto com múltiplas linhas
    const lines = cleaned.split(/[\n\r\s,;]/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // MAC com separadores (formato XX:XX:XX:XX:XX:XX ou XX-XX-XX-XX-XX-XX)
      if (this.macRegex.test(trimmed)) {
        return trimmed.toLowerCase().replace(/-/g, ':');
      }
      
      // MAC sem separadores (12 caracteres alfanuméricos)
      const macWithoutSep = trimmed.match(/^[0-9a-zA-Z]{12}$/);
      if (macWithoutSep) {
        const macClean = macWithoutSep[0].toLowerCase();
        return `${macClean.substr(0,2)}:${macClean.substr(2,2)}:${macClean.substr(4,2)}:${macClean.substr(6,2)}:${macClean.substr(8,2)}:${macClean.substr(10,2)}`;
      }
    }
    
    return null;
  }

  /**
   * Faz login no painel
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[${this.config.name}] Fazendo login...`);

      // Primeiro, acessa a página de login para pegar cookies
      const loginPageResponse = await axios.get(this.config.loginUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: this.config.timeout,
        maxRedirects: 5
      });

      // Extrai cookies
      const cookies = loginPageResponse.headers['set-cookie'] || [];
      let cookieString = cookies.map(c => c.split(';')[0]).join('; ');

      // Aguarda um pouco
      await this.sleep(500);

      // Faz o login
      const formData = new URLSearchParams();
      formData.append('email', this.config.credentials.email);
      formData.append('password', this.config.credentials.password);

      const response = await axios.post(this.config.loginUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookieString,
          'Origin': this.config.baseUrl,
          'Referer': this.config.loginUrl
        },
        timeout: this.config.timeout,
        maxRedirects: 0,
        validateStatus: (status) => status < 500
      });

      // Verifica se o login foi bem sucedido (redirect para dashboard)
      if (response.status === 302 || response.status === 301) {
        const newCookies = response.headers['set-cookie'] || [];
        newCookies.forEach(c => {
          const cookiePart = c.split(';')[0];
          if (!cookieString.includes(cookiePart.split('=')[0])) {
            cookieString += '; ' + cookiePart;
          } else {
            // Atualiza cookie existente
            const cookieName = cookiePart.split('=')[0];
            cookieString = cookieString.replace(
              new RegExp(`${cookieName}=[^;]*`),
              cookiePart
            );
          }
        });

        this.sessionCookie = cookieString;
        console.log(`[${this.config.name}] Login OK!`);
        return { success: true };
      }

      // Se não redirecionou, pode ser erro
      if (response.data && response.data.includes && response.data.includes('Invalid')) {
        return { success: false, error: 'Email ou senha inválidos' };
      }

      // Tenta salvar cookies mesmo assim
      const newCookies = response.headers['set-cookie'] || [];
      newCookies.forEach(c => {
        cookieString += '; ' + c.split(';')[0];
      });
      this.sessionCookie = cookieString;

      return { success: true };

    } catch (error) {
      console.error(`[${this.config.name}] Erro no login:`, error.message);
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

      console.log(`[${this.config.name}] Buscando saldo...`);

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
        console.log(`[${this.config.name}] Saldo: ${credits}`);
        
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
      console.error(`[${this.config.name}] Erro ao buscar saldo:`, error.message);
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
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF ou 12 caracteres'
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
      
      console.log(`[${this.config.name}] Ativando ${mac} com ${creditCount} crédito(s)...`);

      // Payload de ativação
      const formData = new URLSearchParams();
      formData.append('mac_address', mac.toLowerCase());
      formData.append('note', `Ativado via Telegram - ${new Date().toISOString()}`);
      formData.append('credit_count', creditCount.toString());

      console.log(`[${this.config.name}] Payload:`, formData.toString());

      const response = await axios.post(this.config.activateUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookie,
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: this.config.timeout
      });

      console.log(`[${this.config.name}] Resposta:`, response.status, response.data);

      if (response.data?.status === 'success') {
        return {
          success: true,
          message: this.formatSuccessMessage(response.data, mac, tier),
          expireDate: this.calculateExpireDate(tier),
          macAddress: mac,
          apiResponse: response.data
        };
      }

      return {
        success: false,
        error: response.data?.msg || 'Ativação falhou',
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[${this.config.name}] Erro na ativação:`, error.message);
      
      // Se erro de autenticação, tentar login novamente
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log(`[${this.config.name}] Tentando relogin...`);
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
   * Calcula data de expiração baseada no tier
   */
  calculateExpireDate(tier) {
    const hoje = new Date();
    if (tier === 'LIFETIME') {
      hoje.setFullYear(hoje.getFullYear() + 100);
      return 'VITALÍCIO';
    } else {
      hoje.setDate(hoje.getDate() + 365);
      return hoje.toLocaleDateString('pt-BR');
    }
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(apiResponse, macAddress, tier) {
    const tierName = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
    const expireDate = this.calculateExpireDate(tier);
    
    let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> ${this.config.name}\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${tierName}\n`;
    message += `📅 <b>Válido até:</b> ${expireDate}\n`;
    
    if (apiResponse.remain_count !== undefined) {
      message += `💰 <b>Créditos restantes:</b> ${apiResponse.remain_count}\n`;
    }
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo ${this.config.name}\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;
    
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
 * Cria instância do ativador genérico
 * @param {string} dominio - Domínio do painel (ex: 'vuproplayer.org')
 * @param {object} credentials - { email, password }
 * @param {object} options - { name, timeout }
 */
function createActivator(dominio, credentials, options = {}) {
  const activator = new GenericResellerActivator(dominio, credentials, options);

  return {
    activate: (mac, tier, extra) => activator.activate(mac, tier),
    getCredits: () => activator.getCredits(),
    getSaldo: () => activator.getSaldo(),
    extractMacAddress: (mac) => activator.extractMacAddress(mac),
    validateCredentials: () => activator.validateCredentials(),
    testConnection: () => activator.testConnection()
  };
}

/**
 * Consulta saldo de um painel genérico
 * @param {string} dominio - Domínio do painel
 * @param {object} credentials - { email, password }
 */
async function getCredits(dominio, credentials, options = {}) {
  const activator = new GenericResellerActivator(dominio, credentials, options);
  return activator.getSaldo();
}

/**
 * Testa conexão com um painel genérico
 * @param {string} dominio - Domínio do painel
 * @param {object} credentials - { email, password }
 */
async function testConnection(dominio, credentials, options = {}) {
  const activator = new GenericResellerActivator(dominio, credentials, options);
  return activator.testConnection();
}

module.exports = {
  GenericResellerActivator,
  createActivator,
  getCredits,
  testConnection
};
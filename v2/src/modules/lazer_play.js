// src/modules/lazer_play.js - Módulo de ativação Lazer Play (com CAPTCHA)

const axios = require('axios');
const { solveRecaptchaV2 } = require('../utils/captchaSolver');

/**
 * Configurações do Lazer Play
 * NOTA: Usa a mesma API do DreamTV (api.appacesso.com)
 *       A diferença é o CAPTCHA no login
 */
const LAZER_PLAY_CONFIG = {
  name: 'Lazer Play',
  baseUrl: 'https://api.appacesso.com',
  
  // reCAPTCHA do painel
  recaptcha: {
    siteKey: '6LfjXhYsAAAAAHQ6pH2nBmSwmlK-e5xMcdbXAb5z',
    pageUrl: 'https://reseller.lazerplay.io/'
  },
  
  // Pacotes disponíveis (apenas Anual)
  packages: {
    YEAR: { id: 1, name: 'Anual', days: 365 }
  },
  
  timeout: 30000
};

/**
 * Classe do ativador Lazer Play
 */
class LazerPlayActivator {
  constructor(credentials) {
    this.config = {
      credentials: {
        email: credentials.email,
        password: credentials.password
      }
    };
    
    this.accessToken = null;
    this.tokenExpiryTime = null;
    
    // Regex para validar MAC
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
    
    // Cliente HTTP
    this.client = axios.create({
      baseURL: LAZER_PLAY_CONFIG.baseUrl,
      timeout: LAZER_PLAY_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
        'Origin': 'https://reseller.lazerplay.io',
        'Referer': 'https://reseller.lazerplay.io/'
      }
    });
  }

  /**
   * Verifica se as credenciais estão configuradas
   */
  isConfigured() {
    return !!(this.config.credentials.email && this.config.credentials.password);
  }

  /**
   * Verifica se o token ainda é válido
   */
  isTokenValid() {
    return this.accessToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime;
  }

  /**
   * Login na API (requer resolução de CAPTCHA)
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[${LAZER_PLAY_CONFIG.name}] Fazendo login...`);
      
      // Resolver CAPTCHA
      console.log(`[${LAZER_PLAY_CONFIG.name}] Resolvendo CAPTCHA...`);
      const captchaToken = await solveRecaptchaV2(
        LAZER_PLAY_CONFIG.recaptcha.siteKey,
        LAZER_PLAY_CONFIG.recaptcha.pageUrl
      );
      console.log(`[${LAZER_PLAY_CONFIG.name}] CAPTCHA resolvido!`);

      // Fazer login com token do CAPTCHA
      const response = await this.client.post('/reseller/login', {
        email: this.config.credentials.email,
        password: this.config.credentials.password,
        token: captchaToken
      });

      if ((response.status === 200 || response.status === 201) && response.data.error === false && response.data.message) {
        this.accessToken = response.data.message;
        // Token expira em 2 horas (definir 1h50 para segurança)
        this.tokenExpiryTime = Date.now() + (110 * 60 * 1000);
        
        console.log(`[${LAZER_PLAY_CONFIG.name}] Login OK`);
        return { success: true, token: this.accessToken };
      }

      return {
        success: false,
        error: response.data?.message || 'Login falhou'
      };

    } catch (error) {
      console.error(`[${LAZER_PLAY_CONFIG.name}] Erro no login:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Garante que temos um token válido
   */
  async ensureToken() {
    if (!this.isTokenValid()) {
      const result = await this.login();
      if (!result.success) {
        throw new Error(result.error || 'Falha na autenticação');
      }
    }
    return this.accessToken;
  }

  /**
   * Busca saldo de créditos
   */
  async getSaldo() {
    try {
      const token = await this.ensureToken();

      console.log(`[${LAZER_PLAY_CONFIG.name}] Buscando saldo...`);

      const response = await this.client.get('/reseller', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if ((response.status === 200 || response.status === 201) && response.data.error === false) {
        const reseller = response.data.message?.reseller;
        
        if (reseller) {
          const credits = reseller.total_activations || 0;
          console.log(`[${LAZER_PLAY_CONFIG.name}] Saldo: ${credits} créditos`);
          
          return {
            success: true,
            credits: credits,
            username: reseller.email,
            name: reseller.name,
            active: reseller.is_reseller === true
          };
        }
      }

      return {
        success: false,
        error: 'Não foi possível obter informações da conta'
      };

    } catch (error) {
      console.error(`[${LAZER_PLAY_CONFIG.name}] Erro ao buscar saldo:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão
   */
  async testConnection() {
    // Resetar token para forçar novo login
    this.accessToken = null;
    this.tokenExpiryTime = null;
    
    const loginResult = await this.login();
    if (!loginResult.success) {
      return loginResult;
    }

    const saldoResult = await this.getSaldo();
    return {
      success: saldoResult.success,
      error: saldoResult.error,
      message: saldoResult.success 
        ? `Conexão OK - ${saldoResult.credits} créditos` 
        : 'Falha na conexão',
      credits: saldoResult.credits
    };
  }

  /**
   * Extrai MAC Address de texto
   */
  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);
      
      console.log(`[${LAZER_PLAY_CONFIG.name}] Buscando MAC em: "${cleanData}"`);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Regex padrão
        if (this.macRegex.test(trimmed)) {
          const normalizedMac = trimmed.toLowerCase().replace(/-/g, ':');
          console.log(`[${LAZER_PLAY_CONFIG.name}] MAC encontrado: ${normalizedMac}`);
          return normalizedMac;
        }
        
        // MAC sem separadores (12 caracteres)
        const macWithoutSeparators = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toLowerCase();
          const formattedMac = `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
          console.log(`[${LAZER_PLAY_CONFIG.name}] MAC sem separadores: ${formattedMac}`);
          return formattedMac;
        }
      }
      
      console.log(`[${LAZER_PLAY_CONFIG.name}] Nenhum MAC encontrado`);
      return null;
      
    } catch (error) {
      console.error(`[${LAZER_PLAY_CONFIG.name}] Erro ao extrair MAC:`, error);
      return null;
    }
  }

  /**
   * Ativa dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      console.log(`[${LAZER_PLAY_CONFIG.name}] Iniciando ativação...`);
      console.log(`[${LAZER_PLAY_CONFIG.name}] MAC: ${macAddress}, Tier: ${tier}`);

      // Extrair MAC se necessário
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Garantir token
      const token = await this.ensureToken();

      // Lazer Play só tem pacote Anual (package_id: 1)
      const packageId = 1;
      const packageInfo = LAZER_PLAY_CONFIG.packages.YEAR;
      
      console.log(`[${LAZER_PLAY_CONFIG.name}] Ativando com pacote ${packageInfo.name} (ID: ${packageId})...`);

      // Payload de ativação
      const payload = {
        mac: mac,
        package_id: packageId
      };

      console.log(`[${LAZER_PLAY_CONFIG.name}] Payload:`, JSON.stringify(payload));

      const response = await this.client.post('/reseller/activate', payload, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[${LAZER_PLAY_CONFIG.name}] Resposta:`, response.status, JSON.stringify(response.data));

      // Verificar sucesso
      if ((response.status === 200 || response.status === 201) && response.data.error === false) {
        // Calcular data de expiração
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + packageInfo.days);
        const expireDateFormatted = expireDate.toLocaleDateString('pt-BR');
        
        return {
          success: true,
          message: this.formatSuccessMessage(mac, tier, packageInfo, expireDateFormatted),
          macAddress: mac,
          expireDate: expireDateFormatted,
          apiResponse: response.data
        };
      }

      // Tratar erros
      let errorMessage = 'Ativação falhou';
      
      if (response.data?.message) {
        errorMessage = typeof response.data.message === 'string' 
          ? response.data.message 
          : JSON.stringify(response.data.message);
      }

      // Traduzir erros comuns
      if (errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('does not exist')) {
        errorMessage = 'MAC inválido! Dispositivo não encontrado.';
      } else if (errorMessage.toLowerCase().includes('insufficient') || errorMessage.toLowerCase().includes('balance')) {
        errorMessage = 'Créditos insuficientes na conta Lazer Play.';
      } else if (errorMessage.toLowerCase().includes('already')) {
        errorMessage = 'Dispositivo já está ativado.';
      }

      return {
        success: false,
        error: errorMessage,
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[${LAZER_PLAY_CONFIG.name}] Erro na ativação:`, error.message);
      
      // Tratar erro HTTP
      if (error.response) {
        let errorMessage = 'Ativação falhou';
        
        if (error.response.data?.message) {
          errorMessage = typeof error.response.data.message === 'string'
            ? error.response.data.message
            : JSON.stringify(error.response.data.message);
        }

        // Traduzir erros comuns
        if (errorMessage.toLowerCase().includes('not found')) {
          errorMessage = 'MAC inválido! Dispositivo não encontrado.';
        }

        return {
          success: false,
          error: errorMessage,
          apiResponse: error.response.data
        };
      }
      
      // Se erro de autenticação, tentar login novamente
      if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Unauthorized')) {
        console.log(`[${LAZER_PLAY_CONFIG.name}] Tentando relogin...`);
        this.accessToken = null;
        this.tokenExpiryTime = null;
        
        const loginResult = await this.login();
        if (loginResult.success) {
          return this.activate(macAddress, tier);
        }
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
  formatSuccessMessage(macAddress, tier, packageInfo, expireDate) {
    let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> ${LAZER_PLAY_CONFIG.name}\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${packageInfo.name}\n`;
    message += `📅 <b>Válido até:</b> ${expireDate}\n`;
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo Lazer Play\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Cria ativador
 */
function createActivator(credentials) {
  return new LazerPlayActivator({
    email: credentials.email,
    password: credentials.password
  });
}

module.exports = {
  LazerPlayActivator,
  createActivator,
  LAZER_PLAY_CONFIG
};

// src/modules/assist_plus.js - Módulo de ativação Assist+

const axios = require('axios');

/**
 * Configurações do Assist+
 * Estrutura idêntica ao DreamTV/Lumina, sem CAPTCHA
 */
const ASSIST_PLUS_CONFIG = {
  name: 'Assist+',
  baseUrl: 'https://api.assistmaiss.com',
  
  // Pacotes disponíveis
  packages: {
    YEAR: { id: 1, name: 'Anual', days: 365 },
    LIFETIME: { id: 2, name: 'Vitalício', days: 36500 }
  },
  
  timeout: 30000
};

/**
 * Classe do ativador Assist+
 */
class AssistPlusActivator {
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
      baseURL: ASSIST_PLUS_CONFIG.baseUrl,
      timeout: ASSIST_PLUS_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
        'Origin': 'https://reseller.assistmaiss.com',
        'Referer': 'https://reseller.assistmaiss.com/'
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
   * Login na API
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[${ASSIST_PLUS_CONFIG.name}] Fazendo login...`);

      const response = await this.client.post('/reseller/login', {
        email: this.config.credentials.email,
        password: this.config.credentials.password
      });

      if ((response.status === 200 || response.status === 201) && response.data.error === false && response.data.message) {
        this.accessToken = response.data.message;
        // Token expira em 2 horas (definir 1h50 para segurança)
        this.tokenExpiryTime = Date.now() + (110 * 60 * 1000);
        
        console.log(`[${ASSIST_PLUS_CONFIG.name}] Login OK`);
        return { success: true, token: this.accessToken };
      }

      return {
        success: false,
        error: response.data?.message || 'Login falhou'
      };

    } catch (error) {
      console.error(`[${ASSIST_PLUS_CONFIG.name}] Erro no login:`, error.message);
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

      console.log(`[${ASSIST_PLUS_CONFIG.name}] Buscando saldo...`);

      const response = await this.client.get('/reseller', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if ((response.status === 200 || response.status === 201) && response.data.error === false) {
        const reseller = response.data.message?.reseller;
        
        if (reseller) {
          const credits = reseller.total_activations || 0;
          console.log(`[${ASSIST_PLUS_CONFIG.name}] Saldo: ${credits} créditos`);
          
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
      console.error(`[${ASSIST_PLUS_CONFIG.name}] Erro ao buscar saldo:`, error.message);
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
      
      console.log(`[${ASSIST_PLUS_CONFIG.name}] Buscando MAC em: "${cleanData}"`);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Regex padrão
        if (this.macRegex.test(trimmed)) {
          const normalizedMac = trimmed.toLowerCase().replace(/-/g, ':');
          console.log(`[${ASSIST_PLUS_CONFIG.name}] MAC encontrado: ${normalizedMac}`);
          return normalizedMac;
        }
        
        // MAC sem separadores (12 caracteres)
        const macWithoutSeparators = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toLowerCase();
          const formattedMac = `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
          console.log(`[${ASSIST_PLUS_CONFIG.name}] MAC sem separadores: ${formattedMac}`);
          return formattedMac;
        }
      }
      
      console.log(`[${ASSIST_PLUS_CONFIG.name}] Nenhum MAC encontrado`);
      return null;
      
    } catch (error) {
      console.error(`[${ASSIST_PLUS_CONFIG.name}] Erro ao extrair MAC:`, error);
      return null;
    }
  }

  /**
   * Ativa dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      console.log(`[${ASSIST_PLUS_CONFIG.name}] Iniciando ativação...`);
      console.log(`[${ASSIST_PLUS_CONFIG.name}] MAC: ${macAddress}, Tier: ${tier}`);

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

      // Obter package_id baseado no tier
      const packageInfo = ASSIST_PLUS_CONFIG.packages[tier] || ASSIST_PLUS_CONFIG.packages.YEAR;
      const packageId = packageInfo.id;
      
      console.log(`[${ASSIST_PLUS_CONFIG.name}] Ativando com pacote ${packageInfo.name} (ID: ${packageId})...`);

      // Payload de ativação
      const payload = {
        mac: mac,
        package_id: packageId
      };

      console.log(`[${ASSIST_PLUS_CONFIG.name}] Payload:`, JSON.stringify(payload));

      const response = await this.client.post('/reseller/activate', payload, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[${ASSIST_PLUS_CONFIG.name}] Resposta:`, response.status, JSON.stringify(response.data));

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
        errorMessage = 'Créditos insuficientes na conta Assist+.';
      } else if (errorMessage.toLowerCase().includes('already')) {
        errorMessage = 'Dispositivo já está ativado.';
      }

      return {
        success: false,
        error: errorMessage,
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[${ASSIST_PLUS_CONFIG.name}] Erro na ativação:`, error.message);
      
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
        console.log(`[${ASSIST_PLUS_CONFIG.name}] Tentando relogin...`);
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
    message += `📱 <b>Aplicativo:</b> ${ASSIST_PLUS_CONFIG.name}\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${packageInfo.name}\n`;
    message += `📅 <b>Válido até:</b> ${expireDate}\n`;
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo Assist+\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Cria ativador
 */
function createActivator(credentials) {
  return new AssistPlusActivator({
    email: credentials.email,
    password: credentials.password
  });
}

module.exports = {
  AssistPlusActivator,
  createActivator,
  ASSIST_PLUS_CONFIG
};

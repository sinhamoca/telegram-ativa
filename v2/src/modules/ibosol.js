// src/modules/ibosol.js - Módulo base para todos os apps IboSol (IBO Player, BOB Player, etc.)
const axios = require('axios');

class IboSolActivator {
  constructor(config = {}) {
    this.config = {
      name: config.name || 'IboSol App',
      baseUrl: 'https://backend.ibosol.com/api',
      credentials: {
        email: config.email,
        password: config.password
      },
      appModule: config.appModule || 'IBOPLAYER',
      appId: config.appId || 1,
      timeout: config.timeout || 15000
    };
    
    this.token = null;
    this.resellerData = null;
    
    // Mapeamento completo de aplicativos
    this.appMapping = {
      'IBOPLAYER': { id: 1, name: 'IBO Player' },
      'ABEPlayerTV': { id: 2, name: 'ABE Player TV' },
      'BOBPLAYER': { id: 3, name: 'BOB Player' },
      'MACPLAYER': { id: 4, name: 'MAC Player' },
      'VIRGINIA': { id: 5, name: 'Virginia' },
      'AllPlayer': { id: 6, name: 'All Player' },
      'HUSHPLAY': { id: 7, name: 'Hush Play' },
      'KTNPLAYER': { id: 8, name: 'KTN Player' },
      'FAMILYPLAYER': { id: 9, name: 'Family Player' },
      'IBOSSPLAYER': { id: 10, name: 'IBOSS Player' },
      'KING4KPLAYER': { id: 11, name: 'King 4K Player' },
      'IBOSTB': { id: 12, name: 'IBO STB' },
      'IBOXXPLAYER': { id: 13, name: 'IBOXX Player' },
      'DUPLEX': { id: 14, name: 'Duplex 24' },
      'BOBPRO': { id: 15, name: 'BOB Pro' },
      'BOBPREMIUM': { id: 16, name: 'BOB Premium' },
      'IBOSOLPlayer': { id: 17, name: 'IBOSOL Player' },
      'FLIXNET': { id: 18, name: 'Flixnet' },
      'SMARTONEPRO': { id: 19, name: 'SmartOne Pro' }
    };

    // Mapeamento de tiers para créditos
    this.tierCredits = {
      'YEAR': 1,      // Anual = 1 crédito
      'LIFETIME': 2   // Vitalício = 2 créditos
    };
    
    // Headers padrão
    this.defaultHeaders = {
      'Content-Type': 'application/json-patch+json',
      'Accept': 'application/json',
      'Origin': 'https://sandbox.ibosol.com',
      'Referer': 'https://sandbox.ibosol.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US',
      'Accept-Encoding': 'gzip, deflate, br'
    };
    
    // Regex para MAC (flexível)
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
    this.strictMacRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  }

  isConfigured() {
    return !!(this.config.credentials.email && this.config.credentials.password);
  }

  /**
   * Login na API
   */
  async login() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      console.log(`[${this.config.name}] Fazendo login...`);

      const response = await axios.post(
        `${this.config.baseUrl}/login`,
        {
          email: this.config.credentials.email,
          password: this.config.credentials.password
        },
        {
          headers: this.defaultHeaders,
          timeout: this.config.timeout
        }
      );

      let data = response.data;
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      if (data?.status === true && data?.token) {
        this.token = data.token;
        this.resellerData = data.data?.IBOReseller || {};
        
        console.log(`[${this.config.name}] Login OK - Créditos: ${this.resellerData.credit_point}`);
        
        return { 
          success: true, 
          token: this.token,
          credits: this.resellerData.credit_point || 0,
          resellerData: this.resellerData
        };
      }

      return {
        success: false,
        error: data?.msg || 'Login falhou'
      };

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
      const loginResult = await this.login();
      
      if (!loginResult.success) {
        return { success: false, error: loginResult.error };
      }

      return {
        success: true,
        credits: loginResult.credits,
        username: this.resellerData.email,
        name: this.resellerData.name,
        active: this.resellerData.status === 1
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Testa conexão
   */
  async testConnection() {
    const loginResult = await this.login();
    return {
      success: loginResult.success,
      error: loginResult.error,
      message: loginResult.success ? `Conexão OK - ${loginResult.credits} créditos` : 'Falha na conexão'
    };
  }

  /**
   * Extrai MAC address
   */
  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);
      
      console.log(`[${this.config.name}] Buscando MAC em: "${cleanData}"`);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Regex flexível (aceita MACs atípicos)
        if (this.macRegex.test(trimmed)) {
          const normalizedMac = trimmed.toLowerCase().replace(/-/g, ':');
          console.log(`[${this.config.name}] MAC encontrado: ${normalizedMac}`);
          return normalizedMac;
        }
        
        // MAC sem separadores (12 caracteres)
        const macWithoutSeparators = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toLowerCase();
          const formattedMac = `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
          console.log(`[${this.config.name}] MAC sem separadores: ${formattedMac}`);
          return formattedMac;
        }
      }
      
      console.log(`[${this.config.name}] Nenhum MAC encontrado`);
      return null;
      
    } catch (error) {
      console.error(`[${this.config.name}] Erro ao extrair MAC:`, error);
      return null;
    }
  }

  /**
   * Ativa dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      console.log(`[${this.config.name}] Iniciando ativação...`);
      console.log(`[${this.config.name}] MAC: ${macAddress}, Tier: ${tier}`);

      // Extrair MAC se necessário
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Login
      const loginResult = await this.login();
      if (!loginResult.success) {
        return {
          success: false,
          error: `Falha no login: ${loginResult.error}`
        };
      }

      // Determinar créditos e is_trial baseado no tier
      const creditPoints = this.tierCredits[tier] || 1;
      const isTrial = tier === 'LIFETIME' ? 2 : 3; // 2 = vitalício, 3 = anual
      
      console.log(`[${this.config.name}] Ativando com ${creditPoints} crédito(s), is_trial: ${isTrial}...`);

      // Payload de ativação
      const payload = {
        modules: [this.config.appModule],
        requestData: {
          is_trial: isTrial,
          macAddress: mac,
          appType: 'multi-app',
          email: '',
          creditPoints: creditPoints,
          isConfirmed: true,
          comment: `Ativação via Telegram - ${new Date().toISOString()}`,
          app_ids: [this.config.appId]
        }
      };

      console.log(`[${this.config.name}] Payload:`, JSON.stringify(payload));

      const response = await axios.post(
        `${this.config.baseUrl}/bulk-multi-app-activate`,
        payload,
        {
          headers: {
            ...this.defaultHeaders,
            'Authorization': `Bearer ${this.token}`
          },
          timeout: this.config.timeout
        }
      );

      let data = response.data;
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      console.log(`[${this.config.name}] Resposta:`, response.status, data);

      if (data?.status === true && data?.successful_count > 0) {
        const device = data.activated_devices?.[0] || {};
        
        return {
          success: true,
          message: this.formatSuccessMessage(data, mac, tier),
          expireDate: device.expire_date,
          apiResponse: data
        };
      }

      // Falha na ativação
      let errorMsg = data?.msg || 'Ativação falhou';
      
      if (data?.failed_activations?.length > 0) {
        const reasons = data.failed_activations.map(f => 
          f.error || f.reason || f.message || 'Erro desconhecido'
        ).join(', ');
        errorMsg = reasons;
      }

      return {
        success: false,
        error: errorMsg,
        apiResponse: data
      };

    } catch (error) {
      console.error(`[${this.config.name}] Erro na ativação:`, error.message);
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.msg || error.response.statusText,
          apiResponse: error.response.data
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
    const device = apiResponse.activated_devices?.[0] || {};
    
    let message = `🎉 <b>${this.config.name.toUpperCase()} ATIVADO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> ${this.config.name}\n`;
    message += `🔧 <b>MAC Address:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${tierName}\n`;
    
    if (device.expire_date) {
      const expireFormatted = new Date(device.expire_date).toLocaleDateString('pt-BR');
      message += `📅 <b>Válido até:</b> ${expireFormatted}\n`;
    }
    
    message += `\n✅ <b>Status:</b> Ativação confirmada!\n`;
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo ${this.config.name}\n`;
    message += `2. O app já deve estar liberado\n`;
    message += `3. Em caso de dúvidas, contate o suporte`;

    return message;
  }
}

// ==================== FÁBRICA DE ATIVADORES ====================

/**
 * Cria ativador para um app específico
 */
function createActivator(appType, credentials) {
  const apps = {
    'ibo_player': { appModule: 'IBOPLAYER', appId: 1, name: 'IBO Player' },
    'abe_player': { appModule: 'ABEPlayerTV', appId: 2, name: 'ABE Player TV' },
    'bob_player': { appModule: 'BOBPLAYER', appId: 3, name: 'BOB Player' },
    'mac_player': { appModule: 'MACPLAYER', appId: 4, name: 'MAC Player' },
    'virginia': { appModule: 'VIRGINIA', appId: 5, name: 'Virginia' },
    'all_player': { appModule: 'AllPlayer', appId: 6, name: 'All Player' },
    'hush_play': { appModule: 'HUSHPLAY', appId: 7, name: 'Hush Play' },
    'ktn_player': { appModule: 'KTNPLAYER', appId: 8, name: 'KTN Player' },
    'family_player': { appModule: 'FAMILYPLAYER', appId: 9, name: 'Family Player' },
    'iboss_player': { appModule: 'IBOSSPLAYER', appId: 10, name: 'IBOSS Player' },
    'king_4k': { appModule: 'KING4KPLAYER', appId: 11, name: 'King 4K Player' },
    'ibo_stb': { appModule: 'IBOSTB', appId: 12, name: 'IBO STB' },
    'iboxx_player': { appModule: 'IBOXXPLAYER', appId: 13, name: 'IBOXX Player' },
    'duplex': { appModule: 'DUPLEX', appId: 14, name: 'Duplex 24' },
    'bob_pro': { appModule: 'BOBPRO', appId: 15, name: 'BOB Pro' },
    'bob_premium': { appModule: 'BOBPREMIUM', appId: 16, name: 'BOB Premium' },
    'ibosol_player': { appModule: 'IBOSOLPlayer', appId: 17, name: 'IBOSOL Player' },
    'flixnet': { appModule: 'FLIXNET', appId: 18, name: 'Flixnet' },
    'smartone_pro': { appModule: 'SMARTONEPRO', appId: 19, name: 'SmartOne Pro' }
  };

  const appConfig = apps[appType];
  
  if (!appConfig) {
    throw new Error(`App desconhecido: ${appType}`);
  }

  return new IboSolActivator({
    ...appConfig,
    email: credentials.email,
    password: credentials.password
  });
}

/**
 * Lista todos os apps disponíveis
 */
function getAvailableApps() {
  return [
    { id: 'ibo_player', name: 'IBO Player' },
    { id: 'bob_player', name: 'BOB Player' },
    { id: 'bob_pro', name: 'BOB Pro' },
    { id: 'bob_premium', name: 'BOB Premium' },
    { id: 'abe_player', name: 'ABE Player TV' },
    { id: 'mac_player', name: 'MAC Player' },
    { id: 'virginia', name: 'Virginia' },
    { id: 'all_player', name: 'All Player' },
    { id: 'hush_play', name: 'Hush Play' },
    { id: 'ktn_player', name: 'KTN Player' },
    { id: 'family_player', name: 'Family Player' },
    { id: 'iboss_player', name: 'IBOSS Player' },
    { id: 'king_4k', name: 'King 4K Player' },
    { id: 'ibo_stb', name: 'IBO STB' },
    { id: 'iboxx_player', name: 'IBOXX Player' },
    { id: 'duplex', name: 'Duplex 24' },
    { id: 'ibosol_player', name: 'IBOSOL Player' },
    { id: 'flixnet', name: 'Flixnet' },
    { id: 'smartone_pro', name: 'SmartOne Pro' }
  ];
}

module.exports = {
  IboSolActivator,
  createActivator,
  getAvailableApps
};
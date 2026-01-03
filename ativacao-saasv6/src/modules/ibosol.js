// src/modules/ibosol.js - Módulo base para todos os apps IboSol (IBO Player, BOB Player, etc.)
// VERSÃO: Cloudflare Turnstile + Cache de Sessão (Dez/2025)
// - Turnstile resolvido via 2Captcha
// - Cache de sessão em memória (1 hora de validade)
// - Sem Tesseract (não funciona com Turnstile)

const axios = require('axios');
const config = require('../config');

// ╔════════════════════════════════════════════════════════════════════╗
// ║                         CONFIGURAÇÕES                              ║
// ╚════════════════════════════════════════════════════════════════════╝
const CONFIG = {
  // URLs
  baseUrl: 'https://backend.ibosol.com/api',
  loginPageUrl: 'https://b2bibosol.com/login',
  
  // Cloudflare Turnstile
  turnstileSitekey: '0x4AAAAAACJ-DZrldbwqTtbg',
  
  // Timeouts
  timeout: 15000,
  captchaTimeout: 120000,
  
  // Tentativas
  maxLoginAttempts: 3,
  
  // Cache de Sessão
  sessionTTL: 60 * 60 * 1000  // 1 hora em milissegundos
};

// ╔════════════════════════════════════════════════════════════════════╗
// ║                    GERENCIADOR DE SESSÕES                          ║
// ║           Cache em memória para reutilizar tokens válidos          ║
// ╚════════════════════════════════════════════════════════════════════╝

class SessionManager {
  constructor() {
    this.sessions = new Map();
    console.log('[SessionManager] ✅ Inicializado (cache em memória)');
  }

  getKey(email) {
    return email.toLowerCase().trim();
  }

  get(email) {
    const key = this.getKey(email);
    const session = this.sessions.get(key);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      console.log(`[SessionManager] ⏰ Sessão expirada para ${key}`);
      this.sessions.delete(key);
      return null;
    }

    session.lastUsedAt = Date.now();
    
    const minutesLeft = Math.round((session.expiresAt - Date.now()) / 60000);
    console.log(`[SessionManager] ✅ Sessão válida encontrada para ${key} (expira em ${minutesLeft}min)`);
    
    return session;
  }

  set(email, token, credits, resellerData) {
    const key = this.getKey(email);
    const now = Date.now();

    const session = {
      email: key,
      token,
      credits,
      resellerData,
      createdAt: now,
      expiresAt: now + CONFIG.sessionTTL,
      lastUsedAt: now
    };

    this.sessions.set(key, session);
    console.log(`[SessionManager] 💾 Sessão salva para ${key} (válida por ${CONFIG.sessionTTL / 60000}min)`);
    
    return session;
  }

  invalidate(email) {
    const key = this.getKey(email);
    
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
      console.log(`[SessionManager] 🗑️ Sessão invalidada para ${key}`);
      return true;
    }
    
    return false;
  }

  updateCredits(email, credits) {
    const key = this.getKey(email);
    const session = this.sessions.get(key);
    
    if (session) {
      session.credits = credits;
      session.lastUsedAt = Date.now();
    }
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`[SessionManager] 🧹 Limpeza: ${removed} sessões expiradas removidas`);
    }
    
    return removed;
  }

  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    
    for (const session of this.sessions.values()) {
      if (now < session.expiresAt) {
        valid++;
      } else {
        expired++;
      }
    }
    
    return { total: this.sessions.size, valid, expired };
  }
}

// Singleton global do SessionManager
const sessionManager = new SessionManager();

// Limpeza automática a cada 10 minutos
setInterval(() => {
  sessionManager.cleanup();
}, 10 * 60 * 1000);

// ╔════════════════════════════════════════════════════════════════════╗
// ║                       CLASSE PRINCIPAL                             ║
// ╚════════════════════════════════════════════════════════════════════╝

class IboSolActivator {
  constructor(config = {}) {
    this.config = {
      name: config.name || 'IboSol App',
      baseUrl: CONFIG.baseUrl,
      credentials: {
        email: config.email,
        password: config.password
      },
      appModule: config.appModule || 'IBOPLAYER',
      appId: config.appId || 1,
      timeout: config.timeout || CONFIG.timeout,
      captchaTimeout: config.captchaTimeout || CONFIG.captchaTimeout,
      maxLoginAttempts: config.maxLoginAttempts || CONFIG.maxLoginAttempts
    };

    this.token = null;
    this.resellerData = null;

    // Chave do 2Captcha - buscar de várias fontes possíveis
    this.twoCaptchaKey = config.twoCaptchaKey || 
                         process.env.CAPTCHA_2CAPTCHA_KEY || 
                         '';

    // Mapeamento de aplicativos
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
      'YEAR': 1,
      'LIFETIME': 2
    };

    // Headers padrão
    this.defaultHeaders = {
      'Content-Type': 'application/json-patch+json',
      'Accept': 'application/json',
      'Origin': 'https://b2bibosol.com',
      'Referer': 'https://b2bibosol.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US',
      'Accept-Encoding': 'gzip, deflate, br'
    };

    // Regex para MAC
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
  }

  isConfigured() {
    return !!(this.config.credentials.email && this.config.credentials.password);
  }

  isCaptchaConfigured() {
    return !!this.twoCaptchaKey;
  }

  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);

      for (const line of lines) {
        const trimmed = line.trim();

        if (this.macRegex.test(trimmed)) {
          return trimmed.toUpperCase().replace(/-/g, ':');
        }

        const macWithoutSeparators = trimmed.match(/^[0-9a-fA-F]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toUpperCase();
          return `${mac.substr(0, 2)}:${mac.substr(2, 2)}:${mac.substr(4, 2)}:${mac.substr(6, 2)}:${mac.substr(8, 2)}:${mac.substr(10, 2)}`;
        }
      }

      return null;
    } catch (error) {
      console.error(`[${this.config.name}] Erro ao extrair MAC:`, error);
      return null;
    }
  }

  isValidMac(mac) {
    return this.macRegex.test(mac);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== TURNSTILE ====================

  async solveTurnstile() {
    if (!this.isCaptchaConfigured()) {
      throw new Error('Chave 2Captcha não configurada. Defina CAPTCHA_2CAPTCHA_KEY no .env');
    }

    console.log(`[${this.config.name}] 🔄 Enviando Turnstile para 2Captcha...`);

    // Criar task
    const createParams = new URLSearchParams({
      key: this.twoCaptchaKey,
      method: 'turnstile',
      sitekey: CONFIG.turnstileSitekey,
      pageurl: CONFIG.loginPageUrl,
      json: '1'
    });

    const createResponse = await axios.get(
      `https://2captcha.com/in.php?${createParams.toString()}`,
      { timeout: 30000 }
    );

    if (createResponse.data.status !== 1) {
      throw new Error(`Erro ao criar task 2Captcha: ${createResponse.data.request}`);
    }

    const taskId = createResponse.data.request;
    console.log(`[${this.config.name}] ✅ Task criada: ${taskId}`);

    // Polling para resultado
    console.log(`[${this.config.name}] ⏳ Aguardando resolução do Turnstile...`);

    const startTime = Date.now();
    while (Date.now() - startTime < this.config.captchaTimeout) {
      await this.sleep(5000);

      const resultParams = new URLSearchParams({
        key: this.twoCaptchaKey,
        action: 'get',
        id: taskId,
        json: '1'
      });

      const resultResponse = await axios.get(
        `https://2captcha.com/res.php?${resultParams.toString()}`,
        { timeout: 10000 }
      );

      if (resultResponse.data.status === 1) {
        console.log(`[${this.config.name}] ✅ Turnstile resolvido!`);
        return resultResponse.data.request;
      }

      if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Erro 2Captcha: ${resultResponse.data.request}`);
      }

      console.log(`[${this.config.name}] ⏳ Aguardando 2Captcha...`);
    }

    throw new Error('Timeout aguardando resolução do Turnstile');
  }

  // ==================== LOGIN ====================

  isAuthError(errorMsg, statusCode) {
    if (statusCode === 401 || statusCode === 403) return true;
    if (!errorMsg) return false;
    const lowerMsg = errorMsg.toLowerCase();
    return lowerMsg.includes('unauthorized') ||
      lowerMsg.includes('unauthenticated') ||
      lowerMsg.includes('token') ||
      lowerMsg.includes('session');
  }

  isCredentialError(errorMsg) {
    if (!errorMsg) return false;
    const lowerMsg = errorMsg.toLowerCase();
    return lowerMsg.includes('invalid') ||
      lowerMsg.includes('incorrect') ||
      lowerMsg.includes('wrong') ||
      lowerMsg.includes('credentials') ||
      lowerMsg.includes('password') ||
      lowerMsg.includes('email');
  }

  async attemptLogin(turnstileToken) {
    console.log(`[${this.config.name}] 🔐 Enviando login com Turnstile...`);

    const response = await axios.post(
      `${this.config.baseUrl}/login`,
      {
        email: this.config.credentials.email,
        password: this.config.credentials.password,
        captcha_token: turnstileToken
      },
      {
        headers: this.defaultHeaders,
        timeout: this.config.timeout,
        validateStatus: () => true
      }
    );

    let data = response.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        // Manter como string se não for JSON
      }
    }

    console.log(`[${this.config.name}] Resposta login:`, response.status, data?.status, data?.msg || '');

    if (data?.status === true && data?.token) {
      this.token = data.token;
      this.resellerData = data.data?.IBOReseller || {};

      // Salvar sessão no cache
      sessionManager.set(
        this.config.credentials.email,
        this.token,
        this.resellerData.credit_point || 0,
        this.resellerData
      );

      return {
        success: true,
        token: this.token,
        credits: this.resellerData.credit_point || 0,
        resellerData: this.resellerData
      };
    }

    const errorMsg = data?.msg || data?.message || 'Login falhou';
    return {
      success: false,
      error: errorMsg,
      isCredentialError: this.isCredentialError(errorMsg)
    };
  }

  async login() {
    if (!this.isConfigured()) {
      return { success: false, error: 'Credenciais não configuradas' };
    }

    // PRIMEIRO: Verificar se já tem sessão válida no cache
    const cachedSession = sessionManager.get(this.config.credentials.email);

    if (cachedSession) {
      console.log(`[${this.config.name}] ⚡ Usando sessão em cache`);
      this.token = cachedSession.token;
      this.resellerData = cachedSession.resellerData;

      return {
        success: true,
        token: this.token,
        credits: cachedSession.credits,
        resellerData: this.resellerData,
        fromCache: true
      };
    }

    // Sem sessão válida - fazer login completo com Turnstile
    console.log(`[${this.config.name}] 🔐 Sessão não encontrada, fazendo login com Turnstile...`);
    return await this.loginFull();
  }

  async loginFull() {
    if (!this.isCaptchaConfigured()) {
      return { success: false, error: '2Captcha não configurado. Defina CAPTCHA_2CAPTCHA_KEY no .env' };
    }

    console.log(`[${this.config.name}] 🚀 Iniciando login (máx ${this.config.maxLoginAttempts} tentativas)`);

    let lastError = 'Erro desconhecido';

    for (let attempt = 1; attempt <= this.config.maxLoginAttempts; attempt++) {
      try {
        console.log(`[${this.config.name}] 🔄 Tentativa ${attempt}/${this.config.maxLoginAttempts}...`);

        // Resolver Turnstile
        const turnstileToken = await this.solveTurnstile();

        // Tentar login
        const loginResult = await this.attemptLogin(turnstileToken);

        if (loginResult.success) {
          console.log(`[${this.config.name}] ✅ Login OK! Créditos: ${loginResult.credits}`);
          return loginResult;
        }

        lastError = loginResult.error;

        // Se erro de credenciais, não adianta tentar novamente
        if (loginResult.isCredentialError) {
          console.log(`[${this.config.name}] ❌ Erro de credenciais: ${loginResult.error}`);
          return loginResult;
        }

        console.log(`[${this.config.name}] ❌ Falha: ${loginResult.error}`);

        // Aguardar antes de próxima tentativa
        if (attempt < this.config.maxLoginAttempts) {
          console.log(`[${this.config.name}] ⏳ Aguardando 5s antes de próxima tentativa...`);
          await this.sleep(5000);
        }

      } catch (error) {
        console.log(`[${this.config.name}] ❌ Erro na tentativa ${attempt}: ${error.message}`);
        lastError = error.message;

        if (attempt < this.config.maxLoginAttempts) {
          await this.sleep(5000);
        }
      }
    }

    return {
      success: false,
      error: `Login falhou após ${this.config.maxLoginAttempts} tentativas. Último erro: ${lastError}`
    };
  }

  // ==================== CONSULTAS ====================

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

  async testConnection() {
    const loginResult = await this.login();
    return {
      success: loginResult.success,
      error: loginResult.error,
      message: loginResult.success ?
        `Conexão OK! Créditos: ${loginResult.credits}` :
        'Falha na conexão'
    };
  }

  // ==================== ATIVAÇÃO ====================

  async activate(macAddressRaw, tier = 'YEAR') {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Credenciais não configuradas' };
      }

      const mac = this.extractMacAddress(macAddressRaw);
      if (!mac) {
        return { success: false, error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF' };
      }

      // Login (usa cache se disponível)
      const loginResult = await this.login();
      if (!loginResult.success) {
        return { success: false, error: `Falha no login: ${loginResult.error}` };
      }

      const creditPoints = this.tierCredits[tier] || 1;
      const isTrial = tier === 'LIFETIME' ? 2 : 3;

      console.log(`[${this.config.name}] Ativando MAC ${mac} com ${creditPoints} crédito(s)...`);

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

      const response = await axios.post(
        `${this.config.baseUrl}/bulk-multi-app-activate`,
        payload,
        {
          headers: {
            ...this.defaultHeaders,
            'Authorization': `Bearer ${this.token}`
          },
          timeout: this.config.timeout,
          validateStatus: () => true
        }
      );

      let data = response.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {}
      }

      console.log(`[${this.config.name}] Resposta:`, response.status, data);

      // Verificar se sessão expirou
      if (this.isAuthError(data?.msg || data?.message, response.status)) {
        console.log(`[${this.config.name}] ⚠️ Sessão inválida, fazendo login novamente...`);

        // Invalidar sessão e tentar novamente
        sessionManager.invalidate(this.config.credentials.email);

        // Re-login
        const newLoginResult = await this.loginFull();
        if (!newLoginResult.success) {
          return { success: false, error: `Falha no re-login: ${newLoginResult.error}` };
        }

        // Tentar ativação novamente
        const retryResponse = await axios.post(
          `${this.config.baseUrl}/bulk-multi-app-activate`,
          payload,
          {
            headers: {
              ...this.defaultHeaders,
              'Authorization': `Bearer ${this.token}`
            },
            timeout: this.config.timeout,
            validateStatus: () => true
          }
        );

        data = retryResponse.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {}
        }
      }

      // Verificar sucesso
      if ((response.status === 200 || response.status === 201) &&
        data?.status === true && data?.successful_count > 0) {
        const device = data.activated_devices?.[0] || {};

        // Atualizar créditos no cache
        sessionManager.updateCredits(
          this.config.credentials.email,
          (loginResult.credits || 0) - creditPoints
        );

        return {
          success: true,
          message: this.formatSuccessMessage(data, mac, tier),
          expireDate: device.expire_date,
          apiResponse: data
        };
      }

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

      return { success: false, error: error.message };
    }
  }

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
    password: credentials.password,
    twoCaptchaKey: credentials.twoCaptchaKey || process.env.CAPTCHA_2CAPTCHA_KEY
  });
}

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
  getAvailableApps,
  sessionManager,
  CONFIG
};
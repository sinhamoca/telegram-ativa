// src/modules/smartone.js - Módulo de ativação SmartOne IPTV
// Usa FlareSolverr para bypass Cloudflare + 2Captcha para Turnstile

const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../config');

// ============== CONFIGURAÇÕES ==============
const SMARTONE_CONFIG = {
  name: 'SmartOne IPTV',
  baseUrl: 'https://smartone-iptv.com',
  loginUrl: 'https://smartone-iptv.com/client/login/',
  activateUrl: 'https://smartone-iptv.com/plugin/smart_one/client_codes/activate/',
  turnstileSiteKey: '0x4AAAAAAAP8nNwILjC5_ux6',
  flareSolverrTimeout: 90000,
  captchaTimeout: 120000
};

// ============== FUNÇÕES AUXILIARES ==============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Traduz mensagens de erro do inglês para português
 */
function translateError(errorMessage) {
  if (!errorMessage) return 'Erro desconhecido';
  
  const translations = {
    // Erros de MAC
    'The application has not been launched in the device yet': 'O aplicativo ainda não foi iniciado no dispositivo. Verifique se o MAC está correto',
    'you may have entered a wrong MAC': 'você pode ter digitado um MAC incorreto',
    'Invalid MAC address': 'Endereço MAC inválido',
    'MAC address not found': 'Endereço MAC não encontrado',
    'Device not found': 'Dispositivo não encontrado',
    
    // Erros de código
    'Invalid code': 'Código inválido',
    'Code not found': 'Código não encontrado',
    'Code already used': 'Código já foi utilizado',
    'Code has expired': 'Código expirado',
    'This code has already been activated': 'Este código já foi ativado',
    
    // Erros de autenticação
    'Invalid credentials': 'Credenciais inválidas',
    'Login failed': 'Falha no login',
    'Session expired': 'Sessão expirada',
    'Access denied': 'Acesso negado',
    
    // Erros genéricos
    'Something went wrong': 'Algo deu errado',
    'Please try again': 'Por favor, tente novamente',
    'Server error': 'Erro no servidor',
    'Connection error': 'Erro de conexão',
    'Timeout': 'Tempo esgotado'
  };
  
  let translated = errorMessage;
  
  // Substituir todas as ocorrências conhecidas
  for (const [english, portuguese] of Object.entries(translations)) {
    if (translated.toLowerCase().includes(english.toLowerCase())) {
      translated = translated.replace(new RegExp(english, 'gi'), portuguese);
    }
  }
  
  return translated;
}

/**
 * Gerenciador de Sessão SmartOne
 * Cada ativação cria e destrói uma sessão (mais seguro com FlareSolverr)
 */
class SmartOneSessionManager {
  constructor() {
    this.flareSolverrUrl = null;
    this.twoCaptchaKey = null;
  }

  /**
   * Configura URLs e keys
   */
  configure(flareSolverrUrl, twoCaptchaKey) {
    this.flareSolverrUrl = flareSolverrUrl;
    this.twoCaptchaKey = twoCaptchaKey;
  }

  /**
   * Criar sessão no FlareSolverr
   */
  async createSession() {
    console.log(`[${SMARTONE_CONFIG.name}] Criando sessão FlareSolverr...`);
    
    const sessionId = `smartone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await axios.post(this.flareSolverrUrl, {
        cmd: 'sessions.create',
        session: sessionId
      }, { timeout: 30000 });
      
      console.log(`[${SMARTONE_CONFIG.name}] Sessão criada: ${sessionId}`);
      return sessionId;
    } catch (error) {
      if (error.response?.data?.message?.includes('already exists')) {
        return sessionId;
      }
      throw new Error(`Falha ao criar sessão FlareSolverr: ${error.message}`);
    }
  }

  /**
   * Destruir sessão no FlareSolverr
   */
  async destroySession(sessionId) {
    if (!sessionId) return;
    
    console.log(`[${SMARTONE_CONFIG.name}] Destruindo sessão...`);
    
    try {
      await axios.post(this.flareSolverrUrl, {
        cmd: 'sessions.destroy',
        session: sessionId
      }, { timeout: 10000 });
      
      console.log(`[${SMARTONE_CONFIG.name}] Sessão destruída`);
    } catch (error) {
      console.log(`[${SMARTONE_CONFIG.name}] Aviso: Erro ao destruir sessão: ${error.message}`);
    }
  }

  /**
   * Bypass Cloudflare + acessar página de login
   */
  async bypassCloudflare(sessionId) {
    console.log(`[${SMARTONE_CONFIG.name}] Bypass Cloudflare...`);
    
    const response = await axios.post(this.flareSolverrUrl, {
      cmd: 'request.get',
      url: SMARTONE_CONFIG.loginUrl,
      session: sessionId,
      maxTimeout: SMARTONE_CONFIG.flareSolverrTimeout
    }, { timeout: SMARTONE_CONFIG.flareSolverrTimeout + 10000 });
    
    if (response.data.status !== 'ok') {
      throw new Error(`FlareSolverr falhou: ${response.data.message}`);
    }
    
    const solution = response.data.solution;
    const $ = cheerio.load(solution.response);
    const csrfToken = $('input[name="_csrf_token"]').val();
    
    if (!csrfToken) {
      throw new Error('CSRF token não encontrado na página de login');
    }
    
    console.log(`[${SMARTONE_CONFIG.name}] Cloudflare OK, CSRF obtido`);
    
    return {
      csrfToken,
      userAgent: solution.userAgent,
      cookies: solution.cookies
    };
  }

  /**
   * Resolver Turnstile via 2Captcha
   */
  async solveTurnstile() {
    console.log(`[${SMARTONE_CONFIG.name}] Resolvendo Turnstile...`);
    
    // Enviar captcha
    const submitResponse = await axios.get('https://2captcha.com/in.php', {
      params: {
        key: this.twoCaptchaKey,
        method: 'turnstile',
        sitekey: SMARTONE_CONFIG.turnstileSiteKey,
        pageurl: SMARTONE_CONFIG.loginUrl,
        json: 1
      }
    });
    
    if (submitResponse.data.status !== 1) {
      throw new Error(`2Captcha submit falhou: ${submitResponse.data.request}`);
    }
    
    const captchaId = submitResponse.data.request;
    console.log(`[${SMARTONE_CONFIG.name}] Captcha enviado, ID: ${captchaId}`);
    
    // Polling
    const startTime = Date.now();
    while (Date.now() - startTime < SMARTONE_CONFIG.captchaTimeout) {
      await sleep(5000);
      
      const resultResponse = await axios.get('https://2captcha.com/res.php', {
        params: {
          key: this.twoCaptchaKey,
          action: 'get',
          id: captchaId,
          json: 1
        }
      });
      
      if (resultResponse.data.status === 1) {
        console.log(`[${SMARTONE_CONFIG.name}] Turnstile resolvido!`);
        return resultResponse.data.request;
      }
      
      if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${resultResponse.data.request}`);
      }
    }
    
    throw new Error('Timeout aguardando resolução do Turnstile');
  }

  /**
   * Fazer login
   */
  async doLogin(sessionId, csrfToken, turnstileToken, email, password) {
    console.log(`[${SMARTONE_CONFIG.name}] Realizando login...`);
    
    const payload = new URLSearchParams({
      '_csrf_token': csrfToken,
      'username': email,
      'password': password,
      'cf-turnstile-response': turnstileToken
    }).toString();
    
    const response = await axios.post(this.flareSolverrUrl, {
      cmd: 'request.post',
      url: SMARTONE_CONFIG.loginUrl,
      session: sessionId,
      maxTimeout: SMARTONE_CONFIG.flareSolverrTimeout,
      postData: payload
    }, { timeout: SMARTONE_CONFIG.flareSolverrTimeout + 10000 });
    
    if (response.data.status !== 'ok') {
      throw new Error(`Login falhou: ${response.data.message}`);
    }
    
    const solution = response.data.solution;
    const isSuccess = solution.url && 
                      solution.url.includes('/client/') && 
                      !solution.url.includes('/login/');
    
    if (!isSuccess) {
      const $ = cheerio.load(solution.response);
      const errorMsg = $('.alert-danger').text().trim().replace(/×/g, '').trim();
      throw new Error(`Login falhou: ${errorMsg || 'Credenciais inválidas'}`);
    }
    
    console.log(`[${SMARTONE_CONFIG.name}] Login OK!`);
    
    return {
      cookies: solution.cookies,
      html: solution.response
    };
  }

  /**
   * Acessar página de ativação para pegar CSRF token
   */
  async getActivationPage(sessionId) {
    console.log(`[${SMARTONE_CONFIG.name}] Acessando página de ativação...`);
    
    const response = await axios.post(this.flareSolverrUrl, {
      cmd: 'request.get',
      url: SMARTONE_CONFIG.activateUrl,
      session: sessionId,
      maxTimeout: SMARTONE_CONFIG.flareSolverrTimeout
    }, { timeout: SMARTONE_CONFIG.flareSolverrTimeout + 10000 });
    
    if (response.data.status !== 'ok') {
      throw new Error(`Falha ao acessar página de ativação: ${response.data.message}`);
    }
    
    const solution = response.data.solution;
    const $ = cheerio.load(solution.response);
    let csrfToken = $('input[name="_csrf_token"]').val();
    
    if (!csrfToken) {
      // Tentar página /client/
      console.log(`[${SMARTONE_CONFIG.name}] CSRF não encontrado, tentando /client/...`);
      
      const clientResponse = await axios.post(this.flareSolverrUrl, {
        cmd: 'request.get',
        url: `${SMARTONE_CONFIG.baseUrl}/client/`,
        session: sessionId,
        maxTimeout: SMARTONE_CONFIG.flareSolverrTimeout
      }, { timeout: SMARTONE_CONFIG.flareSolverrTimeout + 10000 });
      
      if (clientResponse.data.status === 'ok') {
        const $client = cheerio.load(clientResponse.data.solution.response);
        csrfToken = $client('input[name="_csrf_token"]').val();
      }
      
      if (!csrfToken) {
        throw new Error('CSRF token não encontrado para ativação');
      }
    }
    
    console.log(`[${SMARTONE_CONFIG.name}] CSRF de ativação obtido`);
    return { csrfToken };
  }

  /**
   * Ativar código
   */
  async activateCode(sessionId, csrfToken, mac, code) {
    console.log(`[${SMARTONE_CONFIG.name}] Ativando código...`);
    console.log(`[${SMARTONE_CONFIG.name}] MAC: ${mac}, Código: ${code}`);
    
    const payload = new URLSearchParams({
      '_csrf_token': csrfToken,
      'mac': mac,
      'code': code
    }).toString();
    
    const response = await axios.post(this.flareSolverrUrl, {
      cmd: 'request.post',
      url: SMARTONE_CONFIG.activateUrl,
      session: sessionId,
      maxTimeout: SMARTONE_CONFIG.flareSolverrTimeout,
      postData: payload
    }, { timeout: SMARTONE_CONFIG.flareSolverrTimeout + 10000 });
    
    if (response.data.status !== 'ok') {
      throw new Error(`Ativação falhou: ${response.data.message}`);
    }
    
    const solution = response.data.solution;
    const $ = cheerio.load(solution.response);
    
    const errorAlert = $('.alert-danger').text().trim().replace(/×/g, '').trim();
    const successAlert = $('.alert-success').text().trim().replace(/×/g, '').trim();
    
    return {
      success: !errorAlert && (successAlert || solution.url.includes('/client/')),
      errorMessage: errorAlert || null,
      successMessage: successAlert || null
    };
  }

  /**
   * Processo completo de ativação
   */
  async fullActivation(email, password, mac, code) {
    let sessionId = null;
    
    try {
      // 1. Criar sessão
      sessionId = await this.createSession();
      
      // 2. Bypass Cloudflare
      const { csrfToken: loginCsrf } = await this.bypassCloudflare(sessionId);
      
      // 3. Resolver Turnstile
      const turnstileToken = await this.solveTurnstile();
      
      // 4. Login
      await this.doLogin(sessionId, loginCsrf, turnstileToken, email, password);
      
      // 5. Pegar CSRF da página de ativação
      const { csrfToken: activateCsrf } = await this.getActivationPage(sessionId);
      
      // 6. Ativar código
      const result = await this.activateCode(sessionId, activateCsrf, mac, code);
      
      return result;
      
    } finally {
      // 7. Sempre destruir sessão
      if (sessionId) {
        await this.destroySession(sessionId);
      }
    }
  }

  /**
   * Testar conexão (apenas verifica se consegue passar pelo Cloudflare)
   */
  async testConnection(email, password) {
    let sessionId = null;
    
    try {
      sessionId = await this.createSession();
      const { csrfToken } = await this.bypassCloudflare(sessionId);
      const turnstileToken = await this.solveTurnstile();
      await this.doLogin(sessionId, csrfToken, turnstileToken, email, password);
      
      return {
        success: true,
        message: 'Conexão OK - Login realizado com sucesso'
      };
    } catch (error) {
      return {
        success: false,
        error: translateError(error.message)
      };
    } finally {
      if (sessionId) {
        await this.destroySession(sessionId);
      }
    }
  }
}

// Singleton do gerenciador de sessão
const sessionManager = new SmartOneSessionManager();

/**
 * Classe do Ativador SmartOne
 */
class SmartOneActivator {
  constructor(globalCredentials) {
    this.globalEmail = globalCredentials.email;
    this.globalPassword = globalCredentials.password;
    
    // Configurar session manager com URLs do config
    sessionManager.configure(
      config.FLARESOLVERR?.url || 'http://95.217.161.109:8191/v1',
      config.TWOCAPTCHA?.key || ''
    );
  }

  /**
   * Extrai e formata MAC address
   */
  extractMacAddress(input) {
    if (!input) return null;
    
    // Remove espaços e caracteres especiais
    let mac = input.toString().trim().toUpperCase();
    
    // Remove separadores comuns
    mac = mac.replace(/[:\-\s\.]/g, '');
    
    // Verifica se tem 12 caracteres hex
    if (!/^[0-9A-F]{12}$/.test(mac)) {
      return null;
    }
    
    // Formata como XX:XX:XX:XX:XX:XX
    return mac.match(/.{2}/g).join(':');
  }

  /**
   * Testa conexão
   */
  async testConnection() {
    const result = await sessionManager.testConnection(this.globalEmail, this.globalPassword);
    return {
      success: result.success,
      message: result.success ? result.message : result.error
    };
  }

  /**
   * Ativa dispositivo usando código
   * @param {string} macAddress - MAC do dispositivo
   * @param {string} code - Código de ativação
   * @param {string} tier - Tier da ativação (YEAR ou LIFETIME)
   */
  async activate(macAddress, code, tier = 'YEAR') {
    try {
      console.log(`[${SMARTONE_CONFIG.name}] Iniciando ativação...`);

      // Extrair MAC
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Executar ativação completa
      const result = await sessionManager.fullActivation(
        this.globalEmail,
        this.globalPassword,
        mac,
        code
      );

      if (result.success) {
        return {
          success: true,
          message: this.formatSuccessMessage(mac, code, result.successMessage, tier),
          macAddress: mac,
          code: code,
          tier: tier,
          apiResponse: result
        };
      }

      return {
        success: false,
        error: translateError(result.errorMessage) || 'Ativação falhou'
      };

    } catch (error) {
      console.error(`[${SMARTONE_CONFIG.name}] Erro:`, error.message);
      return { success: false, error: translateError(error.message) };
    }
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(macAddress, code, apiMessage, tier = 'YEAR') {
    // Calcular data de validade
    let validadeStr;
    if (tier === 'LIFETIME') {
      validadeStr = 'VITALÍCIO';
    } else {
      // Anual: hoje + 365 dias
      const dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + 365);
      validadeStr = dataValidade.toLocaleDateString('pt-BR');
    }

    let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> ${SMARTONE_CONFIG.name}\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `🔑 <b>Código:</b> <code>${code}</code>\n`;
    message += `📅 <b>Validade:</b> ${validadeStr}\n`;
    
    if (apiMessage) {
      message += `💬 <b>Resposta:</b> ${apiMessage}\n`;
    }
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo SmartOne IPTV\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Factory function para criar ativador
 */
function createActivator(credentials) {
  return new SmartOneActivator(credentials);
}

module.exports = {
  createActivator,
  SmartOneActivator,
  SmartOneSessionManager,
  SMARTONE_CONFIG
};
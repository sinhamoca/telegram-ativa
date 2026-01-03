// src/modules/duplecast.js - Módulo de ativação Duplecast
// NOTA: Este módulo usa login GLOBAL + códigos individuais por revendedor

const axios = require('axios');
const { solveRecaptchaV2 } = require('../utils/captchaSolver');

/**
 * Configurações do Duplecast
 */
const DUPLECAST_CONFIG = {
  name: 'Duplecast',
  baseUrl: 'https://duplecast.com',
  loginUrl: 'https://duplecast.com/client/login/',
  activateUrl: 'https://duplecast.com/plugin/duplecast/client_codes/activate/',
  siteKey: '6LeR4qQdAAAAAAZghWJl06voIi3_2nUjpKgNcT-z',
  timeout: 30000
};

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
 * Gerenciador de sessão GLOBAL (singleton)
 * Todos os revendedores compartilham a mesma sessão
 */
class DuplecastSessionManager {
  constructor() {
    this.cookies = {};
    this.loggedIn = false;
    this.loginInProgress = false;
    this.lastLoginAttempt = null;
    
    // Cliente HTTP
    this.http = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
      },
      timeout: DUPLECAST_CONFIG.timeout,
      maxRedirects: 0,
      validateStatus: status => status < 400 || status === 302
    });
  }

  /**
   * Converte cookies para string
   */
  getCookieString() {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  /**
   * Parseia cookies do header set-cookie
   */
  parseCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookies.forEach(cookie => {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (match) {
        this.cookies[match[1]] = match[2];
      }
    });
  }

  /**
   * Extrai CSRF token de uma página
   */
  async getCsrfToken(url) {
    const response = await this.http.get(url, {
      headers: { Cookie: this.getCookieString() }
    });

    this.parseCookies(response.headers['set-cookie']);
    const html = response.data;

    const patterns = [
      /name=["']_csrf_token["'][^>]*value=["']([^"']+)["']/i,
      /value=["']([^"']+)["'][^>]*name=["']_csrf_token["']/i,
      /name="_csrf_token"[^>]+value="([^"]+)"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Verifica se a sessão atual é válida
   */
  async isSessionValid() {
    try {
      if (Object.keys(this.cookies).length === 0) {
        return false;
      }

      const response = await this.http.get(`${DUPLECAST_CONFIG.baseUrl}/client/`, {
        headers: { Cookie: this.getCookieString() },
        maxRedirects: 0,
        validateStatus: () => true
      });
      
      const isValid = response.status === 200 && !response.data.includes('/login');
      console.log(`[${DUPLECAST_CONFIG.name}] Sessão válida: ${isValid}`);
      return isValid;
    } catch (error) {
      console.error(`[${DUPLECAST_CONFIG.name}] Erro ao verificar sessão:`, error.message);
      return false;
    }
  }

  /**
   * Faz login no sistema (requer CAPTCHA)
   */
  async login(username, password) {
    // Evitar logins simultâneos
    if (this.loginInProgress) {
      console.log(`[${DUPLECAST_CONFIG.name}] Login já em andamento, aguardando...`);
      // Aguardar até 2 minutos pelo login em andamento
      for (let i = 0; i < 24; i++) {
        await this.sleep(5000);
        if (!this.loginInProgress) break;
      }
      return { success: this.loggedIn, message: 'Usou sessão do login anterior' };
    }

    this.loginInProgress = true;
    this.lastLoginAttempt = Date.now();

    try {
      console.log(`[${DUPLECAST_CONFIG.name}] Iniciando login...`);

      // 1. Obter CSRF token
      console.log(`[${DUPLECAST_CONFIG.name}] Obtendo CSRF token...`);
      const csrfToken = await this.getCsrfToken(DUPLECAST_CONFIG.loginUrl);
      
      if (!csrfToken) {
        return { success: false, error: 'CSRF token não encontrado' };
      }
      console.log(`[${DUPLECAST_CONFIG.name}] CSRF obtido`);

      // 2. Resolver CAPTCHA
      console.log(`[${DUPLECAST_CONFIG.name}] Resolvendo reCAPTCHA...`);
      const recaptchaToken = await solveRecaptchaV2(
        DUPLECAST_CONFIG.siteKey,
        DUPLECAST_CONFIG.loginUrl
      );
      console.log(`[${DUPLECAST_CONFIG.name}] CAPTCHA resolvido!`);

      // 3. Enviar login
      console.log(`[${DUPLECAST_CONFIG.name}] Enviando credenciais...`);
      const loginData = new URLSearchParams({
        '_csrf_token': csrfToken,
        'username': username,
        'password': password,
        'remember_me': 'true',
        'g-recaptcha-response': recaptchaToken
      });

      const response = await this.http.post(DUPLECAST_CONFIG.loginUrl, loginData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': DUPLECAST_CONFIG.baseUrl,
          'Referer': DUPLECAST_CONFIG.loginUrl,
          'Cookie': this.getCookieString()
        }
      });

      this.parseCookies(response.headers['set-cookie']);

      // 4. Verificar sucesso
      if (response.status === 302) {
        const redirectUrl = response.headers['location'] || '';
        if (redirectUrl.includes('/client/') && !redirectUrl.includes('/login')) {
          // Seguir redirect para completar sessão
          const finalRes = await this.http.get(redirectUrl, {
            headers: { Cookie: this.getCookieString() },
            maxRedirects: 5,
            validateStatus: () => true
          });
          this.parseCookies(finalRes.headers['set-cookie']);
          
          this.loggedIn = true;
          console.log(`[${DUPLECAST_CONFIG.name}] Login OK!`);
          return { success: true, message: 'Login realizado com sucesso!' };
        }
      }

      return { success: false, error: 'Login falhou - verificar credenciais' };

    } catch (error) {
      console.error(`[${DUPLECAST_CONFIG.name}] Erro no login:`, error.message);
      return { success: false, error: error.message };
    } finally {
      this.loginInProgress = false;
    }
  }

  /**
   * Garante que temos uma sessão válida
   */
  async ensureSession(username, password) {
    if (await this.isSessionValid()) {
      return { success: true };
    }

    console.log(`[${DUPLECAST_CONFIG.name}] Sessão inválida, fazendo login...`);
    return await this.login(username, password);
  }

  /**
   * Ativa um dispositivo com código
   */
  async activate(mac, code) {
    try {
      console.log(`[${DUPLECAST_CONFIG.name}] Iniciando ativação...`);
      console.log(`[${DUPLECAST_CONFIG.name}] MAC: ${mac}, Código: ${code}`);

      // 1. Obter CSRF da página de ativação
      console.log(`[${DUPLECAST_CONFIG.name}] Obtendo CSRF da página de ativação...`);
      const csrfToken = await this.getCsrfToken(DUPLECAST_CONFIG.activateUrl);

      if (!csrfToken) {
        return { success: false, error: 'CSRF token não encontrado na página de ativação' };
      }

      // 2. Enviar ativação
      console.log(`[${DUPLECAST_CONFIG.name}] Enviando ativação...`);
      const activateData = new URLSearchParams({
        '_csrf_token': csrfToken,
        'mac': mac,
        'code': code
      });

      const response = await this.http.post(DUPLECAST_CONFIG.activateUrl, activateData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': DUPLECAST_CONFIG.baseUrl,
          'Referer': DUPLECAST_CONFIG.activateUrl,
          'Cookie': this.getCookieString()
        },
        maxRedirects: 5,
        validateStatus: () => true
      });

      this.parseCookies(response.headers['set-cookie']);
      const html = response.data;

      // 3. Verificar resultado
      // Verificar erros
      const errorPatterns = [
        /alert-danger[^>]*>[\s\S]*?<button[^>]*>[\s\S]*?<\/button>([\s\S]*?)<\/div>/i,
        /alert-danger[^>]*>([\s\S]*?)<\/div>/i,
        /error[^>]*>([\s\S]*?)<\//i,
      ];

      for (const pattern of errorPatterns) {
        const match = html.match(pattern);
        if (match) {
          let errorMsg = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (errorMsg) {
            console.log(`[${DUPLECAST_CONFIG.name}] Erro: ${errorMsg}`);
            return { success: false, error: errorMsg };
          }
        }
      }

      // Verificar sucesso
      const successPatterns = [
        /alert-success[^>]*>[\s\S]*?<button[^>]*>[\s\S]*?<\/button>([\s\S]*?)<\/div>/i,
        /alert-success[^>]*>([\s\S]*?)<\/div>/i,
        /success[^>]*>([\s\S]*?)<\//i,
      ];

      for (const pattern of successPatterns) {
        const match = html.match(pattern);
        if (match) {
          let successMsg = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (successMsg) {
            console.log(`[${DUPLECAST_CONFIG.name}] Sucesso: ${successMsg}`);
            return { success: true, message: successMsg };
          }
        }
      }

      // Verificar se não há erro no HTML
      if (response.status === 200 && !html.includes('alert-danger')) {
        return { success: true, message: 'Ativação enviada com sucesso' };
      }

      return { success: false, error: 'Erro não identificado na ativação' };

    } catch (error) {
      console.error(`[${DUPLECAST_CONFIG.name}] Erro na ativação:`, error.message);
      return { success: false, error: error.message };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Instância SINGLETON do gerenciador de sessão
const sessionManager = new DuplecastSessionManager();

/**
 * Classe do ativador Duplecast
 * Esta classe é instanciada por revendedor, mas usa o sessionManager global
 */
class DuplecastActivator {
  constructor(globalCredentials) {
    this.globalEmail = globalCredentials.email;
    this.globalPassword = globalCredentials.password;
    
    // Regex para validar MAC
    this.macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  }

  /**
   * Extrai MAC Address de texto
   */
  extractMacAddress(rawData) {
    try {
      const cleanData = rawData.trim().replace(/\s+/g, ' ');
      const lines = cleanData.split(/[\n\r\s,;]/);
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (this.macRegex.test(trimmed)) {
          return trimmed.toUpperCase().replace(/-/g, ':');
        }
        
        const macWithoutSeparators = trimmed.match(/^[0-9a-zA-Z]{12}$/);
        if (macWithoutSeparators) {
          const mac = macWithoutSeparators[0].toUpperCase();
          return `${mac.substr(0,2)}:${mac.substr(2,2)}:${mac.substr(4,2)}:${mac.substr(6,2)}:${mac.substr(8,2)}:${mac.substr(10,2)}`;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Testa conexão (faz login se necessário)
   */
  async testConnection() {
    const result = await sessionManager.ensureSession(this.globalEmail, this.globalPassword);
    return {
      success: result.success,
      error: result.error,
      message: result.success ? 'Conexão OK (sessão ativa)' : 'Falha na conexão'
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
      console.log(`[${DUPLECAST_CONFIG.name}] Preparando ativação...`);

      // Extrair MAC
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Garantir sessão válida
      const sessionResult = await sessionManager.ensureSession(this.globalEmail, this.globalPassword);
      if (!sessionResult.success) {
        return {
          success: false,
          error: `Falha no login: ${translateError(sessionResult.error)}`
        };
      }

      // Ativar
      const activateResult = await sessionManager.activate(mac, code);

      if (activateResult.success) {
        return {
          success: true,
          message: this.formatSuccessMessage(mac, code, activateResult.message, tier),
          macAddress: mac,
          code: code,
          tier: tier,
          apiResponse: activateResult
        };
      }

      return {
        success: false,
        error: translateError(activateResult.error) || 'Ativação falhou'
      };

    } catch (error) {
      console.error(`[${DUPLECAST_CONFIG.name}] Erro:`, error.message);
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
    message += `📱 <b>Aplicativo:</b> ${DUPLECAST_CONFIG.name}\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `🔑 <b>Código:</b> <code>${code}</code>\n`;
    message += `📅 <b>Validade:</b> ${validadeStr}\n`;
    
    if (apiMessage) {
      message += `💬 <b>Resposta:</b> ${apiMessage}\n`;
    }
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo Duplecast\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Cria ativador Duplecast
 * @param {object} globalCredentials - Credenciais globais { email, password }
 */
function createActivator(globalCredentials) {
  return new DuplecastActivator(globalCredentials);
}

/**
 * Obtém o gerenciador de sessão (para uso avançado)
 */
function getSessionManager() {
  return sessionManager;
}

module.exports = {
  DuplecastActivator,
  DuplecastSessionManager,
  createActivator,
  getSessionManager,
  DUPLECAST_CONFIG
};
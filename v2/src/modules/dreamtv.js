// src/modules/dreamtv.js - Módulo DreamTV
// API REST com JWT (sem CAPTCHA)

const https = require('https');

class DreamTVActivator {
  constructor(config = {}) {
    this.config = {
      name: 'DreamTV',
      baseUrl: 'api.dreamtv.life',
      credentials: {
        email: config.email,
        password: config.password
      },
      timeout: config.timeout || 15000
    };
    
    this.accessToken = null;
    this.tokenExpiryTime = null;
    
    // Mapeamento de tiers para package_id
    this.tierPackages = {
      'LIFETIME': 2,  // Vitalício = 2
      'YEAR': 3       // Anual = 3
    };
    
    // Regex para validar MAC address (aceita MACs atípicos)
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
  }

  isConfigured() {
    return !!(this.config.credentials.email && this.config.credentials.password);
  }

  /**
   * Faz requisição HTTP
   */
  request(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.config.baseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('Timeout na requisição'));
      });

      req.on('error', reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  /**
   * Verifica se o token é válido
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

      console.log(`[DreamTV] Fazendo login...`);
      
      const response = await this.request('POST', '/reseller/login', {
        email: this.config.credentials.email,
        password: this.config.credentials.password
      });

      if ((response.status === 200 || response.status === 201) && response.data.error === false && response.data.message) {
        this.accessToken = response.data.message;
        // Token expira em 2 horas (definir 1h50 para segurança)
        this.tokenExpiryTime = Date.now() + (110 * 60 * 1000);
        
        console.log(`[DreamTV] Login OK`);
        return { success: true, token: this.accessToken };
      }

      return {
        success: false,
        error: response.data?.message || 'Login falhou'
      };

    } catch (error) {
      console.error('[DreamTV] Erro no login:', error.message);
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

      console.log(`[DreamTV] Buscando saldo...`);

      const response = await this.request('GET', '/reseller', null, token);

      if ((response.status === 200 || response.status === 201) && response.data.error === false) {
        const reseller = response.data.message?.reseller;
        
        if (reseller) {
          const credits = reseller.total_activations || 0;
          console.log(`[DreamTV] Saldo: ${credits} créditos`);
          
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
      console.error('[DreamTV] Erro ao buscar saldo:', error.message);
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
        
        // MAC sem separadores (12 caracteres alfanuméricos)
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
   * Retorna informações do pacote
   */
  getPackageInfo(packageId) {
    const packages = {
      2: { name: 'Vitalício', days: null },
      3: { name: 'Anual', days: 365 }
    };
    return packages[packageId] || packages[3];
  }

  /**
   * Ativa dispositivo
   */
  async activate(macAddress, tier = 'YEAR') {
    try {
      console.log(`[DreamTV] Iniciando ativação...`);
      console.log(`[DreamTV] MAC: ${macAddress}, Tier: ${tier}`);

      // Extrair e validar MAC
      const mac = this.extractMacAddress(macAddress);
      if (!mac) {
        return {
          success: false,
          error: 'MAC Address inválido. Use formato: AA:BB:CC:DD:EE:FF'
        };
      }

      // Garantir token
      const token = await this.ensureToken();

      // Determinar package_id baseado no tier
      const packageId = this.tierPackages[tier] || 3; // Default: Anual
      const packageInfo = this.getPackageInfo(packageId);
      
      console.log(`[DreamTV] Ativando com pacote ${packageInfo.name} (ID: ${packageId})...`);

      // Payload de ativação
      const payload = {
        mac: mac,
        package_id: packageId
      };

      console.log(`[DreamTV] Payload:`, JSON.stringify(payload));

      const response = await this.request('POST', '/reseller/activate', payload, token);

      console.log(`[DreamTV] Resposta:`, response.status, JSON.stringify(response.data));

      // Verificar sucesso
      if ((response.status === 200 || response.status === 201) && response.data.error === false) {
        // Calcular data de expiração (null para vitalício)
        let expireDateFormatted;
        if (packageInfo.days === null) {
          expireDateFormatted = 'VITALÍCIO';
        } else {
          const expireDate = new Date();
          expireDate.setDate(expireDate.getDate() + packageInfo.days);
          expireDateFormatted = expireDate.toLocaleDateString('pt-BR');
        }
        
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
        errorMessage = 'Créditos insuficientes na conta DreamTV.';
      } else if (errorMessage.toLowerCase().includes('already')) {
        errorMessage = 'Dispositivo já está ativado.';
      }

      return {
        success: false,
        error: errorMessage,
        apiResponse: response.data
      };

    } catch (error) {
      console.error(`[DreamTV] Erro na ativação:`, error.message);
      
      // Se erro de autenticação, tentar login novamente
      if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Unauthorized')) {
        console.log('[DreamTV] Tentando relogin...');
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
    message += `📱 <b>Aplicativo:</b> DreamTV\n`;
    message += `🔧 <b>MAC:</b> <code>${macAddress}</code>\n`;
    message += `⭐ <b>Plano:</b> ${packageInfo.name}\n`;
    message += `📅 <b>Válido até:</b> ${expireDate}\n`;
    
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo DreamTV\n`;
    message += `2. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }
}

/**
 * Cria ativador
 */
function createActivator(credentials) {
  return new DreamTVActivator({
    email: credentials.email,
    password: credentials.password
  });
}

module.exports = {
  DreamTVActivator,
  createActivator
};
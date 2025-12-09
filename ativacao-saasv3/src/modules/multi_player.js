/**
 * Módulo Multi-Player
 * 
 * Suporta múltiplos apps IPTV através da API multi-player.app
 * 
 * Apps disponíveis:
 *  1 - IPTV Player io
 *  2 - IPTV OTT player
 *  3 - IPTV 4K
 *  4 - IPTV Stream player
 *  5 - IPTV Player
 *  6 - IPTV Play
 *  7 - IPTV Plus
 *  8 - IPTV Pro
 *  9 - PRO Player
 * 10 - IPTV Star
 * 11 - TVIP PLAYER
 * 12 - EGO IPTV
 * 13 - SCANDIC IPTV
 * 15 - Flixtra Player
 * 21 - IBO Player Premium
 * 22 - IPTV Duplex Player
 */

const https = require('https');

class MultiPlayerModule {
  constructor() {
    this.name = 'Multi-Player';
    this.id = 'multi_player';
    
    // Regex para MAC address (aceita formatos variados, incluindo atípicos)
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
    
    // Token e controle de expiração
    this.token = null;
    this.tokenExpiryTime = null;
    
    // Apps disponíveis
    this.apps = {
      1: "IPTV Player io",
      2: "IPTV OTT player",
      3: "IPTV 4K",
      4: "IPTV Stream player",
      5: "IPTV Player",
      6: "IPTV Play",
      7: "IPTV Plus",
      8: "IPTV Pro",
      9: "PRO Player",
      10: "IPTV Star",
      11: "TVIP PLAYER",
      12: "EGO IPTV",
      13: "SCANDIC IPTV",
      15: "Flixtra Player",
      21: "IBO Player Premium",
      22: "IPTV Duplex Player"
    };
    
    // ========================================
    // CONFIGURAÇÃO DE PACKAGE IDs
    // ========================================
    // Altere aqui se os valores estiverem incorretos:
    this.packageIds = {
      YEAR: 1,      // Anual - confirmado funcionando
      LIFETIME: 2   // Vitalício - hipótese (alterar se necessário)
    };
    // ========================================
  }

  /**
   * Faz requisição HTTP para a API
   */
  request(method, path, data = null, token = null, params = null) {
    return new Promise((resolve, reject) => {
      let fullPath = path;
      
      if (params) {
        const queryString = new URLSearchParams(params).toString();
        fullPath = `${path}?${queryString}`;
      }
      
      const options = {
        hostname: 'api.multi-player.app',
        port: 443,
        path: fullPath,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
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

      req.on('error', reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  /**
   * Verifica se o token atual é válido
   */
  isTokenValid() {
    return this.token && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime;
  }

  /**
   * Faz login e obtém token
   */
  async login(email, password) {
    console.log(`[${this.name}] Fazendo login...`);
    
    const response = await this.request('POST', '/reseller/login', { email, password });
    
    if (response.status === 200 && response.data.message) {
      this.token = response.data.message;
      // Token expira em 2 horas (definir 1h50 para segurança)
      this.tokenExpiryTime = Date.now() + (110 * 60 * 1000);
      console.log(`[${this.name}] Login bem-sucedido`);
      return true;
    }
    
    console.error(`[${this.name}] Falha no login:`, response.data);
    return false;
  }

  /**
   * Garante que temos um token válido
   */
  async ensureToken(credentials) {
    if (!this.isTokenValid()) {
      const success = await this.login(credentials.email, credentials.password);
      if (!success) {
        throw new Error('Falha na autenticação com Multi-Player');
      }
    }
    return this.token;
  }

  /**
   * Busca saldo/créditos
   */
  async getCredits(credentials) {
    const token = await this.ensureToken(credentials);
    
    const response = await this.request('GET', '/reseller/profile', null, token);
    
    if (response.status === 200) {
      return {
        success: true,
        credits: response.data.credits,
        name: response.data.name,
        deviceCount: response.data.device_count
      };
    }
    
    return { success: false, error: 'Falha ao obter perfil' };
  }

  /**
   * Verifica se dispositivo existe
   */
  async checkDevice(credentials, appId, mac) {
    const token = await this.ensureToken(credentials);
    
    const response = await this.request('GET', '/reseller/devices/check', null, token, {
      app_id: appId,
      mac: mac
    });
    
    return response;
  }

  /**
   * Valida formato do MAC
   */
  validateMac(mac) {
    if (!mac) return { valid: false, error: 'MAC não fornecido' };
    
    const trimmed = mac.trim();
    
    // Aceitar formato com separadores
    if (this.macRegex.test(trimmed)) {
      return { valid: true, formatted: trimmed.toLowerCase().replace(/-/g, ':') };
    }
    
    // Aceitar formato sem separadores (12 caracteres)
    const withoutSep = trimmed.match(/^[0-9a-zA-Z]{12}$/);
    if (withoutSep) {
      const formatted = trimmed.toLowerCase().match(/.{2}/g).join(':');
      return { valid: true, formatted };
    }
    
    return { valid: false, error: 'Formato de MAC inválido' };
  }

  /**
   * Retorna nome do app pelo ID
   */
  getAppName(appId) {
    return this.apps[appId] || `App ID ${appId}`;
  }

  /**
   * Ativa um dispositivo
   * 
   * @param {Object} credentials - { email, password }
   * @param {string} mac - Endereço MAC
   * @param {Object} options - { app_id, tier } onde tier é 'YEAR' ou 'LIFETIME'
   */
  async activate(credentials, mac, options = {}) {
    const startTime = Date.now();
    
    try {
      // Validar MAC
      const macValidation = this.validateMac(mac);
      if (!macValidation.valid) {
        return {
          success: false,
          error: macValidation.error
        };
      }
      
      const formattedMac = macValidation.formatted;
      const appId = options.app_id || 1;
      const tier = options.tier || 'YEAR';
      const packageId = this.packageIds[tier] || this.packageIds.YEAR;
      
      console.log(`[${this.name}] Ativando: MAC=${formattedMac}, App=${this.getAppName(appId)}, Tier=${tier}, PackageID=${packageId}`);
      
      // Obter token
      const token = await this.ensureToken(credentials);
      
      // Verificar dispositivo primeiro
      const checkResult = await this.checkDevice(credentials, appId, formattedMac);
      
      // Analisar resultado da verificação
      if (checkResult.status === 200 && checkResult.data?.message) {
        const device = checkResult.data.message;
        
        // Se já está pago, retornar sucesso
        if (device.payed === true) {
          console.log(`[${this.name}] Dispositivo já está ativo`);
          
          // Formatar validade
          let validadeFormatada = device.expired_at || 'N/A';
          if (device.expired_at) {
            try {
              const dataExp = new Date(device.expired_at);
              validadeFormatada = dataExp.toLocaleDateString('pt-BR');
            } catch (e) {}
          }
          
          const appName = this.getAppName(appId);
          
          let message = '✅ <b>DISPOSITIVO JÁ ESTÁ ATIVADO!</b>\n\n';
          message += `📱 <b>Aplicativo:</b> ${appName}\n`;
          message += `🔧 <b>MAC:</b> <code>${formattedMac}</code>\n`;
          
          if (validadeFormatada && validadeFormatada !== 'N/A') {
            message += `📅 <b>Válido até:</b> ${validadeFormatada}\n`;
          }
          
          message += '\n📲 O aplicativo já deve estar funcionando!\n';
          message += '🙏 Obrigado pela preferência!';
          
          return {
            success: true,
            message: message,
            data: {
              mac: formattedMac,
              app: appName,
              expiry: device.expired_at || 'N/A',
              expiryFormatted: validadeFormatada,
              alreadyActive: true
            },
            duration: Date.now() - startTime
          };
        }
      }
      
      // Tentar ativar
      const payload = {
        app_id: parseInt(appId),
        mac: formattedMac,
        package_id: packageId
      };
      
      const response = await this.request('POST', '/reseller/devices/activate', payload, token);
      
      console.log(`[${this.name}] Resposta ativação:`, JSON.stringify(response.data));
      
      // Verificar sucesso
      if (response.status === 200 || response.status === 201) {
        const data = response.data;
        
        // Extrair data de expiração
        let expiry = 'N/A';
        if (data.message?.expired_at) {
          expiry = data.message.expired_at;
        } else if (data.expired_at) {
          expiry = data.expired_at;
        }
        
        // Formatar validade
        let validadeFormatada = expiry;
        if (expiry && expiry !== 'N/A') {
          try {
            const dataExp = new Date(expiry);
            validadeFormatada = dataExp.toLocaleDateString('pt-BR');
          } catch (e) {}
        }
        
        // Montar mensagem de comprovante completa
        const tierNome = tier === 'YEAR' ? 'Anual' : 'Vitalício';
        const appName = this.getAppName(appId);
        
        let message = '✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n';
        message += `📱 <b>Aplicativo:</b> ${appName}\n`;
        message += `🔧 <b>MAC:</b> <code>${formattedMac}</code>\n`;
        message += `⭐ <b>Plano:</b> ${tierNome}\n`;
        
        if (validadeFormatada && validadeFormatada !== 'N/A') {
          message += `📅 <b>Válido até:</b> ${validadeFormatada}\n`;
        }
        
        message += '\n📲 <b>Próximos passos:</b>\n';
        message += `1. Abra o aplicativo ${appName}\n`;
        message += '2. O aplicativo já deve estar liberado!\n\n';
        message += '🙏 Obrigado pela preferência!';
        
        return {
          success: true,
          message: message,
          data: {
            mac: formattedMac,
            app: appName,
            tier: tierNome,
            expiry: expiry,
            expiryFormatted: validadeFormatada
          },
          duration: Date.now() - startTime
        };
      }
      
      // Tratar erros conhecidos
      let errorMessage = 'Erro desconhecido';
      
      if (typeof response.data === 'string') {
        errorMessage = response.data;
      } else if (response.data?.message) {
        errorMessage = typeof response.data.message === 'string' 
          ? response.data.message 
          : JSON.stringify(response.data.message);
      } else if (response.data?.error) {
        errorMessage = response.data.error;
      }
      
      // Traduzir erros comuns
      if (errorMessage.includes('Device is not found')) {
        errorMessage = 'Dispositivo não encontrado. Verifique o MAC e o aplicativo selecionado.';
      } else if (errorMessage.includes('Not enough credits')) {
        errorMessage = 'Créditos insuficientes na conta Multi-Player.';
      } else if (errorMessage.includes('already activated') || errorMessage.includes('already paid')) {
        errorMessage = 'Dispositivo já está ativado.';
      }
      
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      console.error(`[${this.name}] Erro:`, error.message);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Testa conexão com as credenciais
   */
  async testConnection(credentials) {
    try {
      // Resetar token para forçar novo login
      this.token = null;
      this.tokenExpiryTime = null;
      
      const creditsResult = await this.getCredits(credentials);
      
      if (creditsResult.success) {
        return {
          success: true,
          message: `Conectado! Créditos: ${creditsResult.credits}`,
          credits: creditsResult.credits
        };
      }
      
      return {
        success: false,
        error: 'Falha ao obter informações da conta'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new MultiPlayerModule();
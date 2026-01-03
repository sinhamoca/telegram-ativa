/**
 * Módulo Multi-Player - VERSÃO CORRIGIDA
 * 
 * CORREÇÃO: Tokens agora são armazenados POR USUÁRIO (email)
 * Antes: Token único compartilhado = credenciais globais
 * Agora: Cache de tokens por email = credenciais isoladas
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

// Cache de tokens POR USUÁRIO (email)
const tokenCache = new Map();

class MultiPlayerModule {
  constructor() {
    this.name = 'Multi-Player';
    this.id = 'multi_player';
    
    // Regex para MAC address (aceita formatos variados, incluindo atípicos)
    this.macRegex = /^([0-9A-Za-z]{1,2}[:-]){5}([0-9A-Za-z]{1,2})$/;
    
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
    this.packageIds = {
      YEAR: 1,      // Anual
      LIFETIME: 2   // Vitalício
    };
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
   * Verifica se o token DO USUÁRIO ESPECÍFICO é válido
   */
  isTokenValid(email) {
    const cached = tokenCache.get(email);
    return cached && cached.token && cached.expiryTime && Date.now() < cached.expiryTime;
  }

  /**
   * Obtém token do cache para um email específico
   */
  getToken(email) {
    const cached = tokenCache.get(email);
    return cached?.token || null;
  }

  /**
   * Salva token no cache para um email específico
   */
  setToken(email, token) {
    tokenCache.set(email, {
      token: token,
      expiryTime: Date.now() + (110 * 60 * 1000) // Token expira em 1h50min
    });
    console.log(`[${this.name}] Token armazenado para ${email}`);
  }

  /**
   * Limpa token do cache para um email específico
   */
  clearToken(email) {
    tokenCache.delete(email);
  }

  /**
   * Faz login e obtém token
   */
  async login(email, password) {
    console.log(`[${this.name}] Fazendo login para ${email}...`);
    
    const response = await this.request('POST', '/reseller/login', { email, password });
    
    if (response.status === 200 && response.data.message) {
      const token = response.data.message;
      this.setToken(email, token);
      console.log(`[${this.name}] Login bem-sucedido para ${email}`);
      return true;
    }
    
    console.error(`[${this.name}] Falha no login para ${email}:`, response.data);
    return false;
  }

  /**
   * Garante que temos um token válido PARA ESTE USUÁRIO ESPECÍFICO
   */
  async ensureToken(credentials) {
    const email = credentials.email;
    
    // Verificar se token DESTE usuário é válido
    if (!this.isTokenValid(email)) {
      console.log(`[${this.name}] Token inválido/expirado para ${email}, fazendo login...`);
      const success = await this.login(email, credentials.password);
      if (!success) {
        throw new Error('Falha na autenticação com Multi-Player');
      }
    }
    
    return this.getToken(email);
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
      
      console.log(`[${this.name}] Ativando: MAC=${formattedMac}, App=${this.getAppName(appId)}, Tier=${tier}, PackageID=${packageId}, User=${credentials.email}`);
      
      // Obter token PARA ESTE USUÁRIO
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
              expiry: device.expired_at,
              expiryFormatted: validadeFormatada,
              alreadyActive: true
            },
            duration: Date.now() - startTime
          };
        }
      }
      
      // Fazer ativação
      console.log(`[${this.name}] Chamando API de ativação...`);
      
      const activateResponse = await this.request('POST', '/reseller/devices/activate', {
        app_id: appId,
        mac: formattedMac,
        package_id: packageId
      }, token);
      
      console.log(`[${this.name}] Resposta:`, activateResponse.status, JSON.stringify(activateResponse.data));
      
      // Verificar sucesso
      if ((activateResponse.status === 200 || activateResponse.status === 201) && activateResponse.data?.error !== true) {
        const deviceInfo = activateResponse.data.message || {};
        
        // Formatar validade
        let validadeFormatada = 'N/A';
        if (deviceInfo.expired_at) {
          try {
            const dataExp = new Date(deviceInfo.expired_at);
            validadeFormatada = dataExp.toLocaleDateString('pt-BR');
          } catch (e) {}
        }
        
        const appName = this.getAppName(appId);
        const tierName = tier === 'LIFETIME' ? 'Vitalício' : 'Anual';
        
        let message = '✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n';
        message += `📱 <b>Aplicativo:</b> ${appName}\n`;
        message += `🔧 <b>MAC:</b> <code>${formattedMac}</code>\n`;
        message += `⭐ <b>Plano:</b> ${tierName}\n`;
        
        if (validadeFormatada !== 'N/A') {
          message += `📅 <b>Válido até:</b> ${validadeFormatada}\n`;
        }
        
        message += '\n📲 <b>Próximos passos:</b>\n';
        message += `1. Abra o aplicativo ${appName}\n`;
        message += '2. O app já deve estar liberado!\n\n';
        message += '🙏 Obrigado pela preferência!';
        
        return {
          success: true,
          message: message,
          data: {
            mac: formattedMac,
            app: appName,
            tier: tierName,
            expiry: deviceInfo.expired_at,
            expiryFormatted: validadeFormatada
          },
          duration: Date.now() - startTime
        };
      }
      
      // Erro na ativação
      let errorMessage = 'Falha na ativação';

      // Se resposta é string direta
      if (typeof activateResponse.data === 'string') {
        errorMessage = activateResponse.data;
      } else
      
      if (activateResponse.data?.message) {
        errorMessage = typeof activateResponse.data.message === 'string' 
          ? activateResponse.data.message 
          : JSON.stringify(activateResponse.data.message);
      } else if (activateResponse.data?.error) {
        errorMessage = activateResponse.data.error;
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
      // Limpar token para forçar novo login
      this.clearToken(credentials.email);
      
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

// Exportar instância única COM cache de tokens por usuário
module.exports = new MultiPlayerModule();
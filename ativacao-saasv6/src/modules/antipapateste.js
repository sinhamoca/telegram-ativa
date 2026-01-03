// src/modules/antipapateste.js - Módulo de consulta AntiPapaTeste
// Verifica se um número de telefone é "papa teste" (pega teste grátis e não compra)

const axios = require('axios');

/**
 * Configurações do AntiPapaTeste
 * Credenciais vêm do .env
 */
const CONFIG = {
  baseUrl: 'https://antipapateste.com',
  loginUrl: 'https://antipapateste.com/accounts/login/',
  apiUrl: 'https://antipapateste.com/api/consulta/',
  turnstile: {
    siteKey: '0x4AAAAAABk92lxI5DghFNMf'
  },
  timeout: 30000,
  sessionDuration: 4 * 60 * 60 * 1000 // 4 horas em ms
};

/**
 * Classe do módulo AntiPapaTeste
 */
class AntiPapaTesteModule {
  constructor() {
    // Sessão em memória (compartilhada para todos os usuários)
    this.session = null;
    this.sessionExpiry = null;
    this.loginInProgress = false;
    
    // Cliente HTTP base
    this.client = axios.create({
      baseURL: CONFIG.baseUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || status === 302,
      timeout: CONFIG.timeout
    });
  }

  /**
   * Obtém credenciais do .env
   */
  getCredentials() {
    const username = process.env.ANTIPAPATESTE_USERNAME;
    const password = process.env.ANTIPAPATESTE_PASSWORD;
    const captchaKey = process.env.CAPTCHA_2CAPTCHA_KEY;

    if (!username || !password) {
      throw new Error('Credenciais ANTIPAPATESTE não configuradas no .env');
    }

    if (!captchaKey) {
      throw new Error('CAPTCHA_2CAPTCHA_KEY não configurada no .env');
    }

    return { username, password, captchaKey };
  }

  /**
   * Verifica se a sessão está válida
   */
  isSessionValid() {
    return this.session && 
           this.session.sessionid && 
           this.sessionExpiry && 
           Date.now() < this.sessionExpiry;
  }

  /**
   * Extrai cookies do header set-cookie
   */
  parseCookies(setCookieHeader) {
    if (!setCookieHeader) return {};
    const cookies = {};
    const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    
    cookieArray.forEach(cookie => {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (match) {
        cookies[match[1]] = match[2];
      }
    });
    return cookies;
  }

  /**
   * Extrai CSRF token do HTML
   */
  extractCsrfToken(html) {
    const match = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    return match ? match[1] : null;
  }

  /**
   * Resolve captcha Turnstile via 2Captcha
   */
  async solveTurnstile(captchaKey) {
    console.log('[AntiPapaTeste] 📤 Enviando Turnstile para 2captcha...');
    
    // Criar task
    const createResponse = await axios.post('https://2captcha.com/in.php', null, {
      params: {
        key: captchaKey,
        method: 'turnstile',
        sitekey: CONFIG.turnstile.siteKey,
        pageurl: CONFIG.loginUrl,
        json: 1
      },
      timeout: 30000
    });

    if (createResponse.data.status !== 1) {
      throw new Error(`Erro ao criar task 2captcha: ${createResponse.data.request}`);
    }

    const taskId = createResponse.data.request;
    console.log(`[AntiPapaTeste] ✅ Task criada: ${taskId}`);

    // Polling para resultado (máximo 60 tentativas = 5 minutos)
    for (let attempt = 1; attempt <= 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log(`[AntiPapaTeste] ⏳ Verificando captcha... (${attempt}/60)`);

      const resultResponse = await axios.get('https://2captcha.com/res.php', {
        params: {
          key: captchaKey,
          action: 'get',
          id: taskId,
          json: 1
        },
        timeout: 10000
      });

      if (resultResponse.data.status === 1) {
        console.log('[AntiPapaTeste] ✅ Captcha resolvido!');
        return resultResponse.data.request;
      }

      if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Erro 2captcha: ${resultResponse.data.request}`);
      }
    }

    throw new Error('Timeout ao resolver captcha (5 min)');
  }

  /**
   * Faz login no AntiPapaTeste
   */
  async login() {
    // Evita logins simultâneos
    if (this.loginInProgress) {
      console.log('[AntiPapaTeste] Login já em andamento, aguardando...');
      // Aguarda até 2 minutos pelo login em andamento
      for (let i = 0; i < 24; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!this.loginInProgress && this.isSessionValid()) {
          return { success: true, cached: true };
        }
      }
      throw new Error('Timeout aguardando login em andamento');
    }

    this.loginInProgress = true;

    try {
      const { username, password, captchaKey } = this.getCredentials();
      
      console.log('[AntiPapaTeste] 🔐 Iniciando login...');

      // 1. Acessa página de login para pegar CSRF token e cookies
      console.log('[AntiPapaTeste] 📄 Acessando página de login...');
      const loginPageResponse = await this.client.get('/accounts/login/');
      
      const initialCookies = this.parseCookies(loginPageResponse.headers['set-cookie']);
      
      const csrfToken = this.extractCsrfToken(loginPageResponse.data);
      if (!csrfToken) {
        throw new Error('Não foi possível extrair CSRF token');
      }
      console.log('[AntiPapaTeste] 🔑 CSRF Token obtido');

      // 2. Resolve o Turnstile
      const turnstileToken = await this.solveTurnstile(captchaKey);

      // 3. Faz POST de login
      console.log('[AntiPapaTeste] 📨 Enviando login...');
      
      const formData = new URLSearchParams();
      formData.append('csrfmiddlewaretoken', csrfToken);
      formData.append('username', username);
      formData.append('password', password);
      formData.append('cf-turnstile-response', turnstileToken);

      const loginResponse = await this.client.post('/accounts/login/', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `csrftoken=${initialCookies.csrftoken}`,
          'Referer': CONFIG.loginUrl,
          'Origin': CONFIG.baseUrl
        }
      });

      const sessionCookies = this.parseCookies(loginResponse.headers['set-cookie']);

      // Verifica se login foi bem sucedido (redirect para /)
      if (loginResponse.status === 302 && loginResponse.headers.location === '/') {
        console.log('[AntiPapaTeste] ✅ Login realizado com sucesso!');
        
        this.session = {
          csrftoken: sessionCookies.csrftoken || initialCookies.csrftoken,
          sessionid: sessionCookies.sessionid,
          loginTime: new Date().toISOString()
        };
        
        this.sessionExpiry = Date.now() + CONFIG.sessionDuration;
        
        return { success: true };
      }

      throw new Error('Login falhou - resposta inesperada');

    } catch (error) {
      console.error('[AntiPapaTeste] ❌ Erro no login:', error.message);
      throw error;
    } finally {
      this.loginInProgress = false;
    }
  }

  /**
   * Garante que temos uma sessão válida
   */
  async ensureSession() {
    if (this.isSessionValid()) {
      return;
    }
    
    console.log('[AntiPapaTeste] Sessão expirada ou inexistente, fazendo login...');
    await this.login();
  }

  /**
   * Formata número de telefone
   */
  formatPhone(phone) {
    let cleaned = phone.replace(/\D/g, '');
    
    // Garante código do Brasil
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Classifica o lead baseado nos dados retornados
   */
  classificarLead(data) {
    const { total, ultimos_7_dias, ultimos_30_dias } = data;
    
    // Papa teste ativo (pegou teste recentemente)
    if (ultimos_7_dias > 0) {
      return {
        status: 'PAPA_TESTE_ATIVO',
        emoji: '🚫',
        mensagem: 'Papa teste ATIVO! Pegou teste nos últimos 7 dias.',
        score: 0,
        recomendacao: 'NÃO ATENDER',
        cor: 'vermelho'
      };
    }
    
    // Papa teste recente
    if (ultimos_30_dias > 0) {
      return {
        status: 'PAPA_TESTE_RECENTE',
        emoji: '⛔',
        mensagem: 'Papa teste recente. Pegou teste no último mês.',
        score: 2,
        recomendacao: 'EVITAR',
        cor: 'laranja'
      };
    }
    
    // Papa teste crônico (histórico pesado)
    if (total >= 5) {
      return {
        status: 'PAPA_TESTE_CRONICO',
        emoji: '🚫',
        mensagem: `Papa teste crônico! ${total} testes no histórico.`,
        score: 1,
        recomendacao: 'NÃO ATENDER',
        cor: 'vermelho'
      };
    }
    
    // Suspeito (alguns testes)
    if (total >= 3) {
      return {
        status: 'SUSPEITO',
        emoji: '⚠️',
        mensagem: `Suspeito. ${total} testes registrados.`,
        score: 4,
        recomendacao: 'CAUTELA - Cobrar teste',
        cor: 'amarelo'
      };
    }
    
    // Atenção (poucos testes)
    if (total >= 1) {
      return {
        status: 'ATENCAO',
        emoji: '⚡',
        mensagem: `Atenção. ${total} teste(s) no histórico.`,
        score: 6,
        recomendacao: 'AVALIAR - Pode ser pesquisa legítima',
        cor: 'amarelo'
      };
    }
    
    // Lead limpo
    return {
      status: 'LIMPO',
      emoji: '✅',
      mensagem: 'Lead limpo! Nenhum registro encontrado.',
      score: 10,
      recomendacao: 'PODE ATENDER',
      cor: 'verde'
    };
  }

  /**
   * Consulta um número de telefone
   * @param {string} phone - Número de telefone
   * @returns {Promise<object>} Resultado da consulta
   */
  async consultar(phone) {
    try {
      // Garante sessão válida
      await this.ensureSession();

      const formattedPhone = this.formatPhone(phone);
      console.log(`[AntiPapaTeste] 🔍 Consultando: ${formattedPhone}`);

      // Cria cliente com cookies da sessão
      const response = await axios.get(`${CONFIG.apiUrl}?number=${formattedPhone}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36',
          'Accept': '*/*',
          'Content-Type': 'application/json',
          'Cookie': `csrftoken=${this.session.csrftoken}; sessionid=${this.session.sessionid}`,
          'Referer': 'https://antipapateste.com/'
        },
        timeout: CONFIG.timeout
      });

      const data = response.data;
      const classificacao = this.classificarLead(data);

      console.log(`[AntiPapaTeste] ✅ Consulta OK - ${classificacao.status}`);

      return {
        success: true,
        telefone: data.telefone || formattedPhone,
        total_testes: data.total || 0,
        ultimos_7_dias: data.ultimos_7_dias || 0,
        ultimos_30_dias: data.ultimos_30_dias || 0,
        historico: data.testes || [],
        classificacao
      };

    } catch (error) {
      console.error('[AntiPapaTeste] ❌ Erro na consulta:', error.message);
      
      // Se sessão expirou, invalida e tenta novamente
      if (error.response?.status === 403 || error.response?.status === 401) {
        console.log('[AntiPapaTeste] Sessão expirada, tentando relogin...');
        this.session = null;
        this.sessionExpiry = null;
        
        // Tenta uma vez mais
        try {
          await this.login();
          return await this.consultar(phone);
        } catch (retryError) {
          return {
            success: false,
            telefone: phone,
            error: 'Sessão expirada e relogin falhou'
          };
        }
      }

      return {
        success: false,
        telefone: phone,
        error: error.message
      };
    }
  }

  /**
   * Formata resultado para exibição no Telegram
   * @param {object} result - Resultado da consulta
   * @returns {string} Mensagem formatada em HTML
   */
  formatarMensagem(result) {
    if (!result.success) {
      return `❌ <b>Erro na consulta</b>\n\n` +
             `📱 Número: <code>${result.telefone}</code>\n` +
             `💬 ${result.error}`;
    }

    const c = result.classificacao;
    
    let msg = `${c.emoji} <b>CONSULTA ANTI PAPA TESTE</b>\n\n`;
    msg += `📱 <b>Telefone:</b> <code>${result.telefone}</code>\n`;
    msg += `📊 <b>Total de testes:</b> ${result.total_testes}\n`;
    msg += `📅 <b>Últimos 7 dias:</b> ${result.ultimos_7_dias}\n`;
    msg += `📆 <b>Últimos 30 dias:</b> ${result.ultimos_30_dias}\n\n`;
    
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `${c.emoji} <b>STATUS:</b> ${c.status}\n`;
    msg += `💬 ${c.mensagem}\n`;
    msg += `🎯 <b>Score:</b> ${c.score}/10\n`;
    msg += `👉 <b>${c.recomendacao}</b>\n`;

    // Histórico (limitado a 5 últimos)
    if (result.historico && result.historico.length > 0) {
      msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📜 <b>ÚLTIMOS TESTES:</b>\n\n`;
      
      const ultimos = result.historico.slice(0, 5);
      ultimos.forEach((teste, i) => {
        const data = teste.created_at ? teste.created_at.split('T')[0] : 'N/A';
        msg += `  ${i + 1}. ${data} - ${teste.revenda || 'N/A'}\n`;
      });
      
      if (result.historico.length > 5) {
        msg += `\n  <i>... e mais ${result.historico.length - 5} registros</i>`;
      }
    }

    return msg;
  }

  /**
   * Testa conexão com o serviço
   */
  async testarConexao() {
    try {
      await this.ensureSession();
      return {
        success: true,
        message: 'Conexão OK - Sessão válida'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Instância singleton
const antiPapaTesteModule = new AntiPapaTesteModule();

module.exports = {
  AntiPapaTesteModule,
  antiPapaTesteModule,
  
  // Funções de conveniência
  consultar: (phone) => antiPapaTesteModule.consultar(phone),
  formatarMensagem: (result) => antiPapaTesteModule.formatarMensagem(result),
  testarConexao: () => antiPapaTesteModule.testarConexao()
};

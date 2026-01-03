// src/services/flareSolverService.js
// Serviço para resolver Cloudflare challenges via FlareSolverr
// Pattern: use-and-dispose (cada ativação cria e destrói sua própria sessão)

const axios = require('axios');
const crypto = require('crypto');

class FlareSolverService {
  constructor() {
    this.baseUrl = process.env.FLARESOLVERR_URL || 'http://157.180.44.248:8191/v1'; // VPS dedicada
    this.timeout = parseInt(process.env.FLARESOLVERR_TIMEOUT) || 60000;
    this.maxRetries = 2;
  }

  /**
   * Gera ID único para cada sessão
   */
  generateSessionId() {
    return `tg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Wrapper principal - garante cleanup automático do navegador
   * Uso: await flareSolver.withSession(async (sessionId) => { ... })
   */
  async withSession(callback) {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();
    
    try {
      // 1. Cria sessão (abre navegador no FlareSolverr)
      await this.createSession(sessionId);
      console.log(`[FlareSolverr] ✅ Sessão ${sessionId} criada`);
      
      // 2. Executa o trabalho passado pelo módulo
      const result = await callback(sessionId);
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[FlareSolverr] ⏱️ Sessão ${sessionId} concluída em ${elapsed}s`);
      
      return result;
      
    } catch (error) {
      console.error(`[FlareSolverr] ❌ Erro na sessão ${sessionId}: ${error.message}`);
      throw error;
      
    } finally {
      // 3. SEMPRE destrói sessão (fecha navegador e libera memória)
      await this.destroySession(sessionId);
    }
  }

  /**
   * Cria uma nova sessão no FlareSolverr
   */
  async createSession(sessionId) {
    try {
      const response = await axios.post(this.baseUrl, {
        cmd: 'sessions.create',
        session: sessionId
      }, { 
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status !== 'ok') {
        throw new Error(response.data.message || 'Falha ao criar sessão');
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('FlareSolverr não está acessível. Verifique a conexão.');
      }
      throw error;
    }
  }

  /**
   * Destrói uma sessão (fecha o navegador)
   */
  async destroySession(sessionId) {
    try {
      await axios.post(this.baseUrl, {
        cmd: 'sessions.destroy',
        session: sessionId
      }, { 
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log(`[FlareSolverr] 🗑️ Sessão ${sessionId} destruída`);
      return true;
    } catch (error) {
      // Log mas não falha - sessão pode já ter expirado
      console.warn(`[FlareSolverr] ⚠️ Falha ao destruir sessão ${sessionId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Faz uma requisição GET através do FlareSolverr
   */
  async get(url, sessionId, options = {}) {
    return this.request(url, sessionId, { ...options, method: 'GET' });
  }

  /**
   * Faz uma requisição POST através do FlareSolverr
   */
  async post(url, sessionId, postData, options = {}) {
    return this.request(url, sessionId, { ...options, method: 'POST', postData });
  }

  /**
   * Requisição genérica ao FlareSolverr
   */
  async request(url, sessionId, options = {}) {
    const method = options.method || 'GET';
    
    const payload = {
      cmd: method === 'POST' ? 'request.post' : 'request.get',
      url,
      session: sessionId,
      maxTimeout: options.timeout || this.timeout,
    };

    // Para POST, adicionar dados
    if (method === 'POST' && options.postData) {
      payload.postData = typeof options.postData === 'string' 
        ? options.postData 
        : new URLSearchParams(options.postData).toString();
    }

    // Headers customizados (se necessário)
    if (options.headers) {
      payload.headers = options.headers;
    }

    console.log(`[FlareSolverr] 🌐 ${method} ${url} (sessão: ${sessionId})`);

    try {
      const response = await axios.post(this.baseUrl, payload, {
        timeout: this.timeout + 10000, // Um pouco mais que o maxTimeout
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status !== 'ok') {
        throw new Error(response.data.message || 'Requisição falhou');
      }

      const solution = response.data.solution;
      
      return {
        success: true,
        html: solution.response,
        cookies: solution.cookies || [],
        userAgent: solution.userAgent,
        status: solution.status,
        // Helper: cookies formatados para uso em headers
        cookieString: (solution.cookies || [])
          .map(c => `${c.name}=${c.value}`)
          .join('; ')
      };

    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(`FlareSolverr: ${error.response.data.message}`);
      }
      throw error;
    }
  }

  /**
   * Testa conexão com o FlareSolverr
   */
  async testConnection() {
    try {
      const response = await axios.post(this.baseUrl, {
        cmd: 'sessions.list'
      }, { 
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.status === 'ok') {
        const activeSessions = response.data.sessions?.length || 0;
        return {
          success: true,
          message: `FlareSolverr conectado. Sessões ativas: ${activeSessions}`,
          version: response.data.version || 'unknown',
          sessions: activeSessions
        };
      }

      return {
        success: false,
        error: response.data.message || 'Resposta inválida'
      };

    } catch (error) {
      return {
        success: false,
        error: error.code === 'ECONNREFUSED' 
          ? 'FlareSolverr não está acessível'
          : error.message
      };
    }
  }

  /**
   * Lista sessões ativas (útil para debug)
   */
  async listSessions() {
    try {
      const response = await axios.post(this.baseUrl, {
        cmd: 'sessions.list'
      }, { 
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      return response.data.sessions || [];
    } catch (error) {
      console.error('[FlareSolverr] Erro ao listar sessões:', error.message);
      return [];
    }
  }

  /**
   * Limpa todas as sessões órfãs (útil para manutenção)
   */
  async cleanupAllSessions() {
    const sessions = await this.listSessions();
    
    for (const sessionId of sessions) {
      await this.destroySession(sessionId);
    }
    
    console.log(`[FlareSolverr] 🧹 ${sessions.length} sessões limpas`);
    return sessions.length;
  }
}

// Exporta instância única (singleton)
module.exports = new FlareSolverService();

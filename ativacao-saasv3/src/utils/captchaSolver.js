// src/utils/captchaSolver.js - Helper global para resolução de CAPTCHAs

const axios = require('axios');
const config = require('../config');

/**
 * Classe para resolver CAPTCHAs usando 2Captcha
 */
class TwoCaptchaSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'http://2captcha.com';
  }

  /**
   * Envia CAPTCHA para resolução
   */
  async submitCaptcha(siteKey, pageUrl) {
    console.log('[2Captcha] Enviando CAPTCHA...');
    
    const response = await axios.get(`${this.baseUrl}/in.php`, {
      params: {
        key: this.apiKey,
        method: 'userrecaptcha',
        googlekey: siteKey,
        pageurl: pageUrl,
        json: 1
      },
      timeout: 30000
    });

    if (response.data.status !== 1) {
      throw new Error(`Erro ao enviar CAPTCHA: ${response.data.request}`);
    }

    console.log(`[2Captcha] CAPTCHA enviado! ID: ${response.data.request}`);
    return response.data.request;
  }

  /**
   * Aguarda resultado do CAPTCHA
   */
  async waitForResult(captchaId, maxAttempts = 30, interval = 5000) {
    console.log('[2Captcha] Aguardando resolução...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(interval);
      
      const response = await axios.get(`${this.baseUrl}/res.php`, {
        params: {
          key: this.apiKey,
          action: 'get',
          id: captchaId,
          json: 1
        },
        timeout: 30000
      });

      if (response.data.status === 1) {
        console.log(`[2Captcha] CAPTCHA resolvido! (tentativa ${attempt})`);
        return response.data.request;
      }

      if (response.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Erro ao resolver CAPTCHA: ${response.data.request}`);
      }

      console.log(`[2Captcha] Tentativa ${attempt}/${maxAttempts} - processando...`);
    }

    throw new Error('Timeout aguardando resolução do CAPTCHA');
  }

  /**
   * Resolve reCAPTCHA v2 completo
   */
  async solveRecaptchaV2(siteKey, pageUrl) {
    const startTime = Date.now();
    
    const captchaId = await this.submitCaptcha(siteKey, pageUrl);
    const token = await this.waitForResult(captchaId);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[2Captcha] Tempo total: ${elapsed}s`);
    
    return token;
  }

  /**
   * Consulta saldo da conta
   */
  async getBalance() {
    const response = await axios.get(`${this.baseUrl}/res.php`, {
      params: {
        key: this.apiKey,
        action: 'getbalance',
        json: 1
      },
      timeout: 10000
    });

    return parseFloat(response.data.request);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Classe para resolver CAPTCHAs usando AntiCaptcha
 */
class AntiCaptchaSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.anti-captcha.com';
  }

  /**
   * Cria tarefa de reCAPTCHA v2
   */
  async createTask(siteKey, pageUrl) {
    console.log('[AntiCaptcha] Criando tarefa...');
    
    const response = await axios.post(`${this.baseUrl}/createTask`, {
      clientKey: this.apiKey,
      task: {
        type: 'RecaptchaV2TaskProxyless',
        websiteURL: pageUrl,
        websiteKey: siteKey
      }
    }, { timeout: 30000 });

    if (response.data.errorId !== 0) {
      throw new Error(`Erro ao criar tarefa: ${response.data.errorDescription}`);
    }

    console.log(`[AntiCaptcha] Tarefa criada! ID: ${response.data.taskId}`);
    return response.data.taskId;
  }

  /**
   * Aguarda resultado da tarefa
   */
  async waitForResult(taskId, maxAttempts = 30, interval = 5000) {
    console.log('[AntiCaptcha] Aguardando resolução...');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.sleep(interval);
      
      const response = await axios.post(`${this.baseUrl}/getTaskResult`, {
        clientKey: this.apiKey,
        taskId: taskId
      }, { timeout: 30000 });

      if (response.data.errorId !== 0) {
        throw new Error(`Erro: ${response.data.errorDescription}`);
      }

      if (response.data.status === 'ready') {
        console.log(`[AntiCaptcha] CAPTCHA resolvido! (tentativa ${attempt})`);
        return response.data.solution.gRecaptchaResponse;
      }

      console.log(`[AntiCaptcha] Tentativa ${attempt}/${maxAttempts} - processando...`);
    }

    throw new Error('Timeout aguardando resolução do CAPTCHA');
  }

  /**
   * Resolve reCAPTCHA v2 completo
   */
  async solveRecaptchaV2(siteKey, pageUrl) {
    const startTime = Date.now();
    
    const taskId = await this.createTask(siteKey, pageUrl);
    const token = await this.waitForResult(taskId);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AntiCaptcha] Tempo total: ${elapsed}s`);
    
    return token;
  }

  /**
   * Consulta saldo da conta
   */
  async getBalance() {
    const response = await axios.post(`${this.baseUrl}/getBalance`, {
      clientKey: this.apiKey
    }, { timeout: 10000 });

    if (response.data.errorId !== 0) {
      throw new Error(response.data.errorDescription);
    }

    return response.data.balance;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== EXPORTS ====================

/**
 * Obtém o solver de CAPTCHA configurado
 * @param {string} service - '2captcha' ou 'anticaptcha' (opcional, usa default)
 * @returns {TwoCaptchaSolver|AntiCaptchaSolver}
 */
function getCaptchaSolver(service = null) {
  const captchaConfig = config.CAPTCHA;
  
  if (!captchaConfig) {
    throw new Error('Configuração de CAPTCHA não encontrada');
  }

  const selectedService = service || captchaConfig.defaultService || '2captcha';

  if (selectedService === '2captcha') {
    if (!captchaConfig.TWO_CAPTCHA?.enabled) {
      throw new Error('2Captcha não está configurado');
    }
    return new TwoCaptchaSolver(captchaConfig.TWO_CAPTCHA.apiKey);
  }

  if (selectedService === 'anticaptcha') {
    if (!captchaConfig.ANTI_CAPTCHA?.enabled) {
      throw new Error('AntiCaptcha não está configurado');
    }
    return new AntiCaptchaSolver(captchaConfig.ANTI_CAPTCHA.apiKey);
  }

  throw new Error(`Serviço de CAPTCHA desconhecido: ${selectedService}`);
}

/**
 * Resolve reCAPTCHA v2 usando o serviço configurado
 * @param {string} siteKey - Chave do site do reCAPTCHA
 * @param {string} pageUrl - URL da página com o CAPTCHA
 * @param {string} service - Serviço a usar (opcional)
 * @returns {Promise<string>} Token do CAPTCHA resolvido
 */
async function solveRecaptchaV2(siteKey, pageUrl, service = null) {
  const solver = getCaptchaSolver(service);
  return await solver.solveRecaptchaV2(siteKey, pageUrl);
}

/**
 * Verifica saldo do serviço de CAPTCHA
 * @param {string} service - Serviço a verificar (opcional)
 * @returns {Promise<number>} Saldo em USD
 */
async function getCaptchaBalance(service = null) {
  const solver = getCaptchaSolver(service);
  return await solver.getBalance();
}

module.exports = {
  TwoCaptchaSolver,
  AntiCaptchaSolver,
  getCaptchaSolver,
  solveRecaptchaV2,
  getCaptchaBalance
};

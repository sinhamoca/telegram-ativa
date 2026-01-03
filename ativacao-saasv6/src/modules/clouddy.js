// src/modules/clouddy.js - Módulo de ativação Clouddy
// Usa 2Captcha para Turnstile + Puppeteer para pagamento Stripe
// NOTA: Cada revendedor cadastra seu próprio cartão de crédito

const axios = require('axios');
const puppeteer = require('puppeteer');
const config = require('../config');

// ============== CONFIGURAÇÕES ==============
const CLOUDDY_CONFIG = {
  name: 'Clouddy',
  baseUrl: 'https://console.clouddy.online',
  loginUrl: 'https://console.clouddy.online/user/auth/login',
  refillUrl: 'https://console.clouddy.online/user/refill',
  turnstileSitekey: '0x4AAAAAAB1YQXL0j-m3w7c3',
  planId: 4,           // ID do plano fixo
  amount: '2.00',      // Valor fixo da ativação anual
  timeout: 60000,
  captchaTimeout: 120000
};

const headers = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://console.clouddy.online',
  'Referer': 'https://console.clouddy.online/user/auth/login',
  'Content-Type': 'application/x-www-form-urlencoded'
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
    // Erros de autenticação
    'Invalid credentials': 'Credenciais inválidas',
    'Invalid email or password': 'Email ou senha inválidos',
    'Login failed': 'Falha no login',
    'Session expired': 'Sessão expirada',
    'Access denied': 'Acesso negado',
    'Account not found': 'Conta não encontrada',
    'Account suspended': 'Conta suspensa',
    'Account blocked': 'Conta bloqueada',
    
    // Erros de cartão
    'Card declined': 'Cartão recusado',
    'Insufficient funds': 'Saldo insuficiente',
    'Invalid card number': 'Número do cartão inválido',
    'Invalid expiry': 'Validade inválida',
    'Invalid CVC': 'CVV inválido',
    'Card expired': 'Cartão expirado',
    'Payment failed': 'Pagamento falhou',
    'Transaction declined': 'Transação recusada',
    'Your card was declined': 'Seu cartão foi recusado',
    'Your card has insufficient funds': 'Seu cartão não tem saldo suficiente',
    'Your card number is invalid': 'Número do cartão inválido',
    
    // Erros de CAPTCHA
    'Captcha failed': 'Falha no CAPTCHA',
    'Captcha expired': 'CAPTCHA expirado',
    'Captcha rejected': 'CAPTCHA rejeitado',
    
    // Erros genéricos
    'Something went wrong': 'Algo deu errado',
    'Please try again': 'Por favor, tente novamente',
    'Server error': 'Erro no servidor',
    'Connection error': 'Erro de conexão',
    'Timeout': 'Tempo esgotado',
    'Network error': 'Erro de rede'
  };
  
  let translated = errorMessage;
  
  for (const [english, portuguese] of Object.entries(translations)) {
    if (translated.toLowerCase().includes(english.toLowerCase())) {
      translated = translated.replace(new RegExp(english, 'gi'), portuguese);
    }
  }
  
  return translated;
}

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return [];
  const cookieArray = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return cookieArray.map(cookie => cookie.split(';')[0]);
}

function mergeCookies(existing, newCookies) {
  const cookieMap = new Map();
  [...existing, ...newCookies].forEach(cookie => {
    const [name] = cookie.split('=');
    cookieMap.set(name, cookie);
  });
  return Array.from(cookieMap.values());
}

// ============== CLASSE PRINCIPAL ==============

class ClouddyActivator {
  constructor(cardCredentials) {
    // Dados do cartão do revendedor
    this.cardNumber = cardCredentials.cardNumber;
    this.cardExpiry = cardCredentials.cardExpiry;
    this.cardCvc = cardCredentials.cardCvc;
    this.cardName = cardCredentials.cardName;
    this.cardEmail = cardCredentials.cardEmail;
    
    // 2Captcha
    this.twoCaptchaKey = config.CAPTCHA?.TWO_CAPTCHA?.apiKey || config.TWOCAPTCHA?.key || '';
  }

  /**
   * Resolve Cloudflare Turnstile usando 2Captcha
   */
  async solveTurnstile() {
    console.log(`[${CLOUDDY_CONFIG.name}] 🔄 Enviando Turnstile para 2Captcha...`);
    
    if (!this.twoCaptchaKey) {
      throw new Error('Chave 2Captcha não configurada');
    }

    // Criar task
    const createParams = new URLSearchParams({
      key: this.twoCaptchaKey,
      method: 'turnstile',
      sitekey: CLOUDDY_CONFIG.turnstileSitekey,
      pageurl: CLOUDDY_CONFIG.loginUrl,
      json: '1'
    });

    const createResponse = await axios.get(`https://2captcha.com/in.php?${createParams.toString()}`);
    
    if (createResponse.data.status !== 1) {
      throw new Error(`Erro ao criar task 2Captcha: ${createResponse.data.request}`);
    }

    const taskId = createResponse.data.request;
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ Task criada: ${taskId}`);

    // Polling para resultado
    console.log(`[${CLOUDDY_CONFIG.name}] ⏳ Aguardando resolução...`);
    
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      
      const resultParams = new URLSearchParams({
        key: this.twoCaptchaKey,
        action: 'get',
        id: taskId,
        json: '1'
      });

      const resultResponse = await axios.get(`https://2captcha.com/res.php?${resultParams.toString()}`);
      
      if (resultResponse.data.status === 1) {
        console.log(`[${CLOUDDY_CONFIG.name}] ✅ Turnstile resolvido!`);
        return resultResponse.data.request;
      }
      
      if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`Erro 2Captcha: ${resultResponse.data.request}`);
      }
    }

    throw new Error('Timeout aguardando resolução do Turnstile');
  }

  /**
   * Faz login na conta do cliente
   */
  async login(email, password) {
    console.log(`[${CLOUDDY_CONFIG.name}] 🚀 Iniciando login...`);
    console.log(`[${CLOUDDY_CONFIG.name}] 📧 Email: ${email}`);

    const session = axios.create({
      headers,
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || status === 301 || status === 302
    });

    let cookies = [];

    // 1. Acessar página de login
    console.log(`[${CLOUDDY_CONFIG.name}] 🔄 Acessando página de login...`);
    try {
      const pageResponse = await session.get(CLOUDDY_CONFIG.loginUrl);
      if (pageResponse.headers['set-cookie']) {
        cookies = parseCookies(pageResponse.headers['set-cookie']);
      }
    } catch (err) {
      if (err.response?.headers['set-cookie']) {
        cookies = parseCookies(err.response.headers['set-cookie']);
      }
    }

    // 2. Resolver Turnstile
    const turnstileToken = await this.solveTurnstile();

    // 3. Fazer login
    console.log(`[${CLOUDDY_CONFIG.name}] 🔐 Enviando credenciais...`);
    
    const formData = new URLSearchParams({
      'form[email]': email,
      'form[password]': password,
      'cf-turnstile-response': turnstileToken,
      'g-recaptcha-response': turnstileToken
    });

    try {
      const loginResponse = await session.post(CLOUDDY_CONFIG.loginUrl, formData.toString(), {
        headers: {
          ...headers,
          'Cookie': cookies.join('; ')
        }
      });

      if (loginResponse.headers['set-cookie']) {
        const newCookies = parseCookies(loginResponse.headers['set-cookie']);
        cookies = mergeCookies(cookies, newCookies);
      }

      const location = loginResponse.headers['location'];
      
      if (location && (location.includes('dashboard') || location.includes('index') || location.includes('/user'))) {
        console.log(`[${CLOUDDY_CONFIG.name}] ✅ Login bem sucedido!`);
        return {
          success: true,
          cookies: cookies,
          cookieString: cookies.join('; '),
          redirectUrl: location
        };
      } else if (location && location.includes('login')) {
        return {
          success: false,
          error: 'Email ou senha inválidos'
        };
      }

      return {
        success: false,
        error: 'Resposta inesperada do servidor'
      };

    } catch (error) {
      if (error.response) {
        const location = error.response.headers['location'];
        
        if (error.response.headers['set-cookie']) {
          const newCookies = parseCookies(error.response.headers['set-cookie']);
          cookies = mergeCookies(cookies, newCookies);
        }

        if (location && (location.includes('dashboard') || location.includes('index') || location.includes('/user'))) {
          console.log(`[${CLOUDDY_CONFIG.name}] ✅ Login bem sucedido!`);
          return {
            success: true,
            cookies: cookies,
            cookieString: cookies.join('; '),
            redirectUrl: location
          };
        }
      }
      
      throw error;
    }
  }

  /**
   * Obtém URL do Stripe Checkout
   */
  async getStripeCheckoutUrl(cookieString) {
    console.log(`[${CLOUDDY_CONFIG.name}] 💳 Iniciando recarga...`);
    
    const refillUrl = `${CLOUDDY_CONFIG.refillUrl}/${CLOUDDY_CONFIG.planId}`;
    
    const formData = new URLSearchParams({
      'form[sum]': CLOUDDY_CONFIG.amount,
      'form[confirm]': '1',
      'form[via]': 'stripe'
    });

    try {
      const response = await axios.post(refillUrl, formData.toString(), {
        headers: {
          ...headers,
          'Cookie': cookieString,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': refillUrl
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400 || status === 301 || status === 302
      });

      const stripeUrl = response.headers['location'];
      
      if (stripeUrl && stripeUrl.includes('checkout.stripe.com')) {
        console.log(`[${CLOUDDY_CONFIG.name}] ✅ URL do Stripe obtida!`);
        return {
          success: true,
          stripeUrl: stripeUrl
        };
      }
      
      return {
        success: false,
        error: 'Não foi possível obter URL do Stripe'
      };

    } catch (error) {
      if (error.response) {
        const stripeUrl = error.response.headers['location'];
        
        if (stripeUrl && stripeUrl.includes('checkout.stripe.com')) {
          console.log(`[${CLOUDDY_CONFIG.name}] ✅ URL do Stripe obtida!`);
          return {
            success: true,
            stripeUrl: stripeUrl
          };
        }
      }
      
      throw error;
    }
  }

  /**
   * Completa pagamento no Stripe via Puppeteer
   */
  async completeStripePayment(stripeUrl) {
    console.log(`[${CLOUDDY_CONFIG.name}] 🌐 Iniciando navegador para pagamento...`);
    
    let browser = null;
    
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--single-process',
          '--no-zygote'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      console.log(`[${CLOUDDY_CONFIG.name}] 🔄 Acessando checkout...`);
      await page.goto(stripeUrl, { waitUntil: 'networkidle2', timeout: CLOUDDY_CONFIG.timeout });

      console.log(`[${CLOUDDY_CONFIG.name}] ⏳ Aguardando formulário...`);
      await page.waitForSelector('#email, input[name="email"]', { timeout: 15000 });
      console.log(`[${CLOUDDY_CONFIG.name}] ✅ Formulário carregado`);

      // Preencher formulário
      await this.fillStripeForm(page);

      // Clicar no botão de pagar
      console.log(`[${CLOUDDY_CONFIG.name}] 🔘 Clicando em pagar...`);
      const submitSelector = 'button[type="submit"], .SubmitButton';
      await page.waitForSelector(submitSelector, { timeout: 10000 });
      await sleep(500);
      await page.click(submitSelector);

      // Aguardar processamento
      console.log(`[${CLOUDDY_CONFIG.name}] ⏳ Processando pagamento...`);
      
      const result = await Promise.race([
        page.waitForNavigation({ timeout: 30000 }).then(() => ({ type: 'redirect' })),
        page.waitForSelector('.SuccessMessage, [data-testid="success"]', { timeout: 30000 }).then(() => ({ type: 'success' })),
        page.waitForSelector('.Error, .StripeError, [data-testid="error"]', { timeout: 30000 }).then(async () => {
          const errorText = await page.$eval('.Error, .StripeError, [data-testid="error"]', el => el.textContent).catch(() => '');
          return { type: 'error', message: errorText };
        })
      ]).catch(() => ({ type: 'timeout' }));

      const currentUrl = page.url();
      
      await browser.close();
      browser = null;

      if (result.type === 'redirect' || !currentUrl.includes('checkout.stripe.com')) {
        console.log(`[${CLOUDDY_CONFIG.name}] ✅ Pagamento processado!`);
        return { 
          success: true, 
          message: 'Pagamento realizado com sucesso',
          finalUrl: currentUrl 
        };
      }
      
      if (result.type === 'error') {
        return { 
          success: false, 
          error: result.message || 'Erro no pagamento - cartão pode ter sido recusado'
        };
      }

      return { 
        success: false, 
        error: 'Timeout no processamento do pagamento'
      };

    } catch (error) {
      console.error(`[${CLOUDDY_CONFIG.name}] ❌ Erro no Puppeteer:`, error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Preenche formulário do Stripe usando TAB
   */
  async fillStripeForm(page) {
    console.log(`[${CLOUDDY_CONFIG.name}] 📝 Preenchendo campos...`);
    
    // Email
    const emailField = await page.waitForSelector('#email', { timeout: 15000 });
    await emailField.click();
    await sleep(300);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(this.cardEmail, { delay: 50 });
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ Email`);
    await sleep(500);
    
    // Número do cartão
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.type(this.cardNumber, { delay: 30 });
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ Número do cartão`);
    await sleep(500);
    
    // Validade
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.type(this.cardExpiry, { delay: 30 });
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ Validade`);
    await sleep(500);
    
    // CVC
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.type(this.cardCvc, { delay: 30 });
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ CVC`);
    await sleep(500);
    
    // Nome
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.type(this.cardName, { delay: 30 });
    console.log(`[${CLOUDDY_CONFIG.name}] ✅ Nome`);
    await sleep(1000);
  }

  /**
   * Processo completo de ativação
   * @param {string} clientEmail - Email da conta Clouddy do cliente
   * @param {string} clientPassword - Senha da conta Clouddy do cliente
   */
  async activate(clientEmail, clientPassword) {
    try {
      console.log(`[${CLOUDDY_CONFIG.name}] ========== INICIANDO ATIVAÇÃO ==========`);

      // Validar dados do cartão
      if (!this.cardNumber || !this.cardExpiry || !this.cardCvc || !this.cardName || !this.cardEmail) {
        return {
          success: false,
          error: 'Dados do cartão de crédito não configurados pelo revendedor'
        };
      }

      // 1. Login na conta do cliente
      console.log(`[${CLOUDDY_CONFIG.name}] 📌 PASSO 1: Login na conta do cliente`);
      const loginResult = await this.login(clientEmail, clientPassword);
      
      if (!loginResult.success) {
        return {
          success: false,
          error: translateError(loginResult.error) || 'Falha no login - verifique email e senha'
        };
      }

      // 2. Obter URL do Stripe
      console.log(`[${CLOUDDY_CONFIG.name}] 📌 PASSO 2: Obtendo URL do Stripe`);
      const stripeResult = await this.getStripeCheckoutUrl(loginResult.cookieString);
      
      if (!stripeResult.success) {
        return {
          success: false,
          error: translateError(stripeResult.error) || 'Falha ao gerar link de pagamento'
        };
      }

      // 3. Completar pagamento
      console.log(`[${CLOUDDY_CONFIG.name}] 📌 PASSO 3: Completando pagamento`);
      const paymentResult = await this.completeStripePayment(stripeResult.stripeUrl);
      
      if (!paymentResult.success) {
        return {
          success: false,
          error: translateError(paymentResult.error) || 'Falha no pagamento'
        };
      }

      // Sucesso!
      console.log(`[${CLOUDDY_CONFIG.name}] ✅ ATIVAÇÃO CONCLUÍDA COM SUCESSO!`);
      
      return {
        success: true,
        message: this.formatSuccessMessage(clientEmail),
        clientEmail: clientEmail,
        amount: CLOUDDY_CONFIG.amount,
        apiResponse: paymentResult
      };

    } catch (error) {
      console.error(`[${CLOUDDY_CONFIG.name}] ❌ Erro:`, error.message);
      return { 
        success: false, 
        error: translateError(error.message) 
      };
    }
  }

  /**
   * Formata mensagem de sucesso
   */
  formatSuccessMessage(clientEmail) {
    // Calcular data de validade (1 ano)
    const dataValidade = new Date();
    dataValidade.setDate(dataValidade.getDate() + 365);
    const validadeStr = dataValidade.toLocaleDateString('pt-BR');

    let message = `✅ <b>ATIVAÇÃO REALIZADA COM SUCESSO!</b>\n\n`;
    message += `📱 <b>Aplicativo:</b> ${CLOUDDY_CONFIG.name}\n`;
    message += `📧 <b>Email:</b> <code>${clientEmail}</code>\n`;
    message += `📅 <b>Validade:</b> ${validadeStr}\n`;
    message += `💰 <b>Valor:</b> $${CLOUDDY_CONFIG.amount}\n`;
    message += `\n📲 <b>Próximos passos:</b>\n`;
    message += `1. Abra o aplicativo Clouddy\n`;
    message += `2. Faça login com suas credenciais\n`;
    message += `3. O app já deve estar liberado!\n\n`;
    message += `🙏 Obrigado pela preferência!`;

    return message;
  }

  /**
   * Testa conexão (apenas verifica se consegue fazer login)
   */
  async testConnection(testEmail, testPassword) {
    try {
      console.log(`[${CLOUDDY_CONFIG.name}] 🔧 Testando conexão...`);
      
      // Apenas verificar se os dados do cartão estão preenchidos
      if (!this.cardNumber || !this.cardExpiry || !this.cardCvc || !this.cardName || !this.cardEmail) {
        return {
          success: false,
          error: 'Dados do cartão incompletos'
        };
      }

      // Verificar formato do cartão
      if (this.cardNumber.replace(/\s/g, '').length < 13) {
        return {
          success: false,
          error: 'Número do cartão inválido'
        };
      }

      if (this.cardExpiry.length !== 4) {
        return {
          success: false,
          error: 'Validade deve ter 4 dígitos (MMAA)'
        };
      }

      if (this.cardCvc.length < 3) {
        return {
          success: false,
          error: 'CVV deve ter pelo menos 3 dígitos'
        };
      }

      return {
        success: true,
        message: 'Dados do cartão validados com sucesso'
      };

    } catch (error) {
      return {
        success: false,
        error: translateError(error.message)
      };
    }
  }
}

/**
 * Factory function para criar ativador
 */
function createClouddyActivator(cardCredentials) {
  return new ClouddyActivator(cardCredentials);
}

module.exports = {
  ClouddyActivator,
  createClouddyActivator,
  CLOUDDY_CONFIG
};

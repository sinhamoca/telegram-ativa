// ibosol-ratelimit-test/index.js
// Descobrir o rate limit do IboSol para otimizar sistema híbrido
// Envia CAPTCHAs errados propositalmente para não gastar créditos

const axios = require('axios');
const readline = require('readline');

// ============== CONFIGURAÇÕES ==============
const CONFIG = {
  baseUrl: 'https://backend.ibosol.com/api',
  
  // Configurações do teste
  initialDelay: 5000,        // Delay inicial: 5 segundos
  delayIncrement: 5000,      // Aumentar 5 segundos quando rate limited
  maxDelay: 120000,          // Máximo 2 minutos de delay
  maxRequests: 100,          // Máximo de requisições no teste
  maxRateLimits: 5,          // Parar após 5 rate limits no mesmo delay
  
  // Modo de teste
  testMode: 'discovery'      // 'discovery' ou 'stress'
};

// ============== ESTATÍSTICAS ==============
const stats = {
  totalRequests: 0,
  captchaErrors: 0,          // Erros de CAPTCHA (esperado)
  rateLimits: 0,             // "Too Many Attempts"
  otherErrors: 0,
  successfulLogins: 0,       // Não esperado (CAPTCHA aleatório)
  
  // Para análise
  rateLimitEvents: [],       // { requestNum, delay, timestamp }
  currentDelay: CONFIG.initialDelay,
  requestsBeforeRateLimit: [], // Quantas requests até dar rate limit
  
  startTime: null,
  endTime: null
};

// ============== UTILIDADES ==============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function generateRandomCaptcha() {
  // Gera CAPTCHA aleatório de 2-4 caracteres (sempre errado)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const length = Math.floor(Math.random() * 3) + 2; // 2-4 chars
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatTimestamp(date) {
  return date.toLocaleTimeString('pt-BR');
}

// ============== IBOSOL API ==============

async function fetchCaptcha() {
  try {
    const timestamp = Date.now();
    
    const response = await axios.get(
      `${CONFIG.baseUrl}/captcha?t=${timestamp}`,
      {
        headers: {
          'Accept': 'application/json, image/svg+xml',
          'Origin': 'https://b2bibosol.com',
          'Referer': 'https://b2bibosol.com/login',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      }
    );

    const captchaToken = response.headers['x-captcha-token'];
    
    let sessionCookie = null;
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader && setCookieHeader.length > 0) {
      const sessionMatch = setCookieHeader[0].match(/ibosol_session=([^;]+)/);
      if (sessionMatch) {
        sessionCookie = sessionMatch[0];
      }
    }

    return {
      success: true,
      captchaToken,
      sessionCookie
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function attemptLogin(email, password, captchaText, captchaToken, sessionCookie) {
  try {
    const headers = {
      'Content-Type': 'application/json-patch+json',
      'Accept': 'application/json',
      'Origin': 'https://b2bibosol.com',
      'Referer': 'https://b2bibosol.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const response = await axios.post(
      `${CONFIG.baseUrl}/login`,
      {
        email,
        password,
        captcha: captchaText,
        captcha_token: captchaToken
      },
      {
        headers,
        timeout: 15000,
        validateStatus: () => true
      }
    );

    const data = response.data;
    const errorMsg = data?.msg || data?.message || '';

    return {
      success: data?.status === true && data?.token,
      errorMsg,
      isRateLimit: isRateLimitError(errorMsg),
      isCaptchaError: isCaptchaError(errorMsg),
      rawResponse: data
    };

  } catch (error) {
    return {
      success: false,
      errorMsg: error.message,
      isRateLimit: false,
      isCaptchaError: false
    };
  }
}

function isRateLimitError(errorMsg) {
  if (!errorMsg) return false;
  const lowerMsg = errorMsg.toLowerCase();
  return lowerMsg.includes('too many') ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('try again later') ||
    lowerMsg.includes('attempts');
}

function isCaptchaError(errorMsg) {
  if (!errorMsg) return false;
  const lowerMsg = errorMsg.toLowerCase();
  return lowerMsg.includes('captcha') ||
    lowerMsg.includes('invalid') ||
    lowerMsg.includes('incorrect') ||
    lowerMsg.includes('expired');
}

// ============== MAIN ==============

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     IBOSOL RATE LIMIT DISCOVERY TOOL                       ║');
  console.log('║     Descobrir o intervalo seguro entre requisições         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Pedir credenciais
  const email = await askQuestion('📧 Email do IboSol: ');
  const password = await askQuestion('🔑 Senha do IboSol: ');

  console.log('');
  console.log('⚙️  Configurações:');
  console.log(`   • Delay inicial: ${formatTime(CONFIG.initialDelay)}`);
  console.log(`   • Incremento: ${formatTime(CONFIG.delayIncrement)}`);
  console.log(`   • Máximo de requests: ${CONFIG.maxRequests}`);
  console.log(`   • Parar após ${CONFIG.maxRateLimits} rate limits seguidos`);
  console.log('');
  
  const confirm = await askQuestion('🚀 Iniciar teste? (s/n): ');
  if (confirm.toLowerCase() !== 's') {
    console.log('Cancelado.');
    return;
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('');

  stats.startTime = new Date();
  stats.currentDelay = CONFIG.initialDelay;
  
  let consecutiveRateLimits = 0;
  let requestsSinceLastRateLimit = 0;

  // Loop principal de teste
  for (let i = 1; i <= CONFIG.maxRequests; i++) {
    stats.totalRequests++;
    requestsSinceLastRateLimit++;

    const timestamp = formatTimestamp(new Date());
    process.stdout.write(`[${timestamp}] Request #${i} (delay: ${formatTime(stats.currentDelay)})... `);

    // 1. Buscar CAPTCHA
    const captchaResult = await fetchCaptcha();
    if (!captchaResult.success) {
      console.log(`❌ Erro ao buscar CAPTCHA: ${captchaResult.error}`);
      stats.otherErrors++;
      await sleep(stats.currentDelay);
      continue;
    }

    // 2. Gerar CAPTCHA aleatório (propositalmente errado)
    const fakeCaptcha = generateRandomCaptcha();

    // 3. Tentar login
    const loginResult = await attemptLogin(
      email,
      password,
      fakeCaptcha,
      captchaResult.captchaToken,
      captchaResult.sessionCookie
    );

    // 4. Analisar resultado
    if (loginResult.success) {
      // Improvável, mas possível se o CAPTCHA aleatório estiver certo
      console.log(`✅ LOGIN! (captcha "${fakeCaptcha}" acertou por sorte!)`);
      stats.successfulLogins++;
      consecutiveRateLimits = 0;

    } else if (loginResult.isRateLimit) {
      // RATE LIMIT - o que queremos detectar!
      console.log(`🚫 RATE LIMIT! "${loginResult.errorMsg}"`);
      stats.rateLimits++;
      consecutiveRateLimits++;
      
      // Registrar evento
      stats.rateLimitEvents.push({
        requestNum: i,
        delay: stats.currentDelay,
        timestamp: new Date(),
        requestsSinceLast: requestsSinceLastRateLimit
      });
      
      stats.requestsBeforeRateLimit.push(requestsSinceLastRateLimit);
      requestsSinceLastRateLimit = 0;

      // Verificar se deve parar
      if (consecutiveRateLimits >= CONFIG.maxRateLimits) {
        console.log('');
        console.log(`⛔ ${CONFIG.maxRateLimits} rate limits consecutivos com delay de ${formatTime(stats.currentDelay)}`);
        console.log('   Aumentando delay e continuando...');
        console.log('');
        
        stats.currentDelay += CONFIG.delayIncrement;
        consecutiveRateLimits = 0;
        
        if (stats.currentDelay > CONFIG.maxDelay) {
          console.log('⛔ Delay máximo atingido. Encerrando teste.');
          break;
        }
      }

      // Aguardar mais tempo após rate limit
      console.log(`   ⏳ Aguardando ${formatTime(stats.currentDelay * 2)} antes de continuar...`);
      await sleep(stats.currentDelay * 2);
      continue;

    } else if (loginResult.isCaptchaError) {
      // CAPTCHA errado - comportamento esperado e desejado!
      console.log(`✓ CAPTCHA rejeitado (esperado) - "${loginResult.errorMsg}"`);
      stats.captchaErrors++;
      consecutiveRateLimits = 0;

    } else {
      // Outro erro
      console.log(`❌ Erro: ${loginResult.errorMsg}`);
      stats.otherErrors++;
    }

    // Aguardar antes da próxima requisição
    await sleep(stats.currentDelay);
  }

  stats.endTime = new Date();

  // ============== RELATÓRIO FINAL ==============
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                        RELATÓRIO FINAL                             ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  
  const duration = stats.endTime - stats.startTime;
  console.log(`║  ⏱️  Duração do teste: ${formatTime(duration).padEnd(44)}║`);
  console.log(`║  📊 Total de requisições: ${stats.totalRequests.toString().padEnd(41)}║`);
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log(`║  ✓  CAPTCHAs rejeitados (esperado): ${stats.captchaErrors.toString().padEnd(30)}║`);
  console.log(`║  🚫 Rate limits encontrados: ${stats.rateLimits.toString().padEnd(37)}║`);
  console.log(`║  ❌ Outros erros: ${stats.otherErrors.toString().padEnd(48)}║`);
  console.log(`║  ✅ Logins bem-sucedidos: ${stats.successfulLogins.toString().padEnd(40)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Análise dos rate limits
  if (stats.rateLimitEvents.length > 0) {
    console.log('📋 Eventos de Rate Limit:');
    console.log('-'.repeat(70));
    stats.rateLimitEvents.forEach((event, idx) => {
      console.log(`   ${idx + 1}. Request #${event.requestNum} | Delay: ${formatTime(event.delay)} | Requests desde último: ${event.requestsSinceLast}`);
    });
    console.log('');

    // Calcular média de requests antes do rate limit
    if (stats.requestsBeforeRateLimit.length > 0) {
      const avg = stats.requestsBeforeRateLimit.reduce((a, b) => a + b, 0) / stats.requestsBeforeRateLimit.length;
      const min = Math.min(...stats.requestsBeforeRateLimit);
      const max = Math.max(...stats.requestsBeforeRateLimit);
      
      console.log('📊 Análise de Rate Limit:');
      console.log('-'.repeat(70));
      console.log(`   • Média de requests antes do rate limit: ${avg.toFixed(1)}`);
      console.log(`   • Mínimo: ${min} requests`);
      console.log(`   • Máximo: ${max} requests`);
      console.log('');
    }
  }

  // Recomendação
  console.log('💡 RECOMENDAÇÃO:');
  console.log('-'.repeat(70));
  
  if (stats.rateLimits === 0) {
    console.log(`   ✅ Nenhum rate limit com delay de ${formatTime(CONFIG.initialDelay)}`);
    console.log(`   → Delay de ${formatTime(CONFIG.initialDelay)} parece seguro!`);
    console.log(`   → Pode tentar reduzir para testar limite inferior.`);
  } else {
    const safeDelay = stats.currentDelay + CONFIG.delayIncrement;
    console.log(`   ⚠️  Rate limits detectados durante o teste`);
    console.log(`   → Último delay testado: ${formatTime(stats.currentDelay)}`);
    console.log(`   → Delay seguro recomendado: ${formatTime(safeDelay)}`);
    
    if (stats.requestsBeforeRateLimit.length > 0) {
      const avgRequests = stats.requestsBeforeRateLimit.reduce((a, b) => a + b, 0) / stats.requestsBeforeRateLimit.length;
      console.log(`   → Ou limite de ~${Math.floor(avgRequests)} requests em sequência rápida`);
    }
  }

  console.log('');
  console.log('📝 Para o sistema híbrido (Tesseract + 2Captcha):');
  console.log(`   • Use delay de ${formatTime(stats.currentDelay || CONFIG.initialDelay)} entre tentativas`);
  console.log(`   • Ou reduza tentativas do Tesseract para 3-4`);
  console.log('');
}

// Executar
main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

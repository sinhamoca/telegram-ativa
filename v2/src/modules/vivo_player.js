// src/modules/vivo_player.js - Módulo de ativação Vivo Player

const { execSync } = require('child_process');

const BASE_URL = 'https://api.vivo-player.com/graphql';

/**
 * Executa requisição via curl (bypass Cloudflare)
 */
function curlRequest(payload, token = null) {
  const headers = [
    '-H "Content-Type: application/json"',
    '-H "Accept: */*"',
    '-H "Origin: https://panel.vivo-player.com"',
    '-H "Referer: https://panel.vivo-player.com/"',
    '-H "apollo-require-preflight: true"',
    '-H "User-Agent: Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"'
  ];

  if (token) {
    headers.push(`-H "Authorization: Bearer ${token}"`);
  }

  const jsonPayload = JSON.stringify(payload).replace(/'/g, "'\\''");
  
  const cmd = `curl -s -X POST '${BASE_URL}' ${headers.join(' ')} -d '${jsonPayload}'`;
  
  try {
    const result = execSync(cmd, { 
      encoding: 'utf-8', 
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    });
    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Erro na requisição: ${error.message}`);
  }
}

/**
 * Faz login no painel Vivo Player
 */
async function login(email, password) {
  const query = `query login($data: LoginUserInput!) {
  login(loginUserInput: $data) {
    user {
      _id
      username
      email
      roles
      credits
    }
    authToken
  }
}`;

  const payload = {
    operationName: 'login',
    query: query,
    variables: {
      data: { email, password }
    }
  };

  const response = curlRequest(payload);

  if (response.errors) {
    throw new Error(response.errors[0].message);
  }

  return response.data.login;
}

/**
 * Ativa um dispositivo
 */
async function ativarDispositivo(token, macAddress, tipo = "1") {
  const query = `mutation addOrUpdateDeviceMap($payload: CreateDeviceMapInput!, $userId: String) {
  addOrUpdateDeviceMap(payload: $payload, userId: $userId) {
    _id
    device {
      expire_date
      mac_address
    }
  }
}`;

  const payload = {
    operationName: 'addOrUpdateDeviceMap',
    query: query,
    variables: {
      payload: {
        mac_address: macAddress,
        name: '',
        note: '',
        activate_type: tipo
      }
    }
  };

  const response = curlRequest(payload, token);

  if (response.errors) {
    throw new Error(response.errors[0].message);
  }

  return response.data.addOrUpdateDeviceMap;
}

/**
 * Consulta créditos disponíveis
 */
async function consultarCreditos(email, password) {
  try {
    const result = await login(email, password);
    return {
      success: true,
      credits: result.user.credits,
      username: result.user.username,
      email: result.user.email
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      credits: 0
    };
  }
}

/**
 * Processa ativação completa
 */
async function processarAtivacao(credenciais, macAddress, tier = 'YEAR') {
  const { email, senha } = credenciais;

  console.log(`[VivoPlayer] Iniciando ativação para MAC: ${macAddress}`);

  try {
    // 1. Login
    console.log('[VivoPlayer] Fazendo login...');
    const loginResult = await login(email, senha);
    
    console.log(`[VivoPlayer] Logado! Créditos: ${loginResult.user.credits}`);

    // 2. Verificar créditos
    if (loginResult.user.credits <= 0) {
      return {
        success: false,
        error: 'Créditos insuficientes no painel',
        credits: 0
      };
    }

    // 3. Ativar dispositivo
    // tipo "1" = ativação padrão (anual)
    console.log('[VivoPlayer] Ativando dispositivo...');
    const ativResult = await ativarDispositivo(loginResult.authToken, macAddress, "1");

    // 4. Calcular validade
    const expireDate = new Date(ativResult.device.expire_date);
    const validadeFormatada = expireDate.toLocaleDateString('pt-BR');

    console.log(`[VivoPlayer] ✅ Ativação concluída! Validade: ${validadeFormatada}`);

    return {
      success: true,
      message: `✅ <b>ATIVAÇÃO REALIZADA!</b>\n\n` +
               `📱 <b>App:</b> Vivo Player\n` +
               `📍 <b>MAC:</b> <code>${ativResult.device.mac_address}</code>\n` +
               `📅 <b>Validade:</b> ${validadeFormatada}\n` +
               `🆔 <b>ID:</b> ${ativResult._id}`,
      expireDate: expireDate,
      deviceId: ativResult._id,
      macAddress: ativResult.device.mac_address,
      creditsRemaining: loginResult.user.credits - 1,
      apiResponse: ativResult
    };

  } catch (error) {
    console.error('[VivoPlayer] Erro:', error.message);
    
    // Tratar erros conhecidos
    let mensagemErro = error.message;
    
    if (mensagemErro.includes('Invalid credentials') || mensagemErro.includes('Unauthorized')) {
      mensagemErro = 'Credenciais inválidas no painel';
    } else if (mensagemErro.includes('already exists') || mensagemErro.includes('already activated')) {
      mensagemErro = 'Este MAC já está ativado';
    } else if (mensagemErro.includes('Invalid mac')) {
      mensagemErro = 'MAC Address inválido';
    }

    return {
      success: false,
      error: mensagemErro,
      apiResponse: { error: error.message }
    };
  }
}

/**
 * Testa as credenciais
 */
async function testarCredenciais(email, senha) {
  try {
    const result = await login(email, senha);
    return {
      success: true,
      message: `✅ Credenciais válidas!\n\n` +
               `👤 Usuário: ${result.user.username}\n` +
               `📧 Email: ${result.user.email}\n` +
               `💰 Créditos: ${result.user.credits}`,
      credits: result.user.credits,
      username: result.user.username
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ Falha: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Retorna saldo de créditos
 */
async function getSaldo(email, senha) {
  try {
    const result = await login(email, senha);
    return result.user.credits;
  } catch (error) {
    console.error('[VivoPlayer] Erro ao consultar saldo:', error.message);
    return 0;
  }
}

module.exports = {
  login,
  ativarDispositivo,
  consultarCreditos,
  processarAtivacao,
  testarCredenciais,
  getSaldo
};

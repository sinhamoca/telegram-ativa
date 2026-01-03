const axios = require('axios');

/**
 * Cliente para API de Automação Web
 * Use este cliente na VPS principal para chamar a API na VPS do FlareSolverr
 */
class AutomationClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://95.217.161.109:3099';
        this.secret = options.secret || 'sua_chave_secreta_aqui';
        this.timeout = options.timeout || 120000; // 2 minutos
    }
    
    async request(endpoint, data = {}) {
        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.secret}`
                },
                timeout: this.timeout
            });
            
            return response.data;
        } catch (error) {
            if (error.response) {
                return error.response.data;
            }
            throw error;
        }
    }
    
    // ===== META PLAYER =====
    
    async metaPlayerLogin(username, password) {
        return this.request('/metaplayer/login', { username, password });
    }
    
    async metaPlayerConnect(cookies, userAgent, mac, otpCode) {
        return this.request('/metaplayer/connect', { cookies, userAgent, mac, otpCode });
    }
    
    async metaPlayerActivate(cookies, userAgent, mac, code) {
        return this.request('/metaplayer/activate', { cookies, userAgent, mac, code });
    }
    
    /**
     * Login + Connect em uma única chamada (recomendado)
     * Evita problemas de sessão/Cloudflare entre chamadas separadas
     */
    async metaPlayerFull(username, password, mac, otpCode) {
        return this.request('/metaplayer/full', { username, password, mac, otpCode });
    }
    
    /**
     * Consultar saldo de créditos
     */
    async metaPlayerCredits(username, password) {
        return this.request('/metaplayer/credits', { username, password });
    }
    
    // ===== SMART ONE =====
    
    async smartOneLogin(username, password, twoCaptchaKey) {
        return this.request('/smartone/login', { username, password, twoCaptchaKey });
    }
    
    async smartOneActivate(username, password, twoCaptchaKey, mac, code) {
        return this.request('/smartone/activate', { username, password, twoCaptchaKey, mac, code });
    }
    
    // ===== HEALTH =====
    
    async health() {
        return this.request('/health');
    }
}

module.exports = AutomationClient;

// ===== EXEMPLO DE USO =====

async function exemplo() {
    const client = new AutomationClient({
        baseUrl: 'http://95.217.161.109:3099',
        secret: 'sua_chave_secreta_aqui'  // Use a mesma chave do servidor!
    });
    
    // Health check
    console.log('Health check...');
    const health = await client.health();
    console.log(health);
    
    // Meta Player Login
    console.log('\nMeta Player Login...');
    const loginResult = await client.metaPlayerLogin('isaac', '10203040I');
    console.log(loginResult);
    
    if (loginResult.success) {
        // Meta Player Ativar
        console.log('\nMeta Player Ativar...');
        const activateResult = await client.metaPlayerActivate(
            loginResult.cookies,
            loginResult.userAgent,
            'AA:BB:CC:DD:EE:FF',
            '123456'
        );
        console.log(activateResult);
    }
    
    // SmartOne (exemplo)
    // const smartResult = await client.smartOneActivate(
    //     'usuario', 'senha', 'chave_2captcha',
    //     'AA:BB:CC:DD:EE:FF', '123456'
    // );
}

if (require.main === module) {
    exemplo().catch(console.error);
}
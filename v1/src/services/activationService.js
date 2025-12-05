// src/services/activationService.js - Orquestra o processo de ativação

const db = require('../database');
const config = require('../config');
const { createActivator: createIboProActivator } = require('../modules/ibo_pro');
const { createActivator: createIboSolActivator } = require('../modules/ibosol');
const { createActivator: createVuPlayerProActivator } = require('../modules/vu_player_pro');
const { createActivator: createEnzoPlayerActivator } = require('../modules/enzo_player');
const { createActivator: createDreamTVActivator } = require('../modules/dreamtv');
const multiPlayerModule = require('../modules/multi_player');

// Lista de módulos que usam IboSol
const IBOSOL_MODULES = [
  'ibo_player', 'bob_player', 'bob_pro', 'bob_premium', 'mac_player',
  'smartone_pro', 'duplex', 'king_4k', 'flixnet', 'abe_player',
  'virginia', 'all_player', 'hush_play', 'ktn_player', 'family_player',
  'iboss_player', 'ibo_stb', 'iboxx_player', 'ibosol_player'
];

// Lista de módulos que usam Multi-Player (prefixo mp_)
const MULTI_PLAYER_MODULES = [
  'mp_iptv_player_io', 'mp_iptv_ott', 'mp_iptv_4k', 'mp_iptv_stream',
  'mp_iptv_player', 'mp_iptv_play', 'mp_iptv_plus', 'mp_iptv_pro',
  'mp_pro_player', 'mp_iptv_star', 'mp_tvip_player', 'mp_ego_iptv',
  'mp_scandic_iptv', 'mp_flixtra', 'mp_ibo_premium', 'mp_duplex'
];

class ActivationService {
  constructor() {
    this.activators = {};
  }

  /**
   * Obtém o tipo de credencial para um módulo
   */
  getCredentialType(modulo) {
    const moduloConfig = config.MODULOS[modulo];
    return moduloConfig?.credencial || modulo;
  }

  /**
   * Obtém o ativador correto baseado no módulo
   */
  getActivator(modulo, credentials) {
    if (modulo === 'ibo_pro') {
      return createIboProActivator(credentials);
    }
    
    if (IBOSOL_MODULES.includes(modulo)) {
      return createIboSolActivator(modulo, credentials);
    }

    if (modulo === 'vu_player_pro') {
      return createVuPlayerProActivator(credentials);
    }

    if (modulo === 'enzo_player') {
      return createEnzoPlayerActivator(credentials);
    }

    if (modulo === 'dreamtv') {
      return createDreamTVActivator(credentials);
    }

    // Multi-Player modules
    if (MULTI_PLAYER_MODULES.includes(modulo) || modulo.startsWith('mp_')) {
      const moduloConfig = config.MODULOS[modulo];
      const appId = moduloConfig?.app_id || 1;
      
      // Criar wrapper que adapta a interface
      return {
        activate: async (mac, tier) => {
          const result = await multiPlayerModule.activate(credentials, mac, { 
            app_id: appId, 
            tier 
          });
          
          // Adaptar resposta para o formato esperado
          if (result.success) {
            return {
              success: true,
              message: result.message,
              macAddress: result.data?.mac,
              expireDate: result.data?.expiryFormatted || result.data?.expiry,
              apiResponse: result.data
            };
          }
          return result;
        },
        
        extractMacAddress: (mac) => {
          const validation = multiPlayerModule.validateMac(mac);
          return validation.valid ? validation.formatted : null;
        },
        
        testConnection: async () => {
          return await multiPlayerModule.testConnection(credentials);
        },
        
        getSaldo: async () => {
          return await multiPlayerModule.getCredits(credentials);
        }
      };
    }
    
    throw new Error(`Módulo não suportado: ${modulo}`);
  }

  /**
   * Processa uma ativação completa
   */
  async processarAtivacao(pedidoId) {
    const pedido = db.pedidos.buscarPorId(pedidoId);
    if (!pedido) {
      return { success: false, error: 'Pedido não encontrado' };
    }

    const produto = db.produtos.buscarPorId(pedido.produto_id);
    if (!produto) {
      return { success: false, error: 'Produto não encontrado' };
    }

    const bot = db.bots.buscarPorId(pedido.bot_id);
    if (!bot) {
      return { success: false, error: 'Bot não encontrado' };
    }

    const usuario = db.usuarios.buscarPorId(bot.usuario_id);
    if (!usuario) {
      return { success: false, error: 'Usuário não encontrado' };
    }

    // Verificar se o revendedor pode ativar
    const podeAtivar = db.usuarios.podeAtivar(usuario.id);
    if (!podeAtivar.pode) {
      db.pedidos.marcarErro(pedidoId, podeAtivar.motivo);
      return { success: false, error: podeAtivar.motivo };
    }

    // Buscar credenciais do módulo (usando tipo correto)
    const credentialType = this.getCredentialType(produto.modulo);
    const credenciaisDB = db.credenciais.buscar(usuario.id, credentialType);
    
    if (!credenciaisDB) {
      const credNome = config.CREDENCIAIS[credentialType]?.nome || credentialType;
      db.pedidos.marcarErro(pedidoId, `Credenciais ${credNome} não configuradas`);
      return { success: false, error: `Credenciais ${credNome} não configuradas` };
    }

    try {
      console.log(`[Activation] Processando pedido ${pedido.codigo} - MAC: ${pedido.mac_address}`);
      console.log(`[Activation] Módulo: ${produto.modulo}, Tier: ${produto.tier}`);

      // Obter ativador
      const activator = this.getActivator(produto.modulo, credenciaisDB.dados);

      // Executar ativação
      const resultado = await activator.activate(pedido.mac_address, produto.tier);

      // Registrar no histórico
      db.ativacoes.criar(
        pedidoId,
        usuario.id,
        pedido.mac_address,
        produto.modulo,
        produto.tier,
        resultado.apiResponse || resultado,
        resultado.success
      );

      if (resultado.success) {
        // Marcar pedido como ativado
        db.pedidos.marcarAtivado(pedidoId);

        // Decrementar ativações do revendedor (se não for ilimitado)
        if (usuario.ativacoes_restantes !== null) {
          db.usuarios.decrementarAtivacao(usuario.id);
        }

        console.log(`[Activation] ✅ Pedido ${pedido.codigo} ativado com sucesso`);

        return {
          success: true,
          message: resultado.message,
          macAddress: resultado.macAddress,
          expireDate: resultado.expireDate
        };
      } else {
        db.pedidos.marcarErro(pedidoId, resultado.error);
        
        console.log(`[Activation] ❌ Pedido ${pedido.codigo} falhou: ${resultado.error}`);

        return {
          success: false,
          error: resultado.error
        };
      }

    } catch (error) {
      console.error(`[Activation] Erro ao processar pedido ${pedido.codigo}:`, error);
      
      db.pedidos.marcarErro(pedidoId, error.message);
      
      db.ativacoes.criar(
        pedidoId,
        usuario.id,
        pedido.mac_address,
        produto.modulo,
        produto.tier,
        { error: error.message },
        false
      );

      return {
        success: false,
        error: `Erro interno: ${error.message}`
      };
    }
  }

  /**
   * Valida MAC address antes de criar pedido
   */
  validarMac(modulo, macAddress) {
    try {
      // Credenciais vazias só para validar MAC
      const dummyCredentials = modulo === 'ibo_pro' 
        ? { username: '', password: '' }
        : { email: '', password: '' };
        
      const activator = this.getActivator(modulo, dummyCredentials);
      const macExtraido = activator.extractMacAddress(macAddress);
      
      return {
        valido: !!macExtraido,
        macFormatado: macExtraido,
        erro: macExtraido ? null : 'MAC Address inválido. Envie no formato: AA:BB:CC:DD:EE:FF'
      };
    } catch (error) {
      return {
        valido: false,
        erro: error.message
      };
    }
  }

  /**
   * Testa credenciais de um módulo
   */
  async testarCredenciais(modulo, credentials) {
    try {
      const activator = this.getActivator(modulo, credentials);
      const resultado = await activator.testConnection();
      
      return resultado;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Busca saldo de créditos de um módulo
   */
  async getSaldo(modulo, credentials) {
    try {
      const activator = this.getActivator(modulo, credentials);
      
      if (typeof activator.getSaldo !== 'function') {
        return {
          success: false,
          error: 'Este módulo não suporta consulta de saldo'
        };
      }

      const resultado = await activator.getSaldo();
      return resultado;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Busca saldo usando tipo de credencial diretamente
   */
  async getSaldoPorCredencial(credentialType, credentials) {
    try {
      // Para ibosol, usar qualquer módulo ibosol (ibo_player por exemplo)
      if (credentialType === 'ibosol') {
        return await this.getSaldo('ibo_player', credentials);
      }
      
      // Para multi_player, usar o módulo diretamente
      if (credentialType === 'multi_player') {
        return await multiPlayerModule.getCredits(credentials);
      }
      
      return await this.getSaldo(credentialType, credentials);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Singleton
const activationService = new ActivationService();

module.exports = activationService;
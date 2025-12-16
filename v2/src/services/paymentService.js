// src/services/paymentService.js - Serviço de pagamentos via Mercado Pago

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class PaymentService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.mercadopago.com';
  }

  /**
   * Verifica se o serviço está configurado
   */
  isConfigured() {
    return !!this.accessToken;
  }

  /**
   * Cria um pagamento PIX
   */
  async criarPixPayment(valor, descricao, externalReference) {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Access token não configurado' };
      }

      console.log(`[Payment] Criando PIX: R$${valor} - ${descricao}`);

      const idempotencyKey = uuidv4();
      
      const payload = {
        transaction_amount: valor,
        description: descricao,
        payment_method_id: 'pix',
        external_reference: externalReference,
        payer: {
          email: 'cliente@email.com',
          first_name: 'Cliente',
          last_name: 'Telegram'
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/payments`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': idempotencyKey
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.id) {
        const pixData = response.data.point_of_interaction?.transaction_data;
        
        return {
          success: true,
          paymentId: response.data.id.toString(),
          status: response.data.status,
          qrCode: pixData?.qr_code,
          qrCodeBase64: pixData?.qr_code_base64,
          copiaCola: pixData?.qr_code,
          expirationDate: response.data.date_of_expiration
        };
      }

      return {
        success: false,
        error: 'Resposta inválida do Mercado Pago'
      };

    } catch (error) {
      console.error('[Payment] Erro ao criar PIX:', error.message);
      
      if (error.response) {
        const errorMsg = error.response.data?.message || error.response.data?.error || 'Erro desconhecido';
        return {
          success: false,
          error: `Erro MP: ${errorMsg}`,
          details: error.response.data
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Consulta status de um pagamento
   */
  async consultarPagamento(paymentId) {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Access token não configurado' };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/payments/${paymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 15000
        }
      );

      return {
        success: true,
        paymentId: response.data.id.toString(),
        status: response.data.status,
        statusDetail: response.data.status_detail,
        valor: response.data.transaction_amount,
        externalReference: response.data.external_reference,
        pago: response.data.status === 'approved'
      };

    } catch (error) {
      console.error('[Payment] Erro ao consultar pagamento:', error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Testa conexão com Mercado Pago
   */
  async testarConexao() {
    try {
      if (!this.isConfigured()) {
        return { success: false, error: 'Access token não configurado' };
      }

      const response = await axios.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 15000
        }
      );

      return {
        success: true,
        userId: response.data.id,
        email: response.data.email,
        siteId: response.data.site_id
      };

    } catch (error) {
      console.error('[Payment] Erro ao testar conexão:', error.message);
      
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

/**
 * Cria instância do serviço de pagamento
 */
function createPaymentService(accessToken) {
  return new PaymentService(accessToken);
}

module.exports = {
  PaymentService,
  createPaymentService
};

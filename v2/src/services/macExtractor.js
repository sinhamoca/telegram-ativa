// src/services/macExtractor.js - Extrator de MAC Address por OCR

const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');

class MacExtractor {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.isInitializing = false;
  }

  async init() {
    if (this.isReady) return;
    if (this.isInitializing) {
      // Aguardar inicialização em andamento
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    this.isInitializing = true;
    
    try {
      console.log('[MacExtractor] Inicializando Tesseract...');
      this.worker = await createWorker('eng');
      
      // Configura para melhor reconhecimento de caracteres alfanuméricos
      await this.worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFabcdef:-',
      });
      
      this.isReady = true;
      console.log('[MacExtractor] ✅ Tesseract pronto!');
    } catch (error) {
      console.error('[MacExtractor] ❌ Erro ao inicializar:', error.message);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      console.log('[MacExtractor] Worker encerrado');
    }
  }

  /**
   * Valida se é um MAC válido (aceita caracteres atípicos como J, K, Z)
   */
  isValidMac(mac) {
    const cleanMac = mac.toUpperCase().replace(/[:-]/g, '');
    if (cleanMac.length !== 12) return false;
    // Aceita caracteres alfanuméricos (alguns apps usam letras fora do hex)
    return /^[0-9A-Z]{12}$/.test(cleanMac);
  }

  /**
   * Valida se é um MAC hexadecimal estrito
   */
  isStrictHexMac(mac) {
    const cleanMac = mac.toUpperCase().replace(/[:-]/g, '');
    if (cleanMac.length !== 12) return false;
    return /^[0-9A-F]{12}$/.test(cleanMac);
  }

  /**
   * Normaliza o MAC para formato padrão (XX:XX:XX:XX:XX:XX)
   */
  normalizeMac(mac) {
    const clean = mac.toUpperCase().replace(/[:-]/g, '');
    return clean.match(/.{2}/g).join(':');
  }

  /**
   * Corrige erros comuns do OCR
   */
  fixOcrErrors(text) {
    return text
      .replace(/O/gi, '0')  // O -> 0
      .replace(/I/gi, '1')  // I -> 1
      .replace(/l/g, '1')   // l -> 1
      .replace(/S/gi, '5')  // S -> 5
      .replace(/G/gi, '6')  // G -> 6
      .replace(/Z/gi, '2')  // Z -> 2
      .replace(/\s+/g, '')  // Remove espaços
      .replace(/;/g, ':');  // ; -> :
  }

  /**
   * Extrai MACs de uma imagem
   */
  async extractFromImage(imagePath) {
    if (!this.isReady) await this.init();

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Arquivo não encontrado: ${imagePath}`);
    }

    console.log(`[MacExtractor] 📷 Processando: ${path.basename(imagePath)}`);
    
    const { data: { text } } = await this.worker.recognize(imagePath);
    
    console.log(`[MacExtractor] Texto extraído: ${text.substring(0, 200)}...`);
    
    // Regex para capturar MACs (formato XX:XX:XX:XX:XX:XX ou XX-XX-XX-XX-XX-XX)
    const macRegex = /([0-9A-Za-z]{2}[:-]){5}[0-9A-Za-z]{2}/g;
    
    let macs = text.match(macRegex) || [];
    
    // Se não encontrou, tenta corrigir erros comuns do OCR
    if (macs.length === 0) {
      const fixedText = this.fixOcrErrors(text);
      macs = fixedText.match(macRegex) || [];
    }

    // Tenta também encontrar MACs sem separador (12 caracteres hex seguidos)
    if (macs.length === 0) {
      const noSepRegex = /[0-9A-Fa-f]{12}/g;
      const noSepMacs = text.replace(/\s/g, '').match(noSepRegex) || [];
      macs = noSepMacs.map(m => m.match(/.{2}/g).join(':'));
    }

    // Filtra e normaliza
    const validMacs = macs
      .filter(mac => this.isValidMac(mac))
      .map(mac => this.normalizeMac(mac));

    // Remove duplicados
    const uniqueMacs = [...new Set(validMacs)];

    console.log(`[MacExtractor] ✅ ${uniqueMacs.length} MAC(s) encontrado(s):`, uniqueMacs);

    return {
      macs: uniqueMacs,
      count: uniqueMacs.length,
      rawText: text
    };
  }

  /**
   * Extrai MAC de um buffer de imagem
   */
  async extractFromBuffer(buffer, filename = 'image.jpg') {
    // Salvar temporariamente
    const tempPath = path.join('/tmp', `mac_extract_${Date.now()}_${filename}`);
    
    try {
      fs.writeFileSync(tempPath, buffer);
      const result = await this.extractFromImage(tempPath);
      return result;
    } finally {
      // Limpar arquivo temporário
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        console.error('[MacExtractor] Erro ao limpar temp:', e.message);
      }
    }
  }
}

// Singleton - mantém o worker ativo para melhor performance
let instance = null;

function getMacExtractor() {
  if (!instance) {
    instance = new MacExtractor();
  }
  return instance;
}

module.exports = {
  MacExtractor,
  getMacExtractor
};

// Global data management
const AppState = {
  commands: [],
  operators: [],
  sectors: [],
  risks: [],
  measures: [],

  loadFromLocalStorage() {
    const stored = localStorage.getItem('appData');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.commands = data.commands || [];
        this.operators = data.operators || [];
        this.sectors = data.sectors || [];
        this.risks = data.risks || [];
        this.measures = data.measures || [];
        return true;
      } catch (e) {
        console.error('Error loading from localStorage', e);
        return false;
      }
    }
    return false;
  },

  saveToLocalStorage() {
    localStorage.setItem('appData', JSON.stringify({
      commands: this.commands,
      operators: this.operators,
      sectors: this.sectors,
      risks: this.risks,
      measures: this.measures
    }));
  },

  getCommandById(id) {
    return this.commands.find(c => c.id === id || c.order_number === id);
  },

  updateCommand(id, data) {
    const cmd = this.getCommandById(id);
    if (cmd) {
      Object.assign(cmd, data);
      this.saveToLocalStorage();
      return true;
    }
    return false;
  },

  setCommandStatus(id, status) {
    return this.updateCommand(id, { status });
  },

  getSelectedMeasures(commandId) {
    const key = `measures_${commandId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  },

  setSelectedMeasures(commandId, measures) {
    const key = `measures_${commandId}`;
    localStorage.setItem(key, JSON.stringify(measures));
  },

  getSelectedTrades(commandId) {
    const key = `trades_${commandId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  },

  setSelectedTrades(commandId, trades) {
    const key = `trades_${commandId}`;
    localStorage.setItem(key, JSON.stringify(trades));
  }
};

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getStatusBadge(status) {
  if (status === 'sent') {
    return '<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">✓ Envoyé</span>';
  }
  return '<span class="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">À envoyer</span>';
}

function calculateStats() {
  const total = AppState.commands.length;
  const pending = AppState.commands.filter(c => c.status === 'pending').length;
  const sent = AppState.commands.filter(c => c.status === 'sent').length;
  const totalAmount = AppState.commands.reduce((sum, c) => sum + (c.amount_ttc || 0), 0);

  return { total, pending, sent, totalAmount };
}

// Load data on page init
document.addEventListener('DOMContentLoaded', () => {
  // Try to load from localStorage first
  if (!AppState.loadFromLocalStorage()) {
    // If no saved data, try to load sample data
    loadSampleData();
  }
});

async function loadSampleData() {
  try {
    const response = await fetch('data/sample-data.json');
    if (response.ok) {
      const data = await response.json();
      AppState.commands = data.commands || [];
      AppState.operators = data.operators || [];
      AppState.sectors = data.sectors || [];
      AppState.risks = data.risks || [];
      AppState.measures = data.measures || [];
      AppState.saveToLocalStorage();
      return true;
    }
  } catch (e) {
    console.error('Error loading sample data', e);
  }
  return false;
}

// Get unique values from commands
function getUniqueOperators() {
  return [...new Set(AppState.commands.map(c => c.operator))].map(op => {
    const operatorObj = AppState.operators.find(o => o.code === op);
    return { code: op, name: operatorObj?.name || op };
  });
}

function getUniqueSectors() {
  return [...new Set(AppState.commands.map(c => c.sector))].map(sec => {
    const sectorObj = AppState.sectors.find(s => s.code === sec);
    return { code: sec, name: sectorObj?.name || sec };
  });
}

// Default trades for commands (since we don't have a separate trades list per command in sample data)
function getTradesForCommand(command) {
  // Return some default trades based on work nature
  const nature = command.work_nature || '';

  const tradesMappings = {
    'Revêtement': ['0201', '0301'],
    'Isolation': ['0401', '0402'],
    'Électrique': ['0501'],
    'Plomberie': ['0601'],
    'Toiture': ['0701'],
    'Maçonnerie': ['0801'],
    'Charpente': ['0901'],
    'Éclairage': ['0501', '1001']
  };

  for (const [key, trades] of Object.entries(tradesMappings)) {
    if (nature.includes(key)) {
      return trades;
    }
  }

  return ['0101', '0102']; // Default trades
}

// Risk assessment - return risks based on work nature
function getApplicableRisks(workNature) {
  // Simple mapping of work nature to risks
  const riskMappings = {
    'Chute': ['R001', 'R003'],
    'Électrique': ['R002'],
    'Bruit': ['R006'],
    'Poussière': ['R008'],
    'Hauteur': ['R001'],
    'Toiture': ['R001', 'R005'],
    'Isolation': ['R008', 'R009']
  };

  let applicableRisks = new Set();
  for (const [key, risks] of Object.entries(riskMappings)) {
    if (workNature.includes(key)) {
      risks.forEach(r => applicableRisks.add(r));
    }
  }

  return Array.from(applicableRisks).length > 0 ?
    Array.from(applicableRisks) :
    ['R001', 'R006', 'R008']; // Default risks
}

// Initialize page
function initializePage() {
  if (AppState.commands.length === 0) {
    loadSampleData().then(() => {
      if (typeof onDataLoaded === 'function') {
        onDataLoaded();
      }
    });
  } else {
    if (typeof onDataLoaded === 'function') {
      onDataLoaded();
    }
  }
}

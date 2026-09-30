// Details Page Logic

document.addEventListener('DOMContentLoaded', () => {
  const commandId = getQueryParam('id');

  if (!commandId) {
    document.getElementById('errorMsg').textContent = 'Erreur: Aucun ID de commande fourni';
    document.getElementById('errorMsg').classList.remove('hidden');
    return;
  }

  const command = AppState.getCommandById(commandId);
  if (!command) {
    document.getElementById('errorMsg').textContent = `Erreur: Commande ${commandId} non trouvée`;
    document.getElementById('errorMsg').classList.remove('hidden');
    return;
  }

  // Load data first
  if (AppState.commands.length === 0) {
    loadSampleData().then(() => {
      populateForm(commandId);
    });
  } else {
    populateForm(commandId);
  }

  // Set up event listeners
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('previewBtn').addEventListener('click', saveAndPreview);
});

function populateForm(commandId) {
  const command = AppState.getCommandById(commandId);
  if (!command) return;

  // Set page title
  document.getElementById('pageTitle').textContent = `Détails de la Commande ${command.order_number}`;

  // Fill command info
  document.getElementById('orderNumber').value = command.order_number;
  document.getElementById('operator').value = command.operator;
  document.getElementById('company').value = command.company_name || command.id;
  document.getElementById('address').value = command.address;
  document.getElementById('workNature').value = command.work_nature;
  document.getElementById('workDescription').value = command.work_description;
  document.getElementById('amount').value = formatCurrency(command.amount_ttc);

  // Load stored values
  const storedAddress = localStorage.getItem(`address_${commandId}`);
  if (storedAddress) {
    document.getElementById('address').value = storedAddress;
  }

  const storedDescription = localStorage.getItem(`description_${commandId}`);
  if (storedDescription) {
    document.getElementById('workDescription').value = storedDescription;
  }

  // Populate trades
  populateTrades(command, commandId);

  // Populate measures
  populateMeasures(command, commandId);
}

function populateTrades(command, commandId) {
  const tradesContainer = document.getElementById('tradesContainer');
  tradesContainer.innerHTML = '';

  const trades = getTradesForCommand(command);
  const selectedTrades = AppState.getSelectedTrades(commandId);

  trades.forEach(tradeCode => {
    const isChecked = selectedTrades.includes(tradeCode);
    const label = document.createElement('label');
    label.className = 'flex items-center cursor-pointer';
    label.innerHTML = `
      <input type="checkbox" class="trade-checkbox mr-3" value="${tradeCode}" ${isChecked ? 'checked' : ''}>
      <span class="text-sm">${tradeCode} - Métier correspondant</span>
    `;
    tradesContainer.appendChild(label);
  });

  // Add event listeners to trades
  document.querySelectorAll('.trade-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const selected = Array.from(document.querySelectorAll('.trade-checkbox:checked')).map(cb => cb.value);
      AppState.setSelectedTrades(commandId, selected);
    });
  });
}

function populateMeasures(command, commandId) {
  const measuresContainer = document.getElementById('measuresContainer');
  measuresContainer.innerHTML = '';

  const selectedMeasures = AppState.getSelectedMeasures(commandId);

  AppState.measures.forEach(measure => {
    const isChecked = selectedMeasures.includes(measure.code);
    const label = document.createElement('label');
    label.className = 'flex items-center cursor-pointer p-2 hover:bg-gray-100 rounded';
    label.innerHTML = `
      <input type="checkbox" class="measure-checkbox mr-3" value="${measure.code}" ${isChecked ? 'checked' : ''}>
      <span class="text-sm">
        <strong>${measure.code}</strong><br>
        ${measure.name}
      </span>
    `;
    measuresContainer.appendChild(label);
  });

  // Add event listeners to measures
  document.querySelectorAll('.measure-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const selected = Array.from(document.querySelectorAll('.measure-checkbox:checked')).map(cb => cb.value);
      AppState.setSelectedMeasures(commandId, selected);
    });
  });
}

function saveAndPreview() {
  const commandId = getQueryParam('id');

  // Save modified fields
  const address = document.getElementById('address').value;
  const description = document.getElementById('workDescription').value;

  localStorage.setItem(`address_${commandId}`, address);
  localStorage.setItem(`description_${commandId}`, description);

  // Check if measures are selected
  const selectedMeasures = AppState.getSelectedMeasures(commandId);
  if (selectedMeasures.length === 0) {
    alert('Veuillez sélectionner au moins une mesure de sécurité');
    return;
  }

  // Redirect to preview
  window.location.href = `preview.html?id=${encodeURIComponent(commandId)}`;
}

function goBack() {
  window.history.back();
}

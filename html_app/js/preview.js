// Preview & PDF Export

document.addEventListener('DOMContentLoaded', () => {
  const commandId = getQueryParam('id');

  if (!commandId) {
    document.body.innerHTML = '<div class="text-center mt-20"><h2 class="text-2xl font-bold">Erreur: Pas de commande spécifiée</h2></div>';
    return;
  }

  // Load data if needed
  if (AppState.commands.length === 0) {
    loadSampleData().then(() => {
      populatePreview(commandId);
    });
  } else {
    populatePreview(commandId);
  }

  // Set up button listeners
  document.getElementById('downloadBtn').addEventListener('click', () => downloadPDF(commandId));
  document.getElementById('markSentBtn').addEventListener('click', () => markAsSent(commandId));
  document.getElementById('editBtn').addEventListener('click', () => goBackToEdit(commandId));
});

function populatePreview(commandId) {
  const command = AppState.getCommandById(commandId);
  if (!command) {
    document.body.innerHTML = '<div class="text-center mt-20"><h2 class="text-2xl font-bold">Erreur: Commande non trouvée</h2></div>';
    return;
  }

  // Get custom values if they were edited
  const customAddress = localStorage.getItem(`address_${commandId}`) || command.address;
  const customDescription = localStorage.getItem(`description_${commandId}`) || command.work_description;

  // Fill in command details
  document.getElementById('pdf-orderNumber').textContent = command.order_number;
  document.getElementById('pdf-workNature').textContent = command.work_nature;
  document.getElementById('pdf-company').textContent = command.company_name || command.id;
  document.getElementById('pdf-address').textContent = customAddress;
  document.getElementById('pdf-amount').textContent = formatCurrency(command.amount_ttc);
  document.getElementById('pdf-workDescription').textContent = customDescription;
  document.getElementById('pdf-date').textContent = new Date().toLocaleDateString('fr-FR');

  // Populate trades
  const trades = getTradesForCommand(command);
  const tradesHtml = trades.map(trade => `<li>${trade} - Métier correspondant</li>`).join('');
  document.getElementById('pdf-trades').innerHTML = tradesHtml;

  // Populate risks
  const risks = getApplicableRisks(command.work_nature);
  const riskElements = risks.map(riskCode => {
    const risk = AppState.risks.find(r => r.code === riskCode);
    return `<li>${risk ? risk.code + ' - ' + risk.name : riskCode}</li>`;
  }).join('');
  document.getElementById('pdf-risks').innerHTML = riskElements;

  // Populate selected measures
  const selectedMeasures = AppState.getSelectedMeasures(commandId);
  if (selectedMeasures.length === 0) {
    document.getElementById('pdf-measures').innerHTML = '<p class="text-gray-500">Aucune mesure sélectionnée</p>';
  } else {
    const measuresHtml = selectedMeasures.map(measureCode => {
      const measure = AppState.measures.find(m => m.code === measureCode);
      return `
        <div class="bg-green-50 border-l-4 border-green-500 pl-4 py-2">
          <strong>✓ ${measure?.code || measureCode}</strong><br>
          <span class="text-gray-700">${measure?.name || ''}</span>
        </div>
      `;
    }).join('');
    document.getElementById('pdf-measures').innerHTML = measuresHtml;
  }
}

function downloadPDF(commandId) {
  const element = document.getElementById('pdfContent');
  const command = AppState.getCommandById(commandId);

  const opt = {
    margin: 10,
    filename: `plan-prevention-${command.order_number}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // Create a promise that returns the PDF
  html2pdf().set(opt).from(element).save().then(() => {
    // After download, show success message
    const successMsg = document.getElementById('successMsg');
    successMsg.classList.remove('hidden');
    setTimeout(() => {
      successMsg.classList.add('hidden');
    }, 3000);
  });
}

function markAsSent(commandId) {
  AppState.setCommandStatus(commandId, 'sent');

  const successMsg = document.getElementById('successMsg');
  successMsg.classList.remove('hidden');

  // Change button state
  const markSentBtn = document.getElementById('markSentBtn');
  markSentBtn.disabled = true;
  markSentBtn.classList.add('opacity-50', 'cursor-not-allowed');
  markSentBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
  markSentBtn.classList.add('bg-gray-400');

  setTimeout(() => {
    successMsg.classList.add('hidden');
  }, 3000);
}

function goBackToEdit(commandId) {
  window.location.href = `details.html?id=${encodeURIComponent(commandId)}`;
}

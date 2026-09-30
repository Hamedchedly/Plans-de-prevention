// Filtering and Table Display

function onDataLoaded() {
  initializeFilters();
  updateTable();
  updateStats();
}

function initializeFilters() {
  const operatorFilter = document.getElementById('operatorFilter');
  const sectorFilter = document.getElementById('sectorFilter');

  if (operatorFilter) {
    // Populate operator dropdown
    getUniqueOperators().forEach(op => {
      const option = document.createElement('option');
      option.value = op.code;
      option.textContent = `${op.code} - ${op.name}`;
      operatorFilter.appendChild(option);
    });

    operatorFilter.addEventListener('change', filterTable);
  }

  if (sectorFilter) {
    // Populate sector dropdown
    getUniqueSectors().forEach(sector => {
      const option = document.createElement('option');
      option.value = sector.code;
      option.textContent = `${sector.code} - ${sector.name}`;
      sectorFilter.appendChild(option);
    });

    sectorFilter.addEventListener('change', filterTable);
  }

  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', filterTable);
  }
}

function filterTable() {
  updateTable();
}

function getFilteredCommands() {
  const operatorFilter = document.getElementById('operatorFilter')?.value || '';
  const sectorFilter = document.getElementById('sectorFilter')?.value || '';
  const statusFilter = document.getElementById('statusFilter')?.value || '';

  return AppState.commands.filter(cmd => {
    const matchOperator = !operatorFilter || cmd.operator === operatorFilter;
    const matchSector = !sectorFilter || cmd.sector === sectorFilter;
    const matchStatus = !statusFilter || cmd.status === statusFilter;

    return matchOperator && matchSector && matchStatus;
  });
}

function updateTable() {
  const tbody = document.getElementById('commandsTable');
  if (!tbody) return;

  const filtered = getFilteredCommands();

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="text-center"><td colspan="7" class="px-6 py-4 text-gray-500">Aucune commande trouvée.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(cmd => `
    <tr class="border-b hover:bg-gray-50">
      <td class="px-6 py-4 font-semibold">${cmd.order_number}</td>
      <td class="px-6 py-4 text-sm">${cmd.work_nature || 'N/A'}</td>
      <td class="px-6 py-4 font-semibold text-blue-600">${formatCurrency(cmd.amount_ttc)}</td>
      <td class="px-6 py-4 text-sm">${cmd.company_name || 'N/A'}</td>
      <td class="px-6 py-4 text-sm">${cmd.operator || 'N/A'}</td>
      <td class="px-6 py-4">
        ${getStatusBadge(cmd.status)}
      </td>
      <td class="px-6 py-4">
        <a href="details.html?id=${encodeURIComponent(cmd.order_number)}"
           class="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
          Voir Détails
        </a>
      </td>
    </tr>
  `).join('');
}

function updateStats() {
  const stats = calculateStats();

  const totalCount = document.getElementById('totalCount');
  const pendingCount = document.getElementById('pendingCount');
  const sentCount = document.getElementById('sentCount');
  const totalAmount = document.getElementById('totalAmount');

  if (totalCount) totalCount.textContent = stats.total;
  if (pendingCount) pendingCount.textContent = stats.pending;
  if (sentCount) sentCount.textContent = stats.sent;
  if (totalAmount) totalAmount.textContent = formatCurrency(stats.totalAmount);
}

// Re-update stats when filters change
document.addEventListener('DOMContentLoaded', () => {
  const operatorFilter = document.getElementById('operatorFilter');
  const sectorFilter = document.getElementById('sectorFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (operatorFilter) operatorFilter.addEventListener('change', updateStats);
  if (sectorFilter) sectorFilter.addEventListener('change', updateStats);
  if (statusFilter) statusFilter.addEventListener('change', updateStats);
});

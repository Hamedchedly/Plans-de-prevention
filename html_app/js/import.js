// Excel Import Functionality
document.addEventListener('DOMContentLoaded', () => {
  const uploadBtn = document.getElementById('uploadBtn');
  const excelFile = document.getElementById('excelFile');
  const useSampleBtn = document.getElementById('useSampleBtn');
  const importStatus = document.getElementById('importStatus');

  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (excelFile.files.length > 0) {
        const file = excelFile.files[0];
        importExcel(file);
      }
    });

    excelFile.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importStatus.textContent = 'Fichier sélectionné: ' + e.target.files[0].name;
      }
    });
  }

  if (useSampleBtn) {
    useSampleBtn.addEventListener('click', () => {
      loadSampleData().then(() => {
        if (typeof onDataLoaded === 'function') {
          onDataLoaded();
        }
        importStatus.textContent = '✓ Données test chargées!';
        importStatus.classList.remove('text-gray-600');
        importStatus.classList.add('text-green-600', 'font-semibold');
      });
    });
  }
});

function importExcel(file) {
  const reader = new FileReader();
  const status = document.getElementById('importStatus');

  reader.onload = (e) => {
    try {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: 'binary' });

      // Parse commands from first sheet (ANM_COMD_TRAV_ER)
      const commandsSheet = workbook.Sheets[workbook.SheetNames[0]];
      const commands = XLSX.utils.sheet_to_json(commandsSheet);

      // Transform Excel columns to our format
      const transformedCommands = commands.map(row => ({
        id: row.COMD_NUM || row['N° Commande'] || generateId(),
        order_number: row.COMD_NUM || row['N° Commande'] || '',
        operator: row.UTIC_CODE || row['Chargé Opération'] || 'N/A',
        sector: row.SECT_CODE || row.secteur || 'N/A',
        company_id: row.ENTN_NUM || row['Code Entreprise'] || '',
        company_name: row.ENTR_LIBELLE || row['Nom Entreprise'] || 'N/A',
        work_nature: row.TRAV_LIBELLE || row['Nature Travaux'] || '',
        work_description: row.TRAV_DESCRIPTIF || row['Description'] || '',
        address: row.TRAV_ADRESSE || row['Adresse'] || '',
        amount_ttc: parseFloat(row.TRAV_MONTANT || row['Montant'] || 0),
        status: 'pending'
      })).filter(cmd => cmd.order_number); // Filter out empty rows

      if (transformedCommands.length === 0) {
        status.textContent = '❌ Aucune commande trouvée dans le fichier Excel';
        status.classList.add('text-red-600');
        return;
      }

      // Update AppState
      AppState.commands = transformedCommands;

      // Extract unique operators and sectors
      AppState.operators = [...new Set(transformedCommands.map(c => c.operator))].map(op => ({
        code: op,
        name: op
      }));

      AppState.sectors = [...new Set(transformedCommands.map(c => c.sector))].map(sec => ({
        code: sec,
        name: sec
      }));

      // Save to localStorage
      AppState.saveToLocalStorage();

      // Update UI
      status.textContent = `✓ ${transformedCommands.length} commandes importées avec succès!`;
      status.classList.remove('text-gray-600');
      status.classList.add('text-green-600', 'font-semibold');

      // Trigger data loaded callback
      if (typeof onDataLoaded === 'function') {
        onDataLoaded();
      }

    } catch (error) {
      console.error('Import error:', error);
      const status = document.getElementById('importStatus');
      status.textContent = `❌ Erreur lors de l'import: ${error.message}`;
      status.classList.add('text-red-600');
    }
  };

  reader.readAsBinaryString(file);
}

function generateId() {
  return 'CMD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Initialize
initializePage();

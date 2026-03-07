(function () {
  const scoringState = {
    initialized: false,
    loadedFromApi: false,
    loadError: '',
    activeTab: 'ranking',
    selectedAgencyId: null,
    agencies: [],
    filteredAgencies: [],
    summary: null,
    period: '',
    admin: {
      canEdit: false,
      datasets: [],
      historyPeriods: [],
      currentDataset: 'asesores',
      rows: [],
      filteredRows: [],
      selectedRowKey: null,
      isNew: false
    }
  };

  function getScoringUser() {
    const user = typeof getUser === 'function' ? getUser() : null;
    return user || {};
  }

  function canAccessScoring() {
    const user = getScoringUser();
    const username = String(user.username || '').toLowerCase();
    return user.rol === 'admin' || username === 'ogonzalez';
  }

  function canEditScoringConfig() {
    return getScoringUser().rol === 'admin';
  }

  async function initScoring() {
    if (!canAccessScoring()) {
      const container = document.getElementById('scoring-ranking-body');
      if (container) {
        container.innerHTML = '<tr><td colspan="9" class="scoring-empty-state">No tenes permisos para acceder a Scoring.</td></tr>';
      }
      return;
    }

    if (!scoringState.initialized) {
      bindScoringEvents();
      scoringState.initialized = true;
    }

    scoringState.admin.canEdit = canEditScoringConfig();
    await Promise.all([loadScoringData(), loadConfigSummary()]);
    renderScoring();
  }

  async function loadScoringData() {
    try {
      const params = {};
      if (scoringState.period) {
        params.periodo = scoringState.period;
      }
      const response = window.scoringAPI
        ? await window.scoringAPI.obtenerResumen(params)
        : await apiRequest(`/scoring-agencias/resumen${params.periodo ? `?periodo=${encodeURIComponent(params.periodo)}` : ''}`);
      if (response && response.success && response.data) {
        hydrateStateFromPayload(normalizeApiPayload(response.data, 'api'));
        scoringState.loadedFromApi = true;
        scoringState.loadError = '';
        setPeriodInputValue(scoringState.period);
        return;
      }
      throw new Error('La API de scoring no devolvio datos validos.');
    } catch (error) {
      scoringState.loadedFromApi = false;
      scoringState.loadError = error?.message || 'No se pudieron cargar los datos reales de scoring.';
    }

    hydrateStateFromPayload(buildEmptyPayload(scoringState.period || ''));
    setPeriodInputValue(scoringState.period);
  }

  async function loadConfigSummary() {
    if (!window.scoringAPI) {
      return;
    }

    try {
      const response = await window.scoringAPI.obtenerConfiguracion();
      if (response && response.success && response.data) {
        scoringState.admin.canEdit = !!response.data.puedeEditar;
        scoringState.admin.datasets = Array.isArray(response.data.datasets) ? response.data.datasets : [];
        scoringState.admin.historyPeriods = Array.isArray(response.data.periodosHistorial) ? response.data.periodosHistorial : [];
        if (!scoringState.period && response.data.periodoActual) {
          scoringState.period = response.data.periodoActual;
          setPeriodInputValue(scoringState.period);
        }
        if (!scoringState.admin.datasets.some(item => item.id === scoringState.admin.currentDataset)) {
          scoringState.admin.currentDataset = scoringState.admin.datasets[0]?.id || 'asesores';
        }
        await loadConfigDataset();
        return;
      }
    } catch (error) {
      updateConfigSummaryMessage(error.message || 'No se pudo cargar la configuracion de scoring');
    }

    scoringState.admin.datasets = [];
    scoringState.admin.historyPeriods = [];
    scoringState.admin.rows = [];
    scoringState.admin.filteredRows = [];
    scoringState.admin.selectedRowKey = null;
  }

  async function loadConfigDataset() {
    if (!window.scoringAPI || !scoringState.admin.currentDataset) {
      return;
    }

    try {
      const response = await window.scoringAPI.obtenerDataset(scoringState.admin.currentDataset, {
        limit: scoringState.admin.currentDataset === 'historial' ? 300 : 500
      });
      const rows = Array.isArray(response?.data?.rows) ? response.data.rows : [];
      scoringState.admin.rows = rows;
      scoringState.admin.filteredRows = rows.slice();
      if (!rows.some(row => row.__rowKey === scoringState.admin.selectedRowKey)) {
        scoringState.admin.selectedRowKey = rows[0]?.__rowKey || null;
        scoringState.admin.isNew = false;
      }
      updateConfigSummaryMessage();
    } catch (error) {
      scoringState.admin.rows = [];
      scoringState.admin.filteredRows = [];
      scoringState.admin.selectedRowKey = null;
      updateConfigSummaryMessage(error.message || 'No se pudo cargar el dataset seleccionado');
    }
  }

  function normalizeApiPayload(data, source) {
    const agencies = Array.isArray(data.ranking) ? data.ranking.map(item => ({
      id: String(item.ctaCte || item.agencia || item.id || ''),
      name: item.agenciaNombre || item.agencia || item.nombre || 'Agencia',
      advisor: item.asesor || 'Sin asesor',
      category: item.categoria || 'PLATA',
      categoryClass: categoryClass(item.categoria || 'PLATA'),
      score: Number(item.scoreFinal || item.score || 0),
      baseScore: Number(item.scoreBase || item.baseScore || item.scoreFinal || 0),
      previousScore: Number(item.scoreAnterior || item.scoreFinal || 0),
      deltaPuntaje: item.deltaPuntaje !== null && item.deltaPuntaje !== undefined ? Number(item.deltaPuntaje) : null,
      rankingActual: Number(item.rankingActual || 0),
      movilidadRanking: item.movilidadRanking !== null && item.movilidadRanking !== undefined ? Number(item.movilidadRanking) : null,
      movement: item.movilidad || 'Estable',
      probability: Number(item.probabilidadAscenso || item.probabilidad || 0),
      priority: normalizePriority(item.prioridad || 'MEDIA'),
      axis: item.ejeMayorImpacto || item.eje || 'VENTAS',
      clientCategory: item.categoriaCliente || 'Regular',
      clientCoefficient: Number(item.coefCliente || 1),
      clientScore: Number(item.clienteScore || 0),
      ascentGap: Number(item.distAscenso || 0),
      descentMargin: Number(item.distDescenso || 0),
      impactLabel: item.impactoPotencial || item.mensajeImpacto || 'Sin simulacion disponible.',
      recommendation: item.recomendacion || item.accion || 'Sin recomendacion operativa.',
      diagnostic: item.diagnostico || '',
      factors: Array.isArray(item.factores) ? item.factores : [],
      metadata: item.metadata || {}
    })) : [];

    const summary = data.kpis ? {
      averageScore: Number(data.kpis.scorePromedio || 0),
      scoreDelta: Number(data.kpis.variacion || 0),
      agenciesEvaluated: Number(data.kpis.agenciasEvaluadas || agencies.length),
      coefClientePromedio: Number(data.kpis.coefClientePromedio || 0),
      promedioIncVentasPct: Number(data.kpis.promedioIncVentasPct || 0),
      highPriority: Number(data.kpis.prioridadAlta || 0),
      upliftCandidates: Number(data.kpis.candidatasSubida || 0),
      topAdvisor: data.kpis.asesorTop || 'No definido',
      categories: Array.isArray(data.distribucionCategorias) ? data.distribucionCategorias.map(item => ({
        name: item.categoria,
        count: Number(item.cantidad || 0),
        colorClass: categoryClass(item.categoria)
      })) : [],
      ejeImpacto: data.ejeImpactoDistribucion || {},
      riesgo: data.riesgoDistribucion || { ascenso: 0, descenso: 0, neutro: 0 },
      concentracion: data.concentracionCrecimiento || {},
      top20AltaPrioridad: Array.isArray(data.top20AltaPrioridad) ? data.top20AltaPrioridad : [],
      top20PorMovilidad: Array.isArray(data.top20PorMovilidad) ? data.top20PorMovilidad : [],
      top20PorPuntaje: Array.isArray(data.top20PorPuntaje) ? data.top20PorPuntaje : [],
      priorities: buildSummaryPriorities(data, agencies),
      chips: buildSummaryChips(data, agencies)
    } : buildEmptyPayload(data.periodo?.clave || '').summary;

    return {
      source,
      period: data.periodo?.clave || data.periodo || '',
      summary,
      agencies
    };
  }

  function hydrateStateFromPayload(payload) {
    scoringState.period = payload.period;
    scoringState.summary = payload.summary;
    scoringState.agencies = payload.agencies.slice();
    scoringState.filteredAgencies = payload.agencies.slice();
    scoringState.selectedAgencyId = scoringState.selectedAgencyId || (payload.agencies[0] && payload.agencies[0].id);
  }

  function bindScoringEvents() {
    const search = document.getElementById('scoring-search');
    const filterCategory = document.getElementById('scoring-filter-category');
    const filterPriority = document.getElementById('scoring-filter-priority');
    const filterAsesor = document.getElementById('scoring-filter-asesor');
    const refreshBtn = document.getElementById('scoring-btn-refresh');
    const focusBtn = document.getElementById('scoring-btn-focus-top');
    const exportBtn = document.getElementById('scoring-btn-export-csv');
    const snapshotBtn = document.getElementById('scoring-btn-snapshot');
    const applyPeriodBtn = document.getElementById('scoring-btn-apply-period');
    const autoPeriodBtn = document.getElementById('scoring-btn-period-auto');
    const periodInput = document.getElementById('scoring-period-input');
    const configDataset = document.getElementById('scoring-config-dataset');
    const configSearch = document.getElementById('scoring-config-search');
    const configRefresh = document.getElementById('scoring-config-refresh');
    const configNew = document.getElementById('scoring-config-new');
    const configSave = document.getElementById('scoring-config-save');
    const configCancel = document.getElementById('scoring-config-cancel');
    const configDelete = document.getElementById('scoring-config-delete');
    const configSnapshot = document.getElementById('scoring-config-snapshot');
    const configForm = document.getElementById('scoring-config-form');

    if (search) search.addEventListener('input', applyFilters);
    if (filterCategory) filterCategory.addEventListener('change', applyFilters);
    if (filterPriority) filterPriority.addEventListener('change', applyFilters);
    if (filterAsesor) filterAsesor.addEventListener('change', applyFilters);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await refreshScoringView(refreshBtn);
      });
    }

    if (applyPeriodBtn) {
      applyPeriodBtn.addEventListener('click', async () => {
        scoringState.period = String(periodInput?.value || '').trim().toUpperCase();
        await refreshScoringView(applyPeriodBtn);
      });
    }

    if (autoPeriodBtn) {
      autoPeriodBtn.addEventListener('click', async () => {
        scoringState.period = '';
        setPeriodInputValue('');
        await refreshScoringView(autoPeriodBtn);
      });
    }

    if (periodInput) {
      periodInput.addEventListener('keydown', async event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          scoringState.period = String(periodInput.value || '').trim().toUpperCase();
          await refreshScoringView(applyPeriodBtn || refreshBtn);
        }
      });
    }

    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const target = scoringState.agencies
          .filter(item => item.priority === 'ALTA')
          .sort((left, right) => right.probability - left.probability)[0] || scoringState.agencies[0];
        if (!target) return;
        scoringState.selectedAgencyId = target.id;
        switchScoringTab('ficha');
        renderAgencyDetail();
        highlightSelectedRow();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        if (!window.scoringAPI) return;
        exportBtn.disabled = true;
        const orig = exportBtn.innerHTML;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
          await window.scoringAPI.exportarRanking(scoringState.period ? { periodo: scoringState.period } : {});
        } catch (err) {
          if (typeof showToast === 'function') showToast(err.message || 'Error al exportar', 'error');
        } finally {
          exportBtn.disabled = false;
          exportBtn.innerHTML = orig;
        }
      });
    }

    if (snapshotBtn) {
      snapshotBtn.addEventListener('click', async () => {
        if (!scoringState.admin.canEdit) return;
        snapshotBtn.disabled = true;
        const orig = snapshotBtn.innerHTML;
        snapshotBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        await createSnapshot();
        snapshotBtn.disabled = false;
        snapshotBtn.innerHTML = orig;
      });
    }

    // Tab navigation
    document.querySelectorAll('.scoring-tab[data-scoring-tab]').forEach(tab => {
      tab.addEventListener('click', () => switchScoringTab(tab.dataset.scoringTab));
    });

    ['ventas', 'loto', 'cliente'].forEach(key => {
      const slider = document.getElementById(`scoring-sim-${key}`);
      if (!slider) return;
      slider.addEventListener('input', () => {
        const valueEl = document.getElementById(`scoring-sim-${key}-value`);
        if (valueEl) valueEl.textContent = `+${slider.value}`;
        renderSimulator();
      });
    });

    if (configDataset) {
      configDataset.addEventListener('change', async () => {
        scoringState.admin.currentDataset = configDataset.value || 'asesores';
        await loadConfigDataset();
        renderConfigPanel();
      });
    }

    if (configSearch) {
      configSearch.addEventListener('input', applyConfigFilters);
    }

    if (configRefresh) {
      configRefresh.addEventListener('click', async () => {
        await loadConfigSummary();
        renderConfigPanel();
      });
    }

    if (configNew) {
      configNew.addEventListener('click', () => {
        scoringState.admin.selectedRowKey = null;
        scoringState.admin.isNew = true;
        renderConfigForm();
      });
    }

    if (configSave) {
      configSave.addEventListener('click', saveConfigRecord);
    }

    if (configCancel) {
      configCancel.addEventListener('click', () => {
        scoringState.admin.isNew = false;
        renderConfigForm();
      });
    }

    if (configDelete) {
      configDelete.addEventListener('click', deleteConfigRecord);
    }

    if (configSnapshot) {
      configSnapshot.addEventListener('click', createSnapshot);
    }

    if (configForm) {
      configForm.addEventListener('submit', async event => {
        event.preventDefault();
        await saveConfigRecord();
      });
    }
  }

  async function refreshScoringView(button) {
    const originalHtml = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando';
    }
    await loadScoringData();
    renderScoring();
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    if (typeof showToast === 'function') {
      showToast(scoringState.loadedFromApi ? 'Scoring actualizado con datos reales' : scoringState.loadError, scoringState.loadedFromApi ? 'success' : 'error');
    }
  }

  function setPeriodInputValue(value) {
    const input = document.getElementById('scoring-period-input');
    if (input && document.activeElement !== input) {
      input.value = value || '';
    }
  }

  function renderScoring() {
    switchScoringTab(scoringState.activeTab);
    renderHero();
    renderStats();
    renderSummary();
    populateCategoryFilter();
    populateAsesorFilter();
    updateSnapshotButtonVisibility();
    applyFilters();
    renderAgencyDetail();
    renderSimulator();
    renderConfigPanel();
  }

  function updateSnapshotButtonVisibility() {
    const btn = document.getElementById('scoring-btn-snapshot');
    if (btn) btn.style.display = scoringState.admin.canEdit ? '' : 'none';
  }

  function populateAsesorFilter() {
    const select = document.getElementById('scoring-filter-asesor');
    if (!select) return;
    const current = select.value;
    const asesores = Array.from(new Set(
      scoringState.agencies.map(item => item.advisor).filter(a => a && a !== 'Sin asesor')
    )).sort();
    select.innerHTML = '<option value="">Todos los asesores</option>' +
      asesores.map(a => `<option value="${a}">${a}</option>`).join('');
    if (asesores.includes(current)) select.value = current;
  }

  function switchScoringTab(tabId) {
    scoringState.activeTab = tabId;
    document.querySelectorAll('.scoring-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.scoringTab === tabId);
    });
    document.querySelectorAll('.scoring-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `scoring-panel-${tabId}`);
    });
  }

  function renderHero() {
    const summary = scoringState.summary;
    setPeriodInputValue(scoringState.period);
    document.getElementById('scoring-period-badge').textContent = scoringState.period || 'Auto';
    document.getElementById('scoring-source-badge').textContent = scoringState.loadedFromApi ? 'Datos reales' : 'Sin datos';
    document.getElementById('scoring-hero-score').textContent = formatNumber(summary.averageScore, 1);
    document.getElementById('scoring-hero-foot').textContent = scoringState.loadError
      ? scoringState.loadError
      : (summary.scoreDelta >= 0
        ? `+${formatNumber(summary.scoreDelta, 1)} vs periodo anterior`
        : `${formatNumber(summary.scoreDelta, 1)} vs periodo anterior`);

    const miniGrid = document.getElementById('scoring-hero-mini-grid');
    miniGrid.innerHTML = [
      { label: 'Agencias evaluadas', value: summary.agenciesEvaluated },
      { label: 'Coef. cliente prom.', value: summary.coefClientePromedio ? summary.coefClientePromedio.toFixed(3) : '-' },
      { label: 'Inc. ventas prom.', value: summary.promedioIncVentasPct ? (summary.promedioIncVentasPct >= 0 ? '+' : '') + formatNumber(summary.promedioIncVentasPct, 1) + '%' : '-' },
      { label: 'Prioridad alta', value: summary.highPriority },
      { label: 'Candidatas a subir', value: summary.upliftCandidates },
      { label: 'Asesor destacado', value: summary.topAdvisor }
    ].map(item => `
      <div class="scoring-mini-card scoring-fade-in">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');
  }

  function renderStats() {
    const summary = scoringState.summary;
    const highPotential = scoringState.agencies.filter(item => item.probability >= 0.7).length;
    const lowClient = scoringState.agencies.filter(item => item.clientCoefficient < 0.95).length;
    const riesgo = summary.riesgo || {};
    const ejeTop = summary.ejeImpacto
      ? Object.entries(summary.ejeImpacto).sort((a, b) => b[1] - a[1])[0]
      : null;
    const stats = [
      { label: 'Score promedio', value: formatNumber(summary.averageScore, 1), foot: 'Indicador consolidado de red', accent: 'linear-gradient(90deg, #22d3ee, #0ea5e9)' },
      { label: 'Foco inmediato', value: summary.highPriority, foot: 'Agencias en prioridad alta', accent: 'linear-gradient(90deg, #fb7185, #f97316)' },
      { label: 'En ascenso', value: riesgo.ascenso || 0, foot: `Descenso: ${riesgo.descenso || 0} | Neutro: ${riesgo.neutro || 0}`, accent: 'linear-gradient(90deg, #34d399, #10b981)' },
      { label: 'Cliente penaliza', value: lowClient, foot: 'Coeficiente menor a 0.95', accent: 'linear-gradient(90deg, #f59e0b, #facc15)' },
      { label: 'Eje mas frecuente', value: ejeTop ? ejeTop[0] : '-', foot: ejeTop ? `${ejeTop[1]} agencias` : 'Sin datos', accent: 'linear-gradient(90deg, #a78bfa, #7c3aed)' },
      { label: 'Ascenso probable', value: highPotential, foot: 'Probabilidad >= 70%', accent: 'linear-gradient(90deg, #67e8f9, #06b6d4)' }
    ];

    const grid = document.getElementById('scoring-stats-grid');
    grid.innerHTML = stats.map(item => `
      <div class="scoring-stat scoring-fade-in" style="--scoring-accent:${item.accent};">
        <div class="scoring-stat-label">${item.label}</div>
        <div class="scoring-stat-value">${item.value}</div>
        <div class="scoring-stat-foot">${item.foot}</div>
      </div>
    `).join('');
  }

  function renderSummary() {
    const summary = scoringState.summary;
    document.getElementById('scoring-summary-chips').innerHTML = summary.chips
      .map(item => `<span class="scoring-chip">${item}</span>`)
      .join('');

    const total = Math.max(1, summary.categories.reduce((acc, item) => acc + item.count, 0));
    document.getElementById('scoring-distribution-bars').innerHTML = summary.categories.map(item => `
      <div class="scoring-distribution-item scoring-fade-in">
        <div class="scoring-distribution-top">
          <span class="scoring-table-chip ${item.colorClass}">${item.name}</span>
          <strong>${item.count}</strong>
        </div>
        <div class="scoring-bar-track">
          <div class="scoring-bar-fill" style="width:${(item.count / total) * 100}%;"></div>
        </div>
      </div>
    `).join('');

    document.getElementById('scoring-priority-list').innerHTML = summary.priorities.length
      ? summary.priorities.map(item => `
        <div class="scoring-priority-item scoring-fade-in">
          <div class="scoring-priority-top">
            <strong>${item.title}</strong>
          </div>
          <p>${item.text}</p>
        </div>
      `).join('')
      : '<div class="scoring-empty-state">No hay observaciones ampliadas para este periodo.</div>';

    // Eje de impacto
    const ejeEl = document.getElementById('scoring-eje-impacto');
    if (ejeEl && summary.ejeImpacto) {
      const totalEje = Object.values(summary.ejeImpacto).reduce((a, b) => a + b, 0) || 1;
      ejeEl.innerHTML = Object.entries(summary.ejeImpacto)
        .sort((a, b) => b[1] - a[1])
        .map(([eje, cant]) => `
          <div class="scoring-distribution-item scoring-fade-in">
            <div class="scoring-distribution-top">
              <span class="scoring-muted">${eje}</span>
              <strong>${cant}</strong>
            </div>
            <div class="scoring-bar-track">
              <div class="scoring-bar-fill" style="width:${(cant / totalEje) * 100}%;background:var(--primary);"></div>
            </div>
          </div>
        `).join('') || '<div class="scoring-muted">Sin datos</div>';
    }

    // Concentración de crecimiento
    const concEl = document.getElementById('scoring-concentracion');
    if (concEl && summary.concentracion) {
      const c = summary.concentracion;
      concEl.innerHTML = [10, 20, 50, 100, 200].map(n => {
        const pct = c[`top${n}`] !== undefined ? (c[`top${n}`] * 100).toFixed(1) : '-';
        return `<div class="scoring-concentracion-item"><span>Top ${n}</span><strong>${pct}%</strong></div>`;
      }).join('');
    }

    // Top 20 Alta Prioridad
    const top20El = document.getElementById('scoring-top20-prioridad');
    if (top20El) {
      top20El.innerHTML = (summary.top20AltaPrioridad || []).length
        ? (summary.top20AltaPrioridad || []).map((item, i) => `
            <div class="scoring-top20-row scoring-fade-in">
              <span class="scoring-top20-num">${i + 1}</span>
              <span class="scoring-top20-ag">${item.ctaCte}</span>
              <span class="scoring-table-chip ${categoryClass(item.categoria)}">${item.categoria}</span>
              <span class="scoring-top20-delta scoring-muted">&Delta;${item.distAscenso ?? '-'}</span>
            </div>
          `).join('')
        : '<div class="scoring-muted">Sin agencias en prioridad alta</div>';
    }

    // Top 20 por Movilidad
    const top20MovEl = document.getElementById('scoring-top20-movilidad');
    if (top20MovEl) {
      top20MovEl.innerHTML = (summary.top20PorMovilidad || []).length
        ? (summary.top20PorMovilidad || []).map((item, i) => `
            <div class="scoring-top20-row scoring-fade-in">
              <span class="scoring-top20-num">${i + 1}</span>
              <span class="scoring-top20-ag">${item.ctaCte}</span>
              <span class="scoring-table-chip ${categoryClass(item.categoria)}">${item.categoria}</span>
              <span class="scoring-top20-delta ${item.deltaPuntaje >= 0 ? 'text-success' : 'text-danger'}">${item.deltaPuntaje >= 0 ? '+' : ''}${item.deltaPuntaje}</span>
            </div>
          `).join('')
        : '<div class="scoring-muted">Sin datos de movilidad</div>';
    }

    // Top 20 por Puntaje
    const top20PtsEl = document.getElementById('scoring-top20-puntaje');
    if (top20PtsEl) {
      top20PtsEl.innerHTML = (summary.top20PorPuntaje || []).length
        ? (summary.top20PorPuntaje || []).map((item, i) => `
            <div class="scoring-top20-row scoring-fade-in">
              <span class="scoring-top20-num">${i + 1}</span>
              <span class="scoring-top20-ag">${item.ctaCte}</span>
              <span class="scoring-table-chip ${categoryClass(item.categoria)}">${item.categoria}</span>
              <strong>${formatNumber(item.scoreFinal, 1)}</strong>
            </div>
          `).join('')
        : '<div class="scoring-muted">Sin datos</div>';
    }
  }

  function populateCategoryFilter() {
    const select = document.getElementById('scoring-filter-category');
    if (!select) return;
    const current = select.value;
    const categories = Array.from(new Set(scoringState.agencies.map(item => item.category)));
    select.innerHTML = '<option value="">Todas las categorias</option>' + categories
      .map(category => `<option value="${category}">${category}</option>`)
      .join('');
    select.value = current;
  }

  function applyFilters() {
    const search = String(document.getElementById('scoring-search')?.value || '').trim().toLowerCase();
    const category = document.getElementById('scoring-filter-category')?.value || '';
    const priority = document.getElementById('scoring-filter-priority')?.value || '';
    const asesor = document.getElementById('scoring-filter-asesor')?.value || '';

    scoringState.filteredAgencies = scoringState.agencies.filter(item => {
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.id.toLowerCase().includes(search);
      const matchesCategory = !category || item.category === category;
      const matchesPriority = !priority || item.priority === priority;
      const matchesAsesor = !asesor || item.advisor === asesor;
      return matchesSearch && matchesCategory && matchesPriority && matchesAsesor;
    });

    if (!scoringState.filteredAgencies.some(item => item.id === scoringState.selectedAgencyId)) {
      scoringState.selectedAgencyId = scoringState.filteredAgencies[0] ? scoringState.filteredAgencies[0].id : null;
    }

    renderRanking();
    renderAgencyDetail();
    renderSimulator();
  }

  function renderRanking() {
    const tbody = document.getElementById('scoring-ranking-body');
    const caption = document.getElementById('scoring-ranking-caption');
    if (!tbody) return;

    if (caption) {
      caption.textContent = scoringState.loadError
        ? scoringState.loadError
        : `Mostrando ${scoringState.filteredAgencies.length} agencias. Hace click en una fila para ver su detalle.`;
    }

    if (!scoringState.filteredAgencies.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="scoring-empty-state">${scoringState.loadError || 'No hay agencias para el filtro seleccionado.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = scoringState.filteredAgencies.map((item, idx) => {
      const pos = item.rankingActual || idx + 1;
      const medal = pos === 1 ? '<i class="fas fa-trophy scoring-medal gold"></i>'
        : pos === 2 ? '<i class="fas fa-medal scoring-medal silver"></i>'
        : pos === 3 ? '<i class="fas fa-medal scoring-medal bronze"></i>'
        : `<span class="scoring-pos">${pos}</span>`;
      const movIcon = item.movement === 'Mejora' ? '<i class="fas fa-arrow-up scoring-mov-up"></i>'
        : item.movement === 'Baja' ? '<i class="fas fa-arrow-down scoring-mov-down"></i>'
        : '<i class="fas fa-minus scoring-mov-stable"></i>';
      const deltaTxt = item.deltaPuntaje !== null
        ? `<span class="${item.deltaPuntaje >= 0 ? 'text-success' : 'text-danger'}">${item.deltaPuntaje >= 0 ? '+' : ''}${formatNumber(item.deltaPuntaje, 1)}</span>`
        : '<span class="scoring-muted">-</span>';
      const rankMov = item.movilidadRanking !== null
        ? (item.movilidadRanking > 0 ? `<small class="text-success">▲${item.movilidadRanking}</small>`
          : item.movilidadRanking < 0 ? `<small class="text-danger">▼${Math.abs(item.movilidadRanking)}</small>`
          : '<small class="scoring-muted">→</small>')
        : '';
      return `
      <tr class="scoring-fade-in ${item.id === scoringState.selectedAgencyId ? 'active' : ''}" data-scoring-id="${item.id}">
        <td class="scoring-rank-cell">${medal}${rankMov}</td>
        <td>
          <div class="scoring-table-name">
            <strong>${item.name}</strong>
            <small>${item.id}</small>
          </div>
        </td>
        <td>${item.advisor}</td>
        <td><span class="scoring-pill score">${formatNumber(item.score, 1)}</span> ${deltaTxt}</td>
        <td><span class="scoring-table-chip ${item.categoryClass}">${item.category}</span></td>
        <td>${movIcon} ${item.movement}</td>
        <td>${Math.round(item.probability * 100)}%</td>
        <td><span class="scoring-table-chip ${priorityClass(item.priority)}">${item.priority}</span></td>
        <td>${item.axis}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-scoring-id]').forEach(row => {
      row.addEventListener('click', () => {
        scoringState.selectedAgencyId = row.dataset.scoringId;
        switchScoringTab('ficha');
        renderAgencyDetail();
        renderSimulator();
        highlightSelectedRow();
      });
    });
  }

  function highlightSelectedRow() {
    document.querySelectorAll('#scoring-ranking-body tr[data-scoring-id]').forEach(row => {
      row.classList.toggle('active', row.dataset.scoringId === scoringState.selectedAgencyId);
    });
  }

  function buildSparklineSVG(historial) {
    if (!historial || historial.length < 2) return '';
    const pts = historial.map(h => h.puntaje);
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = Math.max(max - min, 0.1);
    const W = 260, H = 60, PAD = 8;
    const xs = pts.map((_, i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2));
    const ys = pts.map(p => H - PAD - ((p - min) / range) * (H - PAD * 2));
    const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
    const areaClose = `${xs[xs.length - 1]},${H - PAD} ${xs[0]},${H - PAD}`;
    const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];
    const trend = pts[pts.length - 1] >= pts[0] ? '#34d399' : '#fb7185';
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" class="scoring-sparkline">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${trend}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${trend}" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      <polygon points="${polyline} ${areaClose}" fill="url(#spark-grad)"/>
      <polyline points="${polyline}" fill="none" stroke="${trend}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="${trend}" stroke="#0f172a" stroke-width="1.5"/>
    </svg>`;
  }

  async function loadAgencyHistory(agencyId) {
    if (!window.scoringAPI || !agencyId) return [];
    try {
      const res = await window.scoringAPI.obtenerAgencia(agencyId, scoringState.period ? { periodo: scoringState.period } : {});
      return Array.isArray(res?.data?.historial) ? res.data.historial : [];
    } catch { return []; }
  }

  function renderAgencyDetail() {
    const detail = document.getElementById('scoring-agency-detail');
    const categoryBadge = document.getElementById('scoring-selected-category');
    if (!detail || !categoryBadge) return;

    const agency = getSelectedAgency();
    if (!agency) {
      categoryBadge.textContent = '-';
      categoryBadge.className = 'scoring-category-badge';
      detail.innerHTML = `<div class="scoring-empty-state">${scoringState.loadError || 'Selecciona una agencia para ver su ficha.'}</div>`;
      return;
    }

    categoryBadge.textContent = agency.category;
    categoryBadge.className = `scoring-category-badge ${agency.categoryClass}`;
    detail.innerHTML = `
      <div class="scoring-agency-header scoring-fade-in">
        <div>
          <h4>${agency.name}</h4>
          <div class="scoring-agency-subtitle">Asesor ${agency.advisor} · Cliente ${agency.clientCategory} · Principal foco ${agency.axis}</div>
        </div>
        <span class="scoring-pill ${priorityClass(agency.priority)}">${agency.priority}</span>
      </div>

      <div class="scoring-gauge scoring-fade-in">
        <div class="scoring-gauge-subtitle">Score final de la agencia</div>
        <div class="scoring-gauge-main">
          <div class="scoring-gauge-value">${formatNumber(agency.score, 1)}</div>
          <div class="scoring-muted">Base ${formatNumber(agency.baseScore, 1)} · coef. cliente ${formatNumber(agency.clientCoefficient, 2)} · Score cliente ${formatNumber(agency.clientScore, 1)}/100</div>
        </div>
        <div class="scoring-bar-track">
          <div class="scoring-bar-fill" style="width:${Math.min(100, agency.score)}%;"></div>
        </div>
      </div>

      <div class="scoring-metric-grid scoring-fade-in">
        <div class="scoring-metric-card">
          <span>Ranking actual</span>
          <strong>#${agency.rankingActual || '-'}</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Δ Puntaje periodo</span>
          <strong class="${agency.deltaPuntaje !== null && agency.deltaPuntaje >= 0 ? 'text-success' : 'text-danger'}">${agency.deltaPuntaje !== null ? (agency.deltaPuntaje >= 0 ? '+' : '') + formatNumber(agency.deltaPuntaje, 1) : 'Nuevo'}</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Movilidad ranking</span>
          <strong class="${agency.movilidadRanking > 0 ? 'text-success' : agency.movilidadRanking < 0 ? 'text-danger' : ''}">${agency.movilidadRanking !== null ? (agency.movilidadRanking > 0 ? '▲ ' + agency.movilidadRanking : agency.movilidadRanking < 0 ? '▼ ' + Math.abs(agency.movilidadRanking) : '→ Sin cambio') : 'Sin historial'}</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Movilidad categoría</span>
          <strong>${agency.movement}</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Prob. ascenso</span>
          <strong>${Math.round(agency.probability * 100)}%</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Falta para subir</span>
          <strong>${formatNumber(agency.ascentGap, 1)} pts base</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Margen antes de bajar</span>
          <strong>${formatNumber(agency.descentMargin, 1)} pts</strong>
        </div>
        <div class="scoring-metric-card">
          <span>Cliente ${agency.clientCategory}</span>
          <strong>${formatNumber(agency.clientScore, 1)}/100</strong>
        </div>
      </div>

      ${agency.diagnostic ? `<div class="scoring-fade-in scoring-muted" style="padding:0.5rem 0;font-size:0.85rem;">${agency.diagnostic}</div>` : ''}

      <div class="scoring-fade-in">
        <div class="scoring-block-title">Como se forma el score</div>
        <div class="scoring-factor-list">
          ${agency.factors.map(factor => `
            <div class="scoring-factor-row">
              <label>${factor.label}</label>
              <div class="scoring-bar-track"><div class="scoring-bar-fill" style="width:${Math.max(0, Math.min(100, factor.value))}%;"></div></div>
              <span>${formatNumber(factor.value, 1)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="scoring-agency-recommendation scoring-fade-in">
        <strong>${agency.impactLabel}</strong>
        <div>${agency.recommendation}</div>
      </div>

      <div class="scoring-sparkline-card scoring-fade-in" id="scoring-sparkline-wrap">
        <div class="scoring-block-title">Evolución histórica del puntaje</div>
        <div id="scoring-sparkline-chart" class="scoring-sparkline-placeholder">
          <i class="fas fa-spinner fa-spin"></i> Cargando historial...
        </div>
      </div>
    `;

    // Carga asíncrona del historial sin bloquear el render
    loadAgencyHistory(agency.id).then(historial => {
      const chartEl = document.getElementById('scoring-sparkline-chart');
      if (!chartEl) return;
      if (!historial.length) {
        chartEl.innerHTML = '<span class="scoring-muted">Sin historial disponible para esta agencia.</span>';
        return;
      }
      const labelsHtml = historial.map(h =>
        `<span class="scoring-spark-label">${h.periodo}<br><strong>${h.puntaje.toFixed(1)}</strong></span>`
      ).join('');
      chartEl.innerHTML = `
        <div style="overflow-x:auto;">
          ${buildSparklineSVG(historial)}
          <div class="scoring-spark-labels">${labelsHtml}</div>
        </div>
      `;
    });
  }

  function renderSimulator() {
    const result = document.getElementById('scoring-simulator-result');
    if (!result) return;

    const agency = getSelectedAgency();
    if (!agency) {
      result.innerHTML = '<div class="scoring-empty-state">Selecciona una agencia para simular escenarios.</div>';
      return;
    }

    const ventas = Number(document.getElementById('scoring-sim-ventas')?.value || 0);
    const loto = Number(document.getElementById('scoring-sim-loto')?.value || 0);
    const cliente = Number(document.getElementById('scoring-sim-cliente')?.value || 0);
    const simulated = Math.min(100, agency.score + ventas * 0.55 + loto * 0.45 + cliente * 0.35);
    const gain = simulated - agency.score;

    result.innerHTML = `
      <strong>${formatNumber(simulated, 1)} score proyectado</strong>
      <div class="scoring-muted">Impacto estimado: +${formatNumber(gain, 1)} puntos finales sobre ${agency.name}.</div>
      <div style="margin-top:0.75rem;">${simulated >= agency.score + agency.ascentGap ? 'El escenario podria alcanzar el proximo corte si se sostiene la ejecucion.' : 'El escenario mejora la posicion, pero todavia no alcanza el proximo corte estimado.'}</div>
    `;
  }

  function renderConfigPanel() {
    renderConfigDatasets();
    renderHistoryPeriods();
    renderConfigTable();
    renderConfigForm();
  }

  function renderConfigDatasets() {
    const select = document.getElementById('scoring-config-dataset');
    const newButton = document.getElementById('scoring-config-new');
    const saveButton = document.getElementById('scoring-config-save');
    const deleteButton = document.getElementById('scoring-config-delete');
    const snapshotButton = document.getElementById('scoring-config-snapshot');
    if (!select) return;

    const current = scoringState.admin.currentDataset;
    select.innerHTML = scoringState.admin.datasets.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    select.value = scoringState.admin.datasets.some(item => item.id === current) ? current : (scoringState.admin.datasets[0]?.id || '');

    if (newButton) newButton.disabled = !scoringState.admin.canEdit;
    if (saveButton) saveButton.disabled = !scoringState.admin.canEdit;
    if (deleteButton) deleteButton.disabled = !scoringState.admin.canEdit;
    if (snapshotButton) snapshotButton.disabled = !scoringState.admin.canEdit;
  }

  function renderHistoryPeriods() {
    const container = document.getElementById('scoring-config-periods');
    if (!container) return;

    if (!scoringState.admin.historyPeriods.length) {
      container.innerHTML = '<span class="scoring-chip">Sin snapshots historicos cargados</span>';
      return;
    }

    container.innerHTML = scoringState.admin.historyPeriods
      .map(item => `<span class="scoring-chip">${item.periodo} · ${item.total}</span>`)
      .join('');
  }

  function applyConfigFilters() {
    const term = String(document.getElementById('scoring-config-search')?.value || '').trim().toLowerCase();
    if (!term) {
      scoringState.admin.filteredRows = scoringState.admin.rows.slice();
    } else {
      scoringState.admin.filteredRows = scoringState.admin.rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term)));
    }

    if (!scoringState.admin.filteredRows.some(row => row.__rowKey === scoringState.admin.selectedRowKey)) {
      scoringState.admin.selectedRowKey = scoringState.admin.filteredRows[0]?.__rowKey || null;
      scoringState.admin.isNew = false;
    }

    renderConfigTable();
    renderConfigForm();
  }

  function renderConfigTable() {
    const head = document.getElementById('scoring-config-head');
    const body = document.getElementById('scoring-config-body');
    const dataset = getCurrentDatasetMeta();
    if (!head || !body) return;

    if (!dataset) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td class="scoring-empty-state">No hay configuracion disponible.</td></tr>';
      return;
    }

    head.innerHTML = `<tr>${dataset.columns.map(column => `<th>${column.label}</th>`).join('')}</tr>`;
    if (!scoringState.admin.filteredRows.length) {
      body.innerHTML = `<tr><td colspan="${dataset.columns.length}" class="scoring-empty-state">No hay registros para el filtro aplicado.</td></tr>`;
      return;
    }

    body.innerHTML = scoringState.admin.filteredRows.map(row => `
      <tr class="${row.__rowKey === scoringState.admin.selectedRowKey ? 'active' : ''}" data-config-row="${row.__rowKey}">
        ${dataset.columns.map(column => `<td>${formatConfigValue(row[column.name], column.type)}</td>`).join('')}
      </tr>
    `).join('');

    body.querySelectorAll('tr[data-config-row]').forEach(row => {
      row.addEventListener('click', () => {
        scoringState.admin.selectedRowKey = row.dataset.configRow;
        scoringState.admin.isNew = false;
        renderConfigTable();
        renderConfigForm();
      });
    });
  }

  function renderConfigForm() {
    const form = document.getElementById('scoring-config-form');
    const caption = document.getElementById('scoring-config-form-caption');
    const modeBadge = document.getElementById('scoring-config-mode');
    const deleteButton = document.getElementById('scoring-config-delete');
    const dataset = getCurrentDatasetMeta();
    if (!form || !caption || !modeBadge) return;

    if (!dataset) {
      form.innerHTML = '<div class="scoring-empty-state">Sin dataset seleccionado.</div>';
      caption.textContent = 'Selecciona un dataset para consultar sus registros.';
      modeBadge.textContent = 'Sin datos';
      if (deleteButton) deleteButton.disabled = true;
      return;
    }

    const currentRow = getSelectedConfigRow();
    const row = currentRow || buildEmptyConfigRow(dataset);
    const isNew = scoringState.admin.isNew || !currentRow;
    form.innerHTML = dataset.columns.map(column => `
      <label class="scoring-config-field">
        <span>${column.label}${column.required ? ' *' : ''}</span>
        <input
          class="form-control"
          name="${column.name}"
          type="${inputTypeForColumn(column.type)}"
          value="${escapeHtmlInput(formatInputValue(row[column.name], column.type))}"
          ${scoringState.admin.canEdit ? '' : 'disabled'}
        >
      </label>
    `).join('');

    caption.textContent = isNew
      ? `Alta rapida en ${dataset.label}. Completa las claves y guarda.`
      : `Editando ${dataset.label}. Las claves identifican el registro actual.`;
    modeBadge.textContent = scoringState.admin.canEdit ? (isNew ? 'Nuevo' : 'Edicion') : 'Consulta';
    if (deleteButton) {
      deleteButton.disabled = !scoringState.admin.canEdit || isNew || !currentRow;
    }
  }

  async function saveConfigRecord() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    const dataset = getCurrentDatasetMeta();
    const form = document.getElementById('scoring-config-form');
    if (!dataset || !form) {
      return;
    }

    const formData = new FormData(form);
    const record = {};
    dataset.columns.forEach(column => {
      const value = formData.get(column.name);
      record[column.name] = value === '' ? null : value;
    });

    try {
      await window.scoringAPI.guardarDataset(dataset.id, record);
      const nextKey = buildRowKey(dataset, record);
      await loadConfigSummary();
      scoringState.admin.selectedRowKey = nextKey;
      scoringState.admin.isNew = false;
      applyConfigFilters();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast('Registro de scoring guardado', 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo guardar el registro', 'error');
      }
    }
  }

  async function deleteConfigRecord() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    const dataset = getCurrentDatasetMeta();
    const row = getSelectedConfigRow();
    if (!dataset || !row) {
      return;
    }

    if (!window.confirm('Se eliminara el registro seleccionado. Continuar?')) {
      return;
    }

    const keys = dataset.keyFields.reduce((acc, key) => {
      acc[key] = row[key];
      return acc;
    }, {});

    try {
      await window.scoringAPI.eliminarDataset(dataset.id, keys);
      await loadConfigSummary();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast('Registro eliminado', 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo eliminar el registro', 'error');
      }
    }
  }

  async function createSnapshot() {
    if (!scoringState.admin.canEdit) {
      return;
    }

    try {
      await window.scoringAPI.generarSnapshot(scoringState.period || '');
      await loadConfigSummary();
      renderConfigPanel();
      if (typeof showToast === 'function') {
        showToast(`Snapshot guardado para ${scoringState.period || 'periodo actual'}`, 'success');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'No se pudo generar el snapshot', 'error');
      }
    }
  }

  function updateConfigSummaryMessage(customMessage) {
    const container = document.getElementById('scoring-config-summary');
    const dataset = getCurrentDatasetMeta();
    if (!container) return;
    if (customMessage) {
      container.textContent = customMessage;
      return;
    }
    if (!dataset) {
      container.textContent = 'No hay datasets auxiliares cargados.';
      return;
    }
    const total = dataset.total ?? scoringState.admin.rows.length;
    container.textContent = `${dataset.label}: ${total} registros. ${scoringState.admin.canEdit ? 'Edicion habilitada para admin.' : 'Modo consulta.'}`;
  }

  function buildEmptyPayload(period) {
    return {
      period: period || '',
      summary: {
        averageScore: 0,
        scoreDelta: 0,
        agenciesEvaluated: 0,
        coefClientePromedio: 0,
        promedioIncVentasPct: 0,
        highPriority: 0,
        upliftCandidates: 0,
        topAdvisor: '-',
        categories: [],
        ejeImpacto: {},
        riesgo: { ascenso: 0, descenso: 0, neutro: 0 },
        concentracion: {},
        top20AltaPrioridad: [],
        top20PorMovilidad: [],
        top20PorPuntaje: [],
        priorities: [],
        chips: ['Sin datos reales cargados']
      },
      agencies: []
    };
  }

  function buildSummaryChips(data, agencies) {
    const chips = [];
    chips.push(`${agencies.length} agencias procesadas`);
    if (data?.periodo?.clave) chips.push(`Periodo ${data.periodo.clave}`);
    if (data?.kpis?.prioridadAlta) chips.push(`${data.kpis.prioridadAlta} en prioridad alta`);
    if (data?.riesgoDistribucion?.ascenso) chips.push(`${data.riesgoDistribucion.ascenso} en ascenso`);
    if (data?.kpis?.coefClientePromedio) chips.push(`Coef. cliente prom. ${Number(data.kpis.coefClientePromedio).toFixed(2)}`);
    return chips;
  }

  function buildSummaryPriorities(data, agencies) {
    const topCategory = Array.isArray(data?.distribucionCategorias)
      ? data.distribucionCategorias.slice().sort((a, b) => Number(b.cantidad || 0) - Number(a.cantidad || 0))[0]
      : null;
    const notes = [];
    if (topCategory && Number(topCategory.cantidad || 0) > 0) {
      notes.push({
        title: 'Categoria mas frecuente',
        text: `${topCategory.categoria}: ${topCategory.cantidad} agencias en este corte.`
      });
    }
    if (data?.kpis?.prioridadAlta) {
      notes.push({
        title: 'Seguimiento inmediato',
        text: `${data.kpis.prioridadAlta} agencias quedaron con prioridad alta.`
      });
    }
    if (data?.riesgoDistribucion) {
      const r = data.riesgoDistribucion;
      notes.push({
        title: 'Riesgo de movilidad',
        text: `Ascenso: ${r.ascenso} | Descenso: ${r.descenso} | Neutro: ${r.neutro}`
      });
    }
    if (agencies.length) {
      const bestAgency = agencies.slice().sort((a, b) => b.score - a.score)[0];
      notes.push({
        title: 'Mejor score del periodo',
        text: `${bestAgency.name} lidera con ${formatNumber(bestAgency.score, 1)} puntos.`
      });
    }
    if (data?.concentracionCrecimiento?.top10 !== undefined) {
      const c = data.concentracionCrecimiento;
      notes.push({
        title: 'Concentracion de ventas',
        text: `Top 10: ${(c.top10 * 100).toFixed(1)}% | Top 50: ${(c.top50 * 100).toFixed(1)}% | Top 100: ${(c.top100 * 100).toFixed(1)}%`
      });
    }
    return notes.slice(0, 4);
  }

  function getCurrentDatasetMeta() {
    return scoringState.admin.datasets.find(item => item.id === scoringState.admin.currentDataset) || null;
  }

  function getSelectedConfigRow() {
    return scoringState.admin.rows.find(row => row.__rowKey === scoringState.admin.selectedRowKey) || null;
  }

  function buildEmptyConfigRow(dataset) {
    return dataset.columns.reduce((acc, column) => {
      acc[column.name] = '';
      return acc;
    }, {});
  }

  function buildRowKey(dataset, row) {
    return dataset.keyFields.map(key => `${key}:${normalizeRowKeyValue(key, row[key])}`).join('|');
  }

  function normalizeRowKeyValue(key, value) {
    if (key === 'cta_cte') {
      const normalized = String(value || '').trim();
      return /^\d{8}$/.test(normalized) ? normalized.slice(0, 7) : normalized;
    }
    return String(value ?? '').trim();
  }

  function getSelectedAgency() {
    return scoringState.filteredAgencies.find(item => item.id === scoringState.selectedAgencyId)
      || scoringState.agencies.find(item => item.id === scoringState.selectedAgencyId)
      || null;
  }

  function formatNumber(value, decimals) {
    return Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatConfigValue(value, type) {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (type === 'integer') {
      return Number(value).toLocaleString('es-AR');
    }
    if (type === 'number') {
      return formatNumber(value, 2);
    }
    return String(value);
  }

  function inputTypeForColumn(type) {
    if (type === 'integer' || type === 'number') return 'number';
    if (type === 'datetime') return 'datetime-local';
    return 'text';
  }

  function formatInputValue(value, type) {
    if (value === null || value === undefined) {
      return '';
    }
    if (type === 'datetime') {
      return String(value).replace(' ', 'T').slice(0, 16);
    }
    return String(value);
  }

  function escapeHtmlInput(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePriority(priority) {
    const text = String(priority || '').toUpperCase();
    if (text.includes('ALTA')) return 'ALTA';
    if (text.includes('BAJA')) return 'BAJA';
    return 'MEDIA';
  }

  function categoryClass(category) {
    const normalized = String(category || '').toLowerCase();
    if (normalized.includes('diamante')) return 'cat-diamante';
    if (normalized.includes('platino')) return 'cat-platino';
    if (normalized.includes('oro')) return 'cat-oro';
    if (normalized.includes('plata')) return 'cat-plata';
    if (normalized.includes('bronce')) return 'cat-bronce';
    return 'cat-cerrado';
  }

  function priorityClass(priority) {
    if (priority === 'ALTA') return 'priority-high';
    if (priority === 'BAJA') return 'priority-low';
    return 'priority-medium';
  }

  window.initScoring = initScoring;
})();
/* stats.js
   Carga CSVs desde el repo y genera gráficos.
   Ajusta las URLs si mueves los ficheros o cambias rama.
*/

// Rutas RAW al repositorio (ajusta si cambias rama)
const BASE_RAW = 'https://raw.githubusercontent.com/XavierGallart/estadisticas-patufet/main/files/';
const URLS = {
  jugadores: BASE_RAW + 'jugadores.csv',
  partidos:  BASE_RAW + 'partidos.csv',
  presencias: BASE_RAW + 'presencias.csv',
  goles: BASE_RAW + 'goles.csv',
  asistencias: BASE_RAW + 'asistencias.csv',
  asistencia_partidos: BASE_RAW + 'asistencia_partidos.csv'
};

// Util: limpia y normaliza claves (quita BOM, espacios)
function normKey(k) { return String(k || '').trim(); }
function normRow(row) {
  const out = {};
  for (const k in row) {
    out[normKey(k)] = (typeof row[k] === 'string') ? row[k].trim() : row[k];
  }
  return out;
}

// Lee un CSV con PapaParse y devuelve promesa con array de filas normalizadas
function loadCSV(url) {
  return new Promise((res, rej) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      transformHeader: h => normKey(h).replace(/^\d+\|\s*/, ''), // por si hay prefijos "1| "
      complete: p => {
        // Filtrar filas vacías (todas las celdas vacías)
        const rows = p.data
          .map(normRow)
          .filter(r => Object.values(r).some(v => v !== null && v !== ''));
        res(rows);
      },
      error: err => rej(err)
    });
  });
}

// Cargar todos los ficheros
async function loadAll() {
  const [jugadores, partidos, presencias, goles, asistencias, asistencia_partidos] = await Promise.all([
    loadCSV(URLS.jugadores),
    loadCSV(URLS.partidos),
    loadCSV(URLS.presencias),
    loadCSV(URLS.goles),
    loadCSV(URLS.asistencias),
    loadCSV(URLS.asistencia_partidos)
  ]);
  return { jugadores, partidos, presencias, goles, asistencias, asistencia_partidos };
}

// Funciones de cálculo de estadísticas
function sum(arr, key) {
  return arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

function groupBy(arr, keyFn) {
  const map = new Map();
  arr.forEach(r => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

function safeNum(v) {
  return (v === '' || v === null || v === undefined) ? NaN : Number(v);
}

// Render helpers
function addCard(title, value, subtitle) {
  const cards = document.getElementById('summary-cards');
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<strong style="font-size:1.1rem">${value}</strong><div style="color:#374151">${title}</div><div class="muted">${subtitle||''}</div>`;
  cards.appendChild(div);
}

// Generación de gráficos y tablas
async function buildDashboard() {
  const data = await loadAll();

  // Totales de partidos y goles (según partidos.csv)
  const totalMatches = data.partidos.length;
  const goalsFor = sum(data.partidos, 'Goles a favor') || 0;
  const goalsAgainst = sum(data.partidos, 'Goles en contra') || 0;
  const goalDiff = goalsFor - goalsAgainst;

  addCard('Partidos registrados', totalMatches, '');
  addCard('Goles a favor', goalsFor, '');
  addCard('Goles en contra', goalsAgainst, '');
  addCard('Diferencia de goles', goalDiff, '');

  // Top goleadores: preferimos datos de jugadores.csv (totales), si hay goles.csv se combina/valida
  const playersFromFile = data.jugadores.map(r => ({
    nombre: r['Nombre'] || r['Jugador'] || r['NombreJugador'],
    posicion: r['Posición'] || r['Posición'] || r['Posicion'],
    partidos: Number(r['Partidos jugados'] || r['Partidos'] || 0),
    goles: Number(r['Goles'] || 0),
    asistencias: Number(r['Asistencias'] || 0)
  })).filter(p => p.nombre);

  // Si no hay jugadores.csv útil, inferir desde goles.csv y presencias
  const goalsByAuthor = new Map();
  data.goles.forEach(g => {
    const author = g['Autor'] || g['Autor'] || g['Jugador'] || '';
    if (!author) return;
    goalsByAuthor.set(author, (goalsByAuthor.get(author) || 0) + 1);
  });

  // Combinar: tomar la cifra más fiable (jugadores.csv si existe, sino contabilizar goles.csv)
  const scorers = new Map();
  playersFromFile.forEach(p => scorers.set(p.nombre, { goles: p.goles, partidas: p.partidos, asistencias: p.asistencias }));
  for (const [author, cnt] of goalsByAuthor.entries()) {
    if (!scorers.has(author)) scorers.set(author, { goles: cnt, partidas: 0, asistencias: 0 });
    else if (!scorers.get(author).goles) scorers.get(author).goles = cnt;
  }

  // Convertir a array ordenado
  const scorersArr = Array.from(scorers.entries()).map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a,b) => b.goles - a.goles);

  // Chart.js: columna de goleadores (top 8)
  const topN = scorersArr.slice(0, 8);
  const ctx = document.getElementById('goalsBar').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topN.map(x => x.nombre),
      datasets: [{
        label: 'Goles',
        data: topN.map(x => x.goles),
        backgroundColor: topN.map((_,i) => `rgba(59,130,246,${0.6 - i*0.04})`),
        borderColor: 'rgba(59,130,246,0.9)',
        borderWidth: 1
      }]
    },
    options: { responsive:true, plugins:{legend:{display:false}} }
  });

  // ApexCharts Donut: distribución de goles entre jugadores (top 6)
  const donutEl = document.getElementById('goalsDonut');
  const donutTop = scorersArr.slice(0,6);
  const donutOptions = {
    chart: { type: 'donut', height: 320 },
    series: donutTop.map(x => x.goles),
    labels: donutTop.map(x => x.nombre),
    legend: { position: 'bottom' }
  };
  new ApexCharts(donutEl, donutOptions).render();

  // Goles por partido (serie)
  // Agrupar goles por Partido ID (campo Partido ID / ID)
  const goalsByMatch = groupBy(data.goles, r => r['Partido ID'] || r['Partido'] || r['ID Partido']);
  // Reconstruir x: partidos según partidos.csv (mantener orden)
  const partidosOrdered = data.partidos.map(p => ({ id: p['ID'] || p['Id'] || p['ID'], fecha: p['Fecha'], rival: p['Rival'], gf: Number(p['Goles a favor']||0) }));
  const xLabels = partidosOrdered.map(p => `#${p.id} ${p.fecha || ''}`);
  const serieData = partidosOrdered.map(p => (goalsByMatch.get(String(p.id)) || []).length);

  const ctx2 = document.getElementById('goalsLine').getContext('2d');
  new Chart(ctx2, {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [{
        label: 'Goles registrados (goles.csv)',
        data: serieData,
        borderColor: 'rgba(16,185,129,0.9)',
        backgroundColor: 'rgba(16,185,129,0.12)',
        fill: true,
        tension: 0.2
      },{
        label: 'Goles registrados en partidos.csv',
        data: partidosOrdered.map(p => p.gf),
        borderColor: 'rgba(59,130,246,0.9)',
        backgroundColor: 'rgba(59,130,246,0.12)',
        fill: false,
        tension: 0.2
      }]
    },
    options: { responsive:true }
  });

  // Minutos por partido: seleccionar partido en select y mostrar horizontal bar con ApexCharts
  const select = document.getElementById('selectMatch');
  partidosOrdered.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `Partido ${p.id} — ${p.fecha || ''} — ${p.rival || ''}`;
    select.appendChild(opt);
  });

  function renderMinutesChart(partidoId) {
    const pres = data.presencias.filter(r => String(r['Partido ID'] || r['Partido'] || r['ID']) === String(partidoId));
    const labels = pres.map(p => p['Jugador'] || p['Nombre'] || p['Jugador']);
    const minutes = pres.map(p => Number(p['Minutos jugados'] || p['Minutos'] || 0));
    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: true } },
      plotOptions: { bar: { horizontal: true } },
      series: [{ name: 'Minutos', data: minutes }],
      xaxis: { title: { text: 'Minutos' } },
      yaxis: { categories: labels }
    };
    const el = document.getElementById('minutesBar');
    el.innerHTML = '';
    const chart = new ApexCharts(el, options);
    chart.render();
  }

  // Inicial
  if (partidosOrdered.length) renderMinutesChart(partidosOrdered[0].id);
  select.addEventListener('change', ev => renderMinutesChart(ev.target.value));

  // Discrepancias: comparar asistencia_partidos (SI/NO) con presencias
  const presMap = new Map(); // key partido|jugador => minutos/titular
  data.presencias.forEach(p => {
    const key = `${p['Partido ID']||p['Partido']}|${p['Jugador']||p['Nombre']}`;
    presMap.set(key, p);
  });

  const discrepancies = [];
  data.asistencia_partidos.forEach(a => {
    const partido = a['Partido 1'] ? a['Partido 1'] : (a['Partido'] || a['Partido ID'] || a['PartidoID'] || a['Partido 1']);
    // La columna puede ser "Jugador,Partido 1,Partido 2" -> buscar jugador y presencia "SI/NO" en la columna que corresponde
    // Para simplicidad comprobamos si fila contiene Jugador y un valor 'SI'/'NO' en alguna columna aparte.
    const jugador = a['Jugador'] || a['Nombre'] || Object.values(a)[0];
    // Encontrar alguna columna con SI/NO
    const cols = Object.entries(a).filter(([k,v]) => !['Jugador','Nombre','Jugador'].includes(k));
    // Buscar valores SI/NO (aceptamos 'SI','NO','Sí','No','S','N')
    const val = cols.map(([k,v]) => String(v||'').toUpperCase()).find(x => x === 'SI' || x === 'S' || x === 'SÍ' || x === 'NO' || x === 'N');
    if (!jugador) return;
    // Comprobar presencias
    // intentamos inferir partido id por búsqueda en presMap
    let matchFound = false;
    for (const [k,pv] of presMap.entries()) {
      if (k.includes(String(jugador))) {
        matchFound = true;
        const pres = pv;
        const presMinutes = Number(pres['Minutos jugados'] || pres['Minutos'] || 0);
        const asistenciaFlag = (val || '').startsWith('S');
        const presentAccordingPresence = presMinutes > 0 || String(pres['Titular']).toLowerCase().startsWith('t');
        if (assistenciaFlag !== presentAccordingPresence) {
          discrepancies.push({
            jugador,
            asistencia_partidos: val || 'N/D',
            presencias_minutos: presMinutes,
            presencias_titular: pres['Titular'] || 'N/D'
          });
        }
      }
    }
    if (!matchFound) {
      // Si no hay presencias registradas para ese jugador, avisar
      discrepancies.push({ jugador, asistencia_partidos: val || 'N/D', presencias_minutos: 'no registrado', presencias_titular: 'no registrado' });
    }
  });

  // Mostrar discrepancias en una tabla
  const dEl = document.getElementById('discrepancies');
  if (discrepancies.length === 0) {
    dEl.innerHTML = '<div class="muted">No se detectaron discrepancias con los datos actuales.</div>';
  } else {
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Jugador</th><th>Asistencia (SI/NO)</th><th>Minutos (presencias)</th><th>Titular</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    discrepancies.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.jugador}</td><td>${r.asistencia_partidos}</td><td>${r.presencias_minutos}</td><td>${r.presencias_titular}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    dEl.appendChild(table);
  }

  // También mostrar una pequeña tabla de jugadores y sus totales si existen
  const bottom = document.createElement('div');
  bottom.style.marginTop = '12px';
  const playersTable = document.createElement('table');
  playersTable.innerHTML = `<thead><tr><th>Jugador</th><th>Posición</th><th>Partidos</th><th>Goles</th><th>Asistencias</th></tr></thead>`;
  const ptbody = document.createElement('tbody');
  playersFromFile.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.nombre}</td><td>${p.posicion||''}</td><td>${p.partidos||0}</td><td>${p.goles||0}</td><td>${p.asistencias||0}</td>`;
    ptbody.appendChild(tr);
  });
  playersTable.appendChild(ptbody);
  bottom.appendChild(playersTable);
  dEl.appendChild(bottom);
}

// Ejecutar
buildDashboard().catch(err => {
  console.error('Error construyendo dashboard:', err);
  document.body.insertAdjacentHTML('beforeend', `<div style="color:#b91c1c">Error cargando datos: ${err.message || err}</div>`);
});
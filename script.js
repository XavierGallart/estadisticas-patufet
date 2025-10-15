fetch('partidos.json')
  .then(res => res.json())
  .then(partidos => {
    const tbody = document.querySelector('#tablaPartidos tbody');
    const totales = {};

    // Mostrar tabla
    partidos.forEach(p => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${p.fecha}</td>
        <td>${p.local}</td>
        <td>${p.golesLocal}</td>
        <td>${p.visitante}</td>
        <td>${p.golesVisitante}</td>
      `;
      tbody.appendChild(fila);

      // Contar goles por equipo
      if (!totales[p.local]) totales[p.local] = 0;
      if (!totales[p.visitante]) totales[p.visitante] = 0;
      totales[p.local] += p.golesLocal;
      totales[p.visitante] += p.golesVisitante;
    });

    // Crear gráfico
    const ctx = document.getElementById('grafico').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(totales),
        datasets: [{
          label: 'Goles totales',
          data: Object.values(totales)
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  });

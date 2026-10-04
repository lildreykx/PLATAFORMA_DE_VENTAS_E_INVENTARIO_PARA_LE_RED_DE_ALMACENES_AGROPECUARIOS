(() => {
  const boundaryUrl = '/uraba-municipalities.geojson';
  let boundaryDataPromise;

  const colors = {
    arboletes: '#7ad7d0',
    apartado: '#e8a3c5',
    carepa: '#f0dd70',
    chigorodo: '#d8d0b7',
    murindo: '#7cced8',
    mutata: '#e3d69f',
    necocli: '#f0e06c',
    'san juan de uraba': '#c4e7de',
    'san pedro de uraba': '#b8d8e9',
    turbo: '#8bbce2',
    'vigia del fuerte': '#f2d86a'
  };

  const locations = [
    { name: 'Apartadó', key: 'apartado', code: 'A', longitude: -76.625, latitude: 7.882 },
    { name: 'Chigorodó', key: 'chigorodo', code: 'C', longitude: -76.681, latitude: 7.667 }
  ];

  function normalize(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function getRings(geometry) {
    if (geometry.type === 'Polygon') return geometry.coordinates;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
    return [];
  }

  function render(svg, data) {
    const features = data.features;
    const coordinates = features.flatMap(feature => getRings(feature.geometry).flat());
    const longitudes = coordinates.map(point => point[0]);
    const latitudes = coordinates.map(point => point[1]);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const compact = window.matchMedia('(max-width: 600px)').matches;
    const mapBounds = compact
      ? { x: 20, y: 18, width: 380, height: 490 }
      : { x: 28, y: 24, width: 520, height: 472 };
    const scale = Math.min(
      mapBounds.width / (maxLongitude - minLongitude),
      mapBounds.height / (maxLatitude - minLatitude)
    );
    const drawnWidth = (maxLongitude - minLongitude) * scale;
    const drawnHeight = (maxLatitude - minLatitude) * scale;
    const offsetX = mapBounds.x + (mapBounds.width - drawnWidth) / 2;
    const offsetY = mapBounds.y + (mapBounds.height - drawnHeight) / 2;
    const project = ([longitude, latitude]) => [
      offsetX + (longitude - minLongitude) * scale,
      offsetY + (maxLatitude - latitude) * scale
    ];

    const paths = features.map(feature => {
      const name = feature.properties.shapeName;
      const fill = colors[normalize(name)] || '#dedbd1';
      const pathData = getRings(feature.geometry).map(ring => {
        const points = ring.map(project);
        return `M${points.map(point => point.map(value => value.toFixed(1)).join(' ')).join(' L')} Z`;
      }).join(' ');
      return `<path d="${pathData}" fill="${fill}" fill-rule="evenodd" stroke="#343434" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }).join('');

    const markers = locations.map(location => {
      const [x, y] = project([location.longitude, location.latitude]);
      return `<g aria-label="${location.name}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="#17191b" stroke="#fff" stroke-width="2"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${location.code}</text></g>`;
    }).join('');

    const legend = locations.map((location, index) => {
      const y = compact ? 638 + index * 54 : 180 + index * 54;
      const markerX = compact ? 48 : 626;
      const labelX = compact ? 74 : 650;
      return `<g><circle cx="${markerX}" cy="${y}" r="13" fill="#17191b"/><text x="${markerX}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${location.code}</text><text x="${labelX}" y="${y + 6}" font-size="18" font-weight="700" fill="#17191b">${location.name}</text></g>`;
    }).join('');

    svg.setAttribute('viewBox', compact ? '0 0 420 760' : '0 0 900 520');
    svg.innerHTML = `
      <rect width="${compact ? 420 : 900}" height="${compact ? 760 : 520}" fill="#f7f7f7"/>
      <g>${paths}${markers}</g>
      ${compact ? '' : '<path d="M585 45 V455" stroke="#d4d5d6" stroke-width="1"/>'}
      <text x="${compact ? 30 : 620}" y="${compact ? 572 : 92}" font-size="${compact ? 22 : 24}" font-weight="700" fill="#17191b">Municipios de Urabá</text>
      <text x="${compact ? 30 : 620}" y="${compact ? 598 : 123}" font-size="15" fill="#656a70">Antioquia, Colombia</text>
      ${legend}
      <text x="${compact ? 30 : 620}" y="${compact ? 748 : 484}" font-size="${compact ? 9 : 11}" fill="#656a70">Límites: DANE MGN 2020 · geoBoundaries (CC BY 4.0)</text>
    `;
  }

  window.drawUrabaMap = async function (svgId) {
    const svg = document.getElementById(svgId);
    if (!svg) return;

    try {
      boundaryDataPromise ||= fetch(boundaryUrl).then(response => {
        if (!response.ok) throw new Error(`Boundary data request failed: ${response.status}`);
        return response.json();
      });
      render(svg, await boundaryDataPromise);
    } catch (error) {
      console.error('No se pudo cargar el mapa de Urabá:', error);
      svg.innerHTML = '<text x="20" y="40" fill="#b42318">No se pudo cargar el mapa regional.</text>';
    }
  };
})();

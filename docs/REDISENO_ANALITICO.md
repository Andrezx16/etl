# Rediseño analítico de Mercury

## Experiencia

Dashboard abre el Modo guiado. La navegación organiza las seis consultas del catálogo en Panorama, Cobertura, Calidad y Costos. Cada consulta presenta su alcance, su contexto fijo, un gráfico y la tabla del resultado. El hallazgo marca el mayor valor de la primera medida entre las filas visibles. Panorama incluye la distribución por modalidad y cuatro indicadores de oferta, matrícula, créditos y duración.

Explorador avanzado permite seleccionar medidas, agrupar por uno o dos campos, incluir filtros propios y elegir visualización, orden y límite. La vista previa muestra la última consulta ejecutada. Los diseños guardan la configuración y el contexto que tenía cada visual al añadirse. Se conservan las acciones existentes de guardado, duplicado, borrado, exportación e importación de diseños, y el lienzo permite mover y redimensionar.

El panel global se puede ocultar y vuelve a abrirse con los mismos filtros. Se comparte entre los dos modos. Los miembros provienen de SSAS. La lista de campos autorizados se coteja con los metadatos de la instancia cuando responde. La definición del proyecto permite mostrar el catálogo en una instalación sin cubo disponible.

## Contratos de consulta

- Los archivos MDX originales se ejecutan tal como están. El filtro guiado reduce las filas devueltas por S1 y C2 (sector), C1 (departamento) y S2/C3 (rango del año de registro). Se conserva el cálculo original de C3, incluido el contexto para su promedio móvil. La tabla y las exportaciones consumen el resultado filtrado guardado por el servidor.
- En el explorador y las tarjetas de Panorama, los filtros se aplican como subconsultas MDX. El año usa el rol seleccionado y los miembros se limitan por jerarquía mediante `StrToMember` con `CONSTRAINED`. Las opciones se consultan por campo y se muestran hasta 2.000 miembros por búsqueda en la lista cargada.
- Los parámetros opcionales de consulta avanzada incluyen `filters`, `start`, `end`, `date_role` y `order`. `GET /api/analytics/members/{dimension}` devuelve identificadores y etiquetas de miembros. El navegador envía selecciones estructuradas.

## Archivos y verificación

La composición compartida está en `frontend/src/AnalyticsWorkspace.tsx` y `analytics.css`. `App.tsx` integra navegación y constructor. `Visual.tsx` presenta gráfico, tabla y acciones sobre el resultado. Los cambios de contrato están en `client.ts`, `backend/analytics.py` y `backend/api.py`.

Se verificaron los seis análisis contra el cubo publicado y consultas avanzadas de indicadores, cruce de dimensiones y filtros combinados. Se comprobó el CSV de un resultado filtrado y el ciclo de diseños en una copia aislada de la base operativa. La revisión en navegador cubrió escritorio, tablet y móvil, cambio de modo, expansión del contenido, conservación de filtros y acceso a la tabla.
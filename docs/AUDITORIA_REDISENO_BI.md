# Auditoría del rediseño BI unificado · Fase 0

## Punto de partida comprobado

La instalación contiene una publicación de **31.937 programas**. Los registros de versión de PostgreSQL, SQL Server y SSAS coinciden en `9bcb154c`. La base operativa contiene **un diseño guardado**, resultados de las seis consultas predefinidas para esa versión y resultados de consultas avanzadas. Se leyó la base en modo de solo lectura. Los dos archivos MDX coinciden byte por byte con los entregados en el ZIP OLAP. El código actual pasa TypeScript con `--noEmit`.

Las capturas cuarta y quinta de la solicitud documentan el estado visual de partida. Esta fase revisa esa interfaz, el código y los resultados publicados disponibles localmente. La comprobación contra SSMS y las capturas a seis anchos se harán sobre cada entrega visual.

## Inventario y decisiones

| Área | Estado comprobado | Decisión para V2 | Riesgo |
|---|---|---|---|
| Navegación | `App.tsx` monta vistas distintas en `#dashboard`, `#explorador` y `#consultas`. El Explorador tiene «Solo lienzo». El historial usa `#historial`. | Una ruta `#analisis` con Lienzo, Catálogo y Mis dashboards. Resolver enlaces antiguos hacia la pestaña equivalente. Mantener Resumen como monitor operativo y enlazar desde allí al análisis. | Medio |
| Plantillas | En `AnalyticsWorkspace.tsx`, Panorama contiene S2 y C3, más la distribución por modalidad al abrir S2. Cobertura contiene C1. Calidad contiene C2. Costos contiene S1 y S3. | Convertir las cuatro agrupaciones en plantillas editables. Usar el catálogo como fuente común de nombres, explicaciones y consultas. | Alto |
| Consultas | `Visual.tsx` y TanStack Query llaman a `/api/analytics/catalog/{id}/execute` o `/api/analytics/query`. `backend/analytics.py` valida, genera MDX estructurado y ejecuta por el puente SSAS. | Conservar ambos caminos. Compartir un objeto de resultado por tarjeta entre gráfico, tabla y exportación. Incluir versión y configuración efectiva en la clave de consulta. | Alto |
| Metadatos | Las medidas y dimensiones permitidas se cotejan con SSAS cuando está disponible. Los miembros provienen de consultas del cubo, con límite de 2.000 por dimensión en la vista actual. | Reusar metadatos y miembros autorizados. Representar jerarquía y nivel con los identificadores del catálogo. Mostrar el límite de miembros y evaluar búsqueda remota si impide encontrar valores reales. | Medio |
| Filtros | El estado global vive en `App.tsx`. El modo guiado ajusta las filas visibles de las predefinidas compatibles. El avanzado conserva el contexto que tenía la tarjeta al guardarse. «Filtrar filas» mezcla una selección local con el filtrado cruzado. | Separar contexto global del dashboard, filtros particulares persistidos, restricciones fijas de plantilla y selección cruzada temporal. Preparar consultas solo para tarjetas afectadas. | Alto |
| Gráficos | ECharts 5.6 y ECharts GL 2.0.9. El gráfico usa ResizeObserver. Las categorías de años pueden usar eje discreto, las donas conservan demasiadas porciones y la versión se repite en cada tarjeta. | Mantener librerías. Añadir reglas por tipo, cardinalidad y unidad, escala temporal continua, leyenda de dona compacta y altura adaptable al tamaño de la tarjeta. | Medio |
| Lienzo | React Grid Layout 1.5.2 usa 12 columnas, guarda coordenadas y permite arrastre/redimensión fuera de «Solo lienzo». Los gráficos custom pueden recibir el título genérico «Visual avanzado». | Montar el lienzo como región principal, activar arrastre solo en edición, añadir tamaños predefinidos y generar títulos a partir de medida y agrupación. | Alto |
| Tablas | `Visual.tsx` usa TanStack Table con el resultado del gráfico, doce filas por página, búsqueda y orden. La tabla se alterna dentro de cada tarjeta. | Llevar la tabla seleccionada a un panel de datos inferior. Mantener el mismo `resultId` y centralizar ahí búsqueda, orden, paginación, expansión y exportación. | Alto |
| Exportación | CSV UTF-8 con BOM. XLSX incluye Datos y Metadatos. Ambos usan el resultado de SSAS guardado y exportan más allá de la página. La protección actual reconoce prefijos =, +, - y @ al ignorar espacios iniciales. | Mantener el origen y extender la neutralización a tabulador y retorno iniciales. Mostrar truncamiento y asociar el contexto efectivo al resultado exportado. | Alto |
| Diseños | CRUD en `/api/dashboards`; JSON en SQLite. El contrato guarda nombre, tarjetas, tipo, consulta o catálogo, título opcional y geometría. Ya permite guardar, duplicar e importar/exportar JSON. | Ampliación opcional y retrocompatible del contrato para versión de esquema, subtítulo y estado de filtros. Cargar primero adaptando en memoria. Persistir el nuevo esquema al guardar, sin reescritura masiva. | Alto |

## Catálogo auditado

| Consulta | Agrupación y contexto original | Filtro guiado compatible hoy |
|---|---|---|
| S1 | Sector institucional, número de programas y matrícula promedio | Sector |
| S2 | Año de registro SNIES y número de programas | Rango del año de registro |
| S3 | Campo amplio CINE, número de programas y créditos promedio, con Pregrado fijo | Sin recorte de filas global |
| C1 | Departamento, total, programas acreditados y porcentaje sobre el total del departamento | Departamento |
| C2 | Instituciones con oferta en Nariño frente a la referencia nacional de su sector | Sector; Nariño sigue fijo |
| C3 | Registro SNIES, 2013–2026, media móvil de tres años y crecimiento interanual | Rango visible dentro del periodo del MDX |

La respuesta publicada de S2 contiene **2 registros en 1997, 5.748 en 1998 y 848 en 1999**. Se debe anotar el pico visible sin atribuirle una causa ni suprimirlo. En C3 se mantiene el intervalo literal 2013–2026; el comentario del archivo sobre 2029 explica la exclusión, no autoriza a cambiar el intervalo.

## Plan de implementación y verificación

1. **Shell y navegación.** Fondo neutro, cabecera compacta, Espacio de análisis, enlaces anteriores y filtros plegables. Verificar redirecciones, expansión sin reconsulta y persistencia de filtros.
2. **Lienzo.** Cuadrícula de 12 columnas, menú único por tarjeta, selección, títulos descriptivos y edición de diseño. Verificar arrastre, redimensión y una versión de cubo visible en la cabecera.
3. **Gráficos.** Añadir reglas de compatibilidad, eje temporal y anotación de 1998, formatos es-CO, leyendas y agrupación «Otros» solo para medidas aditivas. Validar los registros originales en la tabla.
4. **Panel de datos.** Implementar selección, panel anclado, ampliación y accesibilidad. Comparar filas y orden de CSV/XLSX con el resultado de la tarjeta, y probar truncamiento y neutralización de fórmulas.
5. **Catálogo.** Las seis fichas con explicación en cinco apartados, adición al lienzo y copia editable donde se pueda reproducir la configuración con campos autorizados. Mantener el original cuando el constructor no pueda representar una expresión calculada.
6. **Constructor.** Panel derecho bajo demanda, validación previa, vista previa real, ayuda de campos y aplicación explícita del contexto global y particular. Probar contra SSAS y rechazar combinaciones y entradas fuera del catálogo.
7. **Mis dashboards.** Integrar apertura, guardado, guardado como, renombrado, eliminación y plantillas reales. Probar el diseño existente y un ciclo de guardado en una copia aislada de la base.
8. **Validación.** Pruebas de escritorio, tablet y móvil a 1920, 1440, 1280, 1024, 768 y 390 px. Revisar foco, scroll, errores de consola, consultas del cubo y regresión de carga e historial.

La revisión de cada fase visual se entrega antes de iniciar la siguiente. Esta fase entrega únicamente la auditoría y el plan.

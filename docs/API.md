# API pública de Mercury

Consulta el contrato OpenAPI vivo en `http://127.0.0.1:8000/docs`.

- Configuración inicial: `POST /api/setup/initialize` encola migraciones y despliegue si falta, con conexiones administrativas configuradas.
- Diagnóstico: `GET /api/health` y `GET /api/cube/status`.
- Fuentes: `GET /api/sources/schema` y `GET /api/sources/template/{filename}`.
- Validación: `POST /api/uploads/validate`, formulario multipart con ambos archivos bajo `files`. Anexa dos valores `sources`, en el mismo orden, para declarar sus roles cuando los nombres no sean los del contrato.
- Corridas: `POST /api/runs` con `{"id":"UUID"}`; historial y detalle con GET. `/events` transmite SSE, `/retry` reencola y `/rejections` devuelve CSV.
- Análisis: catálogo, ejecución por ID, metadatos, consultas avanzadas y exportación dentro de `/api/analytics`.
- Diseños: listar y crear en `/api/dashboards`; leer, actualizar y eliminar en `/api/dashboards/{id}`.
- Procesamiento: `POST /api/cube/process` crea una corrida de reproceso si SQL Server está sincronizado.

El servicio interno recibe MDX generado por FastAPI, protegido con `X-Mercury-Key`. Sus rutas incluyen `health`, `cube/status`, `cube/metadata`, `cube/deploy`, `cube/process` y `mdx/execute`, bajo el prefijo `/internal`.
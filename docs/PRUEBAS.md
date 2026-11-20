# Pruebas

Ejecuta `python -m unittest discover -s tests -v` desde la raíz con las dependencias de backend instaladas. Comprueba el frontend con `npm.cmd --prefix frontend run build` y el servicio con `dotnet build ssas-service/Mercury.Ssas.csproj`.

Para crear libros sintéticos, define `PYTHONPATH` apuntando a `backend` y ejecuta `python scripts/generate-fixtures.py ./ejemplos-locales`. Los dos archivos sintéticos cubren los encabezados y las cuatro hojas. Los libros originales del ZIP tienen claves ausentes en Directivos (893), Programas (31940) y Cobertura (45653). Corrige o excluye esas filas en copias revisadas para validar los libros originales.

En un ambiente dedicado, ejecuta `python scripts/verify.py --upload RUTA_INST RUTA_PROG --catalog` y compara las seis consultas de referencia en SSMS. Repite la carga para verificar cero inserciones y actualizaciones de hecho. Modifica, agrega y omite registros en copias de prueba. Comprueba la conservación de claves y repite con Excel inválido, dos confirmaciones concurrentes y fallos controlados en réplica y SSAS. Las pruebas de integración requieren instancias provisionadas y una copia de los datos autorizada.

Los mapas necesitan un archivo geográfico y códigos compatibles, por lo que quedan fuera de las vistas instaladas. ECharts GL admite columnas 3D y superficie cuando dos ejes numéricos consecutivos forman una malla completa; con WebGL no disponible, usa la vista 2D. La preparación de esquemas y el despliegue inicial admiten el asistente local o el flujo manual documentado. La instalación de los servicios y la asignación de permisos corresponden al administrador. Medir carga, consultas, memoria y exportación con el volumen operativo de la instalación.

## Verificación de esta entrega

- Frontend compilado con TypeScript estricto y Vite. Portada, acceso a la plataforma, plantillas y estado sin cubo revisados en navegador.
- Servicio SSAS compilado con .NET SDK 8.0.428. La API alcanzó el puente local, pero ADOMD.NET devolvió un error de conexión al cubo. SQL Server no aceptó el intento de conexión y la réplica y las consultas reales siguen pendientes de integración.
- Siete pruebas del backend pasaron. Incluyen XLSX, exclusión de trabajos, catálogo, desglose, retención de resultado publicado, diseños y exportación.
- En PostgreSQL 17 aislado, el ETL insertó un programa en la primera carga, produjo cero altas y actualizaciones al repetirla y contabilizó un alta y una actualización en la carga modificada. El programa omitido del archivo posterior se conservó.
- Los XLSX de examples/synthetic son de prueba y no corresponden a entidades reales.

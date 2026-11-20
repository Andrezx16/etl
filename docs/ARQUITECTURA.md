# Arquitectura

React y Vite llaman a FastAPI por HTTP. FastAPI y el worker comparten una base operativa SQLite en modo WAL. Solo el worker ejecuta cargas y el bloqueo local impide dos workers activos. Una restricción única impide tener dos corridas activas. El estado sobrevive al reinicio y los checkpoints separan ETL, réplica y publicación.

PostgreSQL contiene staging, bitácora y bodega. SQL Server contiene una réplica transaccional de la bodega. ASP.NET Core se comunica con SSAS mediante ADOMD.NET para consultas y AMO para procesar la base multidimensional dedicada, incluidas sus dimensiones compartidas. El puente utiliza loopback y una clave de servicio. El runtime integrado se dirige a .NET 8 y usa Analysis Services Client Libraries 19.106.1.

La API limita la carga a localhost. Las comprobaciones de configuración y el despliegue inicial mediante AMO utilizan los parámetros locales. Las migraciones se encolan por separado y el despliegue del modelo se omite si el catálogo existe.

La versión pública avanza después de verificar el KPI del cubo contra el total de hechos. Los resultados consultados previamente se conservan en caché por versión. Durante una publicación pendiente, una consulta nueva sin caché queda temporalmente indisponible. El sistema limita el número de snapshots retenidos.

[Cliente de Analysis Services, Microsoft](https://learn.microsoft.com/en-us/analysis-services/client-libraries?view=sql-analysis-services-2025)
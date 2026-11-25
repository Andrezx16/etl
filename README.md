# Mercury

Mercury es una plataforma local para validar Excel del SNIES, cargar PostgreSQL de forma incremental y consultar un cubo multidimensional de SSAS.

- [Instalación en Windows](docs/INSTALACION_WINDOWS.md)
- [Auditoría de insumos](docs/AUDITORIA_REPOSITORIO.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Modelo de datos](docs/MODELO_DATOS.md)
- [Flujo ETL](docs/FLUJO_ETL.md)
- [API](docs/API.md)
- [Catálogo MDX](docs/CONSULTAS_MDX.md)
- [Pruebas y limitaciones](docs/PRUEBAS.md)

Desde esta carpeta en PowerShell, ejecuta `./scripts/setup.ps1` y sigue el asistente de conexiones. Ejecuta `./scripts/dev.ps1`, abre la URL que imprime la consola y elige **Configuración → Preparar instalación**. Cuando termine, carga los dos Excel. Las consultas estarán disponibles tras la primera publicación.

Para compartir Mercury desde tu PC, instala y vincula ngrok y ejecuta `./scripts/dev.ps1 -Share`. Mercury pide el dominio y el modo de acceso la primera vez. [Guía para compartir Mercury](docs/INSTALACION_WINDOWS.md#compartir-mercury-desde-tu-pc-con-ngrok)

La portada usa el logotipo y la imagen suministrados. El ejemplo de la portada es ilustrativo. Un dashboard exportado como JSON contiene su configuración, mientras que CSV/XLSX contienen las filas del resultado analítico correspondiente.

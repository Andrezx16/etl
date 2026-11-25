# Mercury

Mercury es una aplicación web para explorar la oferta de educación superior de Colombia con datos del Sistema Nacional de Información de la Educación Superior (SNIES). Cargas dos archivos Excel y, una vez publicados los datos, puedes comparar programas por año, departamento, sector, nivel académico, modalidad o estado.

**Si ya tienes un enlace a Mercury**, ábrelo en tu navegador y ve a **Cargar datos** o al **Espacio de análisis**. La instalación en Windows se hace en el equipo que aloja la aplicación.

## Primera instalación en Windows

1. Instala Node.js, Python 3.12 y el SDK de .NET 8. El equipo también necesita PostgreSQL con `pg_dump`, SQL Server, Analysis Services en modo multidimensional y los controladores de SQL Server. [Guía de instalación y permisos](docs/INSTALACION_WINDOWS.md)
2. Desde la raíz del repositorio, abre PowerShell y ejecuta estos comandos en orden. Completa el asistente de `setup.ps1` antes de iniciar Mercury. El asistente detecta las instancias y genera el archivo `.env` con las conexiones.

   ```powershell
   .\scripts\setup.ps1
   .\scripts\dev.ps1
   ```

3. Abre la URL que imprime PowerShell. En **Configuración**, pulsa **Preparar instalación** y espera a que termine. Mercury prepara los esquemas y despliega el cubo si hace falta.

Tras la primera instalación, ejecuta `.\scripts\dev.ps1` cada vez que quieras abrir Mercury en tu PC.

## Cargar y publicar datos

En **Cargar datos**, selecciona los dos archivos.

| Archivo | Hojas requeridas |
| --- | --- |
| `Instituciones.xlsx` | Instituciones y Directivos |
| `Programas.xlsx` | Programas y Cobertura |

1. Pulsa **Validar archivos** y revisa el resumen por hoja. En esa misma pantalla puedes descargar las plantillas y consultar las columnas requeridas. Para una prueba inicial, el repositorio incluye [dos archivos de ejemplo con datos sintéticos](examples/synthetic).
2. Pulsa **Confirmar carga incremental**. Mercury agrega los registros nuevos, actualiza los que cambiaron y conserva los registros existentes que no aparecen en la nueva carga.
3. Sigue el avance en **Historial**. Cuando la carga figure como **Publicado**, sus datos estarán disponibles en el **Espacio de análisis**.

Durante la carga, Mercury integra los registros en PostgreSQL, sincroniza la bodega con SQL Server y procesa el cubo de Analysis Services (SSAS). Publica la versión después de comprobar que el total de programas del cubo coincide con el de la bodega. [Detalle del proceso de carga](docs/FLUJO_ETL.md)

## Explorar y compartir resultados

| En el Espacio de análisis | Qué puedes hacer |
| --- | --- |
| **Lienzo** | Empieza con una plantilla de oferta, cobertura, calidad o costos. Usa los filtros globales y personaliza las tarjetas del dashboard. |
| **Catálogo de análisis** | Abre consultas predefinidas del cubo, revisa sus resultados y añade una visualización al lienzo. |
| **Mis dashboards** | Guarda y abre diseños compartidos en la instalación. Puedes trasladar la configuración de un dashboard mediante un archivo JSON. |

Desde el menú **⋯** de una tarjeta puedes abrir **Ver tabla** o exportar los resultados como CSV o XLSX. El menú también permite descargar el gráfico como PNG.

## Dar acceso desde otra red

En el PC anfitrión, instala ngrok y vincula tu cuenta. Detén la sesión local con `Ctrl+C` y ejecuta el siguiente comando.

```powershell
.\scripts\dev.ps1 -Share
```

En el primer inicio, pega el dominio asignado por ngrok y define si el acceso será por correo o público. En modo público, cualquier persona con el enlace puede consultar los datos, cargar Excel y editar los dashboards compartidos.

Comparte el enlace que imprime Mercury. Funciona mientras el PC tenga internet y la sesión siga abierta. Para cambiar el dominio o el modo de acceso, ejecuta `.\scripts\dev.ps1 -ConfigureShare`. [Guía de acceso con ngrok](docs/INSTALACION_WINDOWS.md#compartir-mercury-desde-tu-pc-con-ngrok)

## Documentación técnica

- [Arquitectura](docs/ARQUITECTURA.md) y [modelo de datos](docs/MODELO_DATOS.md)
- [API](docs/API.md) y [catálogo de consultas MDX](docs/CONSULTAS_MDX.md)
- [Auditoría de insumos](docs/AUDITORIA_REPOSITORIO.md) y [pruebas y limitaciones](docs/PRUEBAS.md)

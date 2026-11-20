# Instalación local en Windows

## Instalación guiada

Instala Node.js, Python 3.12, el SDK .NET 8, PostgreSQL con `pg_dump`, SQL Server Database Engine, ODBC Driver 18, Microsoft OLE DB Driver for SQL Server y SQL Server Analysis Services en modo multidimensional. El asistente y `dev.ps1` ponen en marcha las instancias locales configuradas. Si Windows requiere permisos adicionales, solicita autorización para iniciar el servicio. Si tienes varias instalaciones de PostgreSQL, puedes indicar el nombre exacto del servicio en `MERCURY_PG_SERVICE`.

1. Abre PowerShell en la carpeta de Mercury y ejecuta `./scripts/setup.ps1`. En una instalación nueva, el asistente detecta SQL Server y Analysis Services. Si encuentra varias instancias, te pide que elijas en una lista. Usa la cuenta de Windows que ejecuta Mercury para conectarse a ambos servicios.
2. En PostgreSQL puedes usar una base y una cuenta existentes. El asistente también puede crear una base dedicada y su usuario, con una contraseña aleatoria. En ese caso pide una credencial autorizada solo para crearlos. La contraseña de la cuenta administrativa no se guarda. Para el servidor y puerto locales, normalmente puedes aceptar `127.0.0.1` y `5432`.
3. Ejecuta `./scripts/dev.ps1` y abre la URL que imprime la consola. En **Configuración**, elige **Preparar instalación**. Mercury prepara los esquemas y, si falta el cubo, lo despliega y da a la identidad del servicio SSAS permiso de lectura sobre `dw` cuando el asistente haya configurado esa cuenta. La cuenta que inicia Mercury necesita los permisos correspondientes en SQL Server y SSAS.
4. Cuando termine, abre **Cargar datos** y sube `Instituciones.xlsx` y `Programas.xlsx`. La primera carga publica los datos en el cubo.

Si ya tienes una instalación configurada, `setup.ps1` conserva tu `.env`. Para revisar las conexiones de forma guiada ejecuta `./scripts/setup.ps1 -Configure -SkipDependencies` con Mercury detenido. El asistente pide confirmación antes de reemplazar la configuración.

## Configuración avanzada

Para instancias remotas, cuentas administradas por TI o configuración manual, ejecuta `./scripts/setup.ps1 -SkipConfiguration` y completa `.env`. En una instalación nueva, el comando genera la plantilla y el secreto interno.

1. Comprueba que los servicios y controladores estén instalados y que tu cuenta tenga acceso.
2. Crea una base dedicada de PostgreSQL y concede permisos sobre sus esquemas al usuario del ETL. Configura `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` y `PGDATABASE`. Configura `PG_DUMP_PATH` con la ruta del binario si no está en PATH.
3. Para inicializar PostgreSQL de forma explícita, desde la raíz ejecuta:

   ```powershell
   $env:PYTHONPATH = (Resolve-Path ./backend).Path
   & ./.venv/Scripts/python.exe ./scripts/init-postgres.py
   ```

4. Con autorización administrativa, ejecuta `warehouse/05_dw_sqlserver.sql` en SSMS conectado al Database Engine que alojará la réplica. El DDL apunta a `bodega_snies`. Usa una instancia dedicada o revisa previamente que la base y sus claves pertenezcan a esta misma bodega PostgreSQL. Configura `SQLSERVER_CONNECTION` con el servidor y nombre de base correctos. Usa certificados válidos para ODBC 18. En un entorno estrictamente local, el operador puede habilitar temporalmente `TrustServerCertificate=yes` para un certificado de desarrollo.
5. Abre `cube/Cubo_SNIES.sln`. Ajusta el origen `Bodega Snies.ds` al SQL Server y da al contexto de ejecución de SSAS permiso de lectura sobre `dw`. En las propiedades de despliegue, elige tu instancia multidimensional y el catálogo `Cubo_SNIES`. Despliega la estructura con procesamiento desactivado. Confirma servidor y catálogo antes de desplegar, especialmente si ya existe un cubo. Ajusta `SSAS_CONNECTION` y `SSAS_DATABASE` si corresponde.
6. La cuenta que inicia el servicio .NET requiere permisos SSAS para consulta y procesamiento del catálogo. Ejecuta `./scripts/dev.ps1` y abre Mercury. En Configuración comprueba PostgreSQL, SQL Server y SSAS. Un cubo recién creado puede aparecer sin procesar hasta la primera carga válida.

## Preparación desde Mercury

Para habilitar **Preparar instalación**, define `SQLSERVER_ADMIN_CONNECTION` como una conexión ODBC a `master` con permiso para ejecutar el DDL. En `SSAS_SOURCE_CONNECTION` configura la conexión OLE DB con autenticación integrada que usará el servicio de SSAS. Su cuenta necesita permiso de lectura sobre `dw`. Si el catálogo ya existe, Mercury lo reutiliza. Puedes dejar vacía la conexión administrativa al terminar para deshabilitar el botón.

## Inicio por separado

En cada consola ejecuta `. ./scripts/env.ps1` desde la raíz si deseas cargar el archivo de entorno a esa sesión.

| Componente | Comando desde la raíz |
|---|---|
| API | `./.venv/Scripts/python.exe -m uvicorn api:app --app-dir backend --host 127.0.0.1 --port $env:MERCURY_API_PORT` |
| Worker | `Push-Location backend; ../.venv/Scripts/python.exe -m jobs` |
| SSAS | `dotnet run --project ssas-service --no-launch-profile` |
| Frontend | `npm.cmd --prefix frontend run dev` |

## Prueba desde otra red con ngrok

Con el cubo preparado, cierra la terminal anterior de Mercury. Puedes probar la interfaz compilada y la API juntas en tu PC con `./scripts/dev.ps1 -Serve`. Para compartirlas desde fuera, instala [ngrok para Windows](https://ngrok.com/download/windows), crea una cuenta gratuita y agrega su token en tu terminal con `ngrok config add-authtoken`. Si usas una copia portátil de ngrok en `.mercury/tools`, ejecuta `./.mercury/tools/ngrok.exe config add-authtoken` con el token. Usa la dirección de desarrollo que ngrok asigna a tu cuenta.

```powershell
.\scripts\dev.ps1 -ShareUrl 'https://tu-direccion.ngrok-free.dev' -AllowedEmail 'tu-correo@gmail.com','correo-de-tu-companero@gmail.com'
```

Los correos indicados deben poder iniciar sesión con Google. Abre la URL desde un celular con datos móviles. Comprueba que un correo autorizado pueda iniciar sesión y un correo ajeno quede rechazado antes de compartir el enlace. Toda la aplicación queda detrás del inicio de sesión. Los usuarios autorizados pueden ver los datos, cargar archivos y editar dashboards compartidos. Para preparar la instalación o reprocesar manualmente el cubo, usa el inicio local.

La URL funciona mientras el PC tenga internet y la terminal de Mercury permanezca abierta. Detén la publicación con Ctrl+C. Puedes volver al modo local con `./scripts/dev.ps1`. La prueba está pensada para hasta tres usuarios por mes y está sujeta a los [límites del plan gratuito](https://ngrok.com/docs/pricing-limits).

## Recuperación y alojamiento

Antes de migrar, conserva `pg_dump -Fc`, un backup SQL Server, un respaldo SSAS .abf y una copia consistente de `.mercury` con los servicios detenidos. Para recuperar el estado, restaura los cuatro respaldos del mismo punto y verifica el indicador de salud. El registro operativo y los archivos de carga están en `.mercury`. La bitácora del ETL y los respaldos automáticos de PostgreSQL conservan las rutas del módulo original bajo `backend`.

Para un servidor separado, compila el frontend y sirve la SPA y la ruta `/api` bajo el mismo origen. Aloja API, worker y puente SSAS cerca de sus servicios de datos. Mantén la infraestructura en red privada o VPN y añade HTTPS, autenticación, autorización y controles de uso antes de exponerla.

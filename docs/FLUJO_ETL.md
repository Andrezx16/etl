# Flujo ETL

1. La API valida dos XLSX y cuatro hojas fijas. Revisa encabezados, tamaño, fórmulas, errores, claves y duplicados contradictorios. Presenta el resumen y primeras filas.
2. La confirmación encola la corrida. El worker llama al orquestador suministrado en modo incremental con una carpeta exclusiva. Los tipos de negocio se convierten y validan en el ETL original. Se conservan su bitácora, rechazos y homologación DANE.
3. La réplica toma un snapshot de PostgreSQL, prepara tablas temporales SQL Server, verifica claves, actualiza atributos distintos e inserta altas. Verifica el contenido por tabla y confirma todo en una transacción.
4. AMO procesa la base multidimensional dedicada. El worker consulta el número de programas por MDX y comprueba que coincida con el total de PostgreSQL. La versión se publica tras esa comprobación.
5. El botón Reintentar parte del último checkpoint. Un fallo previo al checkpoint del ETL repite la carga incremental completa. Un fallo tras verificar la réplica retoma SSAS. Una corrida anterior no debe reanudarse si una posterior reemplazó la bodega.

## Catálogo geográfico

`backend/data/catalogos/dane_municipios.csv` contiene las cuatro columnas de códigos y nombres de departamentos y municipios del listado DIVIPOLA del DANE. La copia corresponde al corte del 30 de diciembre de 2024 e incluye las 1.122 entradas que publica la fuente. Las aprobaciones guardadas recuperan el nombre vigente de la misma entidad por su código DANE. [Fuente oficial](https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w)

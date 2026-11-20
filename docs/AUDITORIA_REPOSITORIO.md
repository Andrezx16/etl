# Auditoría de los insumos

| Aspecto | ETL sistematizado | Paquete OLAP | Decisión |
|---|---|---|---|
| Fuentes | Dos XLSX, cuatro hojas obligatorias en config/fuentes.py | Plantillas equivalentes con Instituciones, Directivos, Programas y Cobertura | Validar todas las hojas antes de confirmar |
| Bodega | Siete dimensiones y un hecho | 03_dw_schema.sql es idéntico byte por byte al DDL modular | Reutilizar orquestador Python |
| Limpieza | Catálogos, integración y homologación DANE con trazas | Normalizaciones del ETL monolítico y SQL | Usar solo el modular |
| Incremental | Staging conserva filas ausentes. Hecho y dimensiones comparan atributos | El copiador exige destino vacío | Réplica incremental transaccional |
| Identidad | Código IES, código SNIES, combinaciones de atributos y fecha | DSV usa las SK a través de réplica SQL Server | Conservar las SK del origen |
| Cubo | Produce las columnas del DDL compartido | Cubo_SNIES, medidas de programas, matrícula y créditos, roles de tiempo | Desplegar el proyecto SSDT suministrado |
| MDX | Sin cliente OLAP | Seis consultas de referencia | Conservar el texto completo y los criterios originales |

La réplica requiere una bodega dedicada con el mismo origen de claves. La vigencia del directivo depende de la fecha. Contrastar variantes normalizadas, miembros ausentes y consultas C1–C3 contra SSMS.